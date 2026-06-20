import { useState } from 'react';
import { ActivityLog } from '../types';
import { History, Search, Calendar, User, Trash2, ShieldAlert } from 'lucide-react';
import { safeGetDate } from '../utils/date';
import { clearActivityLogs } from '../services/db';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
  currentUserEmail: string;
}

export default function ActivityLogsView({ logs, currentUserEmail }: ActivityLogsViewProps) {
  const [query, setQuery] = useState('');
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(query.toLowerCase()) ||
    log.performedBy.toLowerCase().includes(query.toLowerCase())
  );

  const handleClearLogs = async () => {
    const confirmed = window.confirm(
      "Ese uremera gusiba amateka yose y’ikorwa ry’akazi burundu? / Are you sure you want to permanently clear all activity logs? This action is irreversible."
    );
    if (!confirmed) return;

    try {
      setClearing(true);
      setError(null);
      await clearActivityLogs(currentUserEmail);
    } catch (err: any) {
      setError(err?.message || 'Gusiba amateka byanze. / Failed to clear activity logs.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      
      {/* Header Summary info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 w-full">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Administrative Audit Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Verifiable tracking of shelf updates, inventory stock arrivals, and checkouts. Completely immutable once written.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="px-3 py-1.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 select-none shadow-xs">
            <History className="w-4 h-4 text-indigo-400" />
            <span>{logs.length} Operations Indexed</span>
          </div>

          <button
            id="btn-clear-all-activity-logs"
            onClick={handleClearLogs}
            disabled={clearing}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100/85 active:bg-rose-100 border border-rose-200/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Clear all activity logs"
          >
            {clearing ? (
              <div className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Siba Amateka / Clear Logs</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start space-x-2 animate-pulse">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Internal Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
        <input
          type="text"
          placeholder="Filter audit records by administrator email, action detail keyword..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-white border border-slate-100 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
        />
      </div>

      {/* Auditing timeline items lists */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl py-16 text-center border border-slate-100 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">No matching activities indexed</p>
          <p className="text-[10px] text-slate-400 mt-1">Refine your search parameters and try again.</p>
        </div>
      ) : (
        <div className="relative border-l-2 border-slate-200/80 pl-6 ml-3 space-y-6">
          {filteredLogs.map((log) => (
            <div key={log.id} className="relative group">
              {/* Bullet line checkpoint node indicator */}
              <span className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-slate-300 group-hover:border-indigo-500 transition-colors flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-slate-350 rounded-full group-hover:bg-indigo-500" />
              </span>

              {/* Box info summary content */}
              <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-xs hover:shadow-md hover:border-slate-200/80 transition-all">
                <p className="text-xs font-bold text-slate-800 leading-relaxed font-sans">
                  {log.action}
                </p>

                <div className="flex flex-wrap items-center gap-4 mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <span className="flex items-center space-x-1 hover:text-indigo-650 transition-colors">
                    <User className="w-3.5 h-3.5" />
                    <span>{log.performedBy}</span>
                  </span>
                  
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{log.createdAt ? safeGetDate(log.createdAt).toLocaleString() : ''}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
