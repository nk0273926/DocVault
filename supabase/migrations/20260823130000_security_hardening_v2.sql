/*
# Security Hardening v2 — closes the gaps found in follow-up review

Addresses, in order:
1. Admin privilege now requires a real Supabase MFA assurance level (aal2),
   enforced inside is_admin() itself — not just hidden by the React UI. A
   session that only completed password auth (aal1) cannot exercise admin
   powers in the database even if the browser already holds a JWT.
2. Storage SELECT (and therefore signed-URL issuance) now authorizes at the
   *document* level via can_download_document(), not just case-level access.
3. Approved document deletions now actually remove the underlying storage
   objects (current file + every historical version), not just flip a
   status flag.
4. document_permissions can now GRANT access on their own (not only deny),
   matching what the UI already implied it does.
5. document_permissions UPDATE policy now also allows the case creator (not
   admins only), matching who is allowed to INSERT/DELETE them. INSERT now
   requires created_by = auth.uid().
6. Audit actor display now uses the real profile name (current_profile_name())
   instead of the bare role string.
7. Case status transitions are validated against the ACTUAL current status
   read server-side inside a trusted RPC, not a client-supplied one.
8. Case assignment (`assigned_to`) is now a real auth.users uuid, and a
   trigger keeps it in sync with case_team_members so "assigned" always
   implies "has access".
*/

-- ============================================================
-- 1. MFA-AWARE is_admin()
-- ============================================================

CREATE OR REPLACE FUNCTION current_profile_name()
RETURNS text AS $$
  SELECT COALESCE(NULLIF((SELECT name FROM profiles WHERE id = auth.uid()), ''), 'Unknown User');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Admin powers require aal2 (i.e. a completed Supabase MFA challenge), not
-- merely a password-authenticated (aal1) session. Supabase's GoTrue issues
-- the `aal` claim on the request JWT; auth.jwt() exposes it to Postgres.
-- Non-admin permission checks are unaffected — they never depended on
-- is_admin() alone to grant access, and continue to work at aal1.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' FROM profiles WHERE id = auth.uid())
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2',
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. DOCUMENT-LEVEL DOWNLOAD/VIEW AUTHORIZATION (also grants, not only denies)
-- ============================================================

CREATE OR REPLACE FUNCTION can_view_document(p_document_id uuid)
RETURNS boolean AS $$
DECLARE
  v_case_id uuid;
  v_user_override boolean;
  v_role_override boolean;
BEGIN
  IF is_admin() THEN RETURN true; END IF;

  SELECT case_id INTO v_case_id FROM documents WHERE id = p_document_id AND status <> 'deleted';
  IF v_case_id IS NULL THEN RETURN false; END IF;

  -- A user-specific override (grant OR deny) wins outright — this can grant
  -- access even to someone without case-level access, matching what the UI
  -- has always implied "add a permission override" means.
  SELECT can_view INTO v_user_override FROM document_permissions
    WHERE document_id = p_document_id AND grantee_type = 'user' AND grantee_id = auth.uid()::text;
  IF v_user_override IS NOT NULL THEN RETURN v_user_override; END IF;

  -- A role-level override is next, same logic.
  SELECT can_view INTO v_role_override FROM document_permissions
    WHERE document_id = p_document_id AND grantee_type = 'role' AND grantee_id = current_role_name();
  IF v_role_override IS NOT NULL THEN RETURN v_role_override; END IF;

  -- No override on this document at all: fall back to ordinary case access.
  RETURN has_case_access(v_case_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION can_download_document(p_document_id uuid)
RETURNS boolean AS $$
DECLARE
  v_case_id uuid;
  v_download_allowed boolean;
  v_created_by uuid;
  v_user_override boolean;
  v_role_override boolean;
BEGIN
  -- NOTE ON ADMIN BYPASS: admins can download regardless of download_allowed
  -- or per-document overrides. This is intentional — admins retain full
  -- oversight/audit capability over every document in the system.
  -- download_allowed and document_permissions are restrictions on
  -- non-admin users, not an absolute lock even administrators can't open.
  IF is_admin() THEN RETURN true; END IF;

  SELECT case_id, download_allowed, created_by INTO v_case_id, v_download_allowed, v_created_by
  FROM documents WHERE id = p_document_id AND status <> 'deleted';
  IF v_case_id IS NULL THEN RETURN false; END IF;
  IF NOT v_download_allowed THEN RETURN false; END IF;
  IF NOT can_view_document(p_document_id) THEN RETURN false; END IF;

  SELECT can_download INTO v_user_override FROM document_permissions
    WHERE document_id = p_document_id AND grantee_type = 'user' AND grantee_id = auth.uid()::text;
  IF v_user_override IS NOT NULL THEN RETURN v_user_override; END IF;

  SELECT can_download INTO v_role_override FROM document_permissions
    WHERE document_id = p_document_id AND grantee_type = 'role' AND grantee_id = current_role_name();
  IF v_role_override IS NOT NULL THEN RETURN v_role_override; END IF;

  RETURN v_created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM case_team_members m WHERE m.case_id = v_case_id AND m.user_id = auth.uid() AND m.can_download
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Storage SELECT (and therefore createSignedUrl) now checks the document,
-- not just the case. Path convention: cases/{caseId}/documents/{documentId}/{versionId}.ext
-- so split_part(name, '/', 4) is the document id.
DROP POLICY IF EXISTS "storage_select_case_docs" ON storage.objects;
CREATE POLICY "storage_select_case_docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND can_download_document((split_part(name, '/', 4))::uuid)
  );

