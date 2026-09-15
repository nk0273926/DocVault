import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from '@/types/user';

export function UserProfile() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="border-t border-slate-800 px-4 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-sm font-semibold text-white shrink-0">
          {user.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${ROLE_COLORS[user.role as UserRole]}`}>
          {ROLE_LABELS[user.role as UserRole]}
        </span>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </div>
  );
}
