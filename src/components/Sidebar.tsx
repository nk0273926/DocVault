import { useEffect, useState } from 'react';
import { LayoutDashboard, FolderOpen, FileText, Search, Plus, Menu, X, Shield, Users, ClipboardCheck, ClockAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { UserProfile } from '@/components/UserProfile';

export type View =
  | 'dashboard'
  | 'cases'
  | 'my-cases'
  | 'case-detail'
  | 'new-case'
  | 'user-management'
  | 'pending-approvals'
  | 'audit-history';

interface SidebarProps {
  current: View;
  onNavigate: (view: View) => void;
  onNewCase: () => void;
  onGlobalSearch: (query: string) => void;
}

export function Sidebar({ current, onNavigate, onNewCase, onGlobalSearch }: SidebarProps) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setMobileOpen(false);
  }, [current]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onGlobalSearch(value);
  };

  const isAdmin = user?.role === 'admin';

  const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: isAdmin ? 'cases' : 'my-cases', label: isAdmin ? 'Cases' : 'My Cases', icon: FolderOpen },
  ];

  const adminNavItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'user-management', label: 'User Management', icon: Users },
    { id: 'pending-approvals', label: 'Pending Approvals', icon: ClipboardCheck },
    { id: 'audit-history', label: 'Audit History', icon: ClockAlert },
  ];

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-white shadow-md border border-slate-200 text-slate-700"
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed top-0 left-0 h-screen w-72 bg-slate-900 text-slate-100 flex flex-col z-40 transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Shield size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">CaseVault</h1>
            <p className="text-xs text-slate-400">Document Management</p>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search cases..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition"
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = current === item.id || (item.id !== 'dashboard' && current === 'case-detail');
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Admin</div>
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const active = current === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      active ? 'bg-sky-600 text-white shadow-md shadow-sky-900/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
            </>
          )}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800">
          <button
            onClick={onNewCase}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-900/20 transition-all hover:shadow-xl hover:shadow-blue-900/30"
          >
            <Plus size={18} />
            New Case
          </button>
        </div>

        <UserProfile />

        <div className="px-6 py-3 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileText size={14} />
            <span>Secure & Encrypted</span>
          </div>
        </div>
      </aside>
    </>
  );
}