-- ============================================================
-- 3. ACTUALLY REMOVE STORAGE OBJECTS ON APPROVED DOCUMENT DELETION
-- ============================================================

CREATE OR REPLACE FUNCTION process_deletion_request(p_request_id uuid, p_action text)
RETURNS void AS $$
DECLARE
  req deletion_requests%ROWTYPE;
  doc documents%ROWTYPE;
  v_paths text[];
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
    VALUES (req.case_id, 'deletion_rejected', current_profile_name() || ' rejected deletion request for ' || req.target_name, current_profile_name(), auth.uid());
    RETURN;
  END IF;

  IF req.target_type = 'document' THEN
    SELECT * INTO doc FROM documents WHERE id = req.target_id FOR UPDATE;
    IF FOUND THEN
      -- Collect every storage object ever associated with this document
      -- (current file + all historical versions) and remove them for real.
      -- Deleting the storage.objects row is what actually revokes/removes
      -- the underlying object in Supabase Storage — this function runs
      -- SECURITY DEFINER (as the function owner, not the calling client),
      -- so it can do this even though ordinary authenticated clients have
      -- no storage DELETE policy at all.
      SELECT array_agg(file_path) INTO v_paths FROM document_versions WHERE document_id = doc.id;
      v_paths := array_append(COALESCE(v_paths, ARRAY[]::text[]), doc.file_path);
      DELETE FROM storage.objects WHERE bucket_id = 'case-documents' AND name = ANY(v_paths);

      UPDATE documents SET status = 'deleted' WHERE id = doc.id;
    END IF;

    INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
    VALUES (req.case_id, 'document_deleted', current_profile_name() || ' permanently deleted "' || req.target_name || '" (files removed from storage)', current_profile_name(), auth.uid());
  ELSIF req.target_type = 'case' THEN
    -- Case "deletion" remains an archive, not an erasure (P1 #46 — the
    -- audit trail for a case must survive). Storage files are intentionally
    -- left intact for an archived case; only individual approved document
    -- deletions physically remove files.
    UPDATE cases SET status = 'archived' WHERE id = req.target_id;
    INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
    VALUES (req.target_id, 'case_archived', current_profile_name() || ' deleted case "' || req.target_name || '" (archived, audit trail retained)', current_profile_name(), auth.uid());
  END IF;

  UPDATE deletion_requests
  SET status = 'approved', reviewed_by_id = auth.uid(), reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Same actor-name fix in the versioning RPCs.
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

  INSERT INTO document_versions (document_id, version_number, file_path, file_name, file_type, file_size, saved_by, saved_by_id)
  VALUES (doc.id, doc.version, doc.file_path, doc.name, doc.file_type, doc.file_size, current_profile_name(), auth.uid());

  next_version := doc.version + 1;

  UPDATE documents SET
    file_path = p_new_file_path, name = p_new_file_name, file_type = p_new_file_type,
    file_size = p_new_file_size, version = next_version, uploaded_by_id = auth.uid()
  WHERE id = p_document_id;

  INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
  VALUES (doc.case_id, 'document_replaced', current_profile_name() || ' replaced "' || doc.name || '" (v' || next_version || ')', current_profile_name(), auth.uid());
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

  INSERT INTO document_versions (document_id, version_number, file_path, file_name, file_type, file_size, saved_by, saved_by_id)
  VALUES (doc.id, doc.version, doc.file_path, doc.name, doc.file_type, doc.file_size, current_profile_name(), auth.uid());

  next_version := doc.version + 1;

  -- Restoring re-points the document at the OLD storage object rather than
  -- copying it to a new one. This is safe as an invariant, not a shortcut:
  -- the only code path that ever physically deletes a version's storage
  -- object is process_deletion_request() above, and it deletes every
  -- version's object for a document atomically and only when the whole
  -- document is approved for deletion — so there is no scenario in this
  -- app where an individual historical object gets pruned out from under
  -- a still-live document.
  UPDATE documents SET
    file_path = ver.file_path, name = ver.file_name, file_type = ver.file_type,
    file_size = ver.file_size, version = next_version, uploaded_by_id = auth.uid()
  WHERE id = p_document_id;

  INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
  VALUES (doc.case_id, 'document_restored', current_profile_name() || ' restored "' || doc.name || '" to v' || ver.version_number || ' (as new v' || next_version || ')', current_profile_name(), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. document_permissions: allow case-creator UPDATE, require created_by = auth.uid() on INSERT
-- ============================================================

DROP POLICY IF EXISTS "doc_perms_insert" ON document_permissions;
CREATE POLICY "doc_perms_insert" ON document_permissions FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (
      is_admin() OR EXISTS (
        SELECT 1 FROM documents d JOIN cases c ON c.id = d.case_id
        WHERE d.id = document_id AND c.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "doc_perms_update" ON document_permissions;
CREATE POLICY "doc_perms_update" ON document_permissions FOR UPDATE
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM documents d JOIN cases c ON c.id = d.case_id
      WHERE d.id = document_id AND c.created_by = auth.uid()
    )
  ) WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM documents d JOIN cases c ON c.id = d.case_id
      WHERE d.id = document_id AND c.created_by = auth.uid()
    )
  );

