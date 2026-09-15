import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Trash2, Eye, Upload, Edit, Download, X, Users } from 'lucide-react';
import { fetchTeamMembers, addTeamMember, removeTeamMember, updateTeamMemberPermissions, getAllUsers, type DirectoryUser } from '@/lib/db';
import { type CaseTeamMember, ROLE_LABELS, ROLE_COLORS } from '@/lib/supabase';
import type { UserRole } from '@/types/user';
import { RoleBadge } from '@/components/Badges';

interface TeamManagerProps {
  caseId: string;
  caseCreatedBy: string;
  actor: { id: string; name: string };
}

export function TeamManager({ caseId, caseCreatedBy, actor }: TeamManagerProps) {
  const [team, setTeam] = useState<CaseTeamMember[]>([]);
  const [allUsers, setAllUsers] = useState<DirectoryUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTeam();
    getAllUsers().then(setAllUsers).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function loadTeam() {
    setLoading(true);
    try {
      const data = await fetchTeamMembers(caseId);
      setTeam(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }

  const teamUserIds = useMemo(() => team.map((m) => m.user_id), [team]);
  const availableUsers = useMemo(
    () => allUsers.filter((u) => !teamUserIds.includes(u.id) && u.id !== caseCreatedBy),
    [allUsers, teamUserIds, caseCreatedBy]
  );
  const filteredAvailable = search.trim()
    ? availableUsers.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : availableUsers;

  async function handleAdd(user: DirectoryUser) {
    setError('');
    try {
      // Explicit default RBAC matrix (P1 #67) applied when adding someone
      // to a case team. These are just the starting point — an admin/case
      // creator can adjust any individual toggle afterward.
      //   investigator: view + upload + edit; download requires an
      //                 explicit per-document/team grant (kept off by default)
      //   officer:      view only; download requires an explicit grant
      //   analyst:      view only, most restricted; download requires an
      //                 explicit grant
      const defaultPerms = {
        can_view: true,
        can_upload: user.role === 'investigator',
        can_edit: user.role === 'investigator',
        can_download: false,
      };
      await addTeamMember(caseId, user, defaultPerms, actor);
      await loadTeam();
      setSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  }

  async function handleRemove(member: CaseTeamMember) {
    setError('');
    try {
      await removeTeamMember(member.id, caseId, member.user_name, actor);
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  async function handleTogglePerm(member: CaseTeamMember, perm: 'can_view' | 'can_upload' | 'can_edit' | 'can_download') {
    setError('');
    try {
      await updateTeamMemberPermissions(member.id, {
        can_view: member.can_view,
        can_upload: member.can_upload,
        can_edit: member.can_edit,
        can_download: member.can_download,
        [perm]: !member[perm],
      });
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permissions');
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users size={16} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Case Team Members ({team.length})</h3>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading team...</div>
        ) : team.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Users size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No team members yet. Add users below.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {team.map((member) => (
              <div key={member.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-sm font-semibold text-white shrink-0">
                    {member.user_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{member.user_name}</p>
                    <div className="mt-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${ROLE_COLORS[member.user_role as UserRole]}`}>
                        {ROLE_LABELS[member.user_role as UserRole]}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <PermToggle icon={Eye} label="View" active={member.can_view} onClick={() => handleTogglePerm(member, 'can_view')} />
                  <PermToggle icon={Upload} label="Upload" active={member.can_upload} onClick={() => handleTogglePerm(member, 'can_upload')} />
                  <PermToggle icon={Edit} label="Edit" active={member.can_edit} onClick={() => handleTogglePerm(member, 'can_edit')} />
                  <PermToggle icon={Download} label="Download" active={member.can_download} onClick={() => handleTogglePerm(member, 'can_download')} />
                  <button onClick={() => handleRemove(member)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Remove from team">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Add Team Members</h3>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
          />
        </div>
        {filteredAvailable.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">{search ? 'No users found' : 'All users are already on the team'}</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredAvailable.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2.5 border border-slate-100 rounded-lg hover:bg-slate-50 transition">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                    {u.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{u.name}</p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={u.role} />
                  <button onClick={() => handleAdd(u)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 rounded-lg transition">
                    <UserPlus size={14} />
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PermToggle({ icon: Icon, label, active, onClick }: { icon: typeof Eye; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition ${
        active ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
      }`}
      title={`${label}: ${active ? 'Enabled' : 'Disabled'}`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
