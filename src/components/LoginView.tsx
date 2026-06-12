import { useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sendVerificationCode, verifyCodeAndLogin } from '../firebase';
import { ShieldCheck, LogIn, Store, User, Mail, Phone, ArrowLeft, KeyRound, CheckCircle2, Smartphone, AlertTriangle } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

// Client-side quick validation to prevent obvious fake/disposable emails immediately
function isRealEmailLocal(email: string): { isValid: boolean; reason: string } {
  const clean = email.trim().toLowerCase();
  
  // Basic Regex match
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(clean)) {
    return { isValid: false, reason: 'Imiterere y’imeri ntabwo yemewe. Koresha imeri ifite inyuguti zikwiye (Urugero: manager@domain.rw).' };
  }

  const [username, domain] = clean.split('@');

  if (username.length < 3) {
    return { isValid: false, reason: 'Izina rya imeri rigomba kuba rikwiye nibura inyuguti 3. / Email username part must be at least 3 characters.' };
  }

  const fakeUsernames = ['test', 'dummy', 'fake', 'abc', 'aaa', 'bbb', 'temp', 'admin', 'user', 'mock', 'asdf', 'qwerty'];
  if (fakeUsernames.includes(username)) {
    return { isValid: false, reason: 'Iri zina rya imeri ntabwo ryemewe kuko  rimeze nk’iy’ikigereranyo (test).' };
  }

  // Common disposable platforms
  const disposableDomains = [
    'mailinator.com', 'tempmail.com', '10minutemail.com', 'yopmail.com', 'trashmail.com', 
    'dispostable.com', 'guerrillamail.com', 'sharklasers.com', 'getairmail.com', 'temp-mail.org',
    'maildrop.cc', 'disposable.com', 'boun.cr'
  ];

  if (disposableDomains.some(d => domain.includes(d))) {
    return { isValid: false, reason: 'Imeri zo mu bwoko bwa disposable (iz’igihe gito zihuse) ntabwo zemewe ku bw’umutekano.' };
  }

  // Blacklisted mock domains
  const mockDomains = [
    'test.com', 'example.com', 'invalid.com', 'mock.com', 'fake.com', 'dummy.com', 
    'any.com', 'something.com', 'test.co', 'xyz.com', 'abc.com', 'none.com', 'localhost', 
    'email.com', 'mail.ru', 'test.localhost', 'example.org', 'domain.com'
  ];

  if (mockDomains.includes(domain) || domain.endsWith('.test') || domain.endsWith('.invalid')) {
    return { isValid: false, reason: 'Iri somero rya imeri (domain) ntabwo ryemewe muri sisiteme kuko ari iy’ikigereranyo feyiki.' };
  }

  return { isValid: true, reason: '' };
}

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [email, setEmail] = useState('alieluzii@gmail.com');
  const [name, setName] = useState('Ali Eluzii');
  const [phone, setPhone] = useState('+250 788 123 456');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    // 1. Instantly check email locally
    const check = isRealEmailLocal(email);
    if (!check.isValid) {
      setError(check.reason);
      setLoading(false);
      return;
    }

    // 2. Validate phone number format
    const phoneTrimmed = phone.trim();
    if (!phoneTrimmed || phoneTrimmed.length < 8) {
      setError('Banza winjize numero ya telefoni ifite ireme. / Please insert a valid store phone contact.');
      setLoading(false);
      return;
    }

    try {
      // Send parameters to local server-side authenticator
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
                onSubmit={handleRequestCode} 
                className="space-y-4"
              >
                <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/50 flex items-start space-x-3">
                  <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-900 leading-none">Imeri Nyamakuru Yasabwa ku Mutekano</p>
                    <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                      Ku mutekano w&apos;ububiko bwawe, imeri za baringa zizwi na disposable imeri nka mailinator.com zihita zihakanwa. Banza wandike imeri na numero nzima yo kwakira ubutumwa bugufi bw&apos;isuzuma.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

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
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Imeri Nyakuri / Genuine Store Email *</label>
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
                    System rejects any temporary/disposable address arrays during verification logic.
                  </p>
                </div>

                {/* Telephone Contact Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Telefoni yo Kwakira SMS / Store Contact for SMS OTP *</label>
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

                {/* Submit trigger */}
                <button
                  id="btn-request-verification"
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-slate-900/15 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Ohereza Agaciro K’umutekano na SMS</span>
                    </>
                  )}
                </button>
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
                        
                        {/* Dynamic Message bubble style */}
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
          </AnimatePresence>

          <p className="text-[9px] text-center text-slate-400 leading-relaxed pt-5">
            Active session is cached in local browser storage. Logging out will clear credentials securely.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
