import { auth } from '../firebase';
import { Product, StockIn, Sale, Notification, ActivityLog } from '../types';

// Helper to construct request headers
function getHeaders(emailOverride?: string) {
  const email = emailOverride || auth.currentUser?.email || '';
  return {
    'Content-Type': 'application/json',
    'x-user-email': email
  };
}

// Robust helper to parse response JSON safely and handle HTML/SPA fallback errors cleanly
async function safeReadJson(response: Response) {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Expected JSON but received content-type "${contentType}" with body: ${text.slice(0, 75)}...`);
  }
  return response.json();
}

// Robust helper to read error response messages without crashing on non-JSON HTML pages
async function safeReadError(response: Response, defaultMessage: string): Promise<string> {
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const errData = await response.json();
      return errData.error || defaultMessage;
    } else {
      const text = await response.text();
      return `${defaultMessage} (Server Error ${response.status}: ${text.slice(0, 100).replace(/<[^>]*>/g, '').trim()})`;
    }
  } catch {
    return `${defaultMessage} (Status Code: ${response.status})`;
  }
}

// 1. Subscribe to REALTIME products using smart REST API polling
export function subscribeProducts(userEmail: string, onChange: (products: Product[]) => void) {
  let active = true;
  const controller = new AbortController();

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products', {
        headers: getHeaders(userEmail),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Failed to fetch products (HTTP ${response.status})`);
      const data = await safeReadJson(response);
      if (active) {
        onChange(data);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.warn('[REST Hint] Problems polling products:', error?.message || error);
    }
  };

  fetchProducts();
  const intervalId = setInterval(fetchProducts, 4000);

  return () => {
    active = false;
    controller.abort();
    clearInterval(intervalId);
  };
}

// 2. Subscribe to REALTIME stock-ins using smart REST API polling
export function subscribeStockIns(userEmail: string, onChange: (stockIns: StockIn[]) => void) {
  let active = true;
  const controller = new AbortController();

  const fetchStockIns = async () => {
    try {
      const response = await fetch('/api/stock-ins', {
        headers: getHeaders(userEmail),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Failed to fetch stock-ins (HTTP ${response.status})`);
      const data = await safeReadJson(response);
      if (active) {
        onChange(data);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.warn('[REST Hint] Problems polling stock-ins:', error?.message || error);
    }
  };

  fetchStockIns();
  const intervalId = setInterval(fetchStockIns, 4000);

  return () => {
    active = false;
    controller.abort();
    clearInterval(intervalId);
  };
}

// 3. Subscribe to REALTIME sales using smart REST API polling
export function subscribeSales(userEmail: string, onChange: (sales: Sale[]) => void) {
  let active = true;
  const controller = new AbortController();

  const fetchSales = async () => {
    try {
      const response = await fetch('/api/sales', {
        headers: getHeaders(userEmail),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Failed to fetch sales (HTTP ${response.status})`);
      const data = await safeReadJson(response);
      if (active) {
        onChange(data);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.warn('[REST Hint] Problems polling sales:', error?.message || error);
    }
  };

  fetchSales();
  const intervalId = setInterval(fetchSales, 4000);

  return () => {
    active = false;
    controller.abort();
    clearInterval(intervalId);
  };
}

// 4. Subscribe to REALTIME notifications using smart REST API polling
export function subscribeNotifications(userEmail: string, onChange: (notifications: Notification[]) => void) {
  let active = true;
  const controller = new AbortController();

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', {
        headers: getHeaders(userEmail),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Failed to fetch notifications (HTTP ${response.status})`);
      const data = await safeReadJson(response);
      if (active) {
        onChange(data);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.warn('[REST Hint] Problems polling notifications:', error?.message || error);
    }
  };

  fetchNotifications();
  const intervalId = setInterval(fetchNotifications, 4000);

  return () => {
    active = false;
    controller.abort();
    clearInterval(intervalId);
  };
}

// 5. Subscribe to REALTIME activity logs using smart REST API polling
export function subscribeActivityLogs(userEmail: string, onChange: (logs: ActivityLog[]) => void) {
  let active = true;
  const controller = new AbortController();

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/activity-logs', {
        headers: getHeaders(userEmail),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Failed to fetch activity logs (HTTP ${response.status})`);
      const data = await safeReadJson(response);
      if (active) {
        onChange(data);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.warn('[REST Hint] Problems polling activity logs:', error?.message || error);
    }
  };

  fetchLogs();
  const intervalId = setInterval(fetchLogs, 4000);

  return () => {
    active = false;
    controller.abort();
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
    const errorMsg = await safeReadError(response, 'Failed to create product');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
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
    const errorMsg = await safeReadError(response, 'Failed to update product');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
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
    const errorMsg = await safeReadError(response, 'Failed to delete product');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
}

// 9. Restock a Product (Stock In)
export async function stockIn(pId: string, qty: number, purchasePrice: number, notes: string) {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('Unauthenticated');

  const response = await fetch('/api/stock-ins', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      productId: pId,
      quantity: qty,
      purchasePrice: purchasePrice,
      notes: notes,
    }),
  });

  if (!response.ok) {
    const errorMsg = await safeReadError(response, 'Failed to record restocking delivery');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
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
    const errorMsg = await safeReadError(response, 'Failed to process checkout sale');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
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
    const errorMsg = await safeReadError(response, 'Failed to update notification');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
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
    const errorMsg = await safeReadError(response, 'Failed to delete notification');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
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
    const errorMsg = await safeReadError(response, 'Failed to clear system state');
    throw new Error(errorMsg);
  }

  return safeReadJson(response);
}
