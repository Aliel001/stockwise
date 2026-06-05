export interface Product {
  id: string;
  name: string;
  description: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  minStock: number;
  createdBy: string;
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
}

export interface StockIn {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  supplier?: string;
  notes: string;
  performedBy: string;
  createdAt: string; // ISO String
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  performedBy: string;
  createdAt: string; // ISO String
}

export interface Notification {
  id: string;
  message: string;
  type: 'low_stock' | 'info';
  isRead: boolean;
  userEmail: string;
  createdAt: string; // ISO String
}

export interface ActivityLog {
  id: string;
  action: string;
  performedBy: string;
  createdAt: string; // ISO String
}

export enum Page {
  Dashboard = 'dashboard',
  Products = 'products',
  StockIn = 'stock_in',
  Sales = 'sales',
  Notifications = 'notifications',
  ActivityLogs = 'activity_logs',
}
