/*
 * Canonical database/service layer (P0 #3, P1 #47).
 *
 * Every UI database operation goes through this file. Components must not
 * implement their own Supabase queries. This keeps exactly one implementation
 * of each operation, and makes it possible to reason about what the app does
 * to the database in one place.
 *
 * Note on deletion: there is intentionally no `deleteDocument`/`deleteCase`
 * function here that performs an immediate, irreversible delete. Per the
 * required architecture, all permanent deletion goes through
 * `createDeletionRequest` + the dual-admin `approveDeletion` RPC. The
 * database itself has no DELETE policy for authenticated clients on cases or
 * documents (see the security-hardening migration), so an immediate-delete
 * function could not work even if it existed — it would only fail loudly at
 * the RLS layer, which is the correct outcome.
 */
import { supabase, STORAGE_BUCKET } from '@/lib/supabase';
import type { CaseRecord, CaseStatus, CaseTeamMember } from '@/types/case';
import type { DocumentRecord, DocumentVersion } from '@/types/document';
import type { DeletionRequest, DocumentPermission, GranteeType } from '@/types/permission';
import type { ActivityLog } from '@/types/audit';
import type { UserRole } from '@/types/user';
import { logActivity } from '@/lib/audit';
import { buildStoragePath, uploadFile, getSignedDownloadUrl } from '@/lib/storage';

type Actor = { id: string; name: string };

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export async function fetchCases(): Promise<CaseRecord[]> {
  const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CaseRecord[];
}

export async function fetchCase(caseId: string): Promise<CaseRecord | null> {
  const { data, error } = await supabase.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (error) throw error;
  return data as CaseRecord | null;
}

export interface NewCaseInput {
  title: string;
  description: string;
  status: CaseStatus;
  priority: CaseRecord['priority'];
  category: string;
  client_name: string;
  assigned_to: string | null;
  tags: string[];
  due_date: string | null;
}

export async function createCase(input: NewCaseInput, actor: Actor): Promise<CaseRecord> {
  const { data, error } = await supabase
    .from('cases')
    .insert({ ...input, created_by: actor.id })
    .select()
    .single();
  if (error) throw error;

  await logActivity({
    caseId: data.id,
    action: 'case_created',
    description: `${actor.name} created case "${input.title}"`,
    performedByName: actor.name,
    performedByUserId: actor.id,
  });

  return data as CaseRecord;
}

export async function updateCaseStatus(caseId: string, _currentStatus: CaseStatus, newStatus: CaseStatus, _actor: Actor): Promise<void> {
  // Validation and the audit write both happen server-side inside the RPC,
  // which reads the REAL current status itself rather than trusting
  // whatever the client claims it is (a client could otherwise lie about
  // the current status to smuggle through an invalid transition).
  // currentStatus/actor are accepted for backward-compatible call sites but
  // intentionally unused for authorization.
  const { error } = await supabase.rpc('update_case_status', { p_case_id: caseId, p_new_status: newStatus });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function fetchDocuments(
  caseId: string
): Promise<DocumentRecord[]> {
  const storedDocuments = JSON.parse(
    localStorage.getItem('casevault_documents') || '[]'
  ) as DocumentRecord[];

  return storedDocuments
    .filter(
      (document) =>
        document.case_id === caseId &&
        document.status !== 'deleted'
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );
}

/** Document counts per case, in one query instead of one query per case
 * (P1 #59). Used by the dashboard — kept here, not inline in a component,
 * so every Supabase query still goes through this one canonical layer
 * (P1 #47). */
export async function fetchDocumentCountsByCase(caseIds: string[]): Promise<Record<string, number>> {
  if (caseIds.length === 0) return {};
  const { data, error } = await supabase.from('documents').select('case_id').in('case_id', caseIds).neq('status', 'deleted');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.case_id] = (counts[row.case_id] ?? 0) + 1;
  }
  return counts;
}

export async function fetchDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentVersion[];
}
export async function uploadDocument(params: {
  caseId: string;
  file: File;
  category: string;
  actor: Actor;
}): Promise<DocumentRecord> {
  const { caseId, file, category, actor } = params;

  if (!file || file.size === 0) {
    throw new Error('Please select a non-empty file.');
  }

  const documentId = crypto.randomUUID();

  const document: DocumentRecord = {
    id: documentId,
    case_id: caseId,
    name: file.name,
    file_path: URL.createObjectURL(file),
    file_type: file.type || 'application/octet-stream',
    file_size: file.size,
    category,
    created_by: actor.id,
    uploaded_by_id: actor.id,
    version: 1,
    status: 'active',
    download_allowed: true,
    created_at: new Date().toISOString(),
  };

  // Existing local documents
  const storedDocuments = JSON.parse(
    localStorage.getItem('casevault_documents') || '[]'
  );

  // Save metadata locally
  storedDocuments.push(document);

  localStorage.setItem(
    'casevault_documents',
    JSON.stringify(storedDocuments)
  );

  return document;
}

export async function overwriteDocument(params: {
  document: DocumentRecord;
  file: File;
  actor: Actor;
}): Promise<void> {
  const { document, file, actor } = params;
  if (!file || file.size === 0) throw new Error('Please select a non-empty file.');

  const newVersionId = crypto.randomUUID();
  const newPath = buildStoragePath(document.case_id, document.id, newVersionId, file.name);
  await uploadFile(newPath, file);

  const { error } = await supabase.rpc('overwrite_document', {
    p_document_id: document.id,
    p_new_file_path: newPath,
    p_new_file_name: file.name,
    p_new_file_type: file.type || 'application/octet-stream',
    p_new_file_size: file.size,
  });
  if (error) {
    // Safe to clean up here: storage_delete_own_orphans (security_hardening_v3)
    // only allows deleting an object the caller uploaded AND that no
    // documents/document_versions row references yet — exactly this case,
    // since the RPC that would have created that reference just failed.
    await supabase.storage.from(STORAGE_BUCKET).remove([newPath]);
    throw error;
  }
}

