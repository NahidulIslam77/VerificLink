import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import AuthPage from './pages/AuthPage.jsx';
import CandidateDashboard from './pages/CandidateDashboard.jsx';
import RecruiterDashboard from './pages/RecruiterDashboard.jsx';
import JobBoard from './pages/JobBoard.jsx';
import AssessmentPage from './pages/AssessmentPage.jsx';
import VerifyPage from './pages/VerifyPage.jsx';

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  return user.role === 'recruiter' ? <RecruiterDashboard /> : <CandidateDashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route element={<Layout />}>
        <Route path="/verify/:id" element={<VerifyPage />} />
        <Route path="/" element={<Protected><Home /></Protected>} />
        <Route path="/jobs" element={<Protected role="candidate"><JobBoard /></Protected>} />
        <Route path="/assessment/:id" element={<Protected role="candidate"><AssessmentPage /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
