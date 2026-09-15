import { useState } from 'react';
import { Shield, Mail, Lock, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { DEMO_CREDENTIALS } from '@/data/mockUsers';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(identifier, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
      setLoading(false);
      return;
    }
    if (result.requiresMfa) {
      setLoading(false);
      return;
    }
    onLoginSuccess();
    setLoading(false);
  }

  function fillDemo(email: string, password: string) {
    setIdentifier(email);
    setPassword(password);
    setError('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-xl shadow-blue-900/40 mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CaseVault</h1>
          <p className="text-sm text-slate-400 mt-1">Secure Case & Document Management</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Sign In</h2>
          <p className="text-sm text-slate-500 mb-6">Enter your credentials to access the system</p>

          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@casevault.com"
                  className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition shadow-lg shadow-blue-900/10"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Demo Accounts — Click to fill</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_CREDENTIALS.map((cred) => {
                const demoButtonClass =
                  cred.role === 'Admin'
                    ? 'border-sky-200 bg-sky-50 hover:bg-sky-100'
                    : cred.role === 'Manager'
                      ? 'border-violet-200 bg-violet-50 hover:bg-violet-100'
                      : cred.role === 'Analyst'
                        ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100';

                return (
                  <button
                    key={cred.role}
                    onClick={() => fillDemo(cred.email, cred.password)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border text-left transition hover:shadow-sm ${demoButtonClass}`}
                  >
                    <p className="font-semibold text-slate-700">{cred.role}</p>
                    <p className="text-slate-500 truncate">{cred.email}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Admin accounts require MFA verification after password entry.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          CaseVault Secure Document Management System
        </p>
      </div>
    </div>
  );
}
