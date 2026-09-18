import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, BarChart2, Settings, Bot, CreditCard,
  Hash, LogOut, Zap, PhoneCall, Book, Shield, X, MessageSquare
} from 'lucide-react';

const NAV = [
  { section: 'Overview', items: [
    { to: '/dashboard', Icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/analytics', Icon: BarChart2,       label: 'Analytics' },
  ]},
  { section: 'Voice AI', items: [
    { to: '/assistants', Icon: Bot,           label: 'Assistants' },
    { to: '/campaigns',  Icon: Zap,           label: 'Campaigns' },
    { to: '/leads',      Icon: Users,         label: 'Leads' },
    { to: '/history',    Icon: PhoneCall,     label: 'Call History' },
    { to: '/messages',   Icon: MessageSquare, label: 'Messages' },
  ]},
  { section: 'Configure', items: [
    { to: '/knowledge', Icon: Book,      label: 'Knowledge Base' },
    { to: '/numbers',   Icon: Hash,      label: 'Numbers' },
    { to: '/billing',   Icon: CreditCard,label: 'Billing' },
    { to: '/settings',  Icon: Settings,  label: 'Settings' },
  ]},
];

export default function Sidebar({ isOpen, onClose }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const nav = useNavigate();

  function isActive(to) {
    return pathname === to || (to !== '/dashboard' && pathname.startsWith(to));
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] || 'U').toUpperCase();

  const balance = user?.credit_balance ?? 0;
  const isAdmin = user?.is_admin;

  function handleLinkClick() {
    if (onClose) onClose();
  }

  return (
    <aside className={`vx-sidebar${isOpen ? ' open' : ''}`}>

      {/* Brand row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 18, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
        <Link
          to="/dashboard"
          onClick={handleLinkClick}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flex: 1 }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--grad-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#fff', flexShrink: 0,
          }}>V</div>
          <div>
            <div className="vx-side-brand-name">Velryx</div>
            <div style={{ fontSize: 10, color: 'var(--ink-300)', marginTop: 1, letterSpacing: '0.03em' }}>AI Voice Platform</div>
          </div>
        </Link>
        {/* Close button — only visible on mobile */}
        <button className="btn btn-ghost btn-icon vx-sidebar-close" onClick={onClose} title="Close menu">
          <X size={16} />
        </button>
      </div>

      {/* Nav sections */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV.map(section => (
          <div key={section.section}>
            <div className="vx-side-section">{section.section}</div>
            {section.items.map(item => (
              <Link
                key={item.to}
                to={item.to}
                onClick={handleLinkClick}
                className={`vx-side-link${isActive(item.to) ? ' active' : ''}`}
              >
                <item.Icon size={15} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
        {isAdmin && (
          <div>
            <div className="vx-side-section">Admin</div>
            <Link
              to="/admin"
              onClick={handleLinkClick}
              className={`vx-side-link${pathname === '/admin' ? ' active' : ''}`}
            >
              <Shield size={15} />
              Admin Panel
            </Link>
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="vx-side-footer">
        <div className="vx-user">
          <div className="vx-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || user?.email || 'User'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-300)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
              {user?.email}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { logout(); nav('/login'); }} title="Sign out" style={{ flexShrink: 0 }}>
            <LogOut size={13} />
          </button>
        </div>
        <div
          className="vx-side-link"
          onClick={() => { nav('/billing'); handleLinkClick(); }}
          style={{
            marginTop: 6, justifyContent: 'center', gap: 6, fontWeight: 600, cursor: 'pointer',
            background: 'linear-gradient(135deg, rgba(230,57,70,0.10), rgba(244,178,51,0.10))',
            border: '1px solid rgba(230,57,70,0.20)', borderRadius: 10,
          }}
        >
          <CreditCard size={11} />
          ₹{Number(balance).toFixed(0)} credits
        </div>
      </div>
    </aside>
  );
}
