/*
# Storage Bucket for Case Documents

## Overview
Creates a public storage bucket named 'case-documents' for uploading and
retrieving case-related files (PDFs, images, documents).

## Changes
- Insert a row into storage.buckets if it does not exist.
- Add storage policies allowing anon + authenticated to CRUD objects in the bucket.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('case-documents', 'case-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "anon_upload_case_docs" ON storage.objects;
CREATE POLICY "anon_upload_case_docs" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'case-documents');

DROP POLICY IF EXISTS "anon_read_case_docs" ON storage.objects;
CREATE POLICY "anon_read_case_docs" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'case-documents');

DROP POLICY IF EXISTS "anon_update_case_docs" ON storage.objects;
CREATE POLICY "anon_update_case_docs" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'case-documents')
  WITH CHECK (bucket_id = 'case-documents');

DROP POLICY IF EXISTS "anon_delete_case_docs" ON storage.objects;
CREATE POLICY "anon_delete_case_docs" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'case-documents');