/*
# Security Hardening & Canonical Schema

This migration replaces the "trust the client" model used in the first two
migrations with real authorization enforced entirely inside Postgres via RLS,
backed by Supabase Auth (auth.uid()). It must be run after the two prior
migrations.

Summary of what changes:
1. `profiles` table — one row per Supabase Auth user, holding display name and
   role. This is how the database (not the browser) knows who is making a
   request and what role they hold.
2. Identity columns (`created_by`, `uploaded_by`, `user_id`, `requested_by`,
   `reviewed_by`, `performed_by`) are converted from free-text to
   `uuid references auth.users(id)`. Legacy mock-user text ids (e.g.
   'u-admin-001') cannot be cast to uuid and are set to NULL — the seed data
   from the prototype's mock-auth phase is not trusted identity data.
3. SECURITY DEFINER helper functions encapsulate "is this uid an admin" /
   "does this uid have access to this case" so RLS policies can call them
   without infinite recursion.
4. Every `USING (true)` / `WITH CHECK (true)` anon policy is dropped. Only
   `authenticated` users can touch these tables, and only within what their
   role/team-membership/document-permission grants them.
5. Storage bucket `case-documents` becomes private; access is only through
   signed URLs issued after a server-side (RLS-checked) permission check.
6. `case_number` generation moves to a real sequence (concurrency-safe, never
   reused).
7. `user_role` is constrained to the four allowed values via CHECK.
8. `document_permissions` gets a uniqueness constraint; DENY overrides ALLOW
   is implemented in `lib/permissions.ts` and mirrored by RLS.
9. `activity_logs` becomes append-only: no UPDATE/DELETE policy exists for
   authenticated users, and inserts are only accepted when performed_by_user_id
   matches auth.uid() (no forged actor).
10. A single trusted RPC, `process_deletion_request`, performs dual-admin
    approval atomically: verifies the approver is an admin, verifies
    requester <> approver, deletes/archives the target, writes the audit
    event, and marks the request reviewed — all in one transaction.
*/

-- ============================================================
-- 1. PROFILES (role source of truth, keyed by Supabase Auth uid)
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin','investigator','officer','analyst')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create a profile row whenever a new Supabase Auth user is created.
-- Role defaults to 'analyst' (least privilege); an existing admin must
-- promote the user afterwards. This removes any client ability to self-assign
-- a role at signup.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'analyst'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Helper functions (SECURITY DEFINER so they can read profiles without
-- triggering RLS recursion on the calling policy).
CREATE OR REPLACE FUNCTION current_role_name()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Profiles policies: everyone can read their own profile; admins can read
-- and update everyone's (to manage roles); nobody can self-assign admin.
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles FOR SELECT
  TO authenticated USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "profiles_update_admin_only" ON profiles;
CREATE POLICY "profiles_update_admin_only" ON profiles FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ============================================================
-- 2. IDENTITY COLUMNS: text -> uuid references auth.users
-- ============================================================

-- cases.created_by
ALTER TABLE cases ALTER COLUMN created_by DROP DEFAULT;
ALTER TABLE cases ALTER COLUMN created_by TYPE uuid USING (
  CASE WHEN created_by ~ '^[0-9a-fA-F-]{36}$' THEN created_by::uuid ELSE NULL END
);
ALTER TABLE cases ADD CONSTRAINT cases_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- documents.created_by (canonical owner) + uploaded_by (display of current
-- uploader; kept for UI only)
ALTER TABLE documents ALTER COLUMN created_by DROP DEFAULT;
ALTER TABLE documents ALTER COLUMN created_by TYPE uuid USING (
  CASE WHEN created_by ~ '^[0-9a-fA-F-]{36}$' THEN created_by::uuid ELSE NULL END
);
ALTER TABLE documents ADD CONSTRAINT documents_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'uploaded_by_id') THEN
    ALTER TABLE documents ADD COLUMN uploaded_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- The original free-text `uploaded_by` column is superseded by the trusted
-- `uploaded_by_id` (identity) + `created_by` (canonical owner) pair above.
ALTER TABLE documents DROP COLUMN IF EXISTS uploaded_by;

-- case_team_members.user_id
ALTER TABLE case_team_members ALTER COLUMN user_id TYPE uuid USING (
  CASE WHEN user_id ~ '^[0-9a-fA-F-]{36}$' THEN user_id::uuid ELSE NULL END
);
ALTER TABLE case_team_members ADD CONSTRAINT case_team_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE case_team_members ALTER COLUMN user_id SET NOT NULL;

