import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Clients    from './pages/Clients';
import Generate   from './pages/Generate';
import Schedules  from './pages/Schedules';
import History    from './pages/History';
import { ToastProvider } from './hooks/useToast';

function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{
        marginLeft: 220,
        flex: 1,
        minHeight: '100vh',
        overflowX: 'hidden',
      }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/clients"   element={<Clients />} />
            <Route path="/generate"  element={<Generate />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/history"   element={<History />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ToastProvider>
  );
}
