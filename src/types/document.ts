export type DocumentStatus = 'active' | 'archived' | 'deleted';

export interface DocumentRecord {
  id: string;
  case_id: string;
  name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  category: string;
  status: DocumentStatus;
  version: number;
  // Canonical creator/owner field (see permission.ts #36) — used for all
  // authorization decisions. uploaded_by_id tracks who uploaded the CURRENT
  // version (changes on overwrite/restore) and is display-only.
  created_by: string;
  uploaded_by_id: string | null;
  download_allowed: boolean;
  created_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  saved_by: string;
  created_at: string;
}
