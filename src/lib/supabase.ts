import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Real Supabase Auth session handling. The prior config disabled session
// persistence/refresh and used the implicit flow, which is what allowed the
// app to run entirely on a fake client-side "session" instead of a real
// authenticated Supabase session. PKCE + persisted, auto-refreshed sessions
// are required so that auth.uid() is meaningful to RLS.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const STORAGE_BUCKET = 'case-documents';

// Re-export canonical types/constants from src/types so existing imports of
// `@/lib/supabase` keep working while there is a single source of truth.
export type { CaseStatus, CasePriority, CaseRecord, CaseTeamMember } from '@/types/case';
export {
  STATUS_LABELS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  PRIORITY_COLORS,
  STATUS_DOT_COLORS,
  PRIORITY_DOT_COLORS,
  ALLOWED_STATUS_TRANSITIONS,
} from '@/types/case';
export type { DocumentStatus, DocumentRecord, DocumentVersion } from '@/types/document';
export type { DeletionRequest, DocumentPermission, GranteeType } from '@/types/permission';
export type { ActivityLog, AuditAction } from '@/types/audit';
export type { UserRole, AppUser } from '@/types/user';
export { ROLE_LABELS, ROLE_COLORS } from '@/types/user';