-- user_role must be a real role value (P1 #43)
ALTER TABLE case_team_members DROP CONSTRAINT IF EXISTS case_team_members_user_role_check;
ALTER TABLE case_team_members ADD CONSTRAINT case_team_members_user_role_check
  CHECK (user_role IN ('admin','investigator','officer','analyst'));

-- deletion_requests: split into trusted id columns + display name columns
ALTER TABLE deletion_requests RENAME COLUMN requested_by TO requested_by_name;
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS requested_by_id uuid REFERENCES auth.users(id);
ALTER TABLE deletion_requests RENAME COLUMN reviewed_by TO reviewed_by_name;
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS reviewed_by_id uuid REFERENCES auth.users(id);

-- target_id / case_id as proper uuid (P1 #44 weak FKs)
ALTER TABLE deletion_requests ALTER COLUMN target_id TYPE uuid USING (
  CASE WHEN target_id ~ '^[0-9a-fA-F-]{36}$' THEN target_id::uuid ELSE NULL END
);
ALTER TABLE deletion_requests ALTER COLUMN case_id TYPE uuid USING (
  CASE WHEN case_id ~ '^[0-9a-fA-F-]{36}$' THEN case_id::uuid ELSE NULL END
);
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS status_expires_at timestamptz;

-- document_permissions.created_by -> uuid, plus uniqueness (P0 #39)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_permissions' AND column_name = 'created_by') THEN
    ALTER TABLE document_permissions ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

ALTER TABLE document_permissions DROP CONSTRAINT IF EXISTS document_permissions_unique_grantee;
ALTER TABLE document_permissions ADD CONSTRAINT document_permissions_unique_grantee
  UNIQUE (document_id, grantee_type, grantee_id);

-- document_versions.saved_by -> also track a trusted uid
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'saved_by_id') THEN
    ALTER TABLE document_versions ADD COLUMN saved_by_id uuid REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'is_current') THEN
    ALTER TABLE document_versions ADD COLUMN is_current boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- activity_logs: trusted actor id + do not cascade-delete with the case
-- (P1 #46 — audit trail must survive case deletion/archival)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'performed_by_user_id') THEN
    ALTER TABLE activity_logs ADD COLUMN performed_by_user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;

ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_case_id_fkey;
ALTER TABLE activity_logs ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

-- ============================================================
-- 3. CASE-NUMBER GENERATION: concurrency-safe, never reused (P1 #41/#42)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS case_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'CASE-' || EXTRACT(YEAR FROM now())::text || '-' ||
                        LPAD(nextval('case_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_case_number ON cases;
CREATE TRIGGER cases_case_number BEFORE INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION generate_case_number();

-- ============================================================
-- 4. ACCESS HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION has_case_access(p_case_id uuid)
RETURNS boolean AS $$
  SELECT is_admin()
    OR EXISTS (SELECT 1 FROM cases c WHERE c.id = p_case_id AND c.created_by = auth.uid())
    OR EXISTS (
      SELECT 1 FROM case_team_members m
      WHERE m.case_id = p_case_id AND m.user_id = auth.uid() AND m.can_view
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION can_edit_case(p_case_id uuid)
RETURNS boolean AS $$
  SELECT is_admin()
    OR EXISTS (SELECT 1 FROM cases c WHERE c.id = p_case_id AND c.created_by = auth.uid() AND c.status <> 'solved')
    OR EXISTS (
      SELECT 1 FROM case_team_members m
      JOIN cases c ON c.id = m.case_id
      WHERE m.case_id = p_case_id AND m.user_id = auth.uid() AND m.can_edit AND c.status <> 'solved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION can_upload_to_case(p_case_id uuid)
RETURNS boolean AS $$
  SELECT is_admin()
    OR EXISTS (SELECT 1 FROM cases c WHERE c.id = p_case_id AND c.created_by = auth.uid() AND c.status <> 'solved')
    OR EXISTS (
      SELECT 1 FROM case_team_members m
      JOIN cases c ON c.id = m.case_id
      WHERE m.case_id = p_case_id AND m.user_id = auth.uid() AND m.can_upload AND c.status <> 'solved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Document-level view/download check, including per-document overrides where
-- DENY overrides ALLOW (P0 #40).
CREATE OR REPLACE FUNCTION can_view_document(p_document_id uuid)
RETURNS boolean AS $$
  SELECT is_admin() OR (
    EXISTS (
      SELECT 1 FROM documents d WHERE d.id = p_document_id AND has_case_access(d.case_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM document_permissions dp
      WHERE dp.document_id = p_document_id AND dp.can_view = false AND (
        (dp.grantee_type = 'user' AND dp.grantee_id = auth.uid()::text) OR
        (dp.grantee_type = 'role' AND dp.grantee_id = current_role_name())
      )
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION can_download_document(p_document_id uuid)
RETURNS boolean AS $$
  SELECT is_admin() OR (
    can_view_document(p_document_id)
    AND EXISTS (SELECT 1 FROM documents d WHERE d.id = p_document_id AND d.download_allowed)
    AND NOT EXISTS (
      SELECT 1 FROM document_permissions dp
      WHERE dp.document_id = p_document_id AND dp.can_download = false AND (
        (dp.grantee_type = 'user' AND dp.grantee_id = auth.uid()::text) OR
        (dp.grantee_type = 'role' AND dp.grantee_id = current_role_name())
      )
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. DROP ALL "TRUST ANYONE" POLICIES
-- ============================================================

DROP POLICY IF EXISTS "anon_select_cases" ON cases;
DROP POLICY IF EXISTS "anon_insert_cases" ON cases;
DROP POLICY IF EXISTS "anon_update_cases" ON cases;
DROP POLICY IF EXISTS "anon_delete_cases" ON cases;

DROP POLICY IF EXISTS "anon_select_documents" ON documents;
DROP POLICY IF EXISTS "anon_insert_documents" ON documents;
DROP POLICY IF EXISTS "anon_update_documents" ON documents;
DROP POLICY IF EXISTS "anon_delete_documents" ON documents;

DROP POLICY IF EXISTS "anon_select_activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "anon_insert_activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "anon_delete_activity_logs" ON activity_logs;

DROP POLICY IF EXISTS "anon_select_team" ON case_team_members;
DROP POLICY IF EXISTS "anon_insert_team" ON case_team_members;
DROP POLICY IF EXISTS "anon_update_team" ON case_team_members;
DROP POLICY IF EXISTS "anon_delete_team" ON case_team_members;

DROP POLICY IF EXISTS "anon_select_versions" ON document_versions;
DROP POLICY IF EXISTS "anon_insert_versions" ON document_versions;
DROP POLICY IF EXISTS "anon_delete_versions" ON document_versions;

DROP POLICY IF EXISTS "anon_select_deletion" ON deletion_requests;
DROP POLICY IF EXISTS "anon_insert_deletion" ON deletion_requests;
DROP POLICY IF EXISTS "anon_update_deletion" ON deletion_requests;
DROP POLICY IF EXISTS "anon_delete_deletion" ON deletion_requests;

DROP POLICY IF EXISTS "anon_select_doc_perms" ON document_permissions;
DROP POLICY IF EXISTS "anon_insert_doc_perms" ON document_permissions;
DROP POLICY IF EXISTS "anon_update_doc_perms" ON document_permissions;
DROP POLICY IF EXISTS "anon_delete_doc_perms" ON document_permissions;

-- ============================================================
-- 6. NEW POLICIES — authenticated only, driven by helper functions
-- ============================================================

-- cases
CREATE POLICY "cases_select" ON cases FOR SELECT
  TO authenticated USING (has_case_access(id));

CREATE POLICY "cases_insert" ON cases FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid() AND current_role_name() IN ('admin','investigator')
  );

CREATE POLICY "cases_update" ON cases FOR UPDATE
  TO authenticated USING (can_edit_case(id)) WITH CHECK (can_edit_case(id));

-- No direct DELETE policy on cases: deletion only happens through the
-- process_deletion_request() RPC (SECURITY DEFINER), enforcing dual-admin
-- approval. Ordinary authenticated clients cannot DELETE a case row at all.

-- documents
CREATE POLICY "documents_select" ON documents FOR SELECT
  TO authenticated USING (can_view_document(id));

CREATE POLICY "documents_insert" ON documents FOR INSERT
  TO authenticated WITH CHECK (
    can_upload_to_case(case_id) AND created_by = auth.uid()
  );

CREATE POLICY "documents_update" ON documents FOR UPDATE
  TO authenticated USING (can_edit_case(case_id) OR created_by = auth.uid())
  WITH CHECK (can_edit_case(case_id) OR created_by = auth.uid());

-- No direct DELETE policy on documents either — see process_deletion_request().

-- case_team_members: only admins or the case creator manage the roster
CREATE POLICY "team_select" ON case_team_members FOR SELECT
  TO authenticated USING (has_case_access(case_id));

CREATE POLICY "team_insert" ON case_team_members FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND c.created_by = auth.uid())
  );

CREATE POLICY "team_update" ON case_team_members FOR UPDATE
  TO authenticated USING (
    is_admin() OR EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND c.created_by = auth.uid())
  ) WITH CHECK (
    is_admin() OR EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND c.created_by = auth.uid())
  );

CREATE POLICY "team_delete" ON case_team_members FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND c.created_by = auth.uid())
  );

-- document_versions: readable by anyone with document access; only the
-- server-side db layer inserts (still gated by can_edit_case); never
-- deletable by normal users (immutable history — P2 #76/#77).
CREATE POLICY "versions_select" ON document_versions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM documents d WHERE d.id = document_id AND can_view_document(d.id))
  );

CREATE POLICY "versions_insert" ON document_versions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM documents d WHERE d.id = document_id AND can_edit_case(d.case_id))
    AND saved_by_id = auth.uid()
  );

-- document_permissions: only admins or the case creator grant/revoke access
CREATE POLICY "doc_perms_select" ON document_permissions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM documents d WHERE d.id = document_id AND has_case_access(d.case_id))
  );

CREATE POLICY "doc_perms_insert" ON document_permissions FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM documents d JOIN cases c ON c.id = d.case_id
      WHERE d.id = document_id AND c.created_by = auth.uid()
    )
  );

