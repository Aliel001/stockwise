import { useState, FormEvent } from 'react';
import { Product } from '../types';
import { 
  addProduct, 
  updateProduct, 
  deleteProduct 
} from '../services/db';
import { 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  SlidersHorizontal, 
  X, 
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProductsViewProps {
  products: Product[];
}

export default function ProductsView({ products }: ProductsViewProps) {
  const [searchTerm, setSearchTerm] = useState(() => {
    try {
      const saved = localStorage.getItem('search_product_name') || '';
      if (saved) {
        localStorage.removeItem('search_product_name');
      }
      return saved;
    } catch (e) {
      console.warn('localStorage read blocked by browser privacy/sandboxing:', e);
      return '';
    }
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [minStock, setMinStock] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom Delete confirmation state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Open form for adding a new product
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setQuantity(0);
    setPurchasePrice(0);
    setSellingPrice(0);
    setMinStock(5);
    setError(null);
    setIsFormOpen(true);
  };

  // Open form for editing a product
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setDescription(p.description);
    setQuantity(p.quantity);
    setPurchasePrice(p.purchasePrice || 0);
    setSellingPrice(p.sellingPrice || 0);
    setMinStock(p.minStock);
    setError(null);
    setIsFormOpen(true);
  };

  const startDelete = (p: Product) => {
    setDeletingProduct(p);
    setDeleteError(null);
    setDeleteLoading(false);
  };

  const confirmDelete = async () => {
    if (!deletingProduct) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteProduct(deletingProduct.id);
      setDeletingProduct(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete product.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product Name is required.');
      return;
    }
    if (quantity < 0 || minStock < 0) {
      setError('Values must be positive numbers.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (editingProduct) {
        // Edit flow (quantity is updated primarily via restock or sale, but we can update details)
        await updateProduct(editingProduct.id, {
          name,
          description,
          purchasePrice,
          sellingPrice,
          minStock,
        });
      } else {
        // Add flow
        await addProduct({
          name,
          description,
          quantity,
          purchasePrice,
          sellingPrice,
          minStock,
        });
      }
      setIsFormOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Database transaction error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search and Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 font-sans">
            Products & Inventory Catalog
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Build, edit, and filter items on shelves under strict attribute metrics.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Stock Item</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center space-x-2 bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search products by title, sku description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-slate-700 placeholder-slate-450 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
          />
        </div>
        <div className="p-2.5 bg-slate-50 text-slate-450 border border-slate-100/60 rounded-xl">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
        </div>
      </div>

      {/* Products Table Desktop / Cards Mobile */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl py-14 text-center border border-slate-100">
          <p className="text-xs font-semibold text-slate-500">No products match your filters</p>
          <p className="text-[10px] text-slate-450 mt-1">Try resetting the searchable query values.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-150 text-slate-450 select-none">
                  <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider">Product Description</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-center">In Stock</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-center">Alert Level</th>
                  <th className="py-3.5 px-4 text-xs font-bold uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const isLow = p.quantity <= p.minStock;
                  
                  return (
                    <tr 
                      key={p.id}
                      className={`hover:bg-slate-50/50 transition-colors ${isLow ? 'bg-amber-50/20' : ''}`}
                    >
                      <td className="py-4 px-4">
                        <div>
                          <p className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                            <span>{p.name}</span>
                            {isLow && (
                              <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded-md">
                                <AlertCircle className="w-3 h-3 text-amber-600" />
                                <span>Low stock</span>
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 max-w-xs">{p.description || 'No description writeup provided'}</p>
                          <p className="text-[10.5px] mt-1 text-slate-650 font-medium font-sans">
                            Angura: <span className="font-mono text-indigo-650 font-bold">{p.purchasePrice?.toLocaleString() || 0} RWF</span> • Agurisha: <span className="font-mono text-emerald-650 font-bold">{p.sellingPrice?.toLocaleString() || 0} RWF</span>
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg ${
                          isLow 
                            ? 'bg-amber-100 text-amber-850' 
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {p.quantity} units
                        </span>
                      </td>
                      <td className="py-4 px-4 text-xs text-center font-mono font-semibold text-slate-500">
                        &lt;= {p.minStock} units
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 hover:bg-indigo-50 hover:text-indigo-650 text-slate-500 rounded-lg transition-colors cursor-pointer"
                            title="Edit details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startDelete(p)}
                            className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg transition-colors cursor-pointer"
                            title="Delete Item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards Layout for Mobile screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
            {filteredProducts.map((p) => {
              const isLow = p.quantity <= p.minStock;
              return (
                <div 
                  key={p.id}
                  className={`bg-white rounded-xl p-4 border transition-shadow shadow-sm flex flex-col justify-between ${
                    isLow ? 'border-amber-200 bg-amber-50/10' : 'border-slate-100'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{p.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{p.description || 'No description setup'}</p>
                      </div>
                      
                      <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md whitespace-nowrap ${
                        isLow ? 'bg-amber-100 text-amber-850' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {p.quantity} on shelf
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-450 block text-[9px] font-semibold">Angura (RWF)</span>
                        <span className="font-mono text-indigo-650 font-bold">
                          {p.purchasePrice?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-450 block text-[9px] font-semibold">Agurisha</span>
                        <span className="font-mono text-emerald-650 font-bold">
                          {p.sellingPrice?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-450 block text-[9px] font-semibold">Kugabisha</span>
                        <span className="font-mono text-slate-750 font-medium">
                          &lt;= {p.minStock}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 mt-4 pt-3 border-t border-slate-50">
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="px-2 py-1.5 text-[10px] hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 rounded-lg transition-colors cursor-pointer font-bold flex items-center space-x-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => startDelete(p)}
                      className="px-2 py-1.5 text-[10px] hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg transition-colors cursor-pointer font-bold flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Slide-over or Popup overlay Modal Form */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 z-10 overflow-hidden"
            >
              {/* Modal title header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingProduct ? 'Edit Catalog Product Details' : 'Register New Catalog Product'}
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {editingProduct ? 'Updates will take visual effect in real time.' : 'Initial product setup form.'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form panel body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                
                {error && (
                  <div className="p-3.5 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs leading-relaxed font-semibold">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Product Title/Name *</label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Premium White Rice - 25kg"
                    className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Product Description</label>
                  <textarea
                    rows={2}
                    maxLength={100}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Local organic farm source supplies."
                    className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-sans">Purchase Price (RWF) *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-sans">Selling Price (RWF) *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {!editingProduct && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-sans">Initial quantity *</label>
                      <input
                        type="number"
                        required
                        min={0}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-705 font-medium focus:outline-none"
                      />
                    </div>
                  )}
                  <div className={editingProduct ? 'col-span-2' : ''}>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Min safety alert stock *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={minStock}
                      onChange={(e) => setMinStock(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-slate-50 border border-slate-100/60 rounded-xl py-2 px-3 text-xs text-slate-705 font-medium focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer text-center disabled:opacity-50"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center space-x-2">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Saving...</span>
                      </span>
                    ) : (
                      <span>Save Item</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingProduct(null)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white rounded-2xl w-full max-w-sm shadow-xl border border-slate-100 z-10 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  Confirm Deletion
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  Are you absolutely sure you want to delete this product?
                </p>
              </div>

              <div className="p-6 space-y-4">
                {deleteError && (
                  <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs leading-relaxed font-semibold">
                    {deleteError}
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                  <span className="text-[9px] text-slate-450 uppercase block font-bold">Target Product</span>
                  <span className="text-xs font-bold text-slate-800 block mt-0.5">{deletingProduct.name}</span>
                  <span className="text-[10px] text-slate-500 block mt-1">Current qty: {deletingProduct.quantity} units</span>
                </div>

                <p className="text-[10px] text-slate-450 leading-relaxed font-medium">
                  This action is irreversible and will be logged in the immutable administrative audit ledger.
                </p>

                <div className="flex items-center space-x-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingProduct(null)}
                    className="flex-1 py-1.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center"
                  >
                    Keep Product
                  </button>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={deleteLoading}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-750 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer text-center disabled:opacity-50"
                  >
                    {deleteLoading ? (
                      <span className="flex items-center justify-center space-x-1.5">
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Deleting...</span>
                      </span>
                    ) : (
                      <span>Yes, Delete</span>
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
