/*
 * These are DISPLAY-ONLY labels for the login screen's "demo accounts"
 * shortcut buttons. They do NOT authenticate anyone — real authentication is
 * Supabase Auth (see src/context/AuthContext.tsx). For these buttons to log
 * a user in, an account with this exact email/password must actually exist
 * in Supabase Auth, with a matching row in `profiles` (id, name, email,
 * role) that was created/promoted by an admin. See supabase/seed.sql or the
 * Supabase dashboard's Authentication > Users screen to provision them.
 *
 * Never reuse these passwords in a real deployment.
 */
export const mockUsers = [
  {
    id: "admin-1",
    name: "System Admin",
    email: "admin@casevault.com",
    password: "Admin@123",
    role: "ADMIN",
    requiresMFA: true,
  },
  {
    id: "investigator-1",
    name: "Investigator User",
    email: "investigator@casevault.com",
    password: "Investigator@123",
    role: "INVESTIGATOR",
    requiresMFA: false,
  },
  {
    id: "officer-1",
    name: "Officer User",
    email: "officer@casevault.com",
    password: "Officer@123",
    role: "OFFICER",
    requiresMFA: false,
  },
  {
    id: "analyst-1",
    name: "Analyst User",
    email: "analyst@casevault.com",
    password: "Analyst@123",
    role: "ANALYST",
    requiresMFA: false,
  },
];
export const DEMO_CREDENTIALS = mockUsers;
