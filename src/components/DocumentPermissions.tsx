import { useEffect, useState } from 'react';
import { Plus, Trash2, Eye, Upload, Edit, Download, X, Lock, Unlock } from 'lucide-react';
import {
  createDocumentPermission, removeDocumentPermission, setDocumentDownloadAllowed, getAllUsers,
  getDocumentPermissions, type DirectoryUser,
} from '@/lib/db';
import { ROLE_LABELS } from '@/types/user';
import type { UserRole } from '@/types/user';
import type { DocumentPermission } from '@/types/permission';
import type { DocumentRecord } from '@/types/document';
import { useAuth } from '@/hooks/useAuth';

interface DocumentPermissionsProps {
  document: DocumentRecord;
}

export function DocumentPermissions({ document }: DocumentPermissionsProps) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [allUsers, setAllUsers] = useState<DirectoryUser[]>([]);
  const [downloadAllowed, setDownloadAllowed] = useState(document.download_allowed);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<'user' | 'role'>('user');
  const [addId, setAddId] = useState('');
  const [addPerms, setAddPerms] = useState({ can_view: true, can_upload: false, can_edit: false, can_download: false });
  const [error, setError] = useState('');

  useEffect(() => {
    loadPermissions();
    getAllUsers().then(setAllUsers).catch(() => {});
    setDownloadAllowed(document.download_allowed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]);

  async function loadPermissions() {
    setLoading(true);
    try {
      const data = await getDocumentPermissions(document.id);
      setPermissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    setError('');
    if (!addId.trim() || !user) {
      setError('Please select a user or role');
      return;
    }
    try {
      await createDocumentPermission(document.id, addType, addId, addPerms, { id: user.id, name: user.name });
      await loadPermissions();
      setShowAdd(false);
      setAddId('');
      setAddPerms({ can_view: true, can_upload: false, can_edit: false, can_download: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add permission');
    }
  }

  async function handleRemove(permId: string) {
    setError('');
    try {
      await removeDocumentPermission(permId);
      await loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove permission');
    }
  }

  async function handleToggleDownload() {
    setError('');
    const newAllowed = !downloadAllowed;
    try {
      await setDocumentDownloadAllowed(document.id, newAllowed);
      setDownloadAllowed(newAllowed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update download setting');
    }
  }

  const granteeLabel = (perm: DocumentPermission): string => {
    if (perm.grantee_type === 'role') return ROLE_LABELS[perm.grantee_id as UserRole] || perm.grantee_id;
    const u = allUsers.find((candidate) => candidate.id === perm.grantee_id);
    return u ? `${u.name} (${u.email})` : perm.grantee_id;
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {downloadAllowed ? <Unlock size={20} className="text-emerald-500" /> : <Lock size={20} className="text-red-500" />}
            <div>
              <p className="text-sm font-medium text-slate-800">Download Control</p>
              <p className="text-xs text-slate-500">
                {downloadAllowed ? 'Downloading is allowed for authorized users' : 'Downloading is disabled for all users'}
              </p>
            </div>
          </div>
          <button onClick={handleToggleDownload} className={`relative w-12 h-6 rounded-full transition ${downloadAllowed ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${downloadAllowed ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Document Access Overrides ({permissions.length})</h3>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 rounded-lg transition">
            <Plus size={14} />
            Add Override
          </button>
        </div>

        {showAdd && (
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setAddType('user')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${addType === 'user' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                Specific User
              </button>
              <button
                onClick={() => setAddType('role')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${addType === 'role' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                By Role
              </button>
            </div>

            {addType === 'user' && (
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              >
                <option value="">Select a user...</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                ))}
              </select>
            )}

            {addType === 'role' && (
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              >
                <option value="">Select a role...</option>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            )}

            <div className="flex flex-wrap gap-2">
              <PermCheckbox icon={Eye} label="View" checked={addPerms.can_view} onChange={(v) => setAddPerms({ ...addPerms, can_view: v })} />
              <PermCheckbox icon={Upload} label="Upload*" checked={addPerms.can_upload} onChange={(v) => setAddPerms({ ...addPerms, can_upload: v })} />
              <PermCheckbox icon={Edit} label="Edit" checked={addPerms.can_edit} onChange={(v) => setAddPerms({ ...addPerms, can_edit: v })} />
              <PermCheckbox icon={Download} label="Download" checked={addPerms.can_download} onChange={(v) => setAddPerms({ ...addPerms, can_download: v })} />
            </div>
            <p className="text-xs text-slate-400">
              * Upload isn't a per-document concept — new documents are uploaded to the case, not into an existing one. This
              toggle is stored but not currently enforced; case-level upload access governs uploads instead.
            </p>

            <button onClick={handleAdd} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition">
              Add Permission
            </button>
          </div>
        )}

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading permissions...</div>
        ) : permissions.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Lock size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No permission overrides. Access is controlled by team membership.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {permissions.map((perm) => (
              <div key={perm.id} className="px-5 py-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      {perm.grantee_type === 'role' ? 'Role' : 'User'}
                    </span>
                    <p className="text-sm font-medium text-slate-700 truncate">{granteeLabel(perm)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {perm.can_view && <PermChip icon={Eye} label="View" />}
                    {perm.can_upload && <PermChip icon={Upload} label="Upload" />}
                    {perm.can_edit && <PermChip icon={Edit} label="Edit" />}
                    {perm.can_download && <PermChip icon={Download} label="Download" />}
                    {!perm.can_view && !perm.can_upload && !perm.can_edit && !perm.can_download && (
                      <span className="text-xs text-slate-400">No permissions granted</span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleRemove(perm.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PermCheckbox({ icon: Icon, label, checked, onChange }: { icon: typeof Eye; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 rounded accent-sky-600" />
      <Icon size={12} />
      {label}
    </label>
  );
}

function PermChip({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 rounded-md border border-sky-200">
      <Icon size={10} />
      {label}
    </span>
  );
}
