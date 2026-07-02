import { useState, useEffect, useRef } from 'react';
import { auth, onAuthStateChanged, LocalUser as User } from './firebase';
import { Page, Product, Sale, StockIn, Notification as StockNotification, ActivityLog } from './types';
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
import FloatingAIAssistant from './components/FloatingAIAssistant';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [networkHealthy, setNetworkHealthy] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>(Page.Dashboard);

  // Theme State (Persisted in localStorage, respects system theme if no preference saved)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {
      console.warn('localStorage read blocked by browser privacy/sandboxing:', e);
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.warn('localStorage write blocked by browser privacy/sandboxing:', e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Collections State
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [stockIns, setStockIns] = useState<StockIn[]>([]);
  const [notifications, setNotifications] = useState<StockNotification[]>([]);
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

  const prevNotificationsRef = useRef<StockNotification[]>([]);

  useEffect(() => {
    if (notifications.length === 0) {
      prevNotificationsRef.current = [];
      return;
    }

    // Only alert for NEW unread notifications to avoid spamming existing ones on boot
    if (prevNotificationsRef.current.length > 0) {
      const newUnread = notifications.filter(n => {
        const isNew = !prevNotificationsRef.current.some(prev => prev.id === n.id);
        return isNew && !n.isRead;
      });

      newUnread.forEach(n => {
        // Native desktop notifications if granted
        if ('Notification' in window && Notification.permission === 'granted') {
          let title = '⚠️ Low Stock Warning';
          if (n.type === 'out_of_stock') {
            title = '❌ Out of Stock Alert';
          } else if (n.type === 'critical_stock') {
            title = '🚨 Critical Stock Alert';
          }
          
          const nativeNotif = new window.Notification(title, {
            body: n.message,
            icon: '/favicon.ico',
          });

          nativeNotif.onclick = () => {
            window.focus();
            if (n.productName) {
              try {
                localStorage.setItem('search_product_name', n.productName);
              } catch (e) {
                console.warn('localStorage write blocked by browser privacy/sandboxing:', e);
              }
              setCurrentPage(Page.Products);
            } else {
              setCurrentPage(Page.Notifications);
            }
          };
        }
      });
    }

    prevNotificationsRef.current = notifications;
  }, [notifications]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-4 tracking-wide uppercase">Initializing StockWise...</p>
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Header Navigation Bar */}
      <HeaderNav 
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        unreadCount={unreadNotificationsCount}
        networkHealthy={networkHealthy}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Primary layout body */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Dynamic page state router container component with bottom padding adjust on mobile */}
        <main className="p-4 pb-24 md:p-8 flex-1 max-w-7xl w-full mx-auto">
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
            <NotificationsView notifications={notifications} onNavigate={setCurrentPage} />
          )}

          {currentPage === Page.ActivityLogs && (
            <ActivityLogsView logs={activityLogs} currentUserEmail={currentUser?.email || ''} />
          )}

          {currentPage === Page.AIAssistant && (
            <AIAssistantView />
          )}

          {currentPage === Page.SuperAdmin && (
            <SuperAdminView currentUserEmail={currentUser.email} />
          )}
        </main>
      </div>
      
      {/* Global floating quick-chat virtual assistant handler */}
      {currentPage !== Page.AIAssistant && (
        <FloatingAIAssistant />
      )}
    </div>
  );
}
