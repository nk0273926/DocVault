/*
 * Canonical authorization model — SRC OF TRUTH #48.
 *
 * IMPORTANT: everything in this file is UI-only. It controls which buttons
 * and panels are shown. It must never be treated as the security boundary —
 * the database enforces the real rules via Row Level Security (see
 * supabase/migrations/20260823120000_security_hardening.sql). Even if a user
 * bypasses the UI and calls Supabase directly, RLS mirrors every check here.
 */
import type { AppUser } from '@/types/user';
import type { CaseRecord, CaseTeamMember, CaseStatus } from '@/types/case';
import { ALLOWED_STATUS_TRANSITIONS } from '@/types/case';
import type { DocumentRecord } from '@/types/document';
import type { DocumentPermission } from '@/types/permission';
import type { DeletionRequest } from '@/types/permission';

const isAdmin = (user: AppUser) => user.role === 'admin';
// Both 'solved' and 'archived' are locked for ordinary users — mirrors
// can_edit_case()/can_upload_to_case() in the database exactly.
const isLocked = (record: CaseRecord) => record.status === 'solved' || record.status === 'archived';

function teamMember(userId: string, team: CaseTeamMember[]) {
  return team.find((m) => m.user_id === userId);
}

export function canViewCase(user: AppUser, caseData: CaseRecord, team: CaseTeamMember[]): boolean {
  if (isAdmin(user)) return true;
  if (caseData.created_by === user.id) return true;
  return teamMember(user.id, team)?.can_view ?? false;
}

export function canCreateCase(user: AppUser): boolean {
  return user.role === 'admin' || user.role === 'investigator';
}

export function canEditCase(user: AppUser, caseData: CaseRecord, team: CaseTeamMember[]): boolean {
  if (isLocked(caseData) && !isAdmin(user)) return false;
  if (isAdmin(user)) return true;
  if (caseData.created_by === user.id) return true;
  return teamMember(user.id, team)?.can_edit ?? false;
}

export function canUploadToCase(user: AppUser, caseData: CaseRecord, team: CaseTeamMember[]): boolean {
  if (isLocked(caseData) && !isAdmin(user)) return false;
  if (isAdmin(user)) return true;
  if (caseData.created_by === user.id) return true;
  return teamMember(user.id, team)?.can_upload ?? false;
}

/** DENY overrides ALLOW (P0 #40). A user-specific override wins over a
 * role-based override; if neither exists, fall back to team membership. */
function resolveDocPermission(
  user: AppUser,
  docPermissions: DocumentPermission[],
  field: 'can_view' | 'can_upload' | 'can_edit' | 'can_download'
): boolean | undefined {
  const userPerms = docPermissions.filter((p) => p.grantee_type === 'user' && p.grantee_id === user.id);
  if (userPerms.length > 0) return userPerms.every((p) => p[field]);

  const rolePerms = docPermissions.filter((p) => p.grantee_type === 'role' && p.grantee_id === user.role);
  if (rolePerms.length > 0) return rolePerms.every((p) => p[field]);

  return undefined;
}

export function canViewDocument(
  user: AppUser,
  _doc: DocumentRecord,
  caseData: CaseRecord,
  team: CaseTeamMember[],
  docPermissions: DocumentPermission[]
): boolean {
  if (isAdmin(user)) return true;
  // A user-specific override wins outright (grant OR deny); a role-level
  // override is next; only fall back to ordinary case access if neither
  // exists on this document. This must produce the exact same result as
  // can_view_document() in Postgres — a document override can grant access
  // even to someone without case-level access, not only restrict it.
  const override = resolveDocPermission(user, docPermissions, 'can_view');
  if (override !== undefined) return override;
  return canViewCase(user, caseData, team);
}

export function canEditDocument(
  user: AppUser,
  doc: DocumentRecord,
  caseData: CaseRecord,
  team: CaseTeamMember[],
  docPermissions: DocumentPermission[]
): boolean {
  if (isLocked(caseData) && !isAdmin(user)) return false;
  if (isAdmin(user)) return true;
  if (doc.created_by === user.id) return true;
  const override = resolveDocPermission(user, docPermissions, 'can_edit');
  if (override !== undefined) return override;
  return canEditCase(user, caseData, team);
}

export function canDownloadDocument(
  user: AppUser,
  doc: DocumentRecord,
  caseData: CaseRecord,
  team: CaseTeamMember[],
  docPermissions: DocumentPermission[]
): boolean {
  if (!doc.download_allowed && !isAdmin(user)) return false;
  if (!canViewDocument(user, doc, caseData, team, docPermissions)) return false;
  if (isAdmin(user)) return true;
  const override = resolveDocPermission(user, docPermissions, 'can_download');
  if (override !== undefined) return override;
  return teamMember(user.id, team)?.can_download ?? (doc.created_by === user.id);
}

export function canManageTeam(user: AppUser, caseData: CaseRecord): boolean {
  return isAdmin(user) || caseData.created_by === user.id;
}

export function canChangeCaseStatus(user: AppUser): boolean {
  return isAdmin(user);
}

export function isValidStatusTransition(from: CaseStatus, to: CaseStatus): boolean {
  if (from === to) return false;
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canViewVersionHistory(user: AppUser, caseData: CaseRecord, team: CaseTeamMember[]): boolean {
  return isAdmin(user) || canEditCase(user, caseData, team);
}

export function canRequestDeletion(user: AppUser, caseData: CaseRecord, team: CaseTeamMember[]): boolean {
  return isAdmin(user) || canEditCase(user, caseData, team);
}

export function canApproveDeletion(user: AppUser, request: DeletionRequest): boolean {
  return isAdmin(user) && request.requested_by_id !== user.id;
}

export function canManageUsers(user: AppUser): boolean {
  return isAdmin(user);
}

export function canViewAuditHistory(user: AppUser): boolean {
  return isAdmin(user);
}

export function canViewAllCases(user: AppUser): boolean {
  return isAdmin(user);
}

export function getAccessibleCaseIds(user: AppUser, cases: CaseRecord[], teamMembers: CaseTeamMember[]): string[] {
  if (isAdmin(user)) return cases.map((c) => c.id);
  return cases
    .filter((c) => canViewCase(user, c, teamMembers.filter((m) => m.case_id === c.id)))
    .map((c) => c.id);
}
