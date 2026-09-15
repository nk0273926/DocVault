import { useState } from 'react';
import { Shield, KeyRound, AlertCircle, ArrowRight, QrCode } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface MfaProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function Mfa({ onSuccess, onCancel }: MfaProps) {
  const { verifyMfa, cancelMfa, mfaEnrollment } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await verifyMfa(code);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Verification failed');
      return;
    }
    onSuccess();
  }

  async function handleCancel() {
    await cancelMfa();
    onCancel();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-xl shadow-blue-900/40 mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CaseVault</h1>
          <p className="text-sm text-slate-400 mt-1">Two-Factor Authentication</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              {mfaEnrollment ? <QrCode size={20} className="text-amber-600" /> : <KeyRound size={20} className="text-amber-600" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{mfaEnrollment ? 'Set Up Authenticator' : 'Verification Required'}</h2>
              <p className="text-sm text-slate-500">
                {mfaEnrollment ? 'Admin accounts require an authenticator app' : 'Enter the code from your authenticator app'}
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mfaEnrollment && (
            <div className="mb-5 space-y-3">
              <p className="text-xs text-slate-500">
                Scan this QR code with an authenticator app (e.g. Google Authenticator, 1Password, Authy), then enter the
                6-digit code it shows below to finish enrolling this device.
              </p>
              <div className="flex justify-center p-3 bg-white border border-slate-200 rounded-lg">
                {/* Supabase returns the enrollment QR as a data: URI (SVG or
                    PNG depending on version) — rendered as a plain image,
                    not injected as HTML. */}
                <img src={mfaEnrollment.qrCode} alt="Scan with your authenticator app" width={200} height={200} />
              </div>
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-medium text-slate-600">Can't scan? Enter this key manually</summary>
                <p className="mt-1.5 font-mono break-all bg-slate-50 border border-slate-100 rounded px-2 py-1.5">{mfaEnrollment.secret}</p>
              </details>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Security Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full px-4 py-3 text-2xl font-mono text-center tracking-[0.5em] border border-slate-200 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition shadow-lg"
            >
              {loading ? 'Verifying...' : mfaEnrollment ? 'Confirm & Finish Setup' : 'Verify & Continue'}
              {!loading && <ArrowRight size={16} />}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="w-full px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition"
            >
              Back to login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
