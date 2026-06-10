import { auth } from '../firebase';
import { Product, StockIn, Sale, Notification, ActivityLog } from '../types';

// Helper to construct request headers with authenticated user details
function getHeaders(emailOverride?: string) {
  const email = emailOverride || auth.currentUser?.email || 'alieluzii@gmail.com';
  return {
    'Content-Type': 'application/json',
    'x-user-email': email
  };
}

// 1. Subscribe to REALTIME products using smart REST API polling
export function subscribeProducts(userEmail: string, onChange: (products: Product[]) => void) {
  let active = true;

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products', {
        headers: getHeaders(userEmail)
      });
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      if (active) {
        onChange(data);
      }
    } catch (error) {
      console.error('[REST Error] Problems polling products:', error);
    }
  };

  fetchProducts();
  const intervalId = setInterval(fetchProducts, 4000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}

// 2. Subscribe to REALTIME stock-ins using smart REST API polling
export function subscribeStockIns(userEmail: string, onChange: (stockIns: StockIn[]) => void) {
  let active = true;

  const fetchStockIns = async () => {
    try {
      const response = await fetch('/api/stock-ins', {
        headers: getHeaders(userEmail)
      });
      if (!response.ok) throw new Error('Failed to fetch stock-ins');
      const data = await response.json();
      if (active) {
        onChange(data);
      }
    } catch (error) {
      console.error('[REST Error] Problems polling stock-ins:', error);
    }
  };

  fetchStockIns();
  const intervalId = setInterval(fetchStockIns, 4000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}

// 3. Subscribe to REALTIME sales using smart REST API polling
export function subscribeSales(userEmail: string, onChange: (sales: Sale[]) => void) {
  let active = true;

  const fetchSales = async () => {
    try {
      const response = await fetch('/api/sales', {
        headers: getHeaders(userEmail)
      });
      if (!response.ok) throw new Error('Failed to fetch sales');
      const data = await response.json();
      if (active) {
        onChange(data);
      }
    } catch (error) {
      console.error('[REST Error] Problems polling sales:', error);
    }
  };

  fetchSales();
  const intervalId = setInterval(fetchSales, 4000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}

// 4. Subscribe to REALTIME notifications using smart REST API polling
export function subscribeNotifications(userEmail: string, onChange: (notifications: Notification[]) => void) {
  let active = true;

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', {
        headers: getHeaders(userEmail)
      });
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      if (active) {
        onChange(data);
      }
    } catch (error) {
      console.error('[REST Error] Problems polling notifications:', error);
    }
  };

  fetchNotifications();
  const intervalId = setInterval(fetchNotifications, 4000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}

// 5. Subscribe to REALTIME activity logs using smart REST API polling
export function subscribeActivityLogs(userEmail: string, onChange: (logs: ActivityLog[]) => void) {
  let active = true;

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/activity-logs', {
        headers: getHeaders(userEmail)
      });
      if (!response.ok) throw new Error('Failed to fetch activity logs');
      const data = await response.json();
      if (active) {
        onChange(data);
      }
    } catch (error) {
      console.error('[REST Error] Problems polling activity logs:', error);
    }
  };

  fetchLogs();
  const intervalId = setInterval(fetchLogs, 4000);

  return () => {
    active = false;
    clearInterval(intervalId);
  };
}

// 6. Add a Product
export async function addProduct(p: Omit<Product, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch('/api/products', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(p),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to create product');
  }

  return response.json();
}

// 7. Update a Product (Details only)
export async function updateProduct(id: string, updates: Partial<Omit<Product, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>>) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch(`/api/products/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to update product');
  }

  return response.json();
}

// 8. Delete a Product
export async function deleteProduct(id: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch(`/api/products/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to delete product');
  }

  return response.json();
}

// 9. Restock a Product (Stock In)
export async function stockIn(pId: string, qty: number, notes: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch('/api/stock-ins', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      productId: pId,
      quantity: qty,
      notes: notes,
    }),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to record restocking delivery');
  }

  return response.json();
}

// 10. Sell a Product (Sale / Stock Out)
export async function sellProduct(pId: string, qty: number) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch('/api/sales', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      productId: pId,
      quantity: qty,
    }),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to process checkout sale');
  }

  return response.json();
}

// 11. Mark Notification as Read
export async function markNotificationAsRead(id: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch(`/api/notifications/${id}/read`, {
    method: 'PUT',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to update notification');
  }

  return response.json();
}

// 12. Delete Notification
export async function deleteNotification(id: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch(`/api/notifications/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to delete notification');
  }

  return response.json();
}

// 13. Clear all database collections created by user
export async function clearAllData() {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch('/api/clear-all', {
    method: 'POST',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error || 'Failed to clear system state');
  }

  return response.json();
}
