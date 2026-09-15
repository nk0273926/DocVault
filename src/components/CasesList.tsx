import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, FolderOpen, Calendar, User as UserIcon, AlertCircle } from 'lucide-react';
import { fetchCases } from '@/lib/db';
import { getAccessibleCaseIds } from '@/lib/permissions';
import { StatusBadge, PriorityBadge } from '@/components/Badges';
import { formatDate } from '@/lib/format';
import type { CaseRecord } from '@/types/case';
import type { AppUser } from '@/types/user';

interface CasesListProps {
  user: AppUser;
  onOpenCase: (id: string) => void;
  onNewCase: () => void;
  externalSearch?: string;
  title?: string;
  myCasesOnly?: boolean;
}

export function CasesList({ user, onOpenCase, onNewCase, externalSearch, title = 'Cases', myCasesOnly }: CasesListProps) {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (externalSearch !== undefined) setSearch(externalSearch);
  }, [externalSearch]);

  useEffect(() => {
    load();
  }, [user.id]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      // RLS already restricts what fetchCases() can return to rows this
      // user has access to (see cases_select policy). getAccessibleCaseIds
      // is applied on top only to power the "My Cases" filter (created-by /
      // team-membership), not as a security boundary.
      const data = await fetchCases();
      setCases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cases');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = cases;
    if (myCasesOnly) {
      const accessible = new Set(getAccessibleCaseIds(user, cases, []));
      list = list.filter((c) => c.created_by === user.id || accessible.has(c.id));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.case_number.toLowerCase().includes(q) ||
          c.client_name.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [cases, search, myCasesOnly, user]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} case{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={onNewCase}
          className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
        >
          <Plus size={16} />
          New Case
        </button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, case number, client, or tag..."
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-slate-400">Loading cases...</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FolderOpen size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-1">{search ? 'No matching cases' : 'No cases yet'}</p>
            {!search && (
              <button onClick={onNewCase} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
                Create your first case
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCase(c.id)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{c.case_number}</span>
                    <StatusBadge status={c.status} />
                    <PriorityBadge priority={c.priority} />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    {c.client_name && (
                      <span className="flex items-center gap-1">
                        <UserIcon size={12} />
                        {c.client_name}
                      </span>
                    )}
                    {c.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        Due {formatDate(c.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CasesList;
