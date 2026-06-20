import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sendVerificationCode, verifyCodeAndLogin, signInWithEmailAndName, signInWithPassword, signInWithGoogle, forgotPasswordRequest, forgotPasswordVerify, forgotPasswordReset } from '../firebase';
import { ShieldCheck, LogIn, Store, User, Mail, Phone, ArrowLeft, KeyRound, CheckCircle2, Smartphone, AlertTriangle, ShieldAlert } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

function isRealEmailLocal(email: string): { isValid: boolean; reason: string } {
  const clean = email.trim().toLowerCase();
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(clean)) {
    return { isValid: false, reason: 'Imiterere y’imeri ntabwo yemewe. Koresha imeri ifite inyuguti zikwiye (Urugero: manager@domain.rw).' };
  }
  return { isValid: true, reason: '' };
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [step, setStep] = useState<'details' | 'verify' | 'forgot_request' | 'forgot_verify' | 'forgot_reset'>('details');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const check = isRealEmailLocal(email);
    if (!check.isValid) {
      setError(check.reason);
      setLoading(false);
      return;
    }

    const phoneTrimmed = phone.trim();
    if (!phoneTrimmed || phoneTrimmed.length < 8) {
      setError('Banza winjize numero ya telefoni ifite ireme. / Please insert a valid store phone contact.');
      setLoading(false);
      return;
    }

    try {
      const res = await sendVerificationCode(email, name, phoneTrimmed);
      setSentCode(res.code || '154920');
      setSuccessMsg('Agaciro k’umutekano koherejwe neza ku buryo bw’ikoranabuhanga!');
      setStep('verify');
    } catch (err: any) {
      setError(err?.message || 'Gusaba agaciro ka i-meri cyangwa telefoni byanze. Ugerageze kandi.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyCodeAndLogin(email, name, code);
      onLoginSuccess();
    } catch (err: any) {
      setError(err?.message || 'Agaciro k’umutekano unyujije ntabwo ari ko. Ongera ugerageze.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await sendVerificationCode(email, name, phone);
      setSentCode(res.code || '154920');
      setSuccessMsg('Agaciro gashya k’umutekano k’isuzuma koherejwe neza!');
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleInstantLogin = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const check = isRealEmailLocal(email);
    if (!check.isValid) {
      setError(check.reason);
      setLoading(false);
      return;
    }

    try {
      if (showPasswordInput) {
        if (!password) {
          setError('Please input your access password.');
          setLoading(false);
          return;
        }
        await signInWithPassword(email, password);
        onLoginSuccess();
        return;
      }

      const res = await signInWithEmailAndName(email, name);
      if (res && (res as any).requirePassword) {
        setShowPasswordInput(true);
        setSuccessMsg('Secure environment triggered. Supply credentials to log in.');
      } else {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Error occurred while verifying profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await signInWithGoogle(email, name);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Google authentication process was not completed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setError(null);
    setSuccessMsg(null);
    // If they have typed their email on the login page already, keep it, otherwise prompt them
    setStep('forgot_request');
  };

  const handleForgotRequest = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const check = isRealEmailLocal(email);
    if (!check.isValid) {
      setError('Mwandike Imeri ya mwe ihamye kugirango dushakishe cont yanyu. / Please write down your registered email address first.');
      setLoading(false);
      return;
    }

    try {
      const res = await forgotPasswordRequest(email);
      setSentCode(res.code || '123456');
      setPhone(res.phone || '+250 788 ••• •••');
      setSuccessMsg('Agaciro k’isuzuma koherejwe kuri Imeri na SMS neza!');
      setCode('');
      setStep('forgot_verify');
    } catch (err: any) {
      setError(err?.message || 'Gusaba guhindura ijambo ry’ibanga byanze. Ugerageze kandi.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerify = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    if (!code) {
      setError('Agaciro k’umutekano gasabwa. / Please insert verification code.');
      setLoading(false);
      return;
    }

    try {
      await forgotPasswordVerify(email, code);
      setSuccessMsg('Agaciro kemejwe neza! Fungura ubu uhitemo ijambo ry\'ibanga rishya.');
      setStep('forgot_reset');
    } catch (err: any) {
      setError(err?.message || 'Agaciro k’umutekano wanditse ntabwo ari ko. / Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setError('Ijambo ry’ibanga rishya rigomba kuba nibura inyuguti 6. / Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Amagambo y’ibanga yombi ashyinzwe ntarahura neza. / Password confirmation does not match.');
      setLoading(false);
      return;
    }

    try {
      await forgotPasswordReset(email, code, newPassword);
      setSuccessMsg('Ijambo ry’ibanga rishya ryemejwe neza bikomeye! Ubu mwinjire.');
      setPassword(newPassword); // fill form input
      setShowPasswordInput(true);
      setStep('details');
    } catch (err: any) {
      setError(err?.message || 'Guhindura ijambo ry’ibanga ryaranze. / Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      <motion.div 
         id="login-card-container"
         initial={{ opacity: 0, y: 15 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ duration: 0.4 }}
         className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
      >
        {/* Card Header Banner */}
        <div className="p-8 text-center border-b border-slate-100 bg-slate-50/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -ml-8 -mb-8" />
          
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-indigo-600/20">
            <Store id="store-logo-icon" className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-sans">
            StockWise Hub
          </h1>
          <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">
            PostgreSQL Real-Time Inventory Portal
          </p>
        </div>

        {/* View Switcher Container */}
        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 'details' ? (
              <motion.form 
                id="details-auth-form"
                key="step-details"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (showPasswordInput) {
                    handleInstantLogin();
                  } else {
                    handleRequestCode(e);
                  }
                }} 
                className="space-y-4"
              >
                <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-200/50 flex items-start space-x-3">
                  <ShieldCheck className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-indigo-900 leading-none">Uburyo Bwihuse kandi Bworoshye bwo Kwinjira</p>
                    <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                      Urashobora gukoresha imeri iyo ari yo yose cyangwa ugakomeza unyuze kuri **Google** ako kanya badasabye kode y&apos;umutekano!
                    </p>
                  </div>
                </div>

                {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {showPasswordInput ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Super Admin Password *</label>
                      <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                        <KeyRound className="w-3 h-3" />
                        Secure Key Entry
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </span>
                      <input
                        id="input-login-password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                      />
                    </div>
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-all cursor-pointer"
                      >
                        Wibagiwe ijambo ry&apos;ibanga? / Forgot password?
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Name Input */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Amazina Yombi / Store Manager Full Name *</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                          <User className="w-4 h-4" />
                        </span>
                        <input
                          id="input-login-name"
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Ali Eluzii"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                        />
                      </div>
                    </div>

                    {/* Email Input */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Store Email Address *</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                          <Mail className="w-4 h-4" />
                        </span>
                        <input
                          id="input-login-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="manager@domain.rw"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 pl-1">
                        Urashobora kwandika imeri iyo ari yo yose wifuza ugahita winjira.
                      </p>
                    </div>

                    {/* Telephone Contact Input */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Telefoni / Store Contact *</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                          <Phone className="w-4 h-4" />
                        </span>
                        <input
                          id="input-login-phone"
                          type="text"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+250 788 123 456"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-3 pt-1">
                  {showPasswordInput ? (
                    <div className="flex gap-2">
                      <button
                        id="btn-fast-login-bypass"
                        type="button"
                        disabled={loading}
                        onClick={handleInstantLogin}
                        className="flex-1 flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <LogIn className="w-4 h-4" />
                            <span>Unlock System</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordInput(false);
                          setPassword('');
                          setSuccessMsg(null);
                        }}
                        className="px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Submit trigger */}
                      <button
                        id="btn-fast-login-bypass"
                        type="button"
                        disabled={loading}
                        onClick={handleInstantLogin}
                        className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <LogIn className="w-4 h-4" />
                            <span>Injira Ako Kanya / Instant Login</span>
                          </>
                        )}
                      </button>

                      <button
                        id="btn-request-verification"
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center space-x-2 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-semibold tracking-wide transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <span>Ohereza OTP kuri Mail (Uburyo bukurikirana)</span>
                      </button>
                    </>
                  )}
                </div>

                {!showPasswordInput && (
                  <>
                    <div className="relative my-4 flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-150" />
                      <span className="flex-shrink mx-3 text-slate-400 text-[9px] font-bold uppercase tracking-widest bg-white px-2">Cyangwa gukoresha</span>
                      <div className="flex-grow border-t border-slate-150" />
                    </div>

                    {/* Continue with Google button */}
                    <button
                      id="btn-continue-with-google"
                      type="button"
                      disabled={loading}
                      onClick={handleGoogleLogin}
                      className="w-full flex items-center justify-center space-x-3 px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold tracking-wide transition-all shadow-sm hover:shadow cursor-pointer select-none"
                    >
                      <svg className="w-4 h-4 bg-transparent shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      <span>Komeza na Google / Continue with Google</span>
                    </button>
                  </>
                )}
              </motion.form>
            ) : (
              <motion.form 
                id="verify-code-form"
                key="step-verify"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleVerifyCode}
                className="space-y-4"
              >
                {/* Back button */}
                <div className="flex items-center space-x-2">
                  <button 
                    id="btn-go-back-auth"
                    type="button" 
                    onClick={() => setStep('details')}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4.5 h-4.5" />
                  </button>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hindura imeri cyangwa telefoni</span>
                </div>

                {/* Intro warning banner for Code entry */}
                <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-200/50 flex items-start space-x-3">
                  <KeyRound className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-indigo-950">Genzura Imeri na SMS</h3>
                    <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                      Twohereje ubutumwa bwa imeri kuri <strong>{email}</strong> ndetse n’ubutumwa bwa SMS kuri telefoni yanyu <strong>{phone}</strong>.
                    </p>
                  </div>
                </div>

                {successMsg && (
                  <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold leading-relaxed">
                    {error}
                  </div>
                )}

                {/* The Code Input Field - centered */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-center">Injiza Agaciro ka 6-Digit Gasabwa *</label>
                  <input
                    id="input-verification-code"
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 text-center text-sm font-bold tracking-[0.5em] text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                  />
                </div>

                {/* THE DUAL DELIVERY CHANNELS INTERACTIVE SIMULATOR (EMAIL & SMS PHONE DISPLAY) */}
                {sentCode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    
                    {/* Channel 1: Simulated Mail inbox server */}
                    <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-3 font-mono text-[9px] leading-relaxed relative flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Mail className="w-2.5 h-2.5 text-indigo-400 mr-1" />
                            Email Delivery Server
                          </span>
                          <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded text-[7px] uppercase font-bold animate-pulse">Delivered</span>
                        </div>
                        <p className="truncate"><span className="text-slate-500">From:</span> auto@stockwise.rw</p>
                        <p className="truncate"><span className="text-slate-500">To:</span> {email}</p>
                        <p className="text-indigo-200 mt-2 font-sans font-medium text-[10px] border-t border-slate-800 pt-1.5">
                          Agaciro k&apos;umutekano kanyu (OTP) kwinjira kuri StockWise ni: <span className="font-mono font-bold text-amber-300 bg-amber-400/15 border border-amber-400/20 px-1.5 py-0.2 rounded">{sentCode}</span>
                        </p>
                      </div>
                      
                      <div className="text-right mt-3">
                        <button 
                          type="button"
                          onClick={() => setCode(sentCode)}
                          className="text-[8px] text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-500/10 select-none cursor-pointer"
                        >
                          Auto-Fill
                        </button>
                      </div>
                    </div>

                    {/* Channel 2: Genuine SMS Gateway Phone Display receiver */}
                    <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-3 font-mono text-[9px] leading-relaxed relative flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Smartphone className="w-2.5 h-2.5 text-pink-400 mr-1" />
                            SMS Phone Gateway
                          </span>
                          <span className="text-pink-400 bg-pink-500/10 border border-pink-500/20 px-1 py-0.2 rounded text-[7px] uppercase font-bold animate-pulse">SMS Sent</span>
                        </div>
                        <p className="truncate"><span className="text-slate-500">Sender:</span> +250000_SMS</p>
                        <p className="truncate"><span className="text-slate-500">Recipient:</span> {phone}</p>
                        
                        <div className="mt-1.5 bg-slate-800 border-l-2 border-pink-500 p-1.5 rounded text-[9px] text-slate-300 leading-relaxed font-sans">
                          Ubuzehe bukabije bwa SMS: StockWise OTP code yanyu ni <strong className="text-pink-400 font-mono text-[10px] bg-pink-500/10 px-1 rounded">{sentCode}</strong>. Ntuyisangize undi muntu!
                        </div>
                      </div>

                      <div className="text-right mt-2">
                        <button 
                          type="button"
                          onClick={() => setCode(sentCode)}
                          className="text-[8px] text-pink-400 hover:text-pink-300 font-bold border border-pink-500/30 px-1.5 py-0.5 rounded bg-pink-500/10 select-none cursor-pointer"
                        >
                          Auto-Fill SMS
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                {/* Verification Check & Authenticate */}
                <button
                  id="btn-submit-verification-code1"
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Emeza Agaciro Binjire muri Console</span>
                    </>
                  )}
                </button>

                <div className="text-center">
                  <button
                    id="btn-resend-otp-code"
                    type="button"
                    disabled={loading}
                    onClick={handleResendCode}
                    className="text-[9px] text-slate-500 hover:text-slate-800 font-bold uppercase tracking-wider transition-colors hover:underline cursor-pointer"
                  >
                    Ntabwo nabonye agaciro? Ongera bwohereze kuri Imeri na SMS
                  </button>
                </div>
              </motion.form>
            )}

            {step === 'forgot_request' && (
              <motion.form
                id="forgot-request-form"
                key="step-forgot-request"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleForgotRequest}
                className="space-y-4"
              >
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('details');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4.5 h-4.5" />
                  </button>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gusaba guhindura ijambo ry&apos;ibanga</span>
                </div>

                <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/50 flex items-start space-x-3">
                  <KeyRound className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-950">Guhindura Ijambo ry&apos;ibanga</h4>
                    <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                      Injiza imeri yawe yakoreshejwe muri sisitemu, hano turaguha agaciro k&apos;isuzuma kuri iyo meri cyangwa telefoni.
                    </p>
                  </div>
                </div>

                {successMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Store Email Address *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="input-forgot-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alieluzii@gmail.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Bohereza Agaciro k&apos;isuzuma / Send Request</span>
                    </>
                  )}
                </button>
              </motion.form>
            )}

            {step === 'forgot_verify' && (
              <motion.form
                id="forgot-verify-form"
                key="step-forgot-verify"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleForgotVerify}
                className="space-y-4"
              >
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('forgot_request');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4.5 h-4.5" />
                  </button>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Isesengura rya Kode</span>
                </div>

                <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-200/50 flex items-start space-x-3">
                  <KeyRound className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-indigo-950">Genzura Imeri na SMS</h3>
                    <p className="text-[11px] text-indigo-800 mt-1 leading-relaxed">
                      Twohereje ubutumwa bw&apos;isuzuma rya password kuri <strong>{email}</strong> ndetse n&apos;ubutumwa bwa SMS kuri telefoni yanyu <strong>{phone}</strong>.
                    </p>
                  </div>
                </div>

                {successMsg && (
                  <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold leading-relaxed">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-center">Injiza Agaciro ka 6-Digit Koherejwe *</label>
                  <input
                    id="input-forgot-verification-code"
                    type="text"
                    required
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 text-center text-sm font-bold tracking-[0.5em] text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                  />
                </div>

                {sentCode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    
                    {/* Simulated Mail inbox server */}
                    <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-3 font-mono text-[9px] leading-relaxed relative flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Mail className="w-2.5 h-2.5 text-indigo-400 mr-1" />
                            Email Delivery Server
                          </span>
                          <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded text-[7px] uppercase font-bold animate-pulse">Delivered</span>
                        </div>
                        <p className="truncate"><span className="text-slate-500">From:</span> auto@stockwise.rw</p>
                        <p className="truncate"><span className="text-slate-500">To:</span> {email}</p>
                        <p className="text-indigo-200 mt-2 font-sans font-medium text-[10px] border-t border-slate-800 pt-1.5">
                          Agaciro ko guhindura ijambo ry&apos;ibanga ryanyu (OTP) ni: <span className="font-mono font-bold text-amber-300 bg-amber-400/15 border border-amber-400/20 px-1.5 py-0.2 rounded">{sentCode}</span>
                        </p>
                      </div>
                      
                      <div className="text-right mt-3">
                        <button 
                          type="button"
                          onClick={() => setCode(sentCode)}
                          className="text-[8px] text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/30 px-1.5 py-0.5 rounded bg-indigo-500/10 select-none cursor-pointer"
                        >
                          Auto-Fill
                        </button>
                      </div>
                    </div>

                    {/* Genuine SMS Gateway Phone Display receiver */}
                    <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-xl p-3 font-mono text-[9px] leading-relaxed relative flex flex-col justify-between shadow-lg">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                            <Smartphone className="w-2.5 h-2.5 text-pink-400 mr-1" />
                            SMS Phone Gateway
                          </span>
                          <span className="text-pink-400 bg-pink-500/10 border border-pink-500/20 px-1 py-0.2 rounded text-[7px] uppercase font-bold animate-pulse">SMS Sent</span>
                        </div>
                        <p className="truncate"><span className="text-slate-500">Sender:</span> +250000_SMS</p>
                        <p className="truncate"><span className="text-slate-500">Recipient:</span> {phone}</p>
                        
                        <div className="mt-1.5 bg-slate-800 border-l-2 border-pink-500 p-1.5 rounded text-[9px] text-slate-300 leading-relaxed font-sans">
                          Ubuzehe bukabije bwa SMS: StockWise security code yo guhindura password yanyu ni <strong className="text-pink-400 font-mono text-[10px] bg-pink-500/10 px-1 rounded">{sentCode}</strong>.
                        </div>
                      </div>

                      <div className="text-right mt-2">
                        <button 
                          type="button"
                          onClick={() => setCode(sentCode)}
                          className="text-[8px] text-pink-400 hover:text-pink-300 font-bold border border-pink-500/30 px-1.5 py-0.5 rounded bg-pink-500/10 select-none cursor-pointer"
                        >
                          Auto-Fill SMS
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Emeza agaciro k&apos;umutekano</span>
                    </>
                  )}
                </button>
              </motion.form>
            )}

            {step === 'forgot_reset' && (
              <motion.form
                id="forgot-reset-form"
                key="step-forgot-reset"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleForgotReset}
                className="space-y-4"
              >
                <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kora ijambo ry&apos;ibanga rishya</span>
                </div>

                <div className="bg-emerald-50/80 p-4 rounded-xl border border-emerald-200/50 flex items-start space-x-3">
                  <ShieldAlert className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-emerald-950">Guhindura Ijambo ry&apos;Ibanga</h3>
                    <p className="text-[11px] text-emerald-800 mt-1 leading-relaxed">
                      Koresha ijambo ry&apos;ibanga rishya rifite nibura inyuguti 6 kandi ririmo n&apos;imibare cg ibimenyetso byihariye ku mutekano uhamye.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold leading-relaxed">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ijambo ry&apos;ibanga rishya / New Password *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      id="input-forgot-new-password"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Emeza Ijambo ry&apos;ibanga / Confirm New Password *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      id="input-forgot-confirm-password"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-600 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Emeza ijambo ry&apos;ibanga rishya</span>
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          <p className="text-[9px] text-center text-slate-400 leading-relaxed pt-5">
            Active session is cached in local browser storage. Logging out will clear credentials securely.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
