import { useState, FormEvent, useMemo } from 'react';
import { Product, Sale } from '../types';
import { sellProduct } from '../services/db';
import { 
  ShoppingBag, 
  Search, 
  Calendar, 
  User, 
  ArrowDownRight, 
  Plus, 
  Minus, 
  Flame, 
  Scan, 
  HelpCircle,
  Hash,
  Coins
} from 'lucide-react';
import { safeGetDate } from '../utils/date';
import { motion, AnimatePresence } from 'motion/react';

interface SalesViewProps {
  products: Product[];
  sales: Sale[];
}

export default function SalesView({ products, sales }: SalesViewProps) {
  // POS States
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [posMode, setPosMode] = useState<'quick' | 'list'>('quick');

  const activeProduct = products.find(p => p.id === selectedProductId);

  // Sub-Catalog filtered by search terms
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products.slice(0, 8);
    return products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 8);
  }, [products, searchQuery]);

  // Fast direct POS quantity modifiers
  const changeQty = (amount: number) => {
    setError(null);
    setQty(prev => {
      const next = prev + amount;
      if (next < 0) return 0;
      if (activeProduct && next > activeProduct.quantity) {
        setError(`Ubwiza ntibuhagije. Gusa ibice ${activeProduct.quantity} ni vyo biri mu bubiko burambuye.`);
        return activeProduct.quantity;
      }
      return next;
    });
  };

  const handleBarcodeMockScan = () => {
    // Select the first product that has quantity > 0 as a simulation of a barcode scan
    const salable = products.find(p => p.quantity > 0);
    if (salable) {
      setSelectedProductId(salable.id);
      setQty(1);
      setSuccess("Simulated barcode scan: " + salable.name);
      setError(null);
    } else {
      setError("Nta gicuruza gifite ibintu gishobora guscanishwa.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      setError('Please select a product for checkout.');
      return;
    }
    if (qty <= 0) {
      setError('Sales quantity must be a positive integer.');
      return;
    }
    if (activeProduct && activeProduct.quantity < qty) {
      setError(`Cannot complete transaction. Only ${activeProduct.quantity} units of "${activeProduct.name}" are available in stock.`);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await sellProduct(selectedProductId, qty);
      
      setSuccess(`Checkout successful! Quantity reduced.`);
      setSelectedProductId('');
      setQty(0);
    } catch (err: any) {
      setError(err?.message || 'Transaction failed. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  const totalPrice = activeProduct ? qty * activeProduct.sellingPrice : 0;

  return (
    <div className="space-y-6">
      
      {/* Search Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            Point of Sale (POS Terminal)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Conduct instant checkouts, record sales, of shelf quantities and review transaction logs.
          </p>
        </div>

        {/* Scan emulator trigger button */}
        <button
          onClick={handleBarcodeMockScan}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center space-x-2 self-start sm:self-auto cursor-pointer"
        >
          <Scan className="w-4 h-4 text-indigo-400" />
          <span>Scan / simulates scan code</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Checkout Transaction Left Column */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            {/* Action Toggles for usability */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-700 font-sans block uppercase tracking-wider">
                Active POS Selection
              </span>
              <div className="flex space-x-1 p-1 bg-slate-50 border border-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPosMode('quick')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                    posMode === 'quick' ? 'bg-indigo-600 text-white' : 'text-slate-650 hover:bg-slate-100'
                  }`}
                >
                  Quick Tap Grid
                </button>
                <button
                  type="button"
                  onClick={() => setPosMode('list')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                    posMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-650 hover:bg-slate-100'
                  }`}
                >
                  Classic Menu
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl animate-fade">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl">
                {success}
              </div>
            )}

            {/* Quick Tap Grid */}
            {posMode === 'quick' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-450 absolute left-3 w-4 h-4 top-3.5" />
                  <input
                    type="text"
                    placeholder="Search product lists for quick checkout tap..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 py-2.5 pl-9 pr-4 text-xs font-medium text-slate-700 placeholder-slate-400 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProductId === p.id;
                    const isOutOfStock = p.quantity <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setQty(p.quantity > 0 ? 1 : 0);
                          setError(null);
                        }}
                        className={`p-3.5 rounded-xl text-left border flex flex-col justify-between transition-all select-none min-h-[96px] relative overflow-hidden group ${
                          isOutOfStock 
                            ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                            : isSelected
                              ? 'bg-indigo-50/70 border-indigo-500 shadow-sm ring-1 ring-indigo-500'
                              : 'bg-white border-slate-150 hover:border-indigo-200 hover:shadow-xs cursor-pointer'
                        }`}
                      >
                        <div>
                          <p className={`text-xs font-bold truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                            {p.name}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                            {p.quantity} on shelf
                          </span>
                        </div>
                        
                        <p className={`text-xs font-bold mt-2 font-sans ${isSelected ? 'text-indigo-600' : 'text-slate-650'}`}>
                          RWF {Math.round(p.sellingPrice).toLocaleString()}
                        </p>

                        {/* Selection check indicator */}
                        {isSelected && (
                          <div className="absolute right-1 bottom-1 w-3.5 h-3.5 bg-indigo-600 rounded-full flex items-center justify-center text-white text-[8px] font-bold">
                            ✓
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Classic Dropdown Menu */}
            {posMode === 'list' && (
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Choose catalog item to add
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    setQty(e.target.value ? 1 : 0);
                    setError(null);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">-- Choose shelf item --</option>
                  {products.map(p => {
                    const isOutOfStock = p.quantity <= 0;
                    return (
                      <option key={p.id} value={p.id} disabled={isOutOfStock}>
                        {p.name} {isOutOfStock ? '(OUT OF STOCK)' : `(RWF ${Math.round(p.sellingPrice).toLocaleString()} - ${p.quantity} left)`}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Tap Quantity Adjuster / Digital keypad helper */}
            {activeProduct && (
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 bg-slate-900 text-white text-[9px] font-mono rounded-md font-bold uppercase select-none">Qty Modifier</span>
                    <span className="text-xs text-slate-500 font-bold max-w-[200px] truncate">
                      Tapping {activeProduct.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-450 font-semibold">
                    Available: {activeProduct.quantity} units
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  {/* Plus/minus buttons */}
                  <div className="flex items-center space-x-1.5 bg-white border border-slate-220 p-1.5 rounded-xl shadow-xs shrink-0 select-none">
                    <button
                      type="button"
                      onClick={() => changeQty(-1)}
                      className="p-2 bg-slate-10 hover:bg-slate-50 text-slate-650 rounded-lg border border-slate-200 cursor-pointer active:bg-slate-100"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="px-5 text-sm font-bold text-slate-800 font-mono">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQty(1)}
                      className="p-2 bg-slate-10 hover:bg-slate-50 text-slate-650 rounded-lg border border-slate-200 cursor-pointer active:bg-slate-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Fast shortcut multipliers list */}
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {([1, 5, 10, 20] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setError(null);
                          if (qty + v > activeProduct.quantity) {
                            setQty(activeProduct.quantity);
                            setError(`Available units reached.`);
                          } else {
                            setQty(qty + v);
                          }
                        }}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 active:bg-indigo-50 text-[10.5px] font-bold text-slate-700 rounded-lg transition-all cursor-pointer shadow-xs select-none"
                      >
                        +{v}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setQty(activeProduct.quantity);
                        setError(null);
                      }}
                      className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 text-[10.5px] font-bold rounded-lg transition-colors cursor-pointer select-none"
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Checkout summary box */}
          {activeProduct && qty > 0 ? (
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div className="flex justify-between items-center bg-indigo-50/40 p-4 border border-indigo-100 rounded-2xl">
                <div>
                  <span className="text-[10px] text-indigo-800 font-bold block uppercase tracking-wide">Basket Receipt Due</span>
                  <p className="text-xs text-slate-600 mt-1">
                    {activeProduct.name} x {qty} units
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 line-through block">RWF {Math.round(activeProduct.sellingPrice * qty).toLocaleString()}</span>
                  <span className="text-base font-extrabold text-indigo-650 font-sans block">
                    RWF {Math.round(totalPrice).toLocaleString()}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <button
                  type="submit"
                  disabled={loading || !selectedProductId || qty <= 0}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center flex items-center justify-center space-x-2 shadow-md disabled:opacity-50"
                >
                  {loading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
                      <span>Sell now / Kurangura umusego</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-xl py-10 text-center select-none text-slate-400">
              <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold">Select products and amounts to construct basket receipts</p>
            </div>
          )}
        </div>

        {/* Sales History List Right Panel */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between h-[510px]">
          <div className="flex flex-col min-h-0 h-full">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-sans">Checkout History Ledger</h3>
                <p className="text-[10px] text-slate-450 mt-0.5">Chronological summary indices.</p>
              </div>
              <ArrowDownRight className="w-4 h-4 text-indigo-600" />
            </div>

            {sales.length === 0 ? (
              <div className="py-24 text-center my-auto">
                <p className="text-xs text-slate-500 font-semibold">No sales transactions logged yet</p>
                <p className="text-[10px] text-slate-450 mt-1">Checkouts completed will appear catalogued here.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto mt-4 space-y-3.5 pr-1">
                {sales.map((log) => (
                  <div 
                    key={log.id}
                    className="p-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-100/80 rounded-xl transition-colors flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800 tracking-tight">{log.productName}</p>
                        <p className="text-[9.5px] text-slate-500 flex items-center space-x-1.5 mt-1">
                          <User className="w-3.5 h-3.5 text-slate-450" />
                          <span>By {log.performedBy?.split('@')[0]}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-[9.5px] font-bold text-slate-500 block">
                          {log.quantity} unit{log.quantity > 1 ? 's' : ''}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-md mt-1">
                          RWF {Math.round(log.totalPrice).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-[9px] text-slate-400 font-semibold border-t border-slate-100 pt-2 shrink-0">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{log.createdAt ? safeGetDate(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </span>
                      <span>Pos Ledger</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
