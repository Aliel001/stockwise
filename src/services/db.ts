import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  runTransaction,
  deleteDoc,
  serverTimestamp,
  getDocs,
  writeBatch,
  where
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { Product, StockIn, Sale, Notification, ActivityLog } from '../types';

// Helper to generate UUIDs locally
export function generateUUID() {
  return 'doc_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Subscribe to REALTIME products
export function subscribeProducts(userEmail: string, onChange: (products: Product[]) => void) {
  const q = query(collection(db, 'products'), where('createdBy', '==', userEmail));
  return onSnapshot(q, (snapshot) => {
    const products: Product[] = [];
    snapshot.forEach((doc) => {
      products.push(doc.data() as Product);
    });
    // Sort in memory to avoid needing composite index
    products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    onChange(products);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'products');
  });
}

// Subscribe to REALTIME stock-ins
export function subscribeStockIns(userEmail: string, onChange: (stockIns: StockIn[]) => void) {
  const q = query(collection(db, 'stock_ins'), where('performedBy', '==', userEmail));
  return onSnapshot(q, (snapshot) => {
    const data: StockIn[] = [];
    snapshot.forEach((doc) => {
      data.push(doc.data() as StockIn);
    });
    // Sort in memory desc
    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    onChange(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'stock_ins');
  });
}

// Subscribe to REALTIME sales
export function subscribeSales(userEmail: string, onChange: (sales: Sale[]) => void) {
  const q = query(collection(db, 'sales'), where('performedBy', '==', userEmail));
  return onSnapshot(q, (snapshot) => {
    const data: Sale[] = [];
    snapshot.forEach((doc) => {
      data.push(doc.data() as Sale);
    });
    // Sort in memory desc
    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    onChange(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'sales');
  });
}

// Subscribe to REALTIME notifications
export function subscribeNotifications(userEmail: string, onChange: (notifications: Notification[]) => void) {
  const q = query(collection(db, 'notifications'), where('userEmail', '==', userEmail));
  return onSnapshot(q, (snapshot) => {
    const data: Notification[] = [];
    snapshot.forEach((doc) => {
      data.push(doc.data() as Notification);
    });
    // Sort in memory desc
    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    onChange(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'notifications');
  });
}

// Subscribe to REALTIME activity logs
export function subscribeActivityLogs(userEmail: string, onChange: (logs: ActivityLog[]) => void) {
  const q = query(collection(db, 'activity_logs'), where('performedBy', '==', userEmail));
  return onSnapshot(q, (snapshot) => {
    const data: ActivityLog[] = [];
    snapshot.forEach((doc) => {
      data.push(doc.data() as ActivityLog);
    });
    // Sort in memory desc
    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    onChange(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'activity_logs');
  });
}