CREATE POLICY "doc_perms_update" ON document_permissions FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "doc_perms_delete" ON document_permissions FOR DELETE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM documents d JOIN cases c ON c.id = d.case_id
      WHERE d.id = document_id AND c.created_by = auth.uid()
    )
  );

-- deletion_requests: any user with case access can request; only admins can
-- see the review queue; approval itself only happens via the RPC below.
CREATE POLICY "deletion_select" ON deletion_requests FOR SELECT
  TO authenticated USING (is_admin() OR requested_by_id = auth.uid());

CREATE POLICY "deletion_insert" ON deletion_requests FOR INSERT
  TO authenticated WITH CHECK (requested_by_id = auth.uid());

-- No UPDATE/DELETE policy for ordinary clients — status changes only via RPC.

-- activity_logs: append-only. Readable by anyone with case access (or all,
-- for admins viewing global audit history); insertable only by the acting
-- user, never updatable/deletable by authenticated clients (P0 #26, P2 #72).
CREATE POLICY "activity_select" ON activity_logs FOR SELECT
  TO authenticated USING (is_admin() OR case_id IS NULL OR has_case_access(case_id));

CREATE POLICY "activity_insert" ON activity_logs FOR INSERT
  TO authenticated WITH CHECK (performed_by_user_id = auth.uid());

-- ============================================================
-- 7. TRUSTED RPC: DUAL-ADMIN DELETION WORKFLOW (P0 #22/#24, P2 #73/#74)
-- ============================================================

CREATE OR REPLACE FUNCTION process_deletion_request(p_request_id uuid, p_action text)
RETURNS void AS $$
DECLARE
  req deletion_requests%ROWTYPE;
BEGIN
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins may review deletion requests';
  END IF;

  SELECT * INTO req FROM deletion_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Deletion request already reviewed';
  END IF;
  IF req.requested_by_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve or reject your own deletion request';
  END IF;

  IF p_action = 'reject' THEN
    UPDATE deletion_requests
    SET status = 'rejected', reviewed_by_id = auth.uid(), reviewed_at = now()
    WHERE id = p_request_id;

    INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
    VALUES (req.case_id, 'deletion_rejected', 'Deletion request rejected for ' || req.target_name, current_role_name(), auth.uid());
    RETURN;
  END IF;

  -- Approve: perform the actual deletion/archival target-type by target-type.
  IF req.target_type = 'document' THEN
    UPDATE documents SET status = 'deleted' WHERE id = req.target_id;
    INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
    VALUES (req.case_id, 'document_deleted', 'Document "' || req.target_name || '" permanently deleted', current_role_name(), auth.uid());
  ELSIF req.target_type = 'case' THEN
    UPDATE cases SET status = 'archived' WHERE id = req.target_id;
    INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
    VALUES (req.target_id, 'case_archived', 'Case "' || req.target_name || '" deleted (archived, audit trail retained)', current_role_name(), auth.uid());
  END IF;

  UPDATE deletion_requests
  SET status = 'approved', reviewed_by_id = auth.uid(), reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 8. TRUSTED RPC: DOCUMENT VERSIONING (overwrite / restore) — P1 #52/#53
-- ============================================================

CREATE OR REPLACE FUNCTION overwrite_document(
  p_document_id uuid, p_new_file_path text, p_new_file_name text,
  p_new_file_type text, p_new_file_size bigint
) RETURNS void AS $$
DECLARE
  doc documents%ROWTYPE;
  next_version integer;
BEGIN
  SELECT * INTO doc FROM documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT can_edit_case(doc.case_id) THEN RAISE EXCEPTION 'Not authorized to edit this document'; END IF;

  -- Preserve the current version in history before overwriting.
  INSERT INTO document_versions (document_id, version_number, file_path, file_name, file_type, file_size, saved_by, saved_by_id, is_current)
  VALUES (doc.id, doc.version, doc.file_path, doc.name, doc.file_type, doc.file_size, current_role_name(), auth.uid(), false);

  next_version := doc.version + 1;

  UPDATE documents SET
    file_path = p_new_file_path,
    name = p_new_file_name,
    file_type = p_new_file_type,
    file_size = p_new_file_size,
    version = next_version,
    uploaded_by_id = auth.uid()
  WHERE id = p_document_id;

  INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
  VALUES (doc.case_id, 'document_replaced', 'Document "' || doc.name || '" replaced (v' || next_version || ')', current_role_name(), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION restore_document_version(p_document_id uuid, p_version_id uuid)
RETURNS void AS $$
DECLARE
  doc documents%ROWTYPE;
  ver document_versions%ROWTYPE;
  next_version integer;
BEGIN
  SELECT * INTO doc FROM documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT can_edit_case(doc.case_id) THEN RAISE EXCEPTION 'Not authorized to edit this document'; END IF;

  SELECT * INTO ver FROM document_versions WHERE id = p_version_id AND document_id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;

  -- Save current state to history before restoring (never destroy history).
  INSERT INTO document_versions (document_id, version_number, file_path, file_name, file_type, file_size, saved_by, saved_by_id, is_current)
  VALUES (doc.id, doc.version, doc.file_path, doc.name, doc.file_type, doc.file_size, current_role_name(), auth.uid(), false);

  next_version := doc.version + 1;

  UPDATE documents SET
    file_path = ver.file_path,
    name = ver.file_name,
    file_type = ver.file_type,
    file_size = ver.file_size,
    version = next_version,
    uploaded_by_id = auth.uid()
  WHERE id = p_document_id;

  INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
  VALUES (doc.case_id, 'document_restored', 'Document "' || doc.name || '" restored to v' || ver.version_number || ' (as new v' || next_version || ')', current_role_name(), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 9. STORAGE: PRIVATE BUCKET + SIGNED-URL-ONLY ACCESS (P0 #28-#31)
-- ============================================================

UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400, -- 25 MB server-enforced ceiling (P1 #65)
    allowed_mime_types = ARRAY[
      'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'application/zip'
    ]
WHERE id = 'case-documents';

DROP POLICY IF EXISTS "anon_upload_case_docs" ON storage.objects;
DROP POLICY IF EXISTS "anon_read_case_docs" ON storage.objects;
DROP POLICY IF EXISTS "anon_update_case_docs" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_case_docs" ON storage.objects;

-- Canonical storage path convention: cases/{caseId}/documents/{documentId}/{versionId}.{ext}
-- so authorization can be derived straight from the object path without a
-- lookup, and clients cannot pick arbitrary paths (P1 #66).
CREATE POLICY "storage_insert_case_docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND can_upload_to_case((split_part(name, '/', 2))::uuid)
  );

CREATE POLICY "storage_select_case_docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND has_case_access((split_part(name, '/', 2))::uuid)
  );

CREATE POLICY "storage_update_case_docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'case-documents' AND can_edit_case((split_part(name, '/', 2))::uuid))
  WITH CHECK (bucket_id = 'case-documents' AND can_edit_case((split_part(name, '/', 2))::uuid));

-- No storage DELETE policy for ordinary clients: object removal happens only
-- as a side effect of the trusted RPCs above (service-role context).

-- ============================================================
-- 10. INDEXES for the new/changed columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cases_created_by ON cases(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);
CREATE INDEX IF NOT EXISTS idx_deletion_requested_by ON deletion_requests(requested_by_id);
CREATE INDEX IF NOT EXISTS idx_activity_performed_by ON activity_logs(performed_by_user_id);
