/*
# Secure Case Document Management System — Schema

## Overview
Creates the core tables for a case and document management system: cases,
documents, and activity logs. Designed for a single-tenant deployment (no
sign-in screen) so that the anon-key frontend can read and write its own data.

## New Tables

### cases
- id (uuid, PK)
- case_number (text, unique) — human-readable reference like "CASE-2026-001"
- title (text, not null)
- description (text)
- status (text, default 'open') — open | in_review | closed | archived
- priority (text, default 'medium') — low | medium | high | critical
- category (text) — e.g. litigation, compliance, investigation
- client_name (text)
- assigned_to (text)
- tags (text[]) — optional labels
- due_date (date)
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### documents
- id (uuid, PK)
- case_id (uuid, FK to cases.id, ON DELETE CASCADE)
- name (text, not null) — original file name
- file_path (text, not null) — storage object path
- file_type (text) — mime type
- file_size (bigint) — bytes
- category (text) — e.g. contract, evidence, correspondence, pleading
- status (text, default 'active') — active | archived | deleted
- version (integer, default 1)
- uploaded_by (text)
- created_at (timestamptz, default now())

### activity_logs
- id (uuid, PK)
- case_id (uuid, FK to cases.id, ON DELETE CASCADE)
- action (text, not null) — e.g. case_created, document_uploaded, status_changed
- description (text)
- performed_by (text)
- metadata (jsonb)
- created_at (timestamptz, default now())

## Security
- RLS enabled on all three tables.
- Policies use TO anon, authenticated (single-tenant, no sign-in screen).
- All CRUD allowed for anon + authenticated since data is intentionally shared.
*/

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','closed','archived')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  category text DEFAULT '',
  client_name text DEFAULT '',
  assigned_to text DEFAULT '',
  tags text[] DEFAULT '{}',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cases" ON cases;
CREATE POLICY "anon_select_cases" ON cases FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cases" ON cases;
CREATE POLICY "anon_insert_cases" ON cases FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cases" ON cases;
CREATE POLICY "anon_update_cases" ON cases FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cases" ON cases;
CREATE POLICY "anon_delete_cases" ON cases FOR DELETE
  TO anon, authenticated USING (true);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  file_type text DEFAULT '',
  file_size bigint DEFAULT 0,
  category text DEFAULT 'general',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  version integer NOT NULL DEFAULT 1,
  uploaded_by text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_documents" ON documents;
CREATE POLICY "anon_select_documents" ON documents FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_documents" ON documents;
CREATE POLICY "anon_insert_documents" ON documents FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_documents" ON documents;
CREATE POLICY "anon_update_documents" ON documents FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_documents" ON documents;
CREATE POLICY "anon_delete_documents" ON documents FOR DELETE
  TO anon, authenticated USING (true);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  description text DEFAULT '',
  performed_by text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_activity_logs" ON activity_logs;
CREATE POLICY "anon_select_activity_logs" ON activity_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_activity_logs" ON activity_logs;
CREATE POLICY "anon_insert_activity_logs" ON activity_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_activity_logs" ON activity_logs;
CREATE POLICY "anon_delete_activity_logs" ON activity_logs FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_priority ON cases(priority);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_case_id ON activity_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Auto-update updated_at on cases
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_updated_at ON cases;
CREATE TRIGGER cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate case_number on insert
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    SELECT 'CASE-' || EXTRACT(YEAR FROM now())::text || '-' ||
           LPAD((COALESCE((SELECT COUNT(*) FROM cases), 0) + 1)::text, 4, '0')
    INTO NEW.case_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cases_case_number ON cases;
CREATE TRIGGER cases_case_number BEFORE INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION generate_case_number();