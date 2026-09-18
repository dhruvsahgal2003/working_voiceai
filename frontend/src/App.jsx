import { Component, lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/Sidebar';
import { Bell, Plus, Menu } from 'lucide-react';

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '2rem', background: '#f9fafb', minHeight: '100vh', color: '#dc2626', fontFamily: 'monospace' }}>
        <h2 style={{ color: '#dc2626', marginBottom: 16 }}>Page Error</h2>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#7f1d1d', fontSize: 13, background: '#fee2e2', padding: 16, borderRadius: 12 }}>
          {this.state.error.message}{'\n\n'}{this.state.error.stack}
        </pre>
        <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px' }}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}

import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import About from './pages/About';
import Pricing from './pages/Pricing';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Leads from './pages/Leads';
import Assistants from './pages/Assistants';
import CallHistory from './pages/CallHistory';
import Messages from './pages/Messages';
import Analytics from './pages/Analytics';
import Billing from './pages/Billing';
import Events from './pages/Events';
import Numbers from './pages/Numbers';
import Settings from './pages/Settings';
import DNC from './pages/DNC';
import KnowledgeBase from './pages/KnowledgeBase';
import Admin from './pages/Admin';
import AuthCallback from './pages/AuthCallback';

const PageSpinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
    <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
  </div>
);

const PAGE_META = {
  '/dashboard':  { title: 'Dashboard',      sub: 'Real-time overview of your calling campaigns' },
  '/analytics':  { title: 'Analytics',      sub: 'Deeper trends and cohort performance' },
  '/assistants': { title: 'Assistants',     sub: 'AI voice agents on your account' },
  '/campaigns':  { title: 'Campaigns',      sub: 'Outbound calling campaigns' },
  '/leads':      { title: 'Leads',          sub: 'All uploaded contacts' },
  '/history':    { title: 'Call History',   sub: 'Every call with transcript & recording' },
  '/messages':   { title: 'Messages',       sub: 'WhatsApp conversations with your leads' },
  '/knowledge':  { title: 'Knowledge Base', sub: 'Documents your assistants can read from' },
  '/numbers':    { title: 'Numbers',        sub: 'Phone numbers connected to your account' },
  '/billing':    { title: 'Billing',        sub: 'Credits, invoices, top-ups' },
  '/settings':   { title: 'Settings',       sub: 'Profile, credentials, notifications' },
  '/dnc':        { title: 'DNC List',       sub: 'Do Not Call registry management' },
  '/events':     { title: 'Events',         sub: 'Webhook events and logs' },
  '/admin':      { title: 'Admin',          sub: 'Platform administration' },
};

function Topbar({ onMenuClick }) {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] || { title: 'Velryx', sub: '' };
  return (
    <header className="vx-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-icon vx-hamburger" onClick={onMenuClick} title="Menu">
          <Menu size={18} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 className="vx-page-title">{meta.title}</h1>
          {meta.sub && <div className="vx-page-sub">{meta.sub}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-secondary btn-icon" title="Notifications">
          <Bell size={14} />
        </button>
        <button className="btn btn-primary btn-sm vx-new-campaign-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> <span className="vx-btn-label">New campaign</span>
        </button>
      </div>
    </header>
  );
}

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="vx-orbs" style={{ display: 'flex', minHeight: '100vh', position: 'relative' }}>
      <span className="vx-orb" />
      {/* Overlay — closes sidebar on mobile */}
      <div
        className={`vx-sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <Topbar onMenuClick={() => setSidebarOpen(o => !o)} />
        <div className="vx-page-content">
          <ErrorBoundary key={window.location.pathname}>
            <motion.div
              key={window.location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </ErrorBoundary>
        </div>
        <footer className="vx-app-footer">
          Powered by{' '}
          <a href="https://dhruvsahgal.in" target="_blank" rel="noreferrer" className="vx-footer-link">
            Dhruv Sahgal
          </a>
        </footer>
      </main>
    </div>
  );
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Marketing */}
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/pricing" element={<Pricing />} />

          {/* Auth */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* App */}
          <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
          <Route path="/assistants" element={<ProtectedLayout><Assistants /></ProtectedLayout>} />
          <Route path="/campaigns" element={<ProtectedLayout><Campaigns /></ProtectedLayout>} />
          <Route path="/leads" element={<ProtectedLayout><Leads /></ProtectedLayout>} />
          <Route path="/history" element={<ProtectedLayout><CallHistory /></ProtectedLayout>} />
          <Route path="/calls" element={<Navigate to="/history" replace />} />
          <Route path="/messages" element={<ProtectedLayout><Messages /></ProtectedLayout>} />
          <Route path="/analytics" element={<ProtectedLayout><Analytics /></ProtectedLayout>} />
          <Route path="/knowledge" element={<ProtectedLayout><KnowledgeBase /></ProtectedLayout>} />
          <Route path="/billing" element={<ProtectedLayout><Billing /></ProtectedLayout>} />
          <Route path="/events" element={<ProtectedLayout><Events /></ProtectedLayout>} />
          <Route path="/numbers" element={<ProtectedLayout><Numbers /></ProtectedLayout>} />
          <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
          <Route path="/dnc" element={<ProtectedLayout><DNC /></ProtectedLayout>} />

          {/* Admin */}
          <Route path="/admin" element={<AdminRoute><ProtectedLayout><Admin /></ProtectedLayout></AdminRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ToastProvider>
  );
}
