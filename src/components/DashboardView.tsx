import { useMemo, useState } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeGetDate, safeGetISOString } from '../utils/date';
import { clearAllData } from '../services/db';

interface DashboardViewProps {
  products: Product[];
  sales: Sale[];
  notificationsCount: number;
  onNavigate: (page: Page) => void;
}

export default function DashboardView({ products, sales, notificationsCount, onNavigate }: DashboardViewProps) {
  // Database maintenance state
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

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

  // Aggregate sales by date (last 7 days) for the custom SVG chart
  const weeklyChartData = useMemo(() => {
    const data: { [key: string]: number } = {};
    const now = new Date();
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      data[dateStr] = 0;
    }

    // Populate data
    sales.forEach(sale => {
      if (!sale.createdAt) return;
      const dateStr = safeGetISOString(sale.createdAt).split('T')[0];
      if (data[dateStr] !== undefined) {
        data[dateStr] += sale.totalPrice;
      }
    });

    // Formatting as array
    return Object.entries(data).map(([date, val]) => {
      const formattedDate = safeGetDate(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      return { date: formattedDate, amount: val };
    });
  }, [sales]);

  const maxWeeklyAmount = Math.max(...weeklyChartData.map(d => d.amount), 1);

  const handlePurgeAllData = async () => {
    if (purgeInput !== 'PURGE') return;
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
        
        {/* SVG Week Sales Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Weekly Performance</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Summary of total checkout prices over the past 7 days</p>
            </div>
            <div className="text-xs text-slate-500 font-semibold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
              <span>Checkout Total (RWF)</span>
            </div>
          </div>

          {/* SVG representation of columns */}
          <div className="h-64 flex items-end justify-between gap-2.5 pt-4 border-b border-slate-100">
            {weeklyChartData.map((day, i) => {
              const heightPct = (day.amount / maxWeeklyAmount) * 85 + 5; // scaled 5% to 90%
              return (
                <div key={i} className="flex-1 flex flex-col items-center group h-full justify-end relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] px-2 py-1 rounded-sm mb-1.5 font-mono shadow-md whitespace-nowrap absolute z-10 bottom-full">
                    RWF {Math.round(day.amount).toLocaleString()}
                  </div>
                  
                  {/* Column */}
                  <div 
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-indigo-500 rounded-t-md hover:bg-slate-850 transition-colors relative cursor-pointer group-hover:shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                  >
                    <div className="absolute top-1 left-0 right-0 h-0.5 bg-indigo-300 opacity-30 rounded-full" />
                  </div>
                  
                  {/* Label */}
                  <span className="text-[9px] text-slate-400 mt-2 font-semibold text-center select-none pt-1">
                    {day.date}
                  </span>
                </div>
              );
            })}
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
