/*
# Security Hardening v3 — closes gaps found in the second follow-up review

1. Reassignment/unassignment now actually revokes the PREVIOUS assignee's
   access (previously only ever added, never removed) — tracked via a new
   `assignment_source` column so a manually-added team member is never
   accidentally stripped just because they also used to be the assignee.
2. `create_deletion_request()` RPC replaces client-side INSERT into
   `deletion_requests`: case_id/target_name are now derived from the real
   target record server-side, and the requester's case access is verified
   before the request can be created at all.
3. Audit `performed_by` (the human-readable name) can no longer be forged by
   the client — a trigger overwrites it with the authenticated user's real
   profile name on every insert, regardless of what the client sent.
4. Archived cases are now read-only for ordinary users, same as solved ones
   (previously only 'solved' was treated as locked).
5. Document-level `can_edit` overrides are now wired into documents RLS via
   `can_edit_document()`, matching what DocumentPermissions.tsx already
   implies it grants.
6. `document_permissions` SELECT now also allows a grantee to see their own
   override row even without case-level access (previously such a grant was
   invisible to the very user it applied to).
7. Storage: uploads must now correspond to a real, already-existing (or
   already-editable) document row — closing the "upload untracked garbage
   under a case you can write to" gap — and a narrowly-scoped DELETE policy
   lets a client clean up ONLY their own not-yet-referenced upload (used for
   rollback), never a live, already-referenced document's object.
8. `document_versions` gets a `UNIQUE(document_id, version_number)`
   constraint.
9. Removed the now-unneeded `assigned_to_legacy_text` column.
*/

-- ============================================================
-- 1. REASSIGNMENT / UNASSIGNMENT REVOKES PRIOR ACCESS
-- ============================================================

ALTER TABLE case_team_members ADD COLUMN IF NOT EXISTS assignment_source text NOT NULL DEFAULT 'manual'
  CHECK (assignment_source IN ('assignment', 'manual'));

CREATE OR REPLACE FUNCTION sync_case_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op if assignment didn't actually change.
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
    RETURN NEW;
  END IF;

  -- Revoke the PREVIOUS assignee's access — but only the membership row
  -- that assignment itself created. A team membership that was ever
  -- manually granted (assignment_source = 'manual') is never touched here,
  -- even if that same person also happened to be the assignee at some
  -- point — so reassigning/unassigning can never silently strip access
  -- someone was explicitly, separately given.
  IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    DELETE FROM case_team_members
    WHERE case_id = NEW.id AND user_id = OLD.assigned_to AND assignment_source = 'assignment';
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO case_team_members (case_id, user_id, user_name, user_role, can_view, can_upload, can_edit, can_download, assignment_source)
    SELECT NEW.id, NEW.assigned_to, p.name, p.role, true, true, true, true, 'assignment'
    FROM profiles p WHERE p.id = NEW.assigned_to
    ON CONFLICT (case_id, user_id) DO UPDATE SET can_view = true;
    -- Deliberately does NOT overwrite assignment_source on conflict: if
    -- this person was already a manually-added member, they stay 'manual'.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS cases_sync_assignment ON cases;
CREATE TRIGGER cases_sync_assignment AFTER INSERT OR UPDATE OF assigned_to ON cases
  FOR EACH ROW EXECUTE FUNCTION sync_case_assignment();

-- Now safe to drop the interim compatibility column from v2.
ALTER TABLE cases DROP COLUMN IF EXISTS assigned_to_legacy_text;

-- ============================================================
-- 2. TRUSTED DELETION-REQUEST CREATION
-- ============================================================

CREATE OR REPLACE FUNCTION create_deletion_request(p_target_type text, p_target_id uuid, p_reason text)
RETURNS uuid AS $$
DECLARE
  v_case_id uuid;
  v_target_name text;
  v_request_id uuid;
