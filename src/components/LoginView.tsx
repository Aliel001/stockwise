import { useState } from 'react';
import { motion } from 'motion/react';
import { signInWithGoogle } from '../firebase';
import { ShieldCheck, LogIn, Store } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || 'Login failed matches. Please check your internet connection and try again.');
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
        <div className="p-8 text-center border-b border-slate-100">
          <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4 shadow-inner">
            <Store className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight font-sans">
            StockWise
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Professional Inventory & Sales Management Solution
          </p>
        </div>

        <div className="p-8">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6 flex items-start space-x-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-700">Protected Storefront Operations</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Authorized shop personnel can safely record, add, and audit store performance under secure Firestore constraints.
              </p>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-xs leading-relaxed"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-3 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-slate-900/10 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Verify with Google Admin Sign-In</span>
              </>
            )}
          </motion.button>

          <p className="text-[10px] text-center text-slate-400 mt-6 leading-relaxed">
            By signing in to StockWise, your administrative actions will be tracked in the immutable security audit log. Please act responsibly.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
