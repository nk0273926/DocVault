import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

interface PermissionGuardProps {
  allowed: boolean;
  children: ReactNode;
  fallback?: ReactNode;
  message?: string;
}

export function PermissionGuard({ allowed, children, fallback, message }: PermissionGuardProps) {
  if (!allowed) {
    return (
      <>{fallback ?? (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
          <Lock size={14} />
          {message || 'You do not have permission to perform this action.'}
        </div>
      )}</>
    );
  }
  return <>{children}</>;
}
