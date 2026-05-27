import { useState, useEffect } from 'react';
import { Users, Phone, TrendingUp, CreditCard, Shield, Search, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

export default function Admin() {
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');

  useEffect(() => {
    Promise.all([
      api.admin.stats(),
      api.admin.users(),
    ]).then(([s, u]) => {
      setStats(s);
      setUsers(u.users || []);
    }).catch(err => showToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function toggleActive(user) {
    try {
      await api.admin.updateUser(user.id, { is_active: !user.is_active });
      setUsers(p => p.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function addCredits() {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
    try {
      await api.admin.addCredits(creditModal.id, amount);
      setUsers(p => p.map(u => u.id === creditModal.id ? { ...u, credit_balance: (u.credit_balance || 0) + amount } : u));
      showToast(`₹${amount} added to ${creditModal.name || creditModal.email}`, 'success');
      setCreditModal(null); setCreditAmount('');
    } catch (err) { showToast(err.message, 'error'); }
  }

  const filtered = users.filter(u => !search || u.email?.includes(search) || u.name?.includes(search));

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={22} color="var(--accent)" />
          <div>
            <h1 className="page-title">Admin Panel</h1>
            <p className="page-subtitle">System-wide management and user controls</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="stats-grid" style={{ marginBottom: 28 }}>
          {[
            { label: 'Total Users', value: stats.total_users, icon: Users, color: 'blue' },
            { label: 'Active Users', value: stats.active_users, icon: Shield, color: 'green' },
            { label: 'Total Calls', value: stats.total_calls, icon: Phone, color: 'purple' },
            { label: 'Total Revenue', value: `₹${stats.total_revenue?.toFixed(0)}`, icon: TrendingUp, color: 'amber' },
            { label: 'Credits Held', value: `₹${stats.total_credits_held?.toFixed(0)}`, icon: CreditCard, color: 'cyan' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-card-header">
                <div className={`stat-icon ${s.color}`}><s.icon size={16} /></div>
              </div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">All Users ({filtered.length})</span>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 32, width: 240, fontSize: 13, padding: '7px 12px 7px 32px' }}
              placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>User</th><th>Company</th><th>Credits</th><th>Status</th><th>Joined</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }}><div className="spinner" /></td></tr>
            ) : filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.name || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
                  {u.is_admin && <span className="badge badge-purple" style={{ marginTop: 2 }}>Admin</span>}
                </td>
                <td className="cell-muted">{u.company || '—'}</td>
                <td>
                  <span style={{ fontWeight: 600 }}>₹{(u.credit_balance || 0).toFixed(0)}</span>
                </td>
                <td>
                  <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                    {u.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="cell-muted">{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setCreditModal(u)}>
                      <Plus size={12} /> Credits
                    </button>
                    <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => toggleActive(u)}>
                      {u.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      {u.is_active ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creditModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2 className="modal-title">Add Credits</h2>
              <button className="modal-close" onClick={() => setCreditModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 16 }}>
                Add credits to <strong>{creditModal.name || creditModal.email}</strong><br />
                Current balance: <strong>₹{(creditModal.credit_balance || 0).toFixed(0)}</strong>
              </p>
              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <input className="form-input" type="number" min="1" placeholder="500"
                  value={creditAmount} onChange={e => setCreditAmount(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCreditModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={addCredits}>Add Credits</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
