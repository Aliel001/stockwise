import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, X, Trash2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../firebase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function FloatingAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-floating',
      role: 'assistant',
      text: "Muraho! Mbaza icyo wifuza kumenya ku bicuruzwa cyangwa stock yawe hano ako kanya! ⚡️",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottle
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, isOpen]);

  // Handle click outside to close helper
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const quickPrompts = [
    "Ibicuruzwa bishize?",
    "Ninjije angahe uyu munsi?",
    "Ibyagurishijwe cyane?"
  ];

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setInput('');
    setError(null);

    const userMsg: Message = {
      id: 'floating-msg-' + Math.random().toString(36).substring(2, 9),
      role: 'user',
      text: trimmed,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const email = auth.currentUser?.email || 'alieluzii@gmail.com';
      const historyPayload = messages.slice(1).map(m => ({
        role: m.role,
        text: m.text
      }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': email
        },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload
        })
      });

      if (!response.ok) {
        throw new Error('Hagize ikirangazo kibera kuri server.');
      }

      const data = await response.json();
      const assistantMsg: Message = {
        id: 'floating-msg-' + Math.random().toString(36).substring(2, 9),
        role: 'assistant',
        text: data.reply || 'Nta gisubizo nabashije kubona sasa.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setError('Ntibashoboye kwitaba AI. Ongera ugerageze.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col items-end pointer-events-none select-none">
      
      {/* Compact Overlay Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 35, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 25, scale: 0.95 }}
            transition={{ type: 'spring', damping: 24, stiffness: 220 }}
            className="w-[calc(100vw-32px)] sm:w-88 h-[440px] bg-slate-900 border border-slate-800 text-slate-100 rounded-3xl shadow-2xl flex flex-col pointer-events-auto mr-0 mb-4 overflow-hidden"
          >
            {/* Overlay Header */}
            <div className="p-4 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-indigo-600 rounded-lg text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-extrabold font-sans leading-none tracking-tight">StockWise AI Live</h4>
                  <span className="text-[9px] text-indigo-400 mt-1 font-mono tracking-wider uppercase block">Instant Advisor</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setMessages([{
                    id: 'welcome-floating',
                    role: 'assistant',
                    text: "Siba ibiganiro byagenze neza. Mbaza igikurikiyeho! ✨",
                    timestamp: new Date()
                  }])}
                  title="Siba ibiganiro"
                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* List scrollable chatbox messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-950/20">
              {messages.map((m) => {
                const isAI = m.role === 'assistant';
                return (
                  <div key={m.id} className={`flex items-start gap-2.5 ${isAI ? 'justify-start' : 'justify-end'}`}>
                    {isAI && (
                      <div className="p-1.5 bg-indigo-950 border border-indigo-900/60 rounded-md text-indigo-400 shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="max-w-[80%] flex flex-col">
                      <div className={`p-3 rounded-2xl text-[12px] leading-relaxed whitespace-pre-line border shadow-xs ${
                        isAI 
                          ? 'bg-slate-850 text-slate-200 border-slate-800 rounded-tl-none' 
                          : 'bg-indigo-600 text-white border-indigo-700 rounded-tr-none'
                      }`}>
                        {/* Inline markdown replacements for bold indicators */}
                        {m.text.split('**').map((chunk, idx) => 
                          idx % 2 === 1 ? <strong key={idx} className="font-bold underline decoration-indigo-300 text-slate-100">{chunk}</strong> : chunk
                        )}
                      </div>
                      <span className="text-[8px] text-slate-500 mt-1 ml-1 font-medium select-none">
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex items-start gap-2.5 justify-start">
                  <div className="p-1.5 bg-indigo-950 text-indigo-400 rounded-md animate-bounce">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-slate-850 border border-slate-800 py-2.5 px-3.5 rounded-2xl rounded-tl-none flex items-center space-x-1.5">
                    <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {error && (
                <div className="p-2 border border-rose-950/40 bg-rose-950/20 text-rose-300 text-[10.5px] rounded-xl font-bold">
                  {error}
                </div>
              )}
            </div>

            {/* Quick Prompts shortcuts */}
            <div className="px-3.5 py-2.5 bg-slate-900 border-t border-slate-800/60 overflow-x-auto flex gap-1.5 scrollbar-none">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(p)}
                  disabled={loading}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 active:text-white text-[10px] font-bold rounded-lg border border-slate-700/50 cursor-pointer shrink-0 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Inline Sender controller */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="p-3 bg-slate-950/40 border-t border-slate-800/80 flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Baza igisigaye kuri stock..."
                disabled={loading}
                className="flex-1 bg-slate-850 border border-slate-800 text-slate-200 placeholder-slate-500 text-[11.5px] rounded-xl py-2 px-3 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:bg-slate-900"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl transition-all disabled:opacity-40 disabled:scale-100 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Pulse trigger button */}
      <motion.button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl pulse-btn hover:shadow-indigo-650/40 cursor-pointer pointer-events-auto border border-indigo-500 flex items-center justify-center relative outline-none ring-2 ring-indigo-500/10"
      >
        <Sparkles className="w-5.5 h-5.5" />
        
        {/* Glow halo ripple ring */}
        <span className="absolute -inset-0.5 bg-indigo-600 rounded-full animate-ping opacity-25" />
      </motion.button>
    </div>
  );
}