-- ============================================================
-- 5. SERVER-SIDE CASE STATUS TRANSITIONS (client can no longer lie about
--    the current status to smuggle through an invalid transition)
-- ============================================================

CREATE OR REPLACE FUNCTION update_case_status(p_case_id uuid, p_new_status text)
RETURNS void AS $$
DECLARE
  v_current text;
  v_allowed text[];
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins may change case status';
  END IF;

  SELECT status INTO v_current FROM cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Case not found';
  END IF;

  v_allowed := CASE v_current
    WHEN 'open' THEN ARRAY['in_review','solved','closed','archived']
    WHEN 'in_review' THEN ARRAY['open','solved','closed','archived']
    WHEN 'solved' THEN ARRAY['open','closed','archived']
    WHEN 'closed' THEN ARRAY['open','archived']
    WHEN 'archived' THEN ARRAY['open']
    ELSE ARRAY[]::text[]
  END;

  IF p_new_status = v_current OR NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Cannot change status from % to %', v_current, p_new_status;
  END IF;

  UPDATE cases SET status = p_new_status WHERE id = p_case_id;

  INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
  VALUES (p_case_id, 'case_status_changed', current_profile_name() || ' changed case status from "' || v_current || '" to "' || p_new_status || '"', current_profile_name(), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. REAL CASE ASSIGNMENT — uuid, kept in sync with case_team_members
-- ============================================================

ALTER TABLE case_team_members ADD CONSTRAINT case_team_members_unique_user UNIQUE (case_id, user_id);

ALTER TABLE cases RENAME COLUMN assigned_to TO assigned_to_legacy_text;
ALTER TABLE cases ADD COLUMN assigned_to uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION sync_case_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO case_team_members (case_id, user_id, user_name, user_role, can_view, can_upload, can_edit, can_download)
    SELECT NEW.id, NEW.assigned_to, p.name, p.role, true, true, true, true
    FROM profiles p WHERE p.id = NEW.assigned_to
    ON CONFLICT (case_id, user_id) DO UPDATE SET can_view = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS cases_sync_assignment ON cases;
CREATE TRIGGER cases_sync_assignment AFTER INSERT OR UPDATE OF assigned_to ON cases
  FOR EACH ROW EXECUTE FUNCTION sync_case_assignment();

-- ============================================================
-- 7. Drop the unused is_current column (P0/#18 — one version model: the
--    live version lives on `documents`, document_versions is history only)
-- ============================================================

ALTER TABLE document_versions DROP COLUMN IF EXISTS is_current;

-- ============================================================
-- 8. Close a residual gap: cases_insert checked the role text directly
--    instead of going through is_admin(), so it wasn't MFA-gated like every
--    other admin-level check. Investigators are unaffected (aal1 is fine
--    for them); an admin now needs aal2 for this too, consistent with
--    every other admin capability in this schema.
-- ============================================================

DROP POLICY IF EXISTS "cases_insert" ON cases;
CREATE POLICY "cases_insert" ON cases FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid() AND (is_admin() OR current_role_name() = 'investigator')
  );
