import { useState } from 'react';
import { Notification } from '../types';
import { markNotificationAsRead, deleteNotification } from '../services/db';
import { Bell, Eye, Trash2, ShieldAlert, CheckCircle, Calendar } from 'lucide-react';
import { safeGetDate } from '../utils/date';

interface NotificationsViewProps {
  notifications: Notification[];
}

export default function NotificationsView({ notifications }: NotificationsViewProps) {
  const [error, setError] = useState<string | null>(null);
  
  const handleMarkAsRead = async (id: string) => {
    try {
      setError(null);
      await markNotificationAsRead(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to mark as read.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setError(null);
      await deleteNotification(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete notification.');
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      
      {/* Header Summary */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans">
            Store Notifications & Alerts
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Warnings triggered automatically when inventory quantities fall underneath safety alert specifications.
          </p>
        </div>
        
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg shrink-0 border border-indigo-100 flex items-center space-x-1.5 select-none">
          <Bell className="w-4 h-4" />
          <span>{unreadCount} Alarm{unreadCount !== 1 ? 's' : ''} Active</span>
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {/* Grid or simple clean vertical cards */}
      {notifications.length === 0 ? (
        <div className="bg-white rounded-xl py-16 text-center border border-slate-100">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">
            ✓
          </div>
          <p className="text-xs font-bold text-slate-600">No active alerts recorded</p>
          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed max-w-xs mx-auto">
            Your store is completely stocked and operating cleanly within safety margins.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {notifications.map((n) => {
            const isLowStock = n.type === 'low_stock';
            return (
              <div 
                key={n.id}
                className={`p-4 bg-white rounded-xl border transition-all flex items-start justify-between gap-4 ${
                  !n.isRead 
                    ? 'border-indigo-200 ring-2 ring-indigo-500/5 shadow-md shadow-indigo-50/10' 
                    : 'border-slate-100 shadow-sm opacity-70'
                }`}
              >
                <div className="flex items-start space-x-3.5">
                  <div className={`p-2 rounded-xl shrink-0 ${
                    isLowStock 
                      ? 'bg-amber-50 text-amber-700' 
                      : 'bg-indigo-50 text-indigo-700'
                  }`}>
                    {isLowStock ? <ShieldAlert className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                  </div>

                  <div>
                    <p className={`text-xs ${!n.isRead ? 'font-bold text-slate-800' : 'font-semibold text-slate-500'}`}>
                      {n.message}
                    </p>
                    
                    <div className="flex items-center space-x-2.5 mt-2 text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{n.createdAt ? safeGetDate(n.createdAt).toLocaleString() : ''}</span>
                      </span>
                      <span>&bull;</span>
                      <span className={isLowStock ? 'text-amber-700' : 'text-indigo-600'}>
                        {isLowStock ? 'Stock Depleted Threat' : 'System Announcement'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      className="p-1.5 hover:bg-slate-150 text-slate-500 hover:text-indigo-650 rounded-lg transition-colors cursor-pointer"
                      title="Mark read"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-450 rounded-lg transition-colors cursor-pointer"
                    title="Dismiss alert"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
