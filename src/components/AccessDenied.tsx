import { Shield, ArrowLeft } from 'lucide-react';

interface AccessDeniedProps {
  message?: string;
  onBack?: () => void;
}

export function AccessDenied({ message, onBack }: AccessDeniedProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <Shield size={32} className="text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
      <p className="text-sm text-slate-500 text-center max-w-md mb-6">
        {message || 'You do not have permission to perform this action.'}
      </p>
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-600 hover:text-sky-700 transition"
        >
          <ArrowLeft size={16} />
          Go back
        </button>
      )}
    </div>
  );
}
