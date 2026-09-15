export type UserRole = 'admin' | 'investigator' | 'officer' | 'analyst';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  investigator: 'Investigator',
  officer: 'Officer',
  analyst: 'Analyst',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-800 border-red-200',
  investigator: 'bg-sky-100 text-sky-800 border-sky-200',
  officer: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  analyst: 'bg-amber-100 text-amber-800 border-amber-200',
};
