export type GranteeType = 'user' | 'role';

export interface DocumentPermission {
  id: string;
  document_id: string;
  grantee_type: GranteeType;
  grantee_id: string;
  can_view: boolean;
  can_upload: boolean;
  can_edit: boolean;
  can_download: boolean;
  created_by: string;
  created_at: string;
}

export type DeletionTargetType = 'case' | 'document';
export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DeletionRequest {
  id: string;
  target_type: DeletionTargetType;
  target_id: string;
  target_name: string;
  case_id: string | null;
  requested_by_id: string;
  requested_by_name: string;
  request_reason: string;
  status: DeletionRequestStatus;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
}
