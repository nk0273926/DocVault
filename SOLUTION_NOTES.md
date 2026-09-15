# CaseVault — Rebuild Notes

This is a from-the-architecture-up rebuild, not a patch pass. Read this
before anything else.

## ⚠️ Important caveat

This sandbox has no network access, so I could not run `npm install`,
`npm run typecheck`, or `npm run build` against the real dependency tree —
I've instead done a careful manual review of every file for import
correctness, type shape agreement, and consistent function signatures across
the codebase. **You must run these three commands yourself before trusting
the build is green:**

```
npm install
npm run typecheck
npm run build
```

If `typecheck` surfaces anything, it's most likely a small mismatch I
couldn't catch without the compiler (e.g. a lucide-react icon name that
doesn't exist in your installed version) — those are quick fixes, not signs
of an architectural problem.

I also could not run the SQL migrations against a live database (no network
either), so the migration is reviewed carefully but not executed. Run it on
a scratch/staging Supabase project first.

## What changed, and why

### Build blockers (P0 #1–#10)
- `CasesList.tsx` now actually exports a case list. The `CaseDetail`
  implementation that was accidentally living inside it is gone — there is
  exactly one `CaseDetail.tsx`, combining the more complete feature set
  (versions, permissions, team, deletion workflow) from both prior
  implementations.
- `src/lib/db.ts` is a real, complete data-access layer — every function the
  UI imports now exists (see full list below).
- Renamed `badges.tsx` → `Badges.tsx`, `permision.ts` → deleted (superseded
  by `src/lib/permissions.ts`, the one canonical permission module),
  `supabse/` → `supabase/`.
- Removed `ignoreDeprecations: "6.0"` from `tsconfig.app.json`.
- `node_modules` was stripped from the upload before rebuilding; run
  `npm install` fresh.

### Real authentication (P0 #11–#17)
`src/context/AuthContext.tsx` no longer keeps a fake session in
`sessionStorage`. It calls `supabase.auth.signInWithPassword`, and treats
the **server-issued Supabase session** as the source of truth. Role comes
from a new `profiles` table (one row per Supabase Auth user, `role` column
constrained to the four valid values), not from anything the client sends.
A user cannot self-promote: `profiles` can only be updated by an existing
admin (enforced by RLS).

MFA remains a **clearly labeled demo** step layered on top of the real
Supabase session (see the comment block at the top of `AuthContext.tsx`) —
replacing it with `supabase.auth.mfa.challengeAndVerify` is called out
explicitly as the next step before any real deployment.

**You need to actually provision the four demo accounts** in Supabase Auth
before login will work — see `supabase/seed.sql` for a script and
instructions (local dev vs. hosted project).

### RLS / database security (P0 #18–#40)
`supabase/migrations/20260823120000_security_hardening.sql` is the core of
this rebuild:
- Drops every `USING (true)` / anon policy.
- Adds SECURITY DEFINER helper functions (`is_admin()`, `has_case_access()`,
  `can_edit_case()`, `can_upload_to_case()`, `can_view_document()`,
  `can_download_document()`) so policies stay readable and non-recursive.
- Converts identity columns (`created_by`, `user_id`, `requested_by`,
  `performed_by`, etc.) from free text to `uuid references auth.users(id)`.
  **Legacy mock-user ids like `u-admin-001` cannot be cast to uuid and are
  set to NULL by this migration** — that seed data belonged to the old fake
  auth system and isn't trustworthy identity data anyway.