BEGIN
  IF p_target_type NOT IN ('case', 'document') THEN
    RAISE EXCEPTION 'Invalid target type';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  IF p_target_type = 'document' THEN
    SELECT d.case_id, d.name INTO v_case_id, v_target_name FROM documents d WHERE d.id = p_target_id AND d.status <> 'deleted';
    IF v_case_id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  ELSE
    SELECT c.id, c.title INTO v_case_id, v_target_name FROM cases c WHERE c.id = p_target_id;
    IF v_case_id IS NULL THEN RAISE EXCEPTION 'Case not found'; END IF;
  END IF;

  IF NOT (is_admin() OR can_edit_case(v_case_id)) THEN
    RAISE EXCEPTION 'Not authorized to request deletion for this case';
  END IF;

  INSERT INTO deletion_requests (target_type, target_id, target_name, case_id, requested_by_id, requested_by_name, request_reason, status)
  VALUES (p_target_type, p_target_id, v_target_name, v_case_id, auth.uid(), current_profile_name(), p_reason, 'pending')
  RETURNING id INTO v_request_id;

  INSERT INTO activity_logs (case_id, action, description, performed_by, performed_by_user_id)
  VALUES (v_case_id, 'deletion_requested', current_profile_name() || ' requested deletion of "' || v_target_name || '"', current_profile_name(), auth.uid());

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Direct client INSERTs are no longer the sanctioned path (the app now
-- calls create_deletion_request() instead), but tighten the fallback RLS
-- policy too — belt and suspenders — so even a raw insert must supply a
-- case_id the requester actually has access to.
DROP POLICY IF EXISTS "deletion_insert" ON deletion_requests;
CREATE POLICY "deletion_insert" ON deletion_requests FOR INSERT
  TO authenticated WITH CHECK (
    requested_by_id = auth.uid() AND (is_admin() OR can_edit_case(case_id))
  );

-- ============================================================
-- 3. AUDIT ACTOR NAME CANNOT BE FORGED BY THE CLIENT
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_audit_actor_identity()
RETURNS TRIGGER AS $$
BEGIN
  -- Overwrite whatever the client sent with the authenticated user's real,
  -- server-known identity. RLS already requires performed_by_user_id =
  -- auth.uid() (see security_hardening.sql), but this closes the remaining
  -- gap where the human-readable `performed_by` name was still trusted
  -- client input — a user could otherwise submit their own correct
  -- performed_by_user_id alongside a fabricated performed_by name.
  NEW.performed_by_user_id := auth.uid();
  NEW.performed_by := current_profile_name();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS activity_logs_enforce_actor ON activity_logs;
CREATE TRIGGER activity_logs_enforce_actor BEFORE INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION enforce_audit_actor_identity();

-- ============================================================
-- 4. ARCHIVED CASES ARE READ-ONLY FOR ORDINARY USERS (same as solved)
-- ============================================================

