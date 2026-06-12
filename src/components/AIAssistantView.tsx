import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, HelpCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../firebase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function AIAssistantView() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Muraho! Ndi **StockWise AI Assistant**. Nshobora kugufasha kumenya amakuru ya stock yawe, ibicuruzwa birimo gushira, ibyagurishijwe cyane, inyungu cyangwa ibindi bibazo bifitanye isano n'ubucuruzi bwawe muri rusange.\n\nUshobora kumbaza mu **Kinyarwanda** cyangwa mu **Cyongereza**.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to lowest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sampleQuestions = [
    "Isukari isigaye ingahe?",
    "Ni ibihe bicuruzwa biri hafi gushira?",
    "Ni iki cyagurishijwe cyane muri uku kwezi?",
    "Ninjije angahe uyu munsi?",
    "Ni ibihe bicuruzwa ngomba kongera kurangura?",
    "Mbwira uko stock imeze muri rusange.",
    "Ni ibihe bicuruzwa bitagurishwa cyane?",
    "Ni iyihe nyungu nabonye muri uku kwezi?"
  ];

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput('');

    // Append user message
    const userMsg: Message = {
      id: 'msg-' + Math.random().toString(36).substring(2, 11),
      role: 'user',
      text: trimmed,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const email = auth.currentUser?.email || 'alieluzii@gmail.com';
      
      // Map historical chat for continuity context
      const historyPayload = messages.slice(1).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
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
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to query assistant');
      }

      const data = await response.json();

      const assistantMsg: Message = {
        id: 'msg-' + Math.random().toString(36).substring(2, 11),
        role: 'assistant',
        text: data.reply || 'Nta gisubizo kibonetse kugeza sasa.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Ntibishobotse gushyikirana na AI Assistant. Ongera ugerageze.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text: "Muraho! Ndi **StockWise AI Assistant**. Nshobora kugufasha kumenya amakuru ya stock yawe, ibicuruzwa birimo gushira, ibyagurishijwe cyane, inyungu cyangwa ibindi bibazo bifitanye isano n'ubucuruzi bwawe muri rusange.\n\nUshobora kumbaza mu **Kinyarwanda** cyangwa mu **Cyongereza**.",
        timestamp: new Date()
      }
    ]);
    setError(null);
  };

  return (
    <div id="ai-assistant-root" className="space-y-6 flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto">
      {/* Header section with instructions */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span>StockWise AI Assistant</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Menya uko ibicuruzwa binjira na stock bihagaze ukoresheje ikoranabuhanga rya AI mu Kinyarwanda n'Icyongereza.
          </p>
        </div>

        <button
          onClick={handleClearHistory}
          className="px-3 py-1.5 hover:bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg border border-slate-200 transition-colors flex items-center space-x-1 cursor-pointer select-none"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Siba Ibiganiro</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        {/* Chat window */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200/85 flex flex-col min-h-0 shadow-sm overflow-hidden">
          {/* Scrollable messages container */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const isAI = m.role === 'assistant';
                return (
                  <motion.div
                    key={m.id}
                    id={`message-container-${m.id}`}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className={`flex items-start gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}
                  >
                    {isAI && (
                      <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl shrink-0 mt-0.5 shadow-sm border border-indigo-100/60">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div className="max-w-[85%] sm:max-w-[70%] flex flex-col">
                      <div
                        className={`p-3.5 rounded-2xl text-xs sm:text-[13px] leading-relaxed whitespace-pre-line shadow-sm border ${
                          isAI
                            ? 'bg-slate-50 text-slate-800 border-slate-100 rounded-tl-none'
                            : 'bg-indigo-600 text-white border-indigo-700 rounded-tr-none'
                        }`}
                      >
                        {/* Simplistic Kinyarwanda-friendly inline bold replacement instead of full parser */}
                        {m.text.split('**').map((chunk, idx) => 
                          idx % 2 === 1 ? <strong key={idx} className={isAI ? "font-bold text-slate-900" : "font-semibold text-white underline decoration-indigo-300"}>{chunk}</strong> : chunk
                        )}
                      </div>
                      
                      <span className={`text-[9px] mt-1 text-slate-400 font-medium ${!isAI ? 'text-right mr-1' : 'ml-1'}`}>
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {!isAI && (
                      <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 shrink-0 flex items-center justify-center font-bold text-[10px] uppercase select-none mt-0.5">
                        {auth.currentUser?.email?.[0] || 'U'}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {loading && (
              <div className="flex items-start gap-3 justify-start">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl shrink-0 animate-bounce">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-slate-50 border border-slate-100 py-3 px-4 rounded-2xl rounded-tl-none flex items-center space-x-1 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-slate-450 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-450 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-slate-450 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat input box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="p-3 bg-slate-50 border-t border-slate-200/85 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Baza igishobora kugufasha (urugero: Isukari isigaye ingahe?)..."
              disabled={loading}
              className="flex-1 bg-white border border-slate-250 rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-755 text-white disabled:bg-slate-300 disabled:text-slate-400 disabled:border-slate-350 disabled:cursor-not-allowed rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 border border-indigo-700 shadow-sm"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </form>
        </div>

        {/* Suggestion sidebar chips */}
        <div className="w-full lg:w-72 bg-slate-50 border border-slate-200/85 p-4 rounded-2xl flex flex-col shrink-0 gap-3">
          <div className="flex items-center space-x-2 border-b border-slate-200 pb-2.5">
            <HelpCircle className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-800 tracking-wider uppercase font-mono">Ibikunze kubazwa</h3>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
            Kanda kuri kimwe mu bibazo bikurikira kugira ngo ubaze AI Assistant ako kanya:
          </p>

          <div className="flex flex-row flex-wrap lg:flex-col gap-2 overflow-y-auto">
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q)}
                disabled={loading}
                className="px-3 py-2 text-left bg-white hover:bg-slate-100 text-slate-700 hover:text-indigo-700 text-xs font-semibold rounded-xl border border-slate-250 hover:border-indigo-200 transition-all text-[11px] cursor-pointer select-none leading-snug font-sans disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
