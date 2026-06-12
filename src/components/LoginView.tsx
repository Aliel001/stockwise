import { useState, FormEvent } from 'react';
import { motion } from 'motion/react';
import { signInWithEmailAndName } from '../firebase';
import { ShieldCheck, LogIn, Store, User, Mail } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('alieluzii@gmail.com');
  const [name, setName] = useState('Ali Eluzii');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndName(email, name);
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check input parameters.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.5 }}
         className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden"
      >
        <div className="p-8 text-center border-b border-slate-100 bg-slate-50/50">
          <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm border border-indigo-100/30">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-sans">
            StockWise
          </h1>
          <p className="text-xs text-slate-500 mt-2 font-medium uppercase tracking-wider">
            Neon Database Stock Management Hub
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100/50 flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-900">Direct Storefront Access</p>
              <p className="text-[11px] text-amber-700/90 mt-0.5 leading-relaxed">
                Connect securely to your dedicated Neon PostgreSQL cluster. Firebase is disabled. Choose or enter your store account below.
              </p>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-medium leading-relaxed"
            >
              {error}
            </motion.div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name *</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Ali Eluzii"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Store Email Address *</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@stockwise.rw"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-3.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              Your catalog, sales data, and activity records are linked to this email address on the Neon cloud database.
            </p>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/10 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Enter Store Console</span>
              </>
            )}
          </motion.button>

          <p className="text-[9px] text-center text-slate-400 leading-relaxed pt-2">
            Active session is cached in local browser storage. Logging out will clear credentials securely.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
