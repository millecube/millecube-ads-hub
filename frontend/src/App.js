import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar    from './components/Sidebar';
import Dashboard  from './pages/Dashboard';
import Clients    from './pages/Clients';
import Generate   from './pages/Generate';
import Schedules  from './pages/Schedules';
import History    from './pages/History';
import Settings   from './pages/Settings';
import Login      from './pages/Login';
import { ToastProvider }   from './hooks/useToast';
import { AuthProvider, useAuth }     from './context/AuthContext';
import { ThemeProvider }   from './context/ThemeContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';

function Layout({ children }) {
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
        transition: 'margin-left 0.25s ease',
        background: 'var(--bg)',
      }} className="main-content">
        {/* Mobile hamburger */}
        <button onClick={openMobile} className="hamburger" aria-label="Open menu">☰</button>
        {children}
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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SidebarProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login"      element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/clients"    element={<ProtectedRoute><Clients /></ProtectedRoute>} />
                <Route path="/generate"   element={<ProtectedRoute><Generate /></ProtectedRoute>} />
                <Route path="/schedules"  element={<ProtectedRoute><Schedules /></ProtectedRoute>} />
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
