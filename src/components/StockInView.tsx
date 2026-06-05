import { useState, FormEvent } from 'react';
import { Product, StockIn } from '../types';
import { stockIn } from '../services/db';
import { 
  Plus, 
  Search, 
  Warehouse, 
  Calendar, 
  ArrowUpRight, 
  User, 
  FileText 
} from 'lucide-react';
import { safeGetDate } from '../utils/date';

interface StockInViewProps {
  products: Product[];
  stockIns: StockIn[];
}

export default function StockInView({ products, stockIns }: StockInViewProps) {
  // Form State
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      setError('Please select a target product to restock.');
      return;
    }
    if (qty <= 0) {
      setError('Restock quantity must be a positive integer larger than zero.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await stockIn(selectedProductId, qty, notes);
      
      // Success feedback & clear form
      setSuccess(`Successfully restocked inventory. Product stock updated.`);
      setSelectedProductId('');
      setQty(0);
      setNotes('');
    } catch (err: any) {
      setError(err?.message || 'Failed to complete transaction.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Restocking Action Left Panel */}
      <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm h-fit">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-sans">
            Add Goods (Stock In)
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            Record items added to the inventory. Stock count increases automatically on submission.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-650 rounded-xl text-xs border border-red-100 font-semibold leading-relaxed">
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
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Select Catalog Product *</label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Choose shelf target --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (Current: {p.quantity})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Adding Quantity */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Restock Quantity *</label>
              <input
                type="number"
                required
                min={1}
                value={qty || ''}
                onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
                placeholder="e.g. 100"
                className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
              />
            </div>
          </div>



          {/* Transaction Note */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Internal Notes</label>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: batch 12B, expiry April..."
              className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-705 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-755 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer text-center flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/10"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Warehouse className="w-4 h-4" />
                <span>Submit Restock Transaction</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Restock Log History Right Panel */}
      <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Restocking Logs (History)</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Chronological ledger of previous batch arrivals.</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
          </div>

          {stockIns.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-xs text-slate-500 font-semibold">No stock-in operations recorded yet</p>
              <p className="text-[10px] text-slate-450 mt-1">Use the left form to log your first restock.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4 max-h-[460px] overflow-y-auto pr-1">
              {stockIns.map((log) => (
                <div 
                  key={log.id}
                  className="p-4 bg-slate-50 hover:bg-slate-100/60 rounded-xl border border-slate-100 tension transition-colors flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{log.productName}</p>
                      <p className="text-[10px] text-slate-500 flex items-center space-x-1.5 mt-1">
                        <User className="w-3.5 h-3.5 text-slate-450" />
                        <span>Registered by {log.performedBy}</span>
                      </p>
                    </div>

                    <span className="inline-flex items-center space-x-0.5 px-2 py-0.5 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-md">
                      +{log.quantity} units
                    </span>
                  </div>

                  {log.notes && (
                    <p className="text-[10px] bg-white border border-slate-100/60 text-slate-600 rounded-lg p-2.5 mt-3 block leading-relaxed italic flex items-start space-x-1">
                      <FileText className="w-3.5 h-3.5 text-slate-450 mt-0.5 shrink-0" />
                      <span>{log.notes}</span>
                    </p>
                  )}

                  <div className="flex items-center justify-end mt-3 text-[10px] text-slate-400 font-semibold border-t border-slate-100/80 pt-2.5">
                    <span className="flex items-center space-x-1 text-[9px]">
                      <Calendar className="w-3 h-3" />
                      <span>{log.createdAt ? safeGetDate(log.createdAt).toLocaleString() : ''}</span>
                    </span>
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