// Add a Product
export async function addProduct(p: Omit<Product, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const id = generateUUID();
  const now = new Date().toISOString();

  const productDocRef = doc(db, 'products', id);
  const logDocRef = doc(db, 'activity_logs', generateUUID());

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Create Product
      transaction.set(productDocRef, {
        ...p,
        id,
        createdBy: email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Log activity
      transaction.set(logDocRef, {
        id: logDocRef.id,
        action: `Added product "${p.name}" with initial stock of ${p.quantity}`,
        performedBy: email,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'products');
  }
}

// Update a Product (Details only, stock updates should happen via stock-in/sales)
export async function updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const productDocRef = doc(db, 'products', id);
  const logDocRef = doc(db, 'activity_logs', generateUUID());

  try {
    await runTransaction(db, async (transaction) => {
      const prodSnap = await transaction.get(productDocRef);
      if (!prodSnap.exists()) {
        throw new Error('Product does not exist');
      }
      const existingProduct = prodSnap.data() as Product;

      transaction.update(productDocRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      transaction.set(logDocRef, {
        id: logDocRef.id,
        action: `Updated details of product "${existingProduct.name}"`,
        performedBy: email,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `products/${id}`);
  }
}

// Delete a Product
export async function deleteProduct(id: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const productDocRef = doc(db, 'products', id);
  const logDocRef = doc(db, 'activity_logs', generateUUID());

  try {
    await runTransaction(db, async (transaction) => {
      const prodSnap = await transaction.get(productDocRef);
      if (!prodSnap.exists()) {
        throw new Error('Product does not exist');
      }
      const existingProduct = prodSnap.data() as Product;

      transaction.delete(productDocRef);

      transaction.set(logDocRef, {
        id: logDocRef.id,
        action: `Deleted product "${existingProduct.name}"`,
        performedBy: email,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
  }
}

// Restock a Product (Stock In)
export async function stockIn(pId: string, qty: number, notes: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const productDocRef = doc(db, 'products', pId);
  const stockInId = generateUUID();
  const stockDocRef = doc(db, 'stock_ins', stockInId);
  const logDocRef = doc(db, 'activity_logs', generateUUID());

  try {
    await runTransaction(db, async (transaction) => {
      const prodSnap = await transaction.get(productDocRef);
      if (!prodSnap.exists()) {
        throw new Error('Product not found');
      }
      const existingProduct = prodSnap.data() as Product;
      const newQty = existingProduct.quantity + qty;

      // Update product qty
      transaction.update(productDocRef, {
        quantity: newQty,
        updatedAt: serverTimestamp(),
      });

      // Write Restock record
      transaction.set(stockDocRef, {
        id: stockInId,
        productId: pId,
        productName: existingProduct.name,
        quantity: qty,
        supplier: '',
        notes: notes || '',
        performedBy: email,
        createdAt: serverTimestamp(),
      });

      // Write activity log
      transaction.set(logDocRef, {
        id: logDocRef.id,
        action: `Restocked ${qty} units of "${existingProduct.name}"`,
        performedBy: email,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'stock_ins');
  }
}

// Sell a Product (Sale / Stock Out)
export async function sellProduct(pId: string, qty: number) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const productDocRef = doc(db, 'products', pId);
  const saleId = generateUUID();
  const saleDocRef = doc(db, 'sales', saleId);
  const logDocRef = doc(db, 'activity_logs', generateUUID());

  try {
    await runTransaction(db, async (transaction) => {
      const prodSnap = await transaction.get(productDocRef);
      if (!prodSnap.exists()) {
        throw new Error('Product not found');
      }
      const existingProduct = prodSnap.data() as Product;

      if (existingProduct.quantity < qty) {
        throw new Error(`Insufficient stock for ${existingProduct.name}. Requested: ${qty}, Available: ${existingProduct.quantity}`);
      }

      const newQty = existingProduct.quantity - qty;

      // Update product qty
      transaction.update(productDocRef, {
        quantity: newQty,
        updatedAt: serverTimestamp(),
      });

      // Write Sale record
      const unitPrice = existingProduct.sellingPrice;
      const totalPrice = qty * unitPrice;
      transaction.set(saleDocRef, {
        id: saleId,
        productId: pId,
        productName: existingProduct.name,
        quantity: qty,
        unitPrice,
        totalPrice,
        performedBy: email,
        createdAt: serverTimestamp(),
      });

      // Write activity log
      transaction.set(logDocRef, {
        id: logDocRef.id,
        action: `Sold ${qty} units of "${existingProduct.name}" for a total of RWF ${Math.round(totalPrice).toLocaleString()}`,
        performedBy: email,
        createdAt: serverTimestamp(),
      });

      // Create a warning notification if quantity falls below minStock
      if (newQty <= existingProduct.minStock) {
        const notifId = generateUUID();
        const notificationDocRef = doc(db, 'notifications', notifId);
        transaction.set(notificationDocRef, {
          id: notifId,
          message: `"${existingProduct.name}" is running low (${newQty} left). Please restock soon!`,
          type: 'low_stock',
          isRead: false,
          userEmail: existingProduct.createdBy,
          createdAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sales');
  }
}

// Mark Notification as Read
export async function markNotificationAsRead(id: string) {
  const docRef = doc(db, 'notifications', id);
  try {
    await runTransaction(db, async (transaction) => {
      transaction.update(docRef, {
        isRead: true,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
  }
}

// Delete Notification
export async function deleteNotification(id: string) {
  const docRef = doc(db, 'notifications', id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `notifications/${id}`);
  }
}

// Clear all database collections created by user
export async function clearAllData() {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  try {
    // 1. Products
    const productsSnap = await getDocs(query(collection(db, 'products'), where('createdBy', '==', email)));
    const productsBatch = writeBatch(db);
    productsSnap.forEach((doc) => productsBatch.delete(doc.ref));
    await productsBatch.commit();

    // 2. Stock Ins
    const stockSnap = await getDocs(query(collection(db, 'stock_ins'), where('performedBy', '==', email)));
    const stockBatch = writeBatch(db);
    stockSnap.forEach((doc) => stockBatch.delete(doc.ref));
    await stockBatch.commit();

    // 3. Sales
    const salesSnap = await getDocs(query(collection(db, 'sales'), where('performedBy', '==', email)));
    const salesBatch = writeBatch(db);
    salesSnap.forEach((doc) => salesBatch.delete(doc.ref));
    await salesBatch.commit();

    // 4. Notifications
    const notifsSnap = await getDocs(query(collection(db, 'notifications'), where('userEmail', '==', email)));
    const notifsBatch = writeBatch(db);
    notifsSnap.forEach((doc) => notifsBatch.delete(doc.ref));
    await notifsBatch.commit();

    // 5. Activity Logs
    const logsSnap = await getDocs(query(collection(db, 'activity_logs'), where('performedBy', '==', email)));
    const logsBatch = writeBatch(db);
    logsSnap.forEach((doc) => logsBatch.delete(doc.ref));
    await logsBatch.commit();

    // Now, write an activity log recording the purge action
    const logDocRef = doc(db, 'activity_logs', generateUUID());
    await runTransaction(db, async (transaction) => {
      transaction.set(logDocRef, {
        id: logDocRef.id,
        action: 'Database data reset: Purged all system data from the inventory database.',
        performedBy: email,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'user_data');
  }
}
