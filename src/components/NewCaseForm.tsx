import { useEffect, useState } from 'react';
import { ArrowLeft, X, AlertCircle, Save, Lock } from 'lucide-react';
import { createCase, getAllUsers, type DirectoryUser } from '@/lib/db';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/types/case';
import type { CaseStatus, CasePriority } from '@/types/case';
import type { AppUser } from '@/types/user';
import { usePermissions } from '@/hooks/usePermissions';

interface NewCaseFormProps {
  user: AppUser;
  onBack: () => void;
  onCreated: (caseId: string) => void;
}

const CATEGORIES = ['Litigation', 'Compliance', 'Investigation', 'Contract', 'Employment', 'Real Estate', 'IP & Patent', 'Other'];

export function NewCaseForm({ user, onBack, onCreated }: NewCaseFormProps) {
  const { canCreateCase } = usePermissions();
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'open' as CaseStatus,
    priority: 'medium' as CasePriority,
    category: '',
    client_name: '',
    assigned_to: '' as string,
    tags: [] as string[],
    due_date: '',
  });
  const [allUsers, setAllUsers] = useState<DirectoryUser[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAllUsers().then(setAllUsers).catch(() => {});
  }, []);

  if (!canCreateCase) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Lock size={40} className="text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-600 mb-1">Access Denied</p>
        <p className="text-sm text-slate-400 mb-4">You do not have permission to create cases.</p>
        <button onClick={onBack} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
          Back to cases
        </button>
      </div>
    );
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] });
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Case title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createCase(
        {
          title: form.title.trim(),
          description: form.description.trim(),
          status: form.status,
          priority: form.priority,
          category: form.category,
          client_name: form.client_name.trim(),
          assigned_to: form.assigned_to || null,
          tags: form.tags,
          due_date: form.due_date || null,
        },
        { id: user.id, name: user.name }
      );
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create case');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition">
        <ArrowLeft size={16} />
        Back
      </button>

      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">New Case</h2>
        <p className="text-sm text-slate-500 mt-1">Create a new case record with details and metadata</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">
              Case Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Smith v. Johnson Discovery Phase"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              placeholder="Brief description of the case..."
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition resize-none"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-800">Case Details</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Client Name</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                placeholder="e.g. Acme Corporation"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Assigned To</label>
              <select
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              >
                <option value="">Unassigned</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">The assignee is automatically added to the case team with full access.</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              >
                <option value="">Select category...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Status</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABELS) as CaseStatus[]).filter((s) => s !== 'solved').map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, status: s })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                      form.status === s ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Priority</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PRIORITY_LABELS) as CasePriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, priority: p })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                      form.priority === p ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Tags</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Type a tag and press Enter..."
                className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
              />
              <button type="button" onClick={addTag} className="px-4 py-2.5 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition">
                Add
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onBack} className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <Save size={16} />
            {saving ? 'Creating...' : 'Create Case'}
          </button>
        </div>
      </form>
    </div>
  );
}
