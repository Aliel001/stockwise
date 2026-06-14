import { useMemo, useState, useEffect } from 'react';
import { Product, Sale, Page } from '../types';
import { 
  Package, 
  Warehouse, 
  TrendingUp, 
  CalendarDays, 
  AlertTriangle, 
  ArrowRight,
  ShoppingBag,
  Bell,
  Database,
  Trash2,
  ShieldAlert,
  Users,
  UserCheck,
  Shield,
  Activity,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LocalUser } from '../firebase';
import { safeGetDate, safeGetISOString } from '../utils/date';
import { clearAllData } from '../services/db';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 text-white p-3 rounded-xl shadow-xl font-sans text-xs">
        <p className="font-bold text-slate-400 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center space-x-2 mt-1">
            <span 
              className="w-2 h-2 rounded-full inline-block" 
              style={{ backgroundColor: entry.color || entry.fill || '#6366f1' }} 
            />
            <span className="font-medium text-slate-300">
              {entry.name}:
            </span>
            <span className="font-bold text-white">
              {entry.name === 'Revenue' ? `RWF ${Math.round(entry.value).toLocaleString()}` : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

interface DashboardViewProps {
  products: Product[];
  sales: Sale[];
  notificationsCount: number;
  onNavigate: (page: Page) => void;
  currentUser?: LocalUser | null;
}

export default function DashboardView({ products, sales, notificationsCount, onNavigate, currentUser }: DashboardViewProps) {
  // Database maintenance state
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Super Admin specific state
  interface AdminStats {
    totalUsers: number;
    activeUsers: number;
    pendingUsers: number;
    rejectedUsers: number;
    suspendedUsers: number;
  }
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    if (currentUser?.role !== 'SUPER_ADMIN') return;
    
    const fetchAdminStats = async () => {
      try {
        setAdminLoading(true);
        const res = await fetch('/api/super-admin/stats', {
          headers: {
            'x-user-email': currentUser.email || '',
          }
        });
        if (res.ok) {
          const data = await res.json();
          setAdminStats(data);
        }
      } catch (err) {
        console.error('Error fetching admin stats:', err);
      } finally {
        setAdminLoading(false);
      }
    };

    fetchAdminStats();
  }, [currentUser]);

  // Stats Calculations
  const stats = useMemo(() => {
    const totalProducts = products.length;
    let totalStock = 0;
    
    products.forEach(p => {
      totalStock += p.quantity;
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM format

    let todaySalesValue = 0;
    let monthlySalesValue = 0;

    sales.forEach(sale => {
      if (!sale.createdAt) return;
      // Convert server timestamp to date string safely
      const saleISO = safeGetISOString(sale.createdAt);
      const saleDate = saleISO.split('T')[0];
      const saleMonth = saleISO.slice(0, 7);

      if (saleDate === todayStr) {
        todaySalesValue += sale.totalPrice;
      }
      if (saleMonth === currentMonthPrefix) {
        monthlySalesValue += sale.totalPrice;
      }
    });

    // Low stock items filtering
    const lowStockItems = products.filter(p => p.quantity <= p.minStock);

    return {
      totalProducts,
      totalStock,
      todaySalesValue,
      monthlySalesValue,
      lowStockItems
    };
  }, [products, sales]);

  const [timeframe, setTimeframe] = useState<'7days' | '30days' | '12months' | 'yearly'>('7days');

  // 1. Weekly Data (Last 7 Days)
  const sevenDaysData = useMemo(() => {
    const data: { [key: string]: { dateStr: string; label: string; amount: number; quantity: number } } = {};
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      data[dateKey] = {
        dateStr: dateKey,
        label: formattedDate,
        amount: 0,
        quantity: 0
      };
    }

    sales.forEach(sale => {
      if (!sale.createdAt) return;
      const dateKey = safeGetISOString(sale.createdAt).split('T')[0];
      if (data[dateKey] !== undefined) {
        data[dateKey].amount += sale.totalPrice;
        data[dateKey].quantity += sale.quantity;
      }
    });

    return Object.values(data);
  }, [sales]);

  // 2. Monthly Data (Last 30 Days)
  const monthlyData = useMemo(() => {
    const data: { [key: string]: { dateStr: string; label: string; amount: number; quantity: number } } = {};
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      data[dateKey] = {
        dateStr: dateKey,
        label: formattedDate,
        amount: 0,
        quantity: 0
      };
    }

    sales.forEach(sale => {
      if (!sale.createdAt) return;
      const dateKey = safeGetISOString(sale.createdAt).split('T')[0];
      if (data[dateKey] !== undefined) {
        data[dateKey].amount += sale.totalPrice;
        data[dateKey].quantity += sale.quantity;
      }
    });

    return Object.values(data);
  }, [sales]);

  // 3. Rolling 12 Months and Yearly Performance
  const yearsData = useMemo(() => {
    const rollingMonthly: { [key: string]: { monthKey: string; label: string; amount: number; quantity: number } } = {};
    const yearTotals: { [key: string]: { label: string; amount: number; quantity: number } } = {};
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      rollingMonthly[monthKey] = {
        monthKey,
        label,
        amount: 0,
        quantity: 0
      };
    }

    sales.forEach(sale => {
      if (!sale.createdAt) return;
      const saleDate = safeGetDate(sale.createdAt);
      const saleYear = String(saleDate.getFullYear());
      const monthKey = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;

      if (rollingMonthly[monthKey] !== undefined) {
        rollingMonthly[monthKey].amount += sale.totalPrice;
        rollingMonthly[monthKey].quantity += sale.quantity;
      }

      if (!yearTotals[saleYear]) {
        yearTotals[saleYear] = {
          label: saleYear,
          amount: 0,
          quantity: 0
        };
      }
      yearTotals[saleYear].amount += sale.totalPrice;
      yearTotals[saleYear].quantity += sale.quantity;
    });

    const rollingMonths = Object.values(rollingMonthly);
    const yearly = Object.values(yearTotals).sort((a, b) => a.label.localeCompare(b.label));

    return {
      rollingMonths,
      yearly: yearly.length > 0 ? yearly : [{ label: String(now.getFullYear()), amount: 0, quantity: 0 }]
    };
  }, [sales]);

  const chartData = useMemo(() => {
    switch (timeframe) {
      case '7days':
        return sevenDaysData;
      case '30days':
        return monthlyData;
      case '12months':
        return yearsData.rollingMonths;
      case 'yearly':
        return yearsData.yearly;
      default:
        return sevenDaysData;
    }
  }, [timeframe, sevenDaysData, monthlyData, yearsData]);

  const handlePurgeAllData = async () => {
    if (purgeInput !== 'PURGE' && purgeInput !== 'STOCKWISE SECURE PURGE') return;
    setResetLoading(true);
    setResetError(null);
    try {
      await clearAllData();
      setResetConfirmOpen(false);
      setPurgeInput('');
    } catch (err: any) {
      setResetError(err?.message || 'Failed to clear system data.');
    } finally {
      setResetLoading(false);
    }
  };

  if (currentUser?.role === 'SUPER_ADMIN') {
    return (
      <div className="space-y-6">
        {/* Welcome Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
              System Admin Control Center
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Real-time user authorization, security auditing logs, and general system status configurations.
            </p>
          </div>
          
          {adminStats && adminStats.pendingUsers > 0 && (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 border border-indigo-250 text-indigo-800 rounded-xl text-xs font-semibold cursor-pointer select-none"
              onClick={() => onNavigate(Page.SuperAdmin)}
            >
              <Users className="w-4 h-4 text-indigo-600 animate-pulse" />
              <span>{adminStats.pendingUsers} enrollment request{adminStats.pendingUsers !== 1 ? 's' : ''} awaiting approval!</span>
              <ArrowRight className="w-3.5 h-3.5 text-indigo-600 ml-1" />
            </motion.div>
          )}
        </div>

        {/* Primary Counters - Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          
          {/* Total Registered Users */}
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider font-sans">Registered Users</span>
              <span className="text-3xl font-extrabold text-slate-800 mt-1 block font-sans">
                {adminStats ? adminStats.totalUsers : '...'}
              </span>
              <button 
                onClick={() => onNavigate(Page.SuperAdmin)}
                className="mt-3 text-xs font-semibold text-indigo-650 flex items-center hover:text-indigo-800 transition-colors"
              >
                <span>Manage Users</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-slate-500">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* Pending Approvals */}
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider font-sans">Awaiting Approvals</span>
              <span className={`text-3xl font-extrabold mt-1 block font-sans ${adminStats && adminStats.pendingUsers > 0 ? 'text-amber-500 font-bold' : 'text-slate-800'}`}>
                {adminStats ? adminStats.pendingUsers : '...'}
              </span>
              <span className="text-[10px] text-slate-400 block mt-3">Requires prompt review</span>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          {/* Active Members */}
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider font-sans">Active Accounts</span>
              <span className="text-3xl font-extrabold text-emerald-600 mt-1 block font-sans">
                {adminStats ? adminStats.activeUsers : '...'}
              </span>
              <span className="text-[10px] text-slate-400 block mt-3">Authorized specialists</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>

          {/* Blocked or Suspended Accounts */}
          <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
            <div>
              <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider font-sans">Suspended & Rejected</span>
              <span className="text-3xl font-extrabold text-rose-600 mt-1 block font-sans font-sans">
                {adminStats ? (adminStats.rejectedUsers + adminStats.suspendedUsers) : '...'}
              </span>
              <span className="text-[10px] text-slate-400 mt-3 block font-semibold">Access restricted</span>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl text-rose-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* Lower body grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick Access Actions */}
          <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 font-sans">System Management</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Quick access shortcuts</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                As the Super Admin, you are responsible for monitoring platform access. Review enrollment alerts and verify personnel identities before approving their credentials.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => onNavigate(Page.SuperAdmin)}
                className="w-full text-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer block"
              >
                Go to Access System Panel
              </button>
              <button
                onClick={() => onNavigate(Page.ActivityLogs)}
                className="w-full text-center px-4 py-2.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/65 font-bold text-xs rounded-xl transition-colors cursor-pointer block"
              >
                Review Activity & Audit Logs
              </button>
            </div>
          </div>

          {/* System Notifications Quick Look Card */}
          <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 font-sans">Active System Notifications & Alarms</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Critical system indicators and enrollment requests</p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-650 text-[10px] font-bold rounded-lg border border-indigo-100">
                {notificationsCount} Pending
              </span>
            </div>

            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Access the Alerts panel to see low shelf quantity alerts from managers, or inspect registration reports submitted by prospective applicants.
            </p>

            <button
              onClick={() => onNavigate(Page.Notifications)}
              className="w-full text-center px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-xl transition-colors cursor-pointer block"
            >
              Open Alerts & Notifications Page
            </button>
          </div>

        </div>

        {/* Database Maintenance Option */}
        <div className="bg-white rounded-xl p-6 border border-slate-200/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center space-x-3.5">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Database Maintenance</h3>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">Wipe & Clear System Inventory Data</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed max-w-xl">
                Permanently purge all inserted products, stock-in history records, completed checkout sales, active alerts, and database logs from the system.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setResetError(null);
              setPurgeInput('');
              setResetConfirmOpen(true);
            }}
            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl border border-rose-200 transition-colors shadow-sm cursor-pointer select-none font-sans"
          >
            Purge Storage
          </button>
        </div>

        {/* Database Reset Dialog Modal */}
        <AnimatePresence>
          {resetConfirmOpen && (
            <>
              <div 
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 shadow-2xl"
                onClick={() => !resetLoading && setResetConfirmOpen(false)}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl max-w-md w-full border border-slate-150 shadow-2xl p-6 text-slate-800 relative font-sans"
                >
                  <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
                    <Trash2 className="w-6 h-6" />
                  </div>

                  <h3 className="text-base font-bold text-slate-900 tracking-tight font-sans">
                    Are you absolutely sure?
                  </h3>
                  
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    This operation is <span className="font-bold text-rose-650">irreversible</span>. It will wipe all collections database-wide, leaving a fresh clean installation state.
                  </p>

                  <div className="mt-4 p-3 bg-rose-50/50 rounded-xl border border-rose-100">
                    <p className="text-[10px] text-rose-800 font-bold leading-normal">
                      To confirm deletion, please enter the pass-phrase <span className="underline select-all">"STOCKWISE SECURE PURGE"</span> in the box below:
                    </p>
                    
                    <input 
                      type="text" 
                      placeholder='Type "STOCKWISE SECURE PURGE"...'
                      value={purgeInput}
                      onChange={(e) => setPurgeInput(e.target.value)}
                      disabled={resetLoading}
                      className="w-full mt-2.5 px-3 py-2 bg-white rounded-lg border border-rose-200/60 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-rose-500/10 placeholder-rose-300"
                    />
                  </div>

                  {resetError && (
                    <div className="mt-3 p-2.5 bg-rose-100 text-rose-700 text-[10px] font-semibold rounded-lg leading-relaxed">
                      {resetError}
                    </div>
                  )}

                  <div className="mt-6 flex justify-end gap-2.5">
                    <button
                      type="button"
                      disabled={resetLoading}
                      onClick={() => setResetConfirmOpen(false)}
                      className="px-3.5 py-2 hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Bypass Cancel
                    </button>
                    
                    <button
                      type="button"
                      disabled={resetLoading || purgeInput !== "STOCKWISE SECURE PURGE"}
                      onClick={handlePurgeAllData}
                      className={`px-4 py-2 text-white font-bold text-xs rounded-lg shadow-sm transition-all flex items-center space-x-1 ${
                        purgeInput === "STOCKWISE SECURE PURGE" && !resetLoading
                          ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      }`}
                    >
                      {resetLoading ? 'Wiping Storage...' : 'Yes, Purge Data'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
            Inventory Executive Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time shop status, transaction summaries, and low-level shelf warnings.
          </p>
        </div>
        
        {stats.lowStockItems.length > 0 && (
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center space-x-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold cursor-pointer select-none"
            onClick={() => onNavigate(Page.Notifications)}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 animate-bounce" />
            <span>{stats.lowStockItems.length} items require prompt restock!</span>
            <ArrowRight className="w-3 h-3 text-amber-600 ml-1" />
          </motion.div>
        )}
      </div>

      {/* Primary Counters - Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Total Products */}
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Total Products</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-1 block font-sans">{stats.totalProducts}</span>
            <button 
              onClick={() => onNavigate(Page.Products)}
              className="mt-3 text-xs font-semibold text-indigo-600 flex items-center hover:text-indigo-800 transition-colors"
            >
              <span>View catalog</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-slate-500">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Total Stock Available */}
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Stock Volume</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-1 block font-sans">{stats.totalStock}</span>
            <span className="text-[10px] text-slate-400 block mt-3">Current warehouse tally</span>
          </div>
          <div className="p-3 bg-sky-50 rounded-xl text-sky-600">
            <Warehouse className="w-6 h-6" />
          </div>
        </div>

        {/* Today's Tally */}
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Today's Sales</span>
            <span className="text-3xl font-extrabold text-emerald-600 mt-1 block font-sans">
              RWF {Math.round(stats.todaySalesValue).toLocaleString()}
            </span>
            <button 
              onClick={() => onNavigate(Page.Sales)}
              className="mt-3 text-xs font-semibold text-emerald-600 flex items-center hover:text-emerald-800 transition-colors"
            >
              <span>View sales</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Monthly Estimate */}
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
          <div>
            <span className="text-xs font-semibold text-slate-400 block uppercase tracking-wider">Monthly Revenue</span>
            <span className="text-3xl font-extrabold text-indigo-600 mt-1 block font-sans">
              RWF {Math.round(stats.monthlySalesValue).toLocaleString()}
            </span>
            <span className="text-[10px] text-indigo-400 mt-3 block font-semibold">Active billing cycle</span>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <CalendarDays className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Graphical Section & Summary columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recharts Analytics Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Sales Analytics Performance</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 animate-pulse">
                {timeframe === '7days' && 'Detailed checkout transactions over the last 7 days'}
                {timeframe === '30days' && 'Daily revenue trends and units sold across the last 30 days'}
                {timeframe === '12months' && 'Seasonal monthly demand patterns over rolling last 12 months'}
                {timeframe === 'yearly' && 'Annual historical performance and business growth summaries'}
              </p>
            </div>
            
            {/* Timeframe Switcher */}
            <div className="flex flex-wrap gap-1 p-1 bg-slate-50 border border-slate-100 rounded-xl self-start sm:self-auto">
              {(['7days', '30days', '12months', 'yearly'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTimeframe(opt)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    timeframe === opt
                      ? 'bg-indigo-600 text-white shadow-xs animate-none'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt === '7days' && '7 Days'}
                  {opt === '30days' && '30 Days'}
                  {opt === '12months' && '12 Months'}
                  {opt === 'yearly' && 'Yearly'}
                </button>
              ))}
            </div>
          </div>

          {/* Recharts Render Container */}
          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              {timeframe === 'yearly' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmountBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.15}/>
                    </linearGradient>
                    <linearGradient id="colorQtyBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.15}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    fontFamily="Inter, sans-serif"
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    fontFamily="JetBrains Mono, monospace"
                    tickFormatter={(value) => `RWF ${Math.round(value).toLocaleString()}`} 
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px', fontWeight: 600, color: '#64748b', fontFamily: 'Inter, sans-serif' }}
                  />
                  <Bar name="Revenue" dataKey="amount" fill="url(#colorAmountBar)" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar name="Units Sold" dataKey="quantity" fill="url(#colorQtyBar)" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorQty" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    minTickGap={timeframe === '30days' ? 25 : 5}
                    fontFamily="Inter, sans-serif"
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    fontFamily="JetBrains Mono, monospace"
                    tickFormatter={(value) => `RWF ${(value >= 1000000) ? (value / 1000000).toFixed(1) + 'M' : (value / 1000).toFixed(0) + 'K'}`}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ fontSize: '10px', fontWeight: 600, color: '#64748b', fontFamily: 'Inter, sans-serif' }}
                  />
                  <Area 
                    type="monotone" 
                    name="Revenue" 
                    dataKey="amount" 
                    stroke="#6366f1" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorAmount)" 
                  />
                  <Area 
                    type="monotone" 
                    name="Units Sold" 
                    dataKey="quantity" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill="url(#colorQty)" 
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Watchlist */}
        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Critical Shelf Alerts</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Quantity is smaller or equal to minimum alert configurations</p>
              </div>
              <Bell className="w-4 h-4 text-slate-450 text-slate-400" />
            </div>

            {stats.lowStockItems.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Warehouse className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-500 font-semibold">All shelves completely restocked!</p>
                <p className="text-[10px] text-slate-400 mt-1">No low-stock alerts recorded.</p>
              </div>
            ) : (
              <div className="space-y-3.5 max-h-56 overflow-y-auto pr-1">
                {stats.lowStockItems.slice(0, 4).map((p) => (
                  <div 
                    key={p.id}
                    className="p-3 bg-amber-50/50 hover:bg-amber-50 rounded-xl border border-amber-100 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-800">{p.name}</p>
                      <p className="text-[9px] text-amber-700 font-medium mt-0.5">
                        Alert at {p.minStock} units
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-[10px] font-bold rounded-md block">
                        {p.quantity} Left
                      </span>
                    </div>
                  </div>
                ))}
                {stats.lowStockItems.length > 4 && (
                  <p className="text-[10px] text-slate-400 text-center font-semibold pt-1">
                    + {stats.lowStockItems.length - 4} more low-level items
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate(Page.StockIn)}
            className="w-full mt-4 text-center px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-xl transition-colors cursor-pointer block"
          >
            Go to Restocking Flow
          </button>
        </div>

      </div>

      {/* Quick Action Hub */}
      <div className="bg-indigo-900 text-white rounded-xl p-6 shadow-md shadow-indigo-900/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold font-sans">Quick Store Operations</h3>
          <p className="text-xs text-indigo-200 mt-1">Direct shortcut pathways to record restocks or complete checkout receipts.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => onNavigate(Page.StockIn)}
            className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-950/20 cursor-pointer flex items-center space-x-1.5"
          >
            <Warehouse className="w-3.5 h-3.5" />
            <span>Record Restock</span>
          </button>
          
          <button
            onClick={() => onNavigate(Page.Sales)}
            className="px-4 py-2 bg-white text-indigo-900 hover:bg-indigo-50 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Checkout Sale</span>
          </button>
        </div>
      </div>

      {/* Advanced Maintenance Panel */}
      <div className="bg-white rounded-xl p-6 border border-slate-200/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center space-x-3.5">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Database Maintenance</h3>
            <p className="text-xs font-semibold text-slate-900 mt-0.5">Wipe & Clear System Inventory Data</p>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed max-w-xl">
              Permanently purge all inserted products, stock-in history records, completed checkout sales, active alerts, and database logs from the system.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setResetError(null);
            setPurgeInput('');
            setResetConfirmOpen(true);
          }}
          className="px-4 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center space-x-1.5 border border-rose-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Wipe System Data</span>
        </button>
      </div>

      {/* Purge System Data confirmation modal popup */}
      <AnimatePresence>
        {resetConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!resetLoading) setResetConfirmOpen(false);
              }}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-100 z-10 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-rose-50 bg-rose-50/20 flex items-center space-x-2.5">
                <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    System Data Wipe Requested
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Critical administrative security operation
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {resetError && (
                  <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs leading-relaxed font-semibold">
                    {resetError}
                  </div>
                )}

                <div className="border border-amber-100 bg-amber-50/40 rounded-xl p-3.5 flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold text-amber-800 block">This cannot be undone!</span>
                    <span className="text-[10px] text-slate-500 leading-relaxed block mt-0.5">
                      You are about to delete all custom items you have inserted. Fresh initial tracking logs, empty database shells, and unassigned status structures will be deployed.
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Verify Identity Protection Key
                  </label>
                  <p className="text-[10px] text-slate-450 leading-normal">
                    Please type the code word <b className="text-rose-600 select-all font-mono">PURGE</b> to confirm the transaction.
                  </p>
                  <input
                    type="text"
                    value={purgeInput}
                    onChange={(e) => setPurgeInput(e.target.value)}
                    placeholder="Enter PURGE"
                    disabled={resetLoading}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-rose-500 focus:outline-hidden text-xs rounded-xl transition-all font-bold placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>

                <div className="flex items-center space-x-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetConfirmOpen(false)}
                    disabled={resetLoading}
                    className="flex-1 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all cursor-pointer text-center disabled:opacity-50"
                  >
                    Cancel Action
                  </button>
                  <button
                    type="button"
                    onClick={handlePurgeAllData}
                    disabled={resetLoading || purgeInput !== 'PURGE'}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer text-center disabled:opacity-30 flex items-center justify-center space-x-1.5"
                  >
                    {resetLoading ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Purging System...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Confirm Wipe</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
