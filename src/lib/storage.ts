import { supabase, STORAGE_BUCKET } from '@/lib/supabase';

/**
 * Canonical storage path convention (P1 #66): the client never chooses an
 * arbitrary object path. Every object lives at:
 *   cases/{caseId}/documents/{documentId}/{versionId}.{extension}
 * RLS on storage.objects derives the caseId straight from this path
 * (split_part(name, '/', 2)), so a client cannot upload into a case it
 * doesn't have access to no matter what path it requests.
 */
export function buildStoragePath(caseId: string, documentId: string, versionId: string, originalFileName: string): string {
  const extMatch = originalFileName.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  return `cases/${caseId}/documents/${documentId}/${versionId}${ext}`;
}

export async function uploadFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
}

export async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  // Only works for paths storage_delete_own_orphans (security_hardening_v3)
  // actually permits: objects the caller uploaded that no documents/
  // document_versions row references yet (i.e. upload-rollback scenarios).
  // It will fail — correctly — for any real, already-referenced document.
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
  if (error) throw error;
}

/**
 * Private-bucket downloads only ever happen through a short-lived signed URL
 * (P0 #31, P1 #57). The bucket has `public = false`; RLS on storage.objects
 * still applies to signed-URL creation, so a user without access to the
 * underlying case cannot mint a working URL even if they call this directly.
 */
export async function getSignedDownloadUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Failed to create signed URL');
  return data.signedUrl;
}
