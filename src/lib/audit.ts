import { supabase } from '@/lib/supabase';
import type { AuditAction } from '@/types/audit';

/**
 * Writes an audit event. `performedByUserId` must be the caller's own
 * auth.uid() — RLS on activity_logs (`performed_by_user_id = auth.uid()`)
 * rejects any insert that tries to claim a different actor, so this function
 * cannot be used to forge audit entries (P0 #25) even if a caller passes the
 * wrong id by mistake.
 */
export async function logActivity(params: {
  caseId: string | null;
  action: AuditAction | string;
  description: string;
  performedByName: string;
  performedByUserId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('activity_logs').insert({
    case_id: params.caseId,
    action: params.action,
    description: params.description,
    performed_by: params.performedByName,
    performed_by_user_id: params.performedByUserId,
    metadata: params.metadata ?? {},
  });
  if (error) {
    // Known limitation: this write is not transactional with the operation
    // that triggered it (P2 #70/#29). The highest-stakes operations —
    // approving/rejecting deletions, status changes, and document
    // versioning — do NOT use this function; they run as SQL RPCs
    // (process_deletion_request / update_case_status / overwrite_document /
    // restore_document_version) where the data change and its audit row
    // are written in the same Postgres transaction and cannot diverge.
    // Lower-stakes actions (uploads, team/permission edits, login/logout)
    // still log via this best-effort client call, so a network blip here
    // could in principle leave an action unlogged. Surfaced loudly so it's
    // not silently lost during development; moving these onto RPCs too is
    // the natural next step if that gap matters for your deployment.
    console.error('Failed to write audit log:', error);
  }
}
