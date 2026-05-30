import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { settingsAPI } from './utils/api';
import Sidebar    from './components/Sidebar';
import Dashboard  from './pages/Dashboard';
import Clients    from './pages/Clients';
import Generate   from './pages/Generate';
import Schedules  from './pages/Schedules';
import History    from './pages/History';
import Settings    from './pages/Settings';
import AdsMonitor       from './pages/AdsMonitor';
import PerformanceTable from './pages/PerformanceTable';
import CompareMonitor   from './pages/CompareMonitor';
import BudgetManager from './pages/BudgetManager';
import Login         from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Header        from './components/Header';
import { ToastProvider }   from './hooks/useToast';
import { AuthProvider, useAuth }     from './context/AuthContext';
import { ThemeProvider }   from './context/ThemeContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';

const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
};

function Layout({ children }) {
  const location = useLocation();
  const { collapsed, mobileOpen, openMobile, closeMobile } = useSidebar();
  const sidebarW = collapsed ? 64 : 220;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div onClick={closeMobile} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 99
        }} />
      )}

      <Sidebar />

      <main style={{
        marginLeft: sidebarW,
        flex: 1,
        minHeight: '100vh',
        overflowX: 'hidden',
        transition: 'margin-left 0.28s cubic-bezier(0.4,0,0.2,1)',
        background: 'var(--bg)',
      }} className="main-content">
        {/* Mobile hamburger */}
        <button onClick={openMobile} className="hamburger" aria-label="Open menu">☰</button>
        <Header />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={PAGE_TRANSITION.initial}
            animate={PAGE_TRANSITION.animate}
            exit={PAGE_TRANSITION.exit}
            transition={PAGE_TRANSITION.transition}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function FaviconLoader() {
  useEffect(() => {
    settingsAPI.getPublic().then(({ logo }) => {
      if (!logo) return;
      const link = document.getElementById('app-favicon');
      if (link) link.href = logo;
    }).catch(() => {});
  }, []);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SidebarProvider>
          <ToastProvider>
            <BrowserRouter>
              <FaviconLoader />
              <Routes>
                <Route path="/login"          element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/monitor"      element={<ProtectedRoute><AdsMonitor /></ProtectedRoute>} />
                <Route path="/performance" element={<ProtectedRoute><PerformanceTable /></ProtectedRoute>} />
                <Route path="/compare"     element={<ProtectedRoute><CompareMonitor /></ProtectedRoute>} />
                <Route path="/clients"    element={<ProtectedRoute><Clients /></ProtectedRoute>} />
                <Route path="/generate"   element={<ProtectedRoute><Generate /></ProtectedRoute>} />
                <Route path="/schedules"  element={<ProtectedRoute><Schedules /></ProtectedRoute>} />
                <Route path="/budget"     element={<ProtectedRoute><BudgetManager /></ProtectedRoute>} />
                <Route path="/history"    element={<ProtectedRoute><History /></ProtectedRoute>} />
                <Route path="/settings"   element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </SidebarProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
