import { useState, useEffect } from 'react';
import { auth, onAuthStateChanged, LocalUser as User } from './firebase';
import { Page, Product, Sale, StockIn, Notification, ActivityLog } from './types';
import { 
  subscribeProducts,
  subscribeSales,
  subscribeStockIns,
  subscribeNotifications,
  subscribeActivityLogs
} from './services/db';

// Components
import LoginView from './components/LoginView';
import HeaderNav from './components/HeaderNav';
import DashboardView from './components/DashboardView';
import ProductsView from './components/ProductsView';
import StockInView from './components/StockInView';
import SalesView from './components/SalesView';
import NotificationsView from './components/NotificationsView';
import ActivityLogsView from './components/ActivityLogsView';
import AIAssistantView from './components/AIAssistantView';
import SuperAdminView from './components/SuperAdminView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [networkHealthy, setNetworkHealthy] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>(Page.Dashboard);

  // Collections State
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [stockIns, setStockIns] = useState<StockIn[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  // 1. Validate Connection to Backend on initial application boot
  useEffect(() => {
    async function testConnection() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setNetworkHealthy(true);
        } else {
          setNetworkHealthy(false);
        }
      } catch (error: any) {
        console.error("Please check your PostgreSQL backend running status.", error);
        setNetworkHealthy(false);
      }
    }
    testConnection();
  }, []);

  // 2. Track Firebase auth states
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 3. Keep real-time synchronized collections if and only if authenticated
  useEffect(() => {
    if (!currentUser || !currentUser.email) return;

    const email = currentUser.email;

    const unsubProducts = subscribeProducts(email, setProducts);
    const unsubSales = subscribeSales(email, setSales);
    const unsubStockIns = subscribeStockIns(email, setStockIns);
    const unsubNotifications = subscribeNotifications(email, setNotifications);
    const unsubLogs = subscribeActivityLogs(email, setActivityLogs);

    return () => {
      unsubProducts();
      unsubSales();
      unsubStockIns();
      unsubNotifications();
      unsubLogs();
    };
  }, [currentUser]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-bold mt-4 tracking-wide uppercase">Initializing StockWise...</p>
      </div>
    );
  }

  // Not signed in -> Login portal view
  if (!currentUser) {
    return <LoginView onLoginSuccess={() => setCurrentPage(Page.Dashboard)} />;
  }

  // Unread Count helper
  const unreadNotificationsCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header Navigation Bar */}
      <HeaderNav 
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        unreadCount={unreadNotificationsCount}
        networkHealthy={networkHealthy}
      />

      {/* Primary layout body */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Dynamic page state router container component */}
        <main className="p-6 md:p-8 flex-1 max-w-7xl w-full mx-auto">
          {currentPage === Page.Dashboard && (
            <DashboardView 
              products={products}
              sales={sales}
              notificationsCount={unreadNotificationsCount}
              onNavigate={setCurrentPage}
              currentUser={currentUser}
            />
          )}

          {currentPage === Page.Products && (
            <ProductsView products={products} />
          )}

          {currentPage === Page.StockIn && (
            <StockInView products={products} stockIns={stockIns} />
          )}

          {currentPage === Page.Sales && (
            <SalesView products={products} sales={sales} />
          )}

          {currentPage === Page.Notifications && (
            <NotificationsView notifications={notifications} />
          )}

          {currentPage === Page.ActivityLogs && (
            <ActivityLogsView logs={activityLogs} />
          )}

          {currentPage === Page.AIAssistant && (
            <AIAssistantView />
          )}

          {currentPage === Page.SuperAdmin && (
            <SuperAdminView currentUserEmail={currentUser.email} />
          )}
        </main>
      </div>
    </div>
  );
}