- `cases` and `documents` have **no DELETE policy at all** for authenticated
  clients — deletion only happens through the trusted
  `process_deletion_request()` RPC, which independently re-verifies (in SQL,
  not JS) that the caller is an admin and isn't the original requester
  before doing anything (dual-admin approval, P2 #73/#74).
- `activity_logs` is append-only: insert only, and only when
  `performed_by_user_id = auth.uid()` (no forged actor, no deletion).
- `case_number` generation moved to a real sequence (`case_number_seq`) —
  concurrency-safe and never reused.
- `user_role` / `case_team_members.user_role` are CHECK-constrained to the
  four valid roles.
- `document_permissions` has a `UNIQUE(document_id, grantee_type,
  grantee_id)` constraint; DENY-overrides-ALLOW conflict resolution is
  implemented once, in `src/lib/permissions.ts`, and mirrored by the
  `can_view_document`/`can_download_document` SQL functions.

### Storage (P0 #28–#31)
Bucket `case-documents` is set private, with a server-enforced 25MB size
limit and an explicit MIME allowlist. Storage policies derive the case id
straight from the object path (`cases/{caseId}/...`) rather than trusting a
client-supplied one. Downloads only ever go through
`supabase.storage.createSignedUrl` with a 60-second expiry
(`src/lib/storage.ts`) — there is no public/permanent URL anywhere in the
app.

### Schema mismatches (P0 #32–#40)
- One constant, `STORAGE_BUCKET = 'case-documents'`, used everywhere.
- `case_team_members` used consistently (the `case_team` typo is gone).
- `created_by` is the single canonical ownership field on both `cases` and
  `documents`. `uploaded_by` (free text) was dropped in favor of
  `uploaded_by_id` (uuid, display-only — tracks who uploaded the *current*
  version, separate from the immutable `created_by` owner).
- `document_permissions` schema (`grantee_type`/`grantee_id`) matches the
  frontend types in `src/types/permission.ts` exactly.

### Everything else (P1/P2)
- One canonical db layer (`src/lib/db.ts`), one canonical permission module
  (`src/lib/permissions.ts` for UI, mirrored by RLS for real enforcement),
  one canonical type system (`src/types/*.ts`).
- `overwriteDocument` / `restoreDocumentVersion` are real (implemented as
  SQL RPCs so version history is written atomically with the update —
  `overwrite_document` / `restore_document_version` in the migration).
- `archiveDocument`, `updateCaseStatus` (with an explicit allowed-transition
  table, `ALLOWED_STATUS_TRANSITIONS` in `src/types/case.ts`), and
  `getDocumentUrl` (signed URLs) are all implemented for real — no stubs, no
  `@ts-ignore`, no fake empty-array returns.
- Dashboard's recent-activity feed actually loads now
  (`fetchAllActivityLogs`), and document counts come from a real aggregate
  query instead of a nonexistent field on the cases query.
- `getAllUsers`/`getUsers` now read from the real `profiles` table instead
  of a hard-coded mock array — every component that used to call these
  synchronously (`TeamManager`, `DocumentPermissions`, `UserManagement`) was
  updated to load them asynchronously.
- `UserManagement.tsx` is explicitly labeled as a **read-only mock view**
  (P1 #69) — it does not yet expose an in-app role editor; that would need
  its own admin-only RPC and is flagged as follow-up work, not silently
  implemented halfway.

## Full list of `src/lib/db.ts` functions

`fetchCases`, `fetchCase`, `createCase`, `updateCaseStatus`,
`fetchDocuments`, `fetchDocumentVersions`, `uploadDocument`,
`overwriteDocument`, `restoreDocumentVersion`, `archiveDocument`,
`getDocumentUrl`, `setDocumentDownloadAllowed`, `fetchActivityLogs`,
`fetchAllActivityLogs`, `fetchTeamMembers`, `addTeamMember`,
`removeTeamMember`, `updateTeamMemberPermissions`, `getAllUsers` /
`getUsers`, `getDocumentPermissions`, `createDocumentPermission`,
`removeDocumentPermission`, `fetchDeletionRequests`,
`createDeletionRequest`, `approveDeletion`, `rejectDeletion`.

Deliberately **not** implemented: a direct, unconditional `deleteCase` /
`deleteDocument`. The required architecture (dual-admin approval) makes an
immediate destructive delete a contradiction — and the database itself has
no DELETE policy for cases/documents that would let such a function work
even if it existed. This is documented at the top of `db.ts`.

## What you still need to do

1. `npm install && npm run typecheck && npm run build` — verify clean.
2. Run the migrations **in order** (including `20260823130000_security_hardening_v2.sql`)
   against a scratch Supabase project, then `supabase/seed.sql` to create the
   four demo accounts.
3. Enroll each admin demo account's authenticator app on first login — MFA is
   now real Supabase TOTP (see "Second pass" below), so there's no shortcut
   code to type in anymore.
4. Build a real admin role-editor (promote/demote users) — currently a
   manual `UPDATE profiles SET role = ...` by an admin/DBA.
5. Run through the 17-step functional test in the original spec end to end,
   including attempting unauthorized direct-to-Supabase calls from the
   browser console to confirm RLS — not the React UI — is what blocks them.

## Second pass — fixes from follow-up review

A follow-up audit (against the first rebuild) found several real gaps.
`supabase/migrations/20260823130000_security_hardening_v2.sql` plus frontend
changes address the ten highest-priority ones:

1. **MFA is now real Supabase TOTP**, not a client-generated OTP. Login
   flows through `supabase.auth.mfa.enroll` / `challenge` / `verify` /
   `challengeAndVerify` — nothing in this app generates or displays a code.
   More importantly, `is_admin()` in Postgres now requires the session's JWT
   `aal` claim to be `aal2` (i.e. a completed MFA challenge), not just
   `role = 'admin'`. A password-only (aal1) session — including one an
   attacker obtained by calling Supabase directly and skipping the React MFA
   screen entirely — cannot exercise any admin-gated RLS policy. Hiding the
   "MFA required" screen in the UI is a nicety now, not the boundary.
2. **Document downloads are authorized at the document level in storage
   RLS itself.** `storage_select_case_docs` (which gates `createSignedUrl`)
   now calls `can_download_document(document_id)` — derived from the object
   path — instead of only `has_case_access(case_id)`. `download_allowed`
   and per-document/per-role permission overrides are enforced by Postgres,
   not just hidden in the UI.
3. **Approved document deletion now removes the storage objects for real.**
   `process_deletion_request()` collects the document's current file path
   plus every historical version's path and deletes those rows from
   `storage.objects` (as the SECURITY DEFINER function owner, which is the
   only reason this works — ordinary clients still have no storage DELETE
   policy at all) before marking the document `deleted`.
4. **Document permissions can grant access, not just deny it.**
   `can_view_document()` / `can_download_document()` now check a
   user-specific override first, then a role-level override, and only fall
   back to ordinary case access if neither exists — matching what the "Add
   Override" UI in `DocumentPermissions.tsx` already implied.
5. **`document_permissions` UPDATE policy now also allows the case
   creator** (previously admin-only, which didn't match who can INSERT/
   DELETE them), and INSERT now requires `created_by = auth.uid()`.
6. **Audit actor names in RPCs are real names again** —
   `current_profile_name()` replaces `current_role_name()` in the audit rows
   written by `process_deletion_request`, `overwrite_document`,
   `restore_document_version`, and the new `update_case_status`, so history
   reads "Sarah Mitchell approved..." instead of "admin approved...".
7. **Case status transitions are validated server-side against the real
   current status.** `updateCaseStatus()` in `db.ts` now calls a
   `update_case_status(case_id, new_status)` RPC that reads the case's
   actual current status itself (`FOR UPDATE`) rather than trusting
   whatever `currentStatus` the client passed in.
8. **Case assignment is a real identity, not free text.** `cases.assigned_to`
   is now `uuid references auth.users(id)`; a trigger
   (`sync_case_assignment`) automatically adds the assignee to
   `case_team_members` with full access, so "Assigned To" in the UI can
   never again point at someone who doesn't actually have access.
9. A residual gap in `cases_insert` (checked the role text directly instead
   of going through the now-MFA-gated `is_admin()`) is closed too — see
   item 8 in the v2 migration file.
10. `Dashboard.tsx` no longer calls `supabase.from(...)` directly; the query
    moved into `fetchDocumentCountsByCase()` in `db.ts`, restoring "every
    Supabase call goes through the canonical layer."

Also fixed in this pass: the unused `document_versions.is_current` column
was dropped (one version model — the live version lives on `documents`,
history lives in `document_versions`); `cancelMfa`'s type signature now
correctly says `Promise<void>`; `TeamManager`'s default permissions when
adding someone to a case team now follow an explicit, documented matrix
(investigator: view+upload+edit, download requires an explicit grant;
officer/analyst: view only, download requires an explicit grant) instead of
an arbitrary rule.

## Third pass — fixes from the second follow-up review

A second follow-up audit found more real gaps in the v2 pass, mostly around
consistency between frontend and DB semantics, and a few remaining
client-trust issues. `supabase/migrations/20260823140000_security_hardening_v3.sql`
plus frontend changes fix all of the P0 items it raised:

1. **Frontend document-view logic now matches the database exactly.**
   `canViewDocument()` previously required `override && canViewCase(...)`;
   the database's `can_view_document()` lets an override grant access
   independently. Frontend now does the same: user override wins outright,
   then role override, then falls back to case access — no more silent
   mismatch between what React shows and what Postgres would actually allow.
2. **Reassigning or unassigning a case now actually revokes the previous
   assignee's access.** `case_team_members` gained an `assignment_source`
   column (`'assignment'` vs `'manual'`); the sync trigger now deletes the
   old assignee's *assignment-generated* membership on reassignment/
   unassignment, while never touching a membership that was ever manually
   granted (so a manually-added team member can never be silently stripped
   just because they also used to be the assignee).
3. **Deletion requests go through a trusted `create_deletion_request()` RPC**
   instead of a direct client INSERT. It derives `case_id`/`target_name`
   from the real target record and verifies the requester actually has
   access to that case *before* the request can be created — closing the
   "request deletion of a document I can't even see" hole. `db.ts`'s
   `createDeletionRequest()` signature shrank accordingly (just
   `targetType, targetId, reason` — no more client-supplied name/case id).
4. **Audit `performed_by` (the display name) can no longer be forged.** A
   `BEFORE INSERT` trigger on `activity_logs` overwrites whatever the client
   sent with the authenticated user's real profile name and
   `auth.uid()`, for every insert — RPC-originated or client-originated.
5. **Archived cases are read-only for ordinary users now, same as solved
   ones** (`can_edit_case`/`can_upload_to_case` in SQL and `isLocked()` in
   `lib/permissions.ts`, previously only `'solved'`).
6. **Document-level `can_edit` overrides are wired into `documents` RLS**
   via a new `can_edit_document()` helper, matching what
   `DocumentPermissions.tsx` already implied it grants. (`can_upload` at the
   document level is explicitly documented as inert/reserved rather than
   silently mismatched — see the comment in the migration and a note in
   `DocumentPermissions.tsx` — uploading creates a *new* document under a
   case, so a per-existing-document upload override has no coherent
   target to apply to.)
7. **A user can see their own document-permission grant** even without
   case-level access (`doc_perms_select` policy), fixing a case where a
   grant worked but was invisible to the person it applied to.
8. **Storage uploads must correspond to a real document row.** The app now
   creates the `documents` row *before* uploading the file (storage's
   INSERT policy requires a matching row to already exist), which also
   means there's no more storage-rollback-on-DB-failure to attempt — DB
   failure just means the storage upload never happens. A narrowly-scoped
   `storage_delete_own_orphans` DELETE policy (only your own upload, only
   if no `documents`/`document_versions` row references it yet) lets the
   overwrite flow still clean up after itself if its RPC step fails,
   without reopening the ability to delete anyone's real document.
9. Added `UNIQUE(document_id, version_number)` on `document_versions`.
10. Dropped the now-unneeded `assigned_to_legacy_text` compatibility column.

Also fixed: first-time MFA enrollment now cleans up any stale *unverified*
TOTP factor from a previously-abandoned attempt before creating a new one
(so retries don't accumulate orphaned factors); the QR code in `Mfa.tsx` now
renders as a plain `<img src=...>` instead of `dangerouslySetInnerHTML`; the
frontend's `ALLOWED_STATUS_TRANSITIONS` table is now explicitly commented as
a UI mirror of the authoritative copy in the `update_case_status` RPC, with
a pointer to keep them in sync if either changes.

**Still-open, deliberately not attempted here:** the reviewer's suggestion
to move `process_deletion_request()`'s storage cleanup into a service-role
Edge Function instead of deleting `storage.objects` rows directly from a
SECURITY DEFINER SQL function. That's the more "correct for a real
production system" architecture, but this exercise can't stand up a running
Edge Function — the current approach is a documented, working alternative
within pure Postgres, not a silent shortcut. Likewise, audit-log atomicity
for lower-stakes actions (uploads, team/permission edits) is still
best-effort client-side logging, same caveat as the v2 notes above.