export async function restoreDocumentVersion(params: {
  documentId: string;
  versionId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('restore_document_version', {
    p_document_id: params.documentId,
    p_version_id: params.versionId,
  });
  if (error) throw error;
}

export async function archiveDocument(document: DocumentRecord, actor: Actor): Promise<void> {
  const { error } = await supabase.from('documents').update({ status: 'archived' }).eq('id', document.id);
  if (error) throw error;

  await logActivity({
    caseId: document.case_id,
    action: 'document_archived',
    description: `${actor.name} archived "${document.name}"`,
    performedByName: actor.name,
    performedByUserId: actor.id,
  });
}

/** Signed, short-lived download URL. Never a permanent/public URL (P0 #31). */
export async function getDocumentUrl(document: DocumentRecord, actor: Actor): Promise<string> {
  const url = await getSignedDownloadUrl(document.file_path);
  await logActivity({
    caseId: document.case_id,
    action: 'document_downloaded',
    description: `${actor.name} downloaded "${document.name}"`,
    performedByName: actor.name,
    performedByUserId: actor.id,
  });
  return url;
}

export async function setDocumentDownloadAllowed(documentId: string, allowed: boolean): Promise<void> {
  const { error } = await supabase.from('documents').update({ download_allowed: allowed }).eq('id', documentId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export async function fetchActivityLogs(caseId: string, limit = 100): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function fetchAllActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

// ---------------------------------------------------------------------------
// Team management
// ---------------------------------------------------------------------------

export async function fetchTeamMembers(caseId: string): Promise<CaseTeamMember[]> {
  const { data, error } = await supabase
    .from('case_team_members')
    .select('*')
    .eq('case_id', caseId)
    .order('added_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CaseTeamMember[];
}

export async function addTeamMember(
  caseId: string,
  user: { id: string; name: string; role: UserRole },
  perms: { can_view: boolean; can_upload: boolean; can_edit: boolean; can_download: boolean },
  actor: Actor
): Promise<void> {
  const { error } = await supabase.from('case_team_members').insert({
    case_id: caseId,
    user_id: user.id,
    user_name: user.name,
    user_role: user.role,
    ...perms,
  });
  if (error) throw error;

  await logActivity({
    caseId,
    action: 'team_member_added',
    description: `${actor.name} added ${user.name} to the case team`,
    performedByName: actor.name,
    performedByUserId: actor.id,
  });
}

export async function removeTeamMember(memberId: string, caseId: string, memberName: string, actor: Actor): Promise<void> {
  const { error } = await supabase.from('case_team_members').delete().eq('id', memberId);
  if (error) throw error;

  await logActivity({
    caseId,
    action: 'team_member_removed',
    description: `${actor.name} removed ${memberName} from the case team`,
    performedByName: actor.name,
    performedByUserId: actor.id,
  });
}

export async function updateTeamMemberPermissions(
  memberId: string,
  perms: { can_view: boolean; can_upload: boolean; can_edit: boolean; can_download: boolean }
): Promise<void> {
  const { error } = await supabase.from('case_team_members').update(perms).eq('id', memberId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Users (backed by `profiles`, which mirrors Supabase Auth users — no more
// hard-coded mock user list, P0 #15/P1 #69)
// ---------------------------------------------------------------------------

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export async function getAllUsers(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase.from('profiles').select('id, name, email, role').order('name');
  if (error) throw error;
  return (data ?? []) as DirectoryUser[];
}

/** Alias kept for UserManagement.tsx readability. */
export const getUsers = getAllUsers;

// ---------------------------------------------------------------------------
// Document permissions
// ---------------------------------------------------------------------------

export async function getDocumentPermissions(documentId: string): Promise<DocumentPermission[]> {
  const { data, error } = await supabase.from('document_permissions').select('*').eq('document_id', documentId);
  if (error) throw error;
  return (data ?? []) as DocumentPermission[];
}

export async function createDocumentPermission(
  documentId: string,
  granteeType: GranteeType,
  granteeId: string,
  perms: { can_view: boolean; can_upload: boolean; can_edit: boolean; can_download: boolean },
  actor: Actor
): Promise<void> {
  const { error } = await supabase.from('document_permissions').upsert(
    {
      document_id: documentId,
      grantee_type: granteeType,
      grantee_id: granteeId,
      created_by: actor.id,
      ...perms,
    },
    { onConflict: 'document_id,grantee_type,grantee_id' }
  );
  if (error) throw error;
}

export async function removeDocumentPermission(permissionId: string): Promise<void> {
  const { error } = await supabase.from('document_permissions').delete().eq('id', permissionId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Deletion requests (dual-admin approval workflow, P0 #22/#24, P2 #73/#74)
// ---------------------------------------------------------------------------

export async function fetchDeletionRequests(status?: 'pending' | 'approved' | 'rejected'): Promise<DeletionRequest[]> {
  let query = supabase.from('deletion_requests').select('*').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DeletionRequest[];
}

export async function createDeletionRequest(
  targetType: 'case' | 'document',
  targetId: string,
  reason: string
): Promise<void> {
  // case_id, target_name, and requested_by are all derived server-side by
  // this RPC from the real target record — the client no longer supplies
  // (and therefore can no longer forge) any of them. The RPC also verifies
  // the caller actually has access to the case before creating the
  // request, and writes the audit event in the same transaction.
  const { error } = await supabase.rpc('create_deletion_request', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Both approve/reject run through the same trusted RPC, which independently
 * re-verifies (server-side) that the caller is an admin and is not the
 * original requester before doing anything (P2 #73). */
export async function approveDeletion(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('process_deletion_request', { p_request_id: requestId, p_action: 'approve' });
  if (error) throw error;
}

export async function rejectDeletion(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('process_deletion_request', { p_request_id: requestId, p_action: 'reject' });
  if (error) throw error;
}
