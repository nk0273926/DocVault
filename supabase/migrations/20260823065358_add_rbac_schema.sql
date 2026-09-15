/*
# Multi-Role Auth & Authorization Schema Extension

## Overview
Extends the CaseVault schema to support multi-role authentication, case team
management, document permissions, version history, deletion approvals, and
case status rules (including SOLVED status).

## New Tables

### case_team_members
- Links users to cases with specific permissions.
- Fields: id, case_id (FK cases), user_id (text), user_name, user_role,
  can_view, can_upload, can_edit, can_download, added_at.

### document_versions
- Stores historical versions of documents before overwrite/edit.
- Fields: id, document_id (FK documents), version_number, file_path,
  file_name, file_type, file_size, saved_by, created_at.

### deletion_requests
- Pending permanent deletion requests requiring dual-admin approval.
- Fields: id, target_type ('case'|'document'), target_id, target_name,
  requested_by, request_reason, status ('pending'|'approved'|'rejected'),
  reviewed_by, reviewed_at, created_at.

### document_permissions
- Per-document permission overrides for specific users or roles.
- Fields: id, document_id (FK documents), grantee_type ('user'|'role'),
  grantee_id (text), can_view, can_upload, can_edit, can_download, created_at.

## Modified Tables

### cases
- Added `created_by` (text) — the user ID of the case creator.
- Added `solved` to status CHECK constraint.

### documents
- Added `download_allowed` (boolean, default true).
- Added `created_by` (text) — the user ID of the uploader.

## Security
- RLS enabled on all new tables with anon+authenticated CRUD (single-tenant
  mock-auth model where the frontend enforces role-based access).
- All policies allow anon + authenticated since the app uses mock auth
  and the frontend enforces authorization.
*/

-- Add created_by to cases
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cases' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE cases ADD COLUMN created_by text DEFAULT '';
  END IF;
END $$;

-- Add 'solved' to cases status CHECK
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cases_status_check'
  ) THEN
    ALTER TABLE cases ADD CONSTRAINT cases_status_check
    CHECK (status IN ('open','in_review','solved','closed','archived'));
  ELSE
    ALTER TABLE cases DROP CONSTRAINT cases_status_check;
    ALTER TABLE cases ADD CONSTRAINT cases_status_check
    CHECK (status IN ('open','in_review','solved','closed','archived'));
  END IF;
END $$;

-- Add download_allowed and created_by to documents
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'download_allowed'
  ) THEN
    ALTER TABLE documents ADD COLUMN download_allowed boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE documents ADD COLUMN created_by text DEFAULT '';
  END IF;
END $$;

-- case_team_members table
CREATE TABLE IF NOT EXISTS case_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  user_name text NOT NULL,
  user_role text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_upload boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_download boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, user_id)
);

ALTER TABLE case_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_team" ON case_team_members;
CREATE POLICY "anon_select_team" ON case_team_members FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_team" ON case_team_members;
CREATE POLICY "anon_insert_team" ON case_team_members FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_team" ON case_team_members;
CREATE POLICY "anon_update_team" ON case_team_members FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_team" ON case_team_members;
CREATE POLICY "anon_delete_team" ON case_team_members FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_team_case_id ON case_team_members(case_id);
CREATE INDEX IF NOT EXISTS idx_team_user_id ON case_team_members(user_id);

-- document_versions table
CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text DEFAULT '',
  file_size bigint DEFAULT 0,
  saved_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_versions" ON document_versions;
CREATE POLICY "anon_select_versions" ON document_versions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_versions" ON document_versions;
CREATE POLICY "anon_insert_versions" ON document_versions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_versions" ON document_versions;
CREATE POLICY "anon_delete_versions" ON document_versions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_versions_doc_id ON document_versions(document_id);

-- deletion_requests table
CREATE TABLE IF NOT EXISTS deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('case','document')),
  target_id text NOT NULL,
  target_name text NOT NULL DEFAULT '',
  case_id text DEFAULT '',
  requested_by text NOT NULL,
  request_reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by text DEFAULT '',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_deletion" ON deletion_requests;
CREATE POLICY "anon_select_deletion" ON deletion_requests FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deletion" ON deletion_requests;
CREATE POLICY "anon_insert_deletion" ON deletion_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deletion" ON deletion_requests;
CREATE POLICY "anon_update_deletion" ON deletion_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deletion" ON deletion_requests;
CREATE POLICY "anon_delete_deletion" ON deletion_requests FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_deletion_status ON deletion_requests(status);

-- document_permissions table
CREATE TABLE IF NOT EXISTS document_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user','role')),
  grantee_id text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_upload boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_download boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_doc_perms" ON document_permissions;
CREATE POLICY "anon_select_doc_perms" ON document_permissions FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_doc_perms" ON document_permissions;
CREATE POLICY "anon_insert_doc_perms" ON document_permissions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_doc_perms" ON document_permissions;
CREATE POLICY "anon_update_doc_perms" ON document_permissions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_doc_perms" ON document_permissions;
CREATE POLICY "anon_delete_doc_perms" ON document_permissions FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_doc_perms_doc_id ON document_permissions(document_id);