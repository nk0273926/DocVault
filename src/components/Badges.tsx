import {
  type CaseStatus, type CasePriority, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS,
  STATUS_DOT_COLORS, PRIORITY_DOT_COLORS,
} from '@/types/case';
import { type UserRole, ROLE_LABELS, ROLE_COLORS } from '@/types/user';

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${STATUS_COLORS[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_COLORS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${PRIORITY_COLORS[priority]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT_COLORS[priority]}`} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border ${ROLE_COLORS[role]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}
