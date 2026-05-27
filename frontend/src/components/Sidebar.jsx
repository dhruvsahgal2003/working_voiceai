import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, BarChart2, Settings, Bot, CreditCard,
  Hash, LogOut, Zap, PhoneCall, Book, Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { label: 'Overview', items: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  ]},
  { label: 'Voice AI', items: [
    { to: '/assistants', icon: Bot, label: 'Assistants' },
    { to: '/campaigns', icon: Zap, label: 'Campaigns' },
    { to: '/leads', icon: Users, label: 'Leads' },
    { to: '/history', icon: PhoneCall, label: 'History' },
  ]},
  { label: 'Configure', items: [
    { to: '/knowledge', icon: Book, label: 'Knowledge Base' },
    { to: '/numbers', icon: Hash, label: 'Numbers' },
    { to: '/billing', icon: CreditCard, label: 'Billing' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ]},
];

export default function Sidebar() {
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

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <motion.div
            className="sidebar-logo-icon"
            whileHover={{ scale: 1.05 }}
          >C</motion.div>
          <span className="sidebar-logo-name">Callora</span>
        </div>
        <div className="sidebar-logo-sub">AI Voice Platform</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(section => (
          <div key={section.label} style={{ marginBottom: 6 }}>
            <span className="sidebar-section-label">{section.label}</span>
            {section.items.map((item, i) => (
              <motion.div
                key={item.to}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Link to={item.to} className={`nav-item${isActive(item.to) ? ' active' : ''}`}>
                  <item.icon size={15} />
                  {item.label}
                </Link>
              </motion.div>
            ))}
          </div>
        ))}
        {isAdmin && (
          <div style={{ marginTop: 8 }}>
            <span className="sidebar-section-label">Admin</span>
            <Link to="/admin" className={`nav-item${pathname === '/admin' ? ' active' : ''}`}>
              <Shield size={15} />
              Admin Panel
            </Link>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user?.name || user?.email || 'User'}</div>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button className="btn btn-ghost btn-icon-sm" onClick={() => { logout(); nav('/login'); }} title="Logout">
            <LogOut size={13} />
          </button>
        </div>
        <motion.div
          className="sidebar-credit-pill"
          onClick={() => nav('/billing')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <CreditCard size={11} />
          ₹{Number(balance).toFixed(0)} credits
        </motion.div>
      </div>
    </aside>
  );
}