CREATE OR REPLACE FUNCTION can_edit_case(p_case_id uuid)
RETURNS boolean AS $$
  SELECT is_admin()
    OR EXISTS (SELECT 1 FROM cases c WHERE c.id = p_case_id AND c.created_by = auth.uid() AND c.status NOT IN ('solved', 'archived'))
    OR EXISTS (
      SELECT 1 FROM case_team_members m
      JOIN cases c ON c.id = m.case_id
      WHERE m.case_id = p_case_id AND m.user_id = auth.uid() AND m.can_edit AND c.status NOT IN ('solved', 'archived')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION can_upload_to_case(p_case_id uuid)
RETURNS boolean AS $$
  SELECT is_admin()
    OR EXISTS (SELECT 1 FROM cases c WHERE c.id = p_case_id AND c.created_by = auth.uid() AND c.status NOT IN ('solved', 'archived'))
    OR EXISTS (
      SELECT 1 FROM case_team_members m
      JOIN cases c ON c.id = m.case_id
      WHERE m.case_id = p_case_id AND m.user_id = auth.uid() AND m.can_upload AND c.status NOT IN ('solved', 'archived')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. DOCUMENT-LEVEL can_edit OVERRIDE WIRED INTO documents RLS
-- ============================================================

CREATE OR REPLACE FUNCTION can_edit_document(p_document_id uuid)
RETURNS boolean AS $$
DECLARE
  v_case_id uuid;
  v_created_by uuid;
  v_user_override boolean;
  v_role_override boolean;
BEGIN
  IF is_admin() THEN RETURN true; END IF;

  SELECT case_id, created_by INTO v_case_id, v_created_by FROM documents WHERE id = p_document_id AND status <> 'deleted';
  IF v_case_id IS NULL THEN RETURN false; END IF;
  IF v_created_by = auth.uid() THEN RETURN true; END IF;

  SELECT can_edit INTO v_user_override FROM document_permissions
    WHERE document_id = p_document_id AND grantee_type = 'user' AND grantee_id = auth.uid()::text;
  IF v_user_override IS NOT NULL THEN RETURN v_user_override; END IF;

  SELECT can_edit INTO v_role_override FROM document_permissions
    WHERE document_id = p_document_id AND grantee_type = 'role' AND grantee_id = current_role_name();
  IF v_role_override IS NOT NULL THEN RETURN v_role_override; END IF;

  RETURN can_edit_case(v_case_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "documents_update" ON documents;
CREATE POLICY "documents_update" ON documents FOR UPDATE
  TO authenticated USING (can_edit_document(id)) WITH CHECK (can_edit_document(id));

-- NOTE on can_upload in document_permissions: that field is intentionally
-- NOT wired into any authorization check. Uploading creates a brand-new
-- document under a CASE, not "into" an existing document, so a per-document
-- can_upload override has no coherent meaning to enforce — case-level
-- upload rights (can_upload_to_case) already govern that. The column and
-- its UI toggle are kept for potential future use (e.g. category-scoped
-- upload delegation) but are inert today; DocumentPermissions.tsx should be
-- read with that in mind rather than assuming every toggle it shows changes
-- what's enforced.

-- ============================================================
-- 6. document_permissions SELECT — a grantee can see their own override
-- ============================================================

DROP POLICY IF EXISTS "doc_perms_select" ON document_permissions;
CREATE POLICY "doc_perms_select" ON document_permissions FOR SELECT
  TO authenticated USING (
    (grantee_type = 'user' AND grantee_id = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM documents d WHERE d.id = document_id AND has_case_access(d.case_id))
  );

-- ============================================================
-- 7. STORAGE: uploads must correspond to a real document row;
--    narrowly-scoped rollback DELETE for orphaned (unreferenced) uploads
-- ============================================================

DROP POLICY IF EXISTS "storage_insert_case_docs" ON storage.objects;
CREATE POLICY "storage_insert_case_docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND (
      -- Brand-new document: the app now creates the `documents` row FIRST,
      -- pointing at this exact path, then uploads the file — so the row
      -- must already exist with a matching file_path before storage will
      -- accept the object.
      EXISTS (
        SELECT 1 FROM documents d
        WHERE d.file_path = name AND d.created_by = auth.uid() AND can_upload_to_case(d.case_id)
      )
      OR
      -- New version of an existing, editable document (overwrite flow) —
      -- scoped to documents this user can already edit, so at worst this
      -- lets someone add extra untracked objects inside a document folder
      -- they already have write access to, not an arbitrary case folder.
      EXISTS (
        SELECT 1 FROM documents d
        WHERE d.id = (split_part(name, '/', 4))::uuid AND can_edit_document(d.id)
      )
    )
  );

-- Rollback-only DELETE: a client may remove an object THEY uploaded only if
-- no documents/document_versions row references that path yet. As soon as
-- a row references it (i.e. it's a real, live document or version), this
-- is false and the object can no longer be deleted this way — only the
-- trusted process_deletion_request() RPC can remove a referenced object.
DROP POLICY IF EXISTS "storage_delete_own_orphans" ON storage.objects;
CREATE POLICY "storage_delete_own_orphans" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND owner = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.file_path = storage.objects.name)
    AND NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.file_path = storage.objects.name)
  );

-- ============================================================
-- 8. VERSION INTEGRITY CONSTRAINT
-- ============================================================

ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS document_versions_unique_version;
ALTER TABLE document_versions ADD CONSTRAINT document_versions_unique_version UNIQUE (document_id, version_number);
