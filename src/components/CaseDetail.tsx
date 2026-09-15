import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Upload, Download, Edit, Trash2, Archive, FileText, Clock, Calendar, User, Tag,
  FolderOpen, AlertCircle, X, Users, History, Shield, Lock, AlertTriangle, RotateCcw,
  FileWarning, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  fetchCase, fetchDocuments, fetchActivityLogs, fetchTeamMembers, fetchDocumentVersions,
  getDocumentPermissions, uploadDocument, overwriteDocument, archiveDocument, getDocumentUrl,
  restoreDocumentVersion, updateCaseStatus, createDeletionRequest,
} from '@/lib/db';
import {
  canViewCase, canEditDocument, canUploadToCase, canViewDocument, canDownloadDocument,
  canManageTeam, canChangeCaseStatus, canViewVersionHistory, canRequestDeletion,
} from '@/lib/permissions';
import type { CaseRecord, CaseStatus, CaseTeamMember } from '@/types/case';
import { STATUS_LABELS } from '@/types/case';
import type { DocumentRecord, DocumentVersion } from '@/types/document';
import type { ActivityLog } from '@/types/audit';
import type { DocumentPermission } from '@/types/permission';
import type { AppUser } from '@/types/user';
import { StatusBadge, PriorityBadge } from '@/components/Badges';
import { FileIconDisplay } from '@/components/FileIcon';
import { formatBytes, formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { TeamManager } from '@/components/TeamManager';
import { DocumentPermissions } from '@/components/DocumentPermissions';

interface CaseDetailProps {
  user: AppUser;
  caseId: string;
  onBack: () => void;
  onAccessDenied: () => void;
}

const DOC_CATEGORIES = ['Contract', 'Evidence', 'Correspondence', 'Pleading', 'Report', 'General'];
const STATUS_OPTIONS: { value: CaseStatus; label: string }[] = (Object.keys(STATUS_LABELS) as CaseStatus[]).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

export function CaseDetail({ user, caseId, onBack, onAccessDenied }: CaseDetailProps) {
  const [caseRecord, setCaseRecord] = useState<CaseRecord | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<CaseTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('General');
  const [activeTab, setActiveTab] = useState<'documents' | 'activity' | 'team'>('documents');
  const [error, setError] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [docPermissions, setDocPermissions] = useState<DocumentPermission[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overwriteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function loadData() {
    setLoading(true);
    setError('');
    setAccessDenied(false);
    try {
      const c = await fetchCase(caseId);
      if (!c) {
        setCaseRecord(null);
        setLoading(false);
        return;
      }
      const team = await fetchTeamMembers(caseId);
      if (!canViewCase(user, c, team)) {
        setAccessDenied(true);
        setCaseRecord(c);
        setTeamMembers(team);
        setLoading(false);
        return;
      }
      const [docs, logs] = await Promise.all([fetchDocuments(caseId), fetchActivityLogs(caseId)]);
      setCaseRecord(c);
      setDocuments(docs);
      setActivity(logs);
      setTeamMembers(team);
    } catch (err) {
      // RLS will also reject an unauthorized SELECT outright — treat that
      // the same as a UI-level access denial rather than a generic error.
      setError(err instanceof Error ? err.message : 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }

  async function loadDocPermissions(docId: string) {
    try {
      const [v, p] = await Promise.all([fetchDocumentVersions(docId), getDocumentPermissions(docId)]);
      setVersions(v);
      setDocPermissions(p);
    } catch (err) {
      console.error('Failed to load doc details:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Loading case...</div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield size={40} className="text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-600 mb-1">Access Denied</p>
        <p className="text-sm text-slate-400 mb-4">You do not have permission to view this case.</p>
        <button onClick={onAccessDenied} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
          Back to cases
        </button>
      </div>
    );
  }

  if (!caseRecord) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle size={40} className="text-slate-300 mb-3" />
        <p className="text-sm text-slate-500 mb-4">Case not found</p>
        <button onClick={onBack} className="text-sm text-sky-600 hover:text-sky-700 font-medium">
          Back to cases
        </button>
      </div>
    );
  }

  const canUpload = canUploadToCase(user, caseRecord, teamMembers);
  const canManage = canManageTeam(user, caseRecord);
  const canChangeStatus = canChangeCaseStatus(user);
  // Mirrors isLocked() in lib/permissions.ts and the DB's can_edit_case()/
  // can_upload_to_case() — both 'solved' and 'archived' are read-only for
  // ordinary users.
  const caseIsLocked = caseRecord.status === 'solved' || caseRecord.status === 'archived';

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !caseRecord) return;
    if (!canUploadToCase(user, caseRecord, teamMembers)) {
      setError('You do not have permission to upload to this case.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        await uploadDocument({ caseId, file, category: uploadCategory, actor: { id: user.id, name: user.name } });
      }
      await loadData();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleOverwrite(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedDoc || !caseRecord) return;
    if (!canEditDocument(user, selectedDoc, caseRecord, teamMembers, docPermissions)) {
      setError('You do not have permission to edit this document.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await overwriteDocument({ document: selectedDoc, file, actor: { id: user.id, name: user.name } });
      await loadData();
      if (overwriteRef.current) overwriteRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc: DocumentRecord) {
    setError('');
    try {
      const url = await getDocumentUrl(doc, { id: user.id, name: user.name });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function handleDeleteDoc(doc: DocumentRecord) {
    if (!confirm(`Request permanent deletion of "${doc.name}"? This requires approval from another admin.`)) return;
    setError('');
    try {
      await createDeletionRequest('document', doc.id, 'Document deletion requested');
      alert('Deletion request submitted. Another admin must approve it.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request deletion');
    }
  }

  async function handleArchiveDoc(doc: DocumentRecord) {
    setError('');
    try {
      await archiveDocument(doc, { id: user.id, name: user.name });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    }
  }

  async function handleRestoreVersion(version: DocumentVersion) {
    if (!confirm(`Restore to version ${version.version_number}? The current version will be saved to history.`)) return;
    setError('');
    try {
      await restoreDocumentVersion({ documentId: version.document_id, versionId: version.id });
      await loadData();
      if (selectedDoc) await loadDocPermissions(selectedDoc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    }
  }

  async function handleStatusChange(newStatus: CaseStatus) {
    if (!caseRecord) return;
    setError('');
    setShowStatusDropdown(false);
    try {
      await updateCaseStatus(caseId, caseRecord.status, newStatus, { id: user.id, name: user.name });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change status');
    }
  }

  async function handleRequestCaseDeletion() {
    if (!deleteReason.trim()) {
      setError('Please provide a reason for deletion.');
      return;
    }
    setError('');
    try {
      await createDeletionRequest('case', caseId, deleteReason);
      setShowDeleteConfirm(false);
      setDeleteReason('');
      alert('Deletion request submitted. Another admin must approve it.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request deletion');
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition">
        <ArrowLeft size={16} />
        Back to cases
      </button>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      {caseIsLocked && (
        <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <Lock size={16} className="shrink-0" />
          <span>
            This case is <strong>{STATUS_LABELS[caseRecord.status]}</strong> and is read-only.{' '}
            {canChangeStatus ? 'As an admin, you can reopen it by changing the status.' : 'Only an admin can reopen it.'}
          </span>
        </div>
      )}

      {/* Case header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">{caseRecord.case_number}</span>
              <StatusBadge status={caseRecord.status} />
              <PriorityBadge priority={caseRecord.priority} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{caseRecord.title}</h2>
            {caseRecord.description && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{caseRecord.description}</p>}
          </div>

          {canChangeStatus && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-700 hover:bg-slate-50 transition"
              >
                <AlertTriangle size={14} className="text-slate-400" />
                Change Status
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {showStatusDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      disabled={opt.value === caseRecord.status}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-default flex items-center justify-between"
                    >
                      {opt.label}
                      {opt.value === caseRecord.status && <span className="text-xs text-slate-400">Current</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
          <MetaItem icon={User} label="Client" value={caseRecord.client_name || '—'} />
          <MetaItem
            icon={User}
            label="Assigned To"
            value={teamMembers.find((m) => m.user_id === caseRecord.assigned_to)?.user_name || (caseRecord.assigned_to ? 'Unknown user' : 'Unassigned')}
          />
          <MetaItem icon={FolderOpen} label="Category" value={caseRecord.category || '—'} />
          <MetaItem icon={Calendar} label="Due Date" value={formatDate(caseRecord.due_date)} />
        </div>

        {caseRecord.tags.length > 0 && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
            <Tag size={14} className="text-slate-400" />
            <div className="flex flex-wrap gap-1.5">
              {caseRecord.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={FileText} label={`Documents (${documents.length})`} />
        <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} icon={Clock} label="Activity Log" />
        {canManage && <TabButton active={activeTab === 'team'} onClick={() => setActiveTab('team')} icon={Users} label="Team Management" />}
      </div>

      {/* Documents tab */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {canUpload && !caseIsLocked && (
            <div className="bg-white border border-slate-200 border-dashed rounded-xl p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1 w-full">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Upload Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
                  >
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition shrink-0"
                >
                  <Upload size={16} />
                  {uploading ? 'Uploading...' : 'Upload Files'}
                </button>
                <input ref={fileInputRef} type="file" multiple onChange={handleUpload} className="hidden" />
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {documents.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">{canUpload ? 'No documents uploaded yet' : 'No documents available'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {documents.map((doc) => {
                  const canView = canViewDocument(user, doc, caseRecord, teamMembers, docPermissions);
                  const canEdit = canEditDocument(user, doc, caseRecord, teamMembers, docPermissions);
                  const canDownload = canDownloadDocument(user, doc, caseRecord, teamMembers, docPermissions);
                  const canDeleteReq = canRequestDeletion(user, caseRecord, teamMembers);

                  if (!canView) return null;

                  return (
                    <div
                      key={doc.id}
                      className="px-5 py-4 hover:bg-slate-50 transition cursor-pointer"
                      onClick={() => {
                        setSelectedDoc(doc);
                        loadDocPermissions(doc.id);
                        setShowVersions(false);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <FileIconDisplay type={doc.file_type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                            <span className="text-xs text-slate-400">v{doc.version}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-400">{formatBytes(doc.file_size)}</span>
                            <span className="text-xs text-slate-300">·</span>
                            <span className="text-xs text-slate-400">{doc.category}</span>
                            {doc.status === 'archived' && <span className="text-xs text-amber-600 font-medium">· Archived</span>}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 hidden sm:block">{timeAgo(doc.created_at)}</div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canDownload && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                              className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"
                              title="Download"
                            >
                              <Download size={16} />
                            </button>
                          )}
                          {canEdit && !caseIsLocked && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc); overwriteRef.current?.click(); }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Edit/Overwrite"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                          {user.role === 'admin' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleArchiveDoc(doc); }}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                              title="Archive"
                            >
                              <Archive size={16} />
                            </button>
                          )}
                          {canDeleteReq && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc); }}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Request Deletion"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      {selectedDoc?.id === doc.id && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3" onClick={(e) => e.stopPropagation()}>
                          {canViewVersionHistory(user, caseRecord, teamMembers) && (
                            <div>
                              <button
                                onClick={() => setShowVersions(!showVersions)}
                                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition"
                              >
                                <History size={14} />
                                Version History ({versions.length})
                                {showVersions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                              {showVersions && (
                                <div className="mt-2 space-y-1.5">
                                  <div className="flex items-center gap-3 px-3 py-2 bg-sky-50 border border-sky-100 rounded-lg">
                                    <span className="text-xs font-bold text-sky-700">v{doc.version}</span>
                                    <span className="text-xs text-slate-500">Current</span>
                                    <span className="text-xs text-slate-400 ml-auto">{formatBytes(doc.file_size)}</span>
                                  </div>
                                  {versions.map((v) => (
                                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                                      <span className="text-xs font-bold text-slate-600">v{v.version_number}</span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs text-slate-500 truncate">{v.file_name}</p>
                                        <p className="text-xs text-slate-400">{v.saved_by} · {formatDateTime(v.created_at)}</p>
                                      </div>
                                      {canEdit && !caseIsLocked && (
                                        <button
                                          onClick={() => handleRestoreVersion(v)}
                                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-100 rounded transition"
                                        >
                                          <RotateCcw size={12} />
                                          Restore
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {user.role === 'admin' && <DocumentPermissions document={doc} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <input ref={overwriteRef} type="file" onChange={handleOverwrite} className="hidden" />
        </div>
      )}

      {/* Activity tab */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {activity.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Clock size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">No activity logged yet</p>
            </div>
          ) : (
            <div className="px-5 py-4">
              {activity.map((log, idx) => (
                <div key={log.id} className="flex gap-3">
                  <div className="relative flex flex-col items-center">
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                        log.action.includes('created') ? 'bg-emerald-500' :
                        log.action.includes('uploaded') ? 'bg-sky-500' :
                        log.action.includes('deleted') || log.action.includes('removed') ? 'bg-red-500' :
                        log.action.includes('added') || log.action.includes('team') ? 'bg-blue-500' :
                        log.action.includes('status') || log.action.includes('solved') ? 'bg-amber-500' :
                        'bg-slate-400'
                      }`}
                    />
                    {idx < activity.length - 1 && <div className="w-px flex-1 bg-slate-200" />}
                  </div>
                  <div className="pb-5 min-w-0 flex-1">
                    <p className="text-sm text-slate-700 leading-snug">{log.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{log.performed_by} · {formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Team management tab */}
      {activeTab === 'team' && canManage && (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Team Management</h3>
            <p className="text-sm text-slate-500">Manage who has access to this case and their permissions.</p>
          </div>
          <TeamManager caseId={caseId} caseCreatedBy={caseRecord.created_by} actor={{ id: user.id, name: user.name }} />

          {canRequestDeletion(user, caseRecord, teamMembers) && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <FileWarning size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-red-800 mb-1">Permanent Deletion</h4>
                  <p className="text-xs text-red-600 mb-3">
                    Request permanent deletion of this case. Another admin must approve the request before it is executed.
                  </p>
                  {showDeleteConfirm ? (
                    <div className="space-y-3">
                      <textarea
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        placeholder="Reason for deletion..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleRequestCaseDeletion} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition">
                          Submit Deletion Request
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteReason(''); }}
                          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
                    >
                      <Trash2 size={14} />
                      Request Permanent Deletion
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
        <Icon size={12} />
        {label}
      </div>
      <p className="text-sm text-slate-700 font-medium truncate">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof FileText; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
        active ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
