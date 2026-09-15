import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

import type { AppUser, UserRole } from '@/types/user';
import { DEMO_CREDENTIALS } from '@/data/mockUsers';

interface AuthState {
  user: AppUser | null;
  pendingMfaUser: AppUser | null;
  mfaEnrollment: { qrCode: string; secret: string } | null;
  isAuthenticated: boolean;
  mfaRequired: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (
    email: string,
    password: string
  ) => Promise<{
    success: boolean;
    requiresMfa: boolean;
    error?: string;
  }>;

  verifyMfa: (
    code: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  cancelMfa: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [pendingMfaUser, setPendingMfaUser] =
    useState<AppUser | null>(null);

  const [mfaEnrollment, setMfaEnrollment] =
    useState<{ qrCode: string; secret: string } | null>(null);

  const [loading, setLoading] = useState(true);

  // Restore local session when page refreshes
  useEffect(() => {
    try {
      const savedUser = sessionStorage.getItem('casevault_user');

      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      sessionStorage.removeItem('casevault_user');
    } finally {
      setLoading(false);
    }
  }, []);

  // Local demo login
  const login = useCallback(
    async (email: string, password: string) => {
      const foundUser = DEMO_CREDENTIALS.find(
        (demoUser) =>
          demoUser.email.toLowerCase() === email.toLowerCase() &&
          demoUser.password === password
      );

      if (!foundUser) {
        return {
          success: false,
          requiresMfa: false,
          error: 'Invalid login credentials',
        };
      }

      const localUser: AppUser = {
        id: foundUser.id,
        name: foundUser.name,
        email: foundUser.email,
        role: foundUser.role.toLowerCase() as UserRole,
      };

      // Save user locally
      sessionStorage.setItem(
        'casevault_user',
        JSON.stringify(localUser)
      );

      setUser(localUser);

      return {
        success: true,
        requiresMfa: false,
      };
    },
    []
  );

  // MFA disabled for local demo authentication
  const verifyMfa = useCallback(async (_code: string) => {
    return {
      success: false,
      error: 'MFA is not enabled for local demo accounts.',
    };
  }, []);

  const cancelMfa = useCallback(async () => {
    setPendingMfaUser(null);
    setMfaEnrollment(null);
  }, []);

  const logout = useCallback(async () => {
    sessionStorage.removeItem('casevault_user');

    setUser(null);
    setPendingMfaUser(null);
    setMfaEnrollment(null);
  }, []);

  const value: AuthContextValue = {
    user,
    pendingMfaUser,
    mfaEnrollment,
    isAuthenticated: !!user,
    mfaRequired: false,
    loading,
    login,
    verifyMfa,
    cancelMfa,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      'useAuthContext must be used within AuthProvider'
    );
  }

  return ctx;
}