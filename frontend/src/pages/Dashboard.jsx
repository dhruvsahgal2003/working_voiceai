// Dashboard — real-time stats, call volume chart, recent calls
import { useState, useEffect } from 'react';
import { Phone, Users, TrendingUp, Clock, Zap, CreditCard, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';

const OUTCOME_COLORS = { interested: '#16a34a', not_interested: '#64748b', callback: '#2563eb', no_answer: '#94a3b8', busy: '#d97706', failed: '#dc2626', voicemail: '#7c3aed', unknown: '#cbd5e1' };

function fmtDur(s) { const m = Math.floor(s / 60), sec = s % 60; return `${m}m ${sec}s`; }
function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, d, o, c] = await Promise.all([
        api.analytics.summary(),
        api.analytics.daily(),
        api.analytics.outcomes(),
        api.calls.history({ limit: 8 }),
      ]);
      setStats(s); setDaily(d); setOutcomes(o); setCalls(c.calls || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="page-body" style={{ textAlign: 'center', paddingTop: 80 }}><div className="spinner" /></div>;

  return (
    <div className="page-body">
      <div className="page-header">
        <div><h1 className="page-title">Dashboard</h1><p className="page-subtitle">Real-time overview of your calling campaigns</p></div>
        <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-icon blue"><Phone size={18} /></div></div>
          <div className="stat-value">{stats?.today_calls ?? 0}</div>
          <div className="stat-label">Today's Calls</div>
          <div className="stat-sub">{stats?.total_calls ?? 0} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-icon purple"><Users size={18} /></div></div>
          <div className="stat-value">{stats?.total_leads ?? 0}</div>
          <div className="stat-label">Total Leads</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-icon green"><Zap size={18} /></div></div>
          <div className="stat-value">{stats?.hot_leads ?? 0}</div>
          <div className="stat-label">Hot Leads 🔥</div>
          <div className="stat-sub">{stats?.conversion_rate ?? 0}% conversion</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-icon teal"><TrendingUp size={18} /></div></div>
          <div className="stat-value">{stats?.answer_rate ?? 0}%</div>
          <div className="stat-label">Answer Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-icon amber"><Clock size={18} /></div></div>
          <div className="stat-value">{fmtDur(stats?.avg_duration_sec ?? 0)}</div>
          <div className="stat-label">Avg Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header"><div className="stat-icon accent"><CreditCard size={18} /></div></div>
          <div className="stat-value">₹{Number(stats?.credit_balance ?? 0).toFixed(0)}</div>
          <div className="stat-label">Credits Left</div>
          <div className="stat-sub">₹6/min per call</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Daily Call Volume (30 days)</h3></div>
          <div style={{ padding: '20px 20px 10px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={daily}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [v, n === 'calls' ? 'Calls' : 'Hot Leads']} />
                <Line type="monotone" dataKey="calls" stroke="var(--accent)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="hot_leads" stroke="var(--green)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="card-title">Call Outcomes</h3></div>
          <div style={{ padding: '20px 0 10px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={outcomes} dataKey="count" nameKey="outcome" cx="50%" cy="50%" outerRadius={80} label={({ outcome, percentage }) => `${outcome} ${percentage}%`} labelLine={false}>
                  {outcomes.map((o, i) => <Cell key={i} fill={OUTCOME_COLORS[o.outcome] || '#94a3b8'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="table-header"><h3 className="table-title">Recent Calls</h3></div>
        {!calls.length ? (
          <div className="empty-state"><div className="empty-state-icon"><Phone size={22} /></div><h3>No calls yet</h3><p>Launch a campaign or trigger a manual call to see activity here.</p></div>
        ) : (
          <table>
            <thead><tr><th>Lead</th><th>Phone</th><th>Outcome</th><th>Duration</th><th>Hot?</th><th>Date</th></tr></thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.leads?.name || '—'}</td>
                  <td className="cell-muted font-mono">{c.leads?.phone || c.to_number}</td>
                  <td><StatusBadge status={c.outcome || c.call_status} /></td>
                  <td className="cell-muted">{c.duration_seconds ? fmtDur(c.duration_seconds) : '—'}</td>
                  <td>{c.hot_lead ? '🔥' : '—'}</td>
                  <td className="cell-muted">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
