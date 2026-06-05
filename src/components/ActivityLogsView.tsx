import { useState } from 'react';
import { ActivityLog } from '../types';
import { History, Search, Calendar, User, ClipboardList } from 'lucide-react';
import { safeGetDate } from '../utils/date';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
}

export default function ActivityLogsView({ logs }: ActivityLogsViewProps) {
  const [query, setQuery] = useState('');

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(query.toLowerCase()) ||
    log.performedBy.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-4xl">
      
      {/* Header Summary info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Administrative Audit Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Verifiable tracking of shelf updates, inventory stock arrivals, and checkouts. Completely immutable once written.
          </p>
        </div>
        
        <div className="px-3.5 py-1.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 self-start sm:self-auto select-none">
          <History className="w-4 h-4 text-indigo-400" />
          <span>{logs.length} Operations Indexed</span>
        </div>
      </div>

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
