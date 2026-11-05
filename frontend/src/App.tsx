import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { IncidentExplorer } from './pages/IncidentExplorer';
import { IncidentDetails } from './pages/IncidentDetails';
import { RemediationCenter } from './pages/RemediationCenter';
import { EvidenceExplorer } from './pages/EvidenceExplorer';
import { ServiceMap } from './pages/ServiceMap';
import { KnowledgeBase } from './pages/KnowledgeBase';
import { EvaluationCenter } from './pages/EvaluationCenter';
import { Settings } from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-mono text-xs text-slate-400">
        Authenticating SRE Session...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="incidents" element={<IncidentExplorer />} />
              <Route path="incidents/:id" element={<IncidentDetails />} />
              <Route path="remediations" element={<RemediationCenter />} />
              <Route path="evidence" element={<EvidenceExplorer />} />
              <Route path="services" element={<ServiceMap />} />
              <Route path="knowledge" element={<KnowledgeBase />} />
              <Route path="evaluations" element={<EvaluationCenter />} />
              <Route path="audit" element={<RemediationCenter />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
