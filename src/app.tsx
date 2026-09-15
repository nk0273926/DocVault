import { useEffect, useState } from 'react';
import { Sidebar, type View } from '@/components/sidebar';
import { Dashboard } from '@/components/Dashboard';
import { CasesList } from '@/components/CasesList';
import { CaseDetail } from '@/components/CaseDetail';
import { NewCaseForm } from '@/components/NewCaseForm';
import { UserManagement } from '@/components/UserManagement';
import { PendingApprovals } from '@/components/PendingApprovals';
import { AuditHistory } from '@/components/AuditHistory';
import { Login } from '@/components/Login';
import { Mfa } from '@/components/Mfa';
import { useAuth } from '@/hooks/useAuth';
import { fetchDeletionRequests } from '@/lib/db';

function App() {
  const { user, isAuthenticated, mfaRequired } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const adminOnlyViews: View[] = ['user-management', 'pending-approvals', 'audit-history'];

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchDeletionRequests('pending')
        .then((r) => setPendingApprovalsCount(r.length))
        .catch(() => {});
    } else {
      setPendingApprovalsCount(0);
    }
  }, [user, view]);

  useEffect(() => {
    if (user && adminOnlyViews.includes(view) && user.role !== 'admin') {
      setView('dashboard');
    }
  }, [view, user]);

  if (!isAuthenticated && !mfaRequired) {
    return <Login onLoginSuccess={() => {}} />;
  }

  if (mfaRequired && !isAuthenticated) {
    return (
      <Mfa
        onSuccess={() => {}}
        onCancel={() => {}}
      />
    );
  }

  if (!user) {
    return <Login onLoginSuccess={() => {}} />;
  }

  function openCase(id: string) {
    setSelectedCaseId(id);
    setView('case-detail');
  }

  function navigate(newView: View) {
    setView(newView);
    if (newView !== 'case-detail') setSelectedCaseId(null);
  }

  function startNewCase() {
    setView('new-case');
  }

  function handleGlobalSearch(query: string) {
    setGlobalSearch(query);
    if (query && view !== 'cases' && view !== 'my-cases') {
      setView(user?.role === 'admin' ? 'cases' : 'my-cases');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        current={view}
        onNavigate={navigate}
        onNewCase={startNewCase}
        onGlobalSearch={handleGlobalSearch}
      />

      <main className="lg:ml-72 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {view === 'dashboard' && (
            <Dashboard
              user={user}
              onOpenCase={openCase}
              onNavigateCases={() => setView(user.role === 'admin' ? 'cases' : 'my-cases')}
            />
          )}
          {view === 'cases' && (
            <CasesList
              user={user}
              onOpenCase={openCase}
              onNewCase={startNewCase}
              externalSearch={globalSearch}
              title="All Cases"
            />
          )}
          {view === 'my-cases' && (
            <CasesList
              user={user}
              onOpenCase={openCase}
              onNewCase={startNewCase}
              externalSearch={globalSearch}
              title="My Cases"
              myCasesOnly
            />
          )}
          {view === 'case-detail' && selectedCaseId && (
            <CaseDetail
              user={user}
              caseId={selectedCaseId}
              onBack={() => setView(user.role === 'admin' ? 'cases' : 'my-cases')}
              onAccessDenied={() => setView(user.role === 'admin' ? 'cases' : 'my-cases')}
            />
          )}
          {view === 'new-case' && (
            <NewCaseForm
              user={user}
              onBack={() => setView(user.role === 'admin' ? 'cases' : 'my-cases')}
              onCreated={(caseId) => openCase(caseId)}
            />
          )}
          {view === 'user-management' && user.role === 'admin' && <UserManagement />}
          {view === 'pending-approvals' && user.role === 'admin' && <PendingApprovals user={user} />}
          {view === 'audit-history' && user.role === 'admin' && <AuditHistory />}
        </div>
      </main>
    </div>
  );
}

export default App;
