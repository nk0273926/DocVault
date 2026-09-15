import { useEffect, useState } from 'react';
import { Users, Search, Mail, Shield } from 'lucide-react';
import type { DirectoryUser } from '@/lib/db';
import { type UserRole, ROLE_LABELS, ROLE_COLORS } from '@/types/user';
import { RoleBadge } from '@/components/Badges';
import { DEMO_CREDENTIALS } from '@/data/mockUsers';

export function UserManagement() {
  const [allUsers, setAllUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  useEffect(() => {
    // Simulate API call with demo users
    setTimeout(() => {
      setAllUsers(DEMO_CREDENTIALS.map((cred) => ({
        id: cred.id,
        name: cred.name,
        email: cred.email,
        role: cred.role.toLowerCase() as UserRole,
      })));
      setLoading(false);
    }, 500);
  }, []);

  const filtered = allUsers.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  const roleCounts: Record<UserRole, number> = allUsers.reduce(
    (acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; },
    { admin: 0, investigator: 0, officer: 0, analyst: 0 } as Record<UserRole, number>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h2>
        <p className="text-sm text-slate-500 mt-1">View and manage all system users and their roles</p>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
          <div key={role} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-slate-400" />
              <RoleBadge role={role} />
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{roleCounts[role]}</p>
            <p className="text-xs text-slate-500 mt-0.5">{ROLE_LABELS[role]}{roleCounts[role] !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
        >
          <option value="all">All Roles</option>
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-400">Loading users...</td></tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                          {u.name.charAt(0)}
                        </div>
                        <p className="text-sm font-medium text-slate-800">{u.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Mail size={14} className="text-slate-400" />
                        {u.email}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${ROLE_COLORS[u.role]}`}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-mono text-slate-400">{u.id}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 && (
          <div className="px-5 py-12 text-center">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No users found</p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs text-blue-700">
          <strong>Note:</strong> Role changes (promoting/demoting a user) are performed directly on the `profiles`
          table by an admin (RLS restricts UPDATE on that table to admins). This prototype view does not yet expose
          an in-app role editor or account creation — mark this as a mock/limited view (P1 #69) until that is built.
        </p>
      </div>
    </div>
  );
}
