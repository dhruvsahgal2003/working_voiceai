// Analytics page — call metrics, charts, campaign comparison, CSV export
import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadAnalytics(); }, [range]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const r = await api.analytics.get({ days: range });
      setSummary(r.summary || {});
      setDaily(r.daily_volume || []);
      setOutcomes(r.outcomes || []);
      setCampaigns(r.campaigns || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.analytics.export({ days: range });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calls-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed');
    }
    setExporting(false);
  }

  const statCards = summary ? [
    { label: 'Total Calls', value: summary.total_calls ?? 0 },
    { label: 'Answered', value: summary.answered ?? 0 },
    { label: 'Answer Rate', value: `${summary.answer_rate ?? 0}%` },
    { label: 'Avg Duration', value: summary.avg_duration ? `${Math.round(summary.avg_duration)}s` : '—' },
    { label: 'Hot Leads', value: summary.hot_leads ?? 0 },
    { label: 'Conversion Rate', value: `${summary.conversion_rate ?? 0}%` },
  ] : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Performance insights for your campaigns</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select className="form-select" style={{ width: 130 }} value={range} onChange={e => setRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            {statCards.map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Daily volume chart */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Daily Call Volume</h3>
            {daily.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={2} dot={false} name="Total" />
                  <Line type="monotone" dataKey="answered" stroke="#10b981" strokeWidth={2} dot={false} name="Answered" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Outcomes pie */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Call Outcomes</h3>
              {outcomes.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={outcomes} dataKey="count" nameKey="outcome" cx="50%" cy="50%" outerRadius={80} label={e => `${e.outcome} (${e.count})`}>
                      {outcomes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Campaign comparison bar */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Campaign Performance</h3>
              {campaigns.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No campaign data</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={campaigns} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total_calls" fill="#4f46e5" name="Calls" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="interested" fill="#10b981" name="Interested" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}
