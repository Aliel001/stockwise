import { useState, FormEvent } from 'react';
import { Product, Sale } from '../types';
import { sellProduct } from '../services/db';
import { 
  ShoppingBag, 
  Search, 
  DollarSign, 
  Calendar, 
  TrendingUp, 
  User, 
  ArrowDownRight 
} from 'lucide-react';
import { safeGetDate } from '../utils/date';

interface SalesViewProps {
  products: Product[];
  sales: Sale[];
}

export default function SalesView({ products, sales }: SalesViewProps) {
  // Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Selected product details
  const activeProduct = products.find(p => p.id === selectedProductId);

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Checkout Transaction Left Column */}
      <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm h-fit">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-sans">
            Log Store Sale (Stock Out)
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            Record a customer checkout receipt. Stock level falls and metrics update synchronously.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-650 rounded-xl text-xs border border-red-105 font-semibold leading-relaxed">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs border border-emerald-100 font-semibold leading-relaxed">
              {success}
            </div>
          )}

          {/* Product Dropdown Selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Select Store Item *</label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setQty(0);
                setError(null);
              }}
              className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Choose shelf item --</option>
              {products.map(p => {
                const isOutOfStock = p.quantity <= 0;
                return (
                  <option key={p.id} value={p.id} disabled={isOutOfStock}>
                    {p.name} {isOutOfStock ? '(OUT OF STOCK)' : `(RWF ${Math.round(p.sellingPrice).toLocaleString()} - {p.quantity} left)`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Quantity Selector */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Quantity to Checkout *</label>
            <input
              type="number"
              required
              min={1}
              max={activeProduct ? activeProduct.quantity : 1000}
              value={qty || ''}
              onChange={(e) => {
                setQty(parseInt(e.target.value, 10) || 0);
                setError(null);
              }}
              placeholder="e.g. 5"
              disabled={!selectedProductId}
              className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 disabled:opacity-50"
            />
            {activeProduct && (
              <span className="text-[9px] text-slate-500 font-semibold select-none mt-1.5 block">
                Store has <b className="text-slate-700 font-bold">{activeProduct.quantity}</b> items available.
              </span>
            )}
          </div>

          {/* Mini receipt calculations summary */}
          {activeProduct && qty > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Checkout Receipt Tally</span>
              <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-200/50">
                <span className="text-slate-500">{activeProduct.name} x {qty}</span>
                <span className="font-semibold text-slate-700">RWF {Math.round(activeProduct.sellingPrice).toLocaleString()} ea</span>
              </div>
              <div className="flex items-center justify-between font-bold text-slate-900 text-xs pt-1.5">
                <span>Total checkout due</span>
                <span className="font-mono text-sm text-indigo-600">RWF {Math.round(totalPrice).toLocaleString()}</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !selectedProductId || qty <= 0}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center flex items-center justify-center space-x-1.5 shadow-md disabled:opacity-50"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>Execute Store Checkout</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Sales History List Right Panel */}
      <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Checkout History Sales Ledger</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Summary and timestamps of checkouts completed by administrators.</p>
            </div>
            <ArrowDownRight className="w-4 h-4 text-slate-450" />
          </div>

          {sales.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-xs text-slate-500 font-semibold">No sales transactions logged yet</p>
              <p className="text-[10px] text-slate-445 mt-1">Use the left form to execute store sales.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4 max-h-[460px] overflow-y-auto pr-1">
              {sales.map((log) => (
                <div 
                  key={log.id}
                  className="p-4 bg-slate-50 hover:bg-slate-100/60 rounded-xl border border-slate-100 transition-colors flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{log.productName}</p>
                      <p className="text-[10px] text-slate-500 flex items-center space-x-1.5 mt-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Sold by {log.performedBy}</span>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {log.quantity} unit{log.quantity > 1 ? 's' : ''} @ RWF {Math.round(log.unitPrice).toLocaleString()}
                      </span>
                      <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 bg-indigo-50 text-indigo-800 text-[10px] font-bold rounded-md mt-1">
                        RWF {Math.round(log.totalPrice).toLocaleString()} total
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400 font-semibold border-t border-slate-100/80 pt-2.5">
                    <span className="flex items-center space-x-1 text-[9px]">
                      <Calendar className="w-3   h-3" />
                      <span>{log.createdAt ? safeGetDate(log.createdAt).toLocaleString() : ''}</span>
                    </span>
                    <span className="text-[9px] text-indigo-500/80">Completed Tally Ledger</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
