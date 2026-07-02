import { useState, useEffect } from 'react';
import { Users, UserCheck, ShieldAlert, Ban, Clock, Search, Shield, RefreshCw, Bell, Trash2, History, Calendar } from 'lucide-react';

interface SuperAdminUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

interface SuperAdminStats {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  rejectedUsers: number;
  suspendedUsers: number;
}

interface SuperAdminViewProps {
  currentUserEmail: string;
}

export default function SuperAdminView({ currentUserEmail }: SuperAdminViewProps) {
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [stats, setStats] = useState<SuperAdminStats>({
    totalUsers: 0,
    activeUsers: 0,
    pendingUsers: 0,
    rejectedUsers: 0,
    suspendedUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);

  const fetchSystemLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await fetch('/api/activity-logs', {
        headers: {
          'x-user-email': currentUserEmail,
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemLogs(data);
      }
    } catch (err: any) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleClearAllLogs = async () => {
    const confirmed = window.confirm(
      "Ese uremereye gusiba amateka yose y'akazi burundu? / Are you sure you want to permanently clear all system activity logs? This action cannot be undone."
    );
    if (!confirmed) return;

    try {
      setClearingLogs(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const response = await fetch('/api/activity-logs', {
        method: 'DELETE',
        headers: {
          'x-user-email': currentUserEmail,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to clear activity logs.');
      }

      const data = await response.json();
      setSuccessMsg(data.message || 'System activity logs successfully cleared!');
      await fetchSystemLogs();
      await fetchUsersAndStats();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not clear system activity logs.');
    } finally {
      setClearingLogs(false);
    }
  };

  const fetchUsersAndStats = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // fetch stats
      const statsRes = await fetch('/api/super-admin/stats', {
        headers: {
          'x-user-email': currentUserEmail,
        }
      });
      if (!statsRes.ok) {
        throw new Error('Failed to retrieve system statistics metrics.');
      }
      const statsData = await statsRes.json();
      setStats(statsData);

      // fetch users
      const usersRes = await fetch('/api/super-admin/users', {
        headers: {
          'x-user-email': currentUserEmail,
        }
      });
      if (!usersRes.ok) {
        throw new Error('Failed to retrieve user registry listing.');
      }
      const usersData = await usersRes.json();
      setUsers(usersData);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndStats();
    fetchSystemLogs();
  }, [currentUserEmail]);

  const handleUpdateStatus = async (userId: string, targetStatus: string) => {
    try {
      setActionLoadingId(userId);
      setErrorMsg(null);
      setSuccessMsg(null);

      const response = await fetch(`/api/super-admin/users/${userId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': currentUserEmail,
        },
        body: JSON.stringify({ status: targetStatus })
      });

      if (!response.ok) {
        let errText = 'Failed to update user status';
        try {
          const errData = await response.json();
          errText = errData.error || errText;
        } catch {}
        throw new Error(errText);
      }

      const data = await response.json();
      setSuccessMsg(data.message || 'Status successfully updated!');
      await fetchUsersAndStats();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not update user status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      setActionLoadingId(userId);
      setErrorMsg(null);
      setSuccessMsg(null);

      const response = await fetch(`/api/super-admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'x-user-email': currentUserEmail,
        },
      });

      if (!response.ok) {
        let errText = 'Failed to delete user';
        try {
          const errData = await response.json();
          errText = errData.error || errText;
        } catch {}
        throw new Error(errText);
      }

      const data = await response.json();
      setSuccessMsg(data.message || 'User successfully deleted!');
      setConfirmDeleteId(null);
      await fetchUsersAndStats();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not delete user');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter computation
  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'ALL') return matchesSearch;
    return matchesSearch && u.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight font-sans flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            Super Admin Access System
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Authorize accounts, filter pending enrollment flags, suspend profiles, and verify platform operational telemetry logs.
          </p>
        </div>

        <button 
          id="btn_refresh_sa"
          onClick={fetchUsersAndStats}
          disabled={loading}
          className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg flex items-center space-x-1.5 self-start sm:self-auto select-none"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Info states banner notifications */}
      {errorMsg && (
        <div id="sa_error_alert" className="p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-xs font-semibold">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div id="sa_success_alert" className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold">
          {successMsg}
        </div>
      )}

      {/* Pending Enrollment Request Alerts */}
      {users.filter((u) => u.status === 'PENDING').length > 0 && (
        <div id="sa_pending_alerts_panel" className="bg-amber-50/40 border border-amber-200/80 rounded-xl p-4 mt-2 space-y-3 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-550"></span>
            </span>
            <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 font-sans">
              <Bell className="w-4.5 h-4.5 text-amber-600" />
              New User Enrollment Alerts ({users.filter((u) => u.status === 'PENDING').length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {users.filter((u) => u.status === 'PENDING').map((usr) => (
              <div key={usr.id} className="p-3.5 bg-white border border-amber-200/50 rounded-xl flex items-start sm:items-center justify-between gap-3 shadow-xs hover:border-amber-300/80 transition-colors">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 bg-amber-50 rounded-lg text-amber-750 shrink-0 mt-0.5">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-800 leading-tight">
                      Request from <span className="text-indigo-600 font-extrabold">{usr.fullName}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">{usr.email}</p>
                    <p className="text-[9px] text-amber-700 font-semibold bg-amber-50/40 border border-amber-100 px-1.5 py-0.2 rounded mt-1.5 max-w-max">
                      Awaiting access authorization
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleUpdateStatus(usr.id, 'ACTIVE')}
                    disabled={actionLoadingId === usr.id}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg shadow-sm transition-colors cursor-pointer select-none"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(usr.id, 'REJECTED')}
                    disabled={actionLoadingId === usr.id}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold rounded-lg border border-rose-250 shadow-sm transition-colors cursor-pointer select-none"
                  >
                    Reject
                  </button>

                  {confirmDeleteId === usr.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDeleteUser(usr.id)}
                        disabled={actionLoadingId === usr.id}
                        className="px-2 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-1.5 py-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg border border-slate-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(usr.id)}
                      disabled={actionLoadingId === usr.id}
                      className="p-1.5 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-500 rounded-lg border border-slate-200 transition-colors"
                      title="Permanently Delete User"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Registered */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Enregistered</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight mt-0.5">{stats.totalUsers}</p>
          </div>
        </div>

        {/* Pending Approval */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-amber-600">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Pending Approval</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight mt-0.5">{stats.pendingUsers}</p>
          </div>
        </div>

        {/* Active Accounts */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Active Accounts</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight mt-0.5">{stats.activeUsers}</p>
          </div>
        </div>

        {/* Suspended Accounts */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-100 text-orange-600">
            <Ban className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Suspended</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight mt-0.5">{stats.suspendedUsers}</p>
          </div>
        </div>

        {/* Rejected Accounts */}
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Rejected</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight mt-0.5">{stats.rejectedUsers}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-3 justify-between items-center">
        {/* Internal status filtering */}
        <div className="flex flex-wrap gap-1.5 self-stretch md:self-auto">
          {(['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const).map((filter) => (
            <button
              key={filter}
              id={`filter_${filter.toLowerCase()}`}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
                statusFilter === filter
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {filter.toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search Input filter */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="sa_search_input"
            type="text"
            placeholder="Search matching personnel by name, imeri..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg py-1.5 pl-9 pr-4 text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Database Registered User Listing Table */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs font-semibold text-slate-500">Querying live database system archives...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-xs font-semibold text-slate-500">No registered users matched the active filters</p>
            <p className="text-[10px] text-slate-400 mt-1">Change filters or reset your keyword string query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500">
                  <th className="p-4">Personnel Name</th>
                  <th className="p-4">Email Address</th>
                  <th className="p-4">Authorization Role</th>
                  <th className="p-4">Enrollment Status</th>
                  <th className="p-4 text-center">Security Interventions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => {
                  const isUserSuperAdmin = user.role === 'SUPER_ADMIN';
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-semibold text-slate-900">{user.fullName || 'Untitled'}</td>
                      <td className="p-4 font-mono text-slate-500 select-all">{user.email}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isUserSuperAdmin 
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                            : user.role === 'ADMIN' 
                            ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {user.role || 'USER'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-block ${
                          user.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : user.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800 animate-pulse'
                            : user.status === 'SUSPENDED'
                            ? 'bg-orange-100 text-orange-850'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {user.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {isUserSuperAdmin ? (
                            <span className="text-[10px] font-semibold text-indigo-500 select-none">Immutable Account</span>
                          ) : (
                            <>
                              {user.status !== 'ACTIVE' && (
                                <button
                                  id={`btn_approve_${user.id}`}
                                  disabled={actionLoadingId === user.id}
                                  onClick={() => handleUpdateStatus(user.id, 'ACTIVE')}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-md transition-colors font-sans"
                                  title="Approve User"
                                >
                                  Approve
                                </button>
                              )}

                              {user.status !== 'SUSPENDED' && (
                                <button
                                  id={`btn_suspend_${user.id}`}
                                  disabled={actionLoadingId === user.id}
                                  onClick={() => handleUpdateStatus(user.id, 'SUSPENDED')}
                                  className="px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-md transition-colors font-sans"
                                  title="Suspend User"
                                >
                                  Suspend
                                </button>
                              )}

                              {user.status !== 'REJECTED' && (
                                <button
                                  id={`btn_reject_${user.id}`}
                                  disabled={actionLoadingId === user.id}
                                  onClick={() => handleUpdateStatus(user.id, 'REJECTED')}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-md transition-colors font-sans"
                                  title="Reject User"
                                >
                                  Reject
                                </button>
                              )}

                              {/* Restore helper button to make life easy for debugging/testing */}
                              {user.status !== 'PENDING' && (
                                <button
                                  id={`btn_pending_${user.id}`}
                                  disabled={actionLoadingId === user.id}
                                  onClick={() => handleUpdateStatus(user.id, 'PENDING')}
                                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-500 font-bold rounded-md transition-colors font-sans"
                                  title="Reset back to Awaiting Approval Status"
                                >
                                  Reset
                                </button>
                              )}

                              {confirmDeleteId === user.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    id={`btn_confirm_delete_${user.id}`}
                                    disabled={actionLoadingId === user.id}
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md text-[10px] font-sans"
                                    title="Confirm Permanent Deletion"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    id={`btn_cancel_delete_${user.id}`}
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-1.5 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 font-bold rounded-md text-[10px] font-sans"
                                    title="Cancel Deletion"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  id={`btn_delete_${user.id}`}
                                  disabled={actionLoadingId === user.id}
                                  onClick={() => setConfirmDeleteId(user.id)}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-150 text-rose-700 hover:text-rose-800 font-bold rounded-md transition-colors font-sans"
                                  title="Permanently Delete User"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Platform Audit & Telemetry Activity Logs Section */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight font-sans flex items-center gap-1.5">
              <History className="w-4 h-4 text-indigo-600" />
              Platform Operational Telemetry Logs
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Verify platform operations history, audit logs, and clear system telemetry history database-wide.
            </p>
          </div>

          <button
            id="btn_clear_telemetry_logs_sa"
            onClick={handleClearAllLogs}
            disabled={clearingLogs || logsLoading}
            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center space-x-1.5 select-none transition-colors border border-rose-200/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge Database Logs</span>
          </button>
        </div>

        {logsLoading ? (
          <div className="py-8 text-center">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-[10px] text-slate-400">Loading system logs ledger...</p>
          </div>
        ) : systemLogs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-slate-400">All activity logs have been purged from the system.</p>
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2.5 pr-2">
            {systemLogs.slice(0, 50).map((log: any) => (
              <div key={log.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800 font-sans leading-snug">{log.action}</p>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>by {log.performedBy || 'System'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
