import { useEffect, useState } from 'react';
import { ClockAlert, Search } from 'lucide-react';
import { fetchAllActivityLogs } from '@/lib/db';
import type { ActivityLog } from '@/types/audit';
import { formatDateTime } from '@/lib/format';

export function AuditHistory() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // RLS restricts activity_logs SELECT to admins (global) or users
        // with access to the relevant case (P2 #72 — immutable, and only
        // visible to those entitled to see it).
        const data = await fetchAllActivityLogs(100);
        setLogs(data);
      } catch (err) {
        console.error('Failed to load audit history:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = search.trim()
    ? logs.filter(
        (l) =>
          l.description.toLowerCase().includes(search.toLowerCase()) ||
          l.performed_by.toLowerCase().includes(search.toLowerCase()) ||
          l.action.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const actionColor = (action: string): string => {
    if (action.includes('created')) return 'bg-emerald-500';
    if (action.includes('uploaded')) return 'bg-sky-500';
    if (action.includes('deleted') || action.includes('removed')) return 'bg-red-500';
    if (action.includes('added') || action.includes('team')) return 'bg-blue-500';
    if (action.includes('status') || action.includes('solved')) return 'bg-amber-500';
    if (action.includes('restored')) return 'bg-purple-500';
    return 'bg-slate-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Audit History</h2>
        <p className="text-sm text-slate-500 mt-1">Complete system activity log for all cases and documents</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by action, description, or user..."
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
        />
      </div>

      {/* Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">Loading audit history...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <ClockAlert size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-400">
              {search ? 'No matching activity found' : 'No activity recorded yet'}
            </p>
          </div>
        ) : (
          <div className="px-5 py-4">
            {filtered.map((log, idx) => (
              <div key={log.id} className="flex gap-3">
                <div className="relative flex flex-col items-center">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${actionColor(log.action)}`} />
                  {idx < filtered.length - 1 && <div className="w-px flex-1 bg-slate-200" />}
                </div>
                <div className="pb-5 min-w-0 flex-1">
                  <p className="text-sm text-slate-700 leading-snug">{log.description}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs text-slate-400">
                      {log.performed_by} · {formatDateTime(log.created_at)}
                    </p>
                    <span className="text-xs font-mono text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded">
                      {log.action}
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
