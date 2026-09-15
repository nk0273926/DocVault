import { useEffect, useState } from 'react';
import { ClipboardCheck, Check, X, Clock, FileText, FolderOpen, AlertCircle } from 'lucide-react';
import { fetchDeletionRequests, approveDeletion, rejectDeletion } from '@/lib/db';
import type { DeletionRequest } from '@/types/permission';
import type { AppUser } from '@/types/user';
import { formatDateTime } from '@/lib/format';
import { canApproveDeletion } from '@/lib/permissions';

interface PendingApprovalsProps {
  user: AppUser;
}

export function PendingApprovals({ user }: PendingApprovalsProps) {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchDeletionRequests(filter === 'pending' ? 'pending' : undefined);
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(req: DeletionRequest) {
    if (!confirm(`Approve permanent deletion of "${req.target_name}"? This action cannot be undone.`)) return;
    setError('');
    try {
      await approveDeletion(req.id);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    }
  }

  async function handleReject(req: DeletionRequest) {
    setError('');
    try {
      await rejectDeletion(req.id);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Pending Approvals</h2>
          <p className="text-sm text-slate-500 mt-1">Review permanent deletion requests from other admins</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <Clock size={18} className="text-amber-600" />
            <span className="text-sm font-medium text-amber-800">{pendingCount} pending</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${filter === 'pending' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${filter === 'all' ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          All Requests
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">Loading requests...</div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
          <ClipboardCheck size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600 mb-1">No deletion requests</p>
          <p className="text-xs text-slate-400">
            {filter === 'pending' ? 'There are no pending deletion requests to review' : 'No deletion requests have been made'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const canApprove = canApproveDeletion(user, req);
            const isPending = req.status === 'pending';

            return (
              <div key={req.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${req.target_type === 'case' ? 'bg-orange-50' : 'bg-red-50'}`}>
                    {req.target_type === 'case' ? <FolderOpen size={20} className="text-orange-600" /> : <FileText size={20} className="text-red-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-slate-800">{req.target_name}</p>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                          req.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                      >
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {req.target_type === 'case' ? 'Case deletion' : 'Document deletion'} · Requested by{' '}
                      <strong>{req.requested_by_name}</strong> on {formatDateTime(req.created_at)}
                    </p>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-slate-400 font-medium mb-0.5">Reason</p>
                      <p className="text-sm text-slate-600">{req.request_reason}</p>
                    </div>
                    {req.reviewed_by_name && (
                      <p className="text-xs text-slate-400 mt-2">
                        {req.status === 'approved' ? 'Approved' : 'Rejected'} by {req.reviewed_by_name}
                        {req.reviewed_at && ` on ${formatDateTime(req.reviewed_at)}`}
                      </p>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={!canApprove}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-medium rounded-lg transition"
                        title={canApprove ? 'Approve deletion' : 'You cannot approve your own request'}
                      >
                        <Check size={14} />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(req)}
                        disabled={!canApprove}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg transition"
                      >
                        <X size={14} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                {isPending && !canApprove && (
                  <p className="text-xs text-slate-400 mt-3 text-center">
                    You cannot approve your own deletion request. Another admin must review it.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
