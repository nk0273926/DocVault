import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AccessDenied } from '@/components/AccessDenied';
interface RoleGuardProps {
  roles: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ roles, children, fallback }: RoleGuardProps) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return <>{fallback ?? <AccessDenied />}</>;
  }
  return <>{children}</>;
}
