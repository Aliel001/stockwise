import { useState, useEffect } from 'react';
import { Notification as StockNotification, Page } from '../types';
import { 
  markNotificationAsRead, 
  deleteNotification, 
  getNotificationSettings, 
  updateNotificationSettings 
} from '../services/db';
import { 
  Bell, 
  Eye, 
  Trash2, 
  ShieldAlert, 
  CheckCircle, 
  Calendar, 
  Settings, 
  Smartphone, 
  Laptop, 
  AlertTriangle,
  ExternalLink,
  Sliders,
  Sparkles
} from 'lucide-react';
import { safeGetDate } from '../utils/date';

interface NotificationsViewProps {
  notifications: StockNotification[];
  onNavigate?: (page: Page) => void;
}

export default function NotificationsView({ notifications, onNavigate }: NotificationsViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    enableNotifications: true,
    desktopNotifications: true,
    mobilePushNotifications: true,
    lowStockAlerts: true,
    criticalStockAlerts: true,
    outOfStockAlerts: true
  });
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Load user settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        setSettingsLoading(true);
        const data = await getNotificationSettings();
        if (data) {
          setSettings(data);
        }
      } catch (err: any) {
        console.warn('Failed to fetch notification settings:', err);
      } finally {
        setSettingsLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleToggle = async (key: keyof typeof settings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);

    // Request native permission if toggling desktop notifications on
    if (key === 'desktopNotifications' && updated.desktopNotifications) {
      if ('Notification' in window && Notification.permission !== 'granted') {
        try {
          await Notification.requestPermission();
        } catch (e) {
          console.warn('Notification permission request denied or failed:', e);
        }
      }
    }

    try {
      await updateNotificationSettings(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to update preferences.');
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      setError(null);
      await markNotificationAsRead(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark as read.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError(null);
      await deleteNotification(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete notification.');
    }
  };

  const handleOpenProduct = (name: string) => {
    try {
      localStorage.setItem('search_product_name', name);
    } catch (e) {
      console.warn('localStorage write blocked by browser privacy/sandboxing:', e);
    }
    if (onNavigate) {
      onNavigate(Page.Products);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Store Notifications & Alerts
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time critical, low, and out-of-stock alarm metrics linked directly to store catalogs.
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center space-x-1.5 cursor-pointer ${
              settingsOpen 
                ? 'bg-slate-800 text-white border-slate-800' 
                : 'bg-white text-slate-700 border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Settings Preferences</span>
          </button>

          <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg shrink-0 border border-indigo-100 flex items-center space-x-1.5 select-none">
            <Bell className="w-4 h-4" />
            <span>{unreadCount} Alarm{unreadCount !== 1 ? 's' : ''} Active</span>
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {/* Preferences Section (Collapsible Settings Panel) */}
      {settingsOpen && (
        <div className="p-5 bg-white rounded-2xl border border-slate-100/90 shadow-md max-w-3xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center space-x-2 mb-4">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Configure Alerts</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Delivery Methods */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1">Channels</h4>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Enable Notifications</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Toggle global system alerts</p>
                </div>
                <input 
                  type="checkbox"
                  checked={settings.enableNotifications}
                  onChange={() => handleToggle('enableNotifications')}
                  className="w-9 h-5 bg-slate-200 rounded-full appearance-none cursor-pointer relative checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:w-4 after:h-4 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:translate-x-4 after:transition-transform"
                />
              </div>

              <div className="flex items-center justify-between opacity-80">
                <div className="flex items-start space-x-2">
                  <Laptop className="w-4 h-4 text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Desktop Notifications</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Native system push permissions</p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={settings.desktopNotifications}
                  onChange={() => handleToggle('desktopNotifications')}
                  disabled={!settings.enableNotifications}
                  className="w-9 h-5 bg-slate-200 rounded-full appearance-none cursor-pointer relative checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:w-4 after:h-4 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:translate-x-4 after:transition-transform disabled:opacity-40"
                />
              </div>

              <div className="flex items-center justify-between opacity-80">
                <div className="flex items-start space-x-2">
                  <Smartphone className="w-4 h-4 text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Mobile Alerts</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Register responsive devices</p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={settings.mobilePushNotifications}
                  onChange={() => handleToggle('mobilePushNotifications')}
                  disabled={!settings.enableNotifications}
                  className="w-9 h-5 bg-slate-200 rounded-full appearance-none cursor-pointer relative checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:w-4 after:h-4 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:translate-x-4 after:transition-transform disabled:opacity-40"
                />
              </div>
            </div>

            {/* Threshold Levels */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-1">Alarm Thresholds</h4>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Low Stock Warning</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Trigger at safety minimum (Min Stock)</p>
                </div>
                <input 
                  type="checkbox"
                  checked={settings.lowStockAlerts}
                  onChange={() => handleToggle('lowStockAlerts')}
                  disabled={!settings.enableNotifications}
                  className="w-9 h-5 bg-slate-200 rounded-full appearance-none cursor-pointer relative checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:w-4 after:h-4 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:translate-x-4 after:transition-transform disabled:opacity-40"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Critical Stock Warning</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Trigger at 25% of safety minimum</p>
                </div>
                <input 
                  type="checkbox"
                  checked={settings.criticalStockAlerts}
                  onChange={() => handleToggle('criticalStockAlerts')}
                  disabled={!settings.enableNotifications}
                  className="w-9 h-5 bg-slate-200 rounded-full appearance-none cursor-pointer relative checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:w-4 after:h-4 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:translate-x-4 after:transition-transform disabled:opacity-40"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-700">Out of Stock Threat</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Trigger immediately when quantity reaches 0</p>
                </div>
                <input 
                  type="checkbox"
                  checked={settings.outOfStockAlerts}
                  onChange={() => handleToggle('outOfStockAlerts')}
                  disabled={!settings.enableNotifications}
                  className="w-9 h-5 bg-slate-200 rounded-full appearance-none cursor-pointer relative checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:w-4 after:h-4 after:rounded-full after:bg-white after:top-0.5 after:left-0.5 checked:after:translate-x-4 after:transition-transform disabled:opacity-40"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid or simple clean vertical cards */}
      {notifications.length === 0 ? (
        <div className="bg-white rounded-xl py-16 text-center border border-slate-100 max-w-3xl">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg select-none">
            ✓
          </div>
          <p className="text-xs font-bold text-slate-600">No active alerts recorded</p>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed max-w-xs mx-auto">
            Your store is completely stocked and operating cleanly within safety margins.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {notifications.map((n) => {
            const isOutOfStock = n.type === 'out_of_stock';
            const isCriticalStock = n.type === 'critical_stock';
            const isLowStock = n.type === 'low_stock';

            // Custom visual style mappings for thresholds
            let badgeStyle = 'bg-slate-50 text-slate-650';
            let alertLabel = 'System Notification';
            let iconBox = 'bg-slate-50 text-slate-600';

            if (isOutOfStock) {
              badgeStyle = 'bg-rose-50 text-rose-700 border border-rose-100';
              alertLabel = '❌ OUT OF STOCK';
              iconBox = 'bg-rose-100/70 text-rose-700';
            } else if (isCriticalStock) {
              badgeStyle = 'bg-orange-50 text-orange-700 border border-orange-100';
              alertLabel = '🚨 CRITICAL STOCK';
              iconBox = 'bg-orange-100/70 text-orange-700';
            } else if (isLowStock) {
              badgeStyle = 'bg-amber-50 text-amber-700 border border-amber-100';
              alertLabel = '⚠️ LOW STOCK';
              iconBox = 'bg-amber-100/70 text-amber-700';
            }

            return (
              <div 
                key={n.id}
                className={`p-4 bg-white rounded-xl border transition-all flex items-start justify-between gap-4 ${
                  !n.isRead 
                    ? 'border-indigo-200 ring-2 ring-indigo-500/5 shadow-md shadow-indigo-50/10' 
                    : 'border-slate-100 shadow-sm opacity-70'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  <div className={`p-2 rounded-xl shrink-0 ${iconBox}`}>
                    {isOutOfStock || isCriticalStock || isLowStock ? (
                      <ShieldAlert className="w-5 h-5 animate-pulse" />
                    ) : (
                      <Bell className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className={`px-2 py-0.5 text-[8px] font-extrabold tracking-wider rounded-md uppercase ${badgeStyle}`}>
                        {alertLabel}
                      </span>
                      {n.productName && (
                        <span className="text-[10px] font-bold text-slate-700">
                          {n.productName}
                        </span>
                      )}
                    </div>

                    <p className={`text-xs leading-relaxed whitespace-pre-line ${!n.isRead ? 'font-bold text-slate-800' : 'font-semibold text-slate-500'}`}>
                      {n.message}
                    </p>
                    
                    {n.stockRemaining !== undefined && n.stockRemaining !== null && (
                      <p className="text-[10px] text-indigo-650 font-bold mt-1">
                        Remaining Stock: <span className="underline">{n.stockRemaining} units</span> / Threshold: {n.minimumStock || 0}
                      </p>
                    )}

                    <div className="flex items-center space-x-2.5 mt-2.5 text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{n.createdAt ? safeGetDate(n.createdAt).toLocaleString() : ''}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {n.productName && onNavigate && (
                    <button
                      onClick={() => handleOpenProduct(n.productName || '')}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-650 rounded-lg transition-colors cursor-pointer"
                      title="Open Related Product"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                  
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-650 rounded-lg transition-colors cursor-pointer"
                      title="Mark read"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-450 rounded-lg transition-colors cursor-pointer"
                    title="Dismiss alert"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
