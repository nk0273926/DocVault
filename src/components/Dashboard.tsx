import { useEffect, useState } from 'react';
import { FolderOpen, FileText, AlertTriangle, CheckCircle2, Clock, TrendingUp, ArrowRight, ClipboardCheck, Star } from 'lucide-react';
import { fetchCases, fetchAllActivityLogs, fetchDeletionRequests, fetchDocumentCountsByCase } from '@/lib/db';
import type { CaseRecord } from '@/types/case';
import type { ActivityLog } from '@/types/audit';
import type { AppUser } from '@/types/user';
import { StatusBadge, PriorityBadge } from '@/components/Badges';
import { formatDate, timeAgo } from '@/lib/format';

interface DashboardProps {
  user: AppUser;
  onOpenCase: (id: string) => void;
  onNavigateCases: () => void;
}

interface DashboardStats {
  totalCases: number;
  openCases: number;
  reviewCases: number;
  closedCases: number;
  totalDocs: number;
  criticalCases: number;
}

const EMPTY_STATS: DashboardStats = { totalCases: 0, openCases: 0, reviewCases: 0, closedCases: 0, totalDocs: 0, criticalCases: 0 };

function computeStats(cases: CaseRecord[], docCounts: Record<string, number>): DashboardStats {
  return cases.reduce<DashboardStats>((stats, c) => {
    stats.totalCases += 1;
    if (c.status === 'open') stats.openCases += 1;
    if (c.status === 'in_review') stats.reviewCases += 1;
    if (c.status === 'closed' || c.status === 'solved') stats.closedCases += 1;
    if (c.priority === 'critical') stats.criticalCases += 1;
    stats.totalDocs += docCounts[c.id] ?? 0;
    return stats;
  }, { ...EMPTY_STATS });
}

export function Dashboard({ user, onOpenCase, onNavigateCases }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [recentCases, setRecentCases] = useState<CaseRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // fetchCases() is already scoped by RLS to what this user can see
        // (admin: everything; others: created-by-them or team-member-of),
        // so no extra client-side filtering is needed for correctness — see
        // P1 #60/#61: every view uses the same access model.
        const [cases, activity] = await Promise.all([fetchCases(), fetchAllActivityLogs(10)]);
        const docCounts = await fetchDocumentCountsByCase(cases.map((c) => c.id));

        setStats(computeStats(cases, docCounts));
        setRecentActivity(activity);
        setRecentCases(cases.slice(0, 5));

        if (user.role === 'admin') {
          const pending = await fetchDeletionRequests('pending');
          setPendingApprovals(pending.length);
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user.id, user.role]);

  const dashboardTitle = user.role === 'admin' ? 'Dashboard' : 'My Dashboard';
  const dashboardSubtitle =
    user.role === 'admin' ? 'Overview of all cases and system activity'
    : user.role === 'investigator' ? 'Your created and assigned cases'
    : 'Cases assigned to you and recent activity';

  const STAT_CARDS = [
    { label: 'Total Cases', value: stats.totalCases, icon: FolderOpen, bg: 'bg-sky-50', iconColor: 'text-sky-600' },
    { label: 'Open Cases', value: stats.openCases, icon: Clock, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { label: 'In Review', value: stats.reviewCases, icon: TrendingUp, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: user.role === 'admin' ? 'Solved/Closed' : 'Closed', value: stats.closedCases, icon: CheckCircle2, bg: 'bg-slate-100', iconColor: 'text-slate-600' },
    { label: 'Documents', value: stats.totalDocs, icon: FileText, bg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { label: 'Critical Priority', value: stats.criticalCases, icon: AlertTriangle, bg: 'bg-red-50', iconColor: 'text-red-600' },
  ];

  const recentCasesTitle = user.role === 'admin' ? 'Recent Cases' : 'My Recent Cases';
  const recentCasesLabel = user.role === 'admin' ? 'View all' : 'View my cases';

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{dashboardTitle}</h2>
          <p className="text-sm text-slate-500 mt-1">{dashboardSubtitle}</p>
        </div>
        {user.role === 'admin' && pendingApprovals > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <ClipboardCheck size={18} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-800">{pendingApprovals} pending approval{pendingApprovals !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-lg hover:border-slate-300 transition-all duration-200">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <Icon size={20} className={card.iconColor} />
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {loading ? <span className="text-slate-300">—</span> : card.value}
              </p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              {user.role !== 'admin' && <Star size={16} className="text-sky-500" />}
              {recentCasesTitle}
            </h3>
            <button onClick={onNavigateCases} className="text-xs font-medium text-sky-600 hover:text-sky-700 flex items-center gap-1 transition">
              {recentCasesLabel} <ArrowRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {loading && <div className="px-5 py-8 text-center text-sm text-slate-400">Loading...</div>}
            {!loading && recentCases.length === 0 && (
              <div className="px-5 py-12 text-center">
                <FolderOpen size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">{user.role === 'admin' ? 'No cases yet' : 'No cases assigned to you yet'}</p>
              </div>
            )}
            {recentCases.map((c) => (
              <button key={c.id} onClick={() => onOpenCase(c.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-400">{c.case_number}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{c.client_name || 'No client'} · {formatDate(c.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <PriorityBadge priority={c.priority} />
                  <StatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Recent Activity</h3>
          </div>
          <div className="px-5 py-4 space-y-4 max-h-[420px] overflow-y-auto">
            {loading && <div className="text-center text-sm text-slate-400 py-4">Loading...</div>}
            {!loading && recentActivity.length === 0 && (
              <div className="text-center py-8">
                <Clock size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No activity yet</p>
              </div>
            )}
            {recentActivity.map((log) => (
              <div key={log.id} className="flex gap-3">
                <div className="relative flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                  <div className="w-px flex-1 bg-slate-200" />
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <p className="text-sm text-slate-700 leading-snug">{log.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{log.performed_by} · {timeAgo(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
