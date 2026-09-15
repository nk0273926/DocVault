import { useAuth } from './useAuth';

export function usePermissions() {
  const { user, isAuthenticated } = useAuth();

  const role = user?.role;
  const isAdmin = role === 'admin';
  const isInvestigator = role === 'investigator';
  const isOfficer = role === 'officer';
  const isAnalyst = role === 'analyst';

  return {
    user,
    isAuthenticated,
    isAdmin,
    isInvestigator,
    isOfficer,
    isAnalyst,
    canCreateCase: isAdmin || isInvestigator,
    canManageUsers: isAdmin,
    canManageTeam: isAdmin,
    canViewAuditHistory: isAdmin,
    canViewAllCases: isAdmin,
  };
}
