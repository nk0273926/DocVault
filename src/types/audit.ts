export type AuditAction =
  | 'case_created'
  | 'case_updated'
  | 'case_status_changed'
  | 'case_archived'
  | 'document_uploaded'
  | 'document_replaced'
  | 'document_downloaded'
  | 'document_deleted'
  | 'document_restored'
  | 'document_archived'
  | 'team_member_added'
  | 'team_member_removed'
  | 'team_member_permissions_updated'
  | 'permission_granted'
  | 'permission_revoked'
  | 'deletion_requested'
  | 'deletion_approved'
  | 'deletion_rejected'
  | 'login'
  | 'logout';

export interface ActivityLog {
  id: string;
  case_id: string | null;
  action: AuditAction | string;
  description: string;
  performed_by: string;
  performed_by_user_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
