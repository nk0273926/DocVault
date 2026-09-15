export type CaseStatus = 'open' | 'in_review' | 'solved' | 'closed' | 'archived';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface CaseRecord {
  id: string;
  case_number: string;
  title: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  category: string;
  client_name: string;
  // Real identity now (uuid referencing auth.users), not free text — kept
  // in sync with case_team_members by a DB trigger so "assigned" always
  // implies "has access" (previously a name typed here didn't grant
  // anything). Resolve the display name via the case's team members list.
  assigned_to: string | null;
  tags: string[];
  due_date: string | null;
  // Canonical ownership field. Do NOT use created_at for authorization —
  // that is a timestamp, not a user id. Use created_by everywhere.
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CaseTeamMember {
  id: string;
  case_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  can_view: boolean;
  can_upload: boolean;
  can_edit: boolean;
  can_download: boolean;
  added_at: string;
}

export const STATUS_LABELS: Record<CaseStatus, string> = {
  open: 'Open',
  in_review: 'In Review',
  solved: 'Solved',
  closed: 'Closed',
  archived: 'Archived',
};

export const PRIORITY_LABELS: Record<CasePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const STATUS_COLORS: Record<CaseStatus, string> = {
  open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  in_review: 'bg-amber-100 text-amber-800 border-amber-200',
  solved: 'bg-blue-100 text-blue-800 border-blue-200',
  closed: 'bg-slate-100 text-slate-700 border-slate-200',
  archived: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const PRIORITY_COLORS: Record<CasePriority, string> = {
  low: 'bg-sky-100 text-sky-800 border-sky-200',
  medium: 'bg-slate-100 text-slate-700 border-slate-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

export const STATUS_DOT_COLORS: Record<CaseStatus, string> = {
  open: 'bg-emerald-500',
  in_review: 'bg-amber-500',
  solved: 'bg-blue-500',
  closed: 'bg-slate-400',
  archived: 'bg-gray-400',
};

export const PRIORITY_DOT_COLORS: Record<CasePriority, string> = {
  low: 'bg-sky-500',
  medium: 'bg-slate-400',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

/** Allowed case status transitions (P1 #56), mirrored here for responsive
 * UI (which options to show/enable). The DATABASE is authoritative: the
 * `update_case_status(case_id, new_status)` RPC
 * (supabase/migrations/20260823130000_security_hardening_v2.sql) has its
 * own copy of this exact transition table and re-validates server-side
 * against the real current status — a client can never bypass it by
 * lying about the current status or skipping this check. If you change
 * the allowed transitions, update BOTH copies; this one only controls
 * what the UI offers, not what's actually permitted. */
export const ALLOWED_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ['in_review', 'solved', 'closed', 'archived'],
  in_review: ['open', 'solved', 'closed', 'archived'],
  solved: ['open', 'closed', 'archived'], // reopening a solved case is explicit
  closed: ['open', 'archived'],
  archived: ['open'],
};
