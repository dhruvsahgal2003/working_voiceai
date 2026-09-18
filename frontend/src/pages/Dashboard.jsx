// Dashboard — KPI tiles + SVG volume chart + live calls + recent activity
import { useState, useEffect, useCallback } from 'react';
import { Phone, Users, TrendingUp, Clock, Zap, CreditCard, RefreshCw, Flame } from 'lucide-react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';

function fmtDur(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtDate(d) {
  if (!d) return '—';
  const now = Date.now(), dt = new Date(d).getTime(), diff = now - dt;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

/* ── Sparkline ─────────────────────────────────────────────────────── */
function Sparkline({ data, color = '#E63946', height = 28 }) {
  if (!data || data.length < 2) return null;
  const w = 120;
  const max = Math.max(...data), min = Math.min(...data);
  const range = (max - min) || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${height - ((d - min) / range) * height}`).join(' ');
  const id = 'sg-' + color.replace('#', '');
  return (
    <svg width={w} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts} />
      <polygon fill={`url(#${id})`} points={`0,${height} ${pts} ${w},${height}`} />
    </svg>
  );
}

/* ── Deboss KPI tile ───────────────────────────────────────────────── */
function KPI({ Icon, value, label, delta, tone = 'red', trend }) {
  const colors = {
    red: '#E63946', coral: '#F4B233', gold: '#F4B233',
    green: '#1F8A5B', mint: '#1F8A5B', amber: '#F97316', sky: '#475569',
  };
  const c = colors[tone] || colors.red;
  const isDown = delta && delta.startsWith('▼');
  return (
    <div className="deboss" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, background: c, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 3px 8px ${c}40`,
          }}><Icon size={15} /></div>
          <div style={{ font: "italic 400 13px/1 'Instrument Serif',serif", color: '#52525F' }}>{label}</div>
        </div>
        {delta && (
          <span style={{
            font: '600 11px/1 Inter', display: 'inline-flex', gap: 3, alignItems: 'center',
            color: isDown ? '#9F1239' : '#16613F',
          }}>{delta}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, lineHeight: 0.9, color: '#0B0B14', letterSpacing: '-0.02em' }}>{value}</span>
      </div>
      {trend && <Sparkline data={trend} color={c} />}
    </div>
  );
}

/* ── SVG Volume Chart ──────────────────────────────────────────────── */
function VolumeChart({ daily }) {
  const calls = daily.map(d => d.calls || 0);
  const hot   = daily.map(d => d.hot_leads || 0);
  if (!calls.length) {
    const demo = [12,14,13,16,17,15,19,20,21,19,23,24,26,27];
    const hotD  = [1,1,1,1,2,1,2,2,3,2,3,3,3,4];
    return <VolumeChartSVG calls={demo} hot={hotD} labels={demo.map(() => '')} />;
  }
  return <VolumeChartSVG calls={calls} hot={hot} labels={daily.map(d => (d.date || '').slice(5))} />;
}

function VolumeChartSVG({ calls, hot, labels }) {
  const w = 720, h = 180, pad = 24;
  const max = Math.max(...calls, 1);
  const xs = (i) => pad + (i / (calls.length - 1 || 1)) * (w - pad * 2);
  const ys = (v) => h - pad - (v / max) * (h - pad * 2);
  const line = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={180} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="g-calls-d" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#E63946" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#E63946" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((p, i) => (
        <line key={i} x1={pad} x2={w - pad} y1={ys(max * p)} y2={ys(max * p)} stroke="rgba(20,20,40,0.06)" strokeDasharray="3 3" />
      ))}
      {calls.length > 1 && <>
        <path d={line(calls) + ` L${xs(calls.length - 1)},${h - pad} L${xs(0)},${h - pad} Z`} fill="url(#g-calls-d)" />
        <path d={line(calls)} fill="none" stroke="#E63946" strokeWidth="2.5" />
        <path d={line(hot)} fill="none" stroke="#F4B233" strokeWidth="2" />
        <circle cx={xs(calls.length - 1)} cy={ys(calls[calls.length - 1])} r="4" fill="#E63946" stroke="#fff" strokeWidth="2" />
        <circle cx={xs(hot.length - 1)} cy={ys(hot[hot.length - 1])} r="4" fill="#F4B233" stroke="#fff" strokeWidth="2" />
      </>}
    </svg>
  );
}

export default function Dashboard() {
  const [stats, setStats]     = useState(null);
  const [daily, setDaily]     = useState([]);
  const [calls, setCalls]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [s, d, c] = await Promise.all([
        api.analytics.summary(),
        api.analytics.daily(),
        api.calls.history({ limit: 8 }),
      ]);
      setStats(s);
      setDaily(d || []);
      setCalls((c.calls || []).slice(0, 6));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s (silent — no spinner)
  useEffect(() => {
    const iv = setInterval(() => load(true), 30000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return (
    <div style={{ textAlign: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto' }} />
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <div style={{ padding: '20px 24px', background: 'rgba(230,57,70,0.07)', border: '1px solid rgba(230,57,70,0.2)', borderRadius: 12, maxWidth: 420, margin: '0 auto' }}>
        <div style={{ font: "700 15px/1 'Inter Tight'", color: '#E63946', marginBottom: 8 }}>Failed to load dashboard</div>
        <div style={{ font: "500 13px/1.5 'Inter'", color: '#52525F', marginBottom: 16 }}>{error}</div>
        <button className="btn btn-primary btn-sm" onClick={() => load()}>Retry</button>
      </div>
    </div>
  );

  // ── Computed metrics ──────────────────────────────────────────────
  // "This week" — sum last 7 days from daily data (avoids UTC/IST mismatch on "today")
  const weekCalls = daily.slice(-7).reduce((sum, d) => sum + (d.calls || 0), 0);
  const hotLeads  = stats?.hot_leads ?? 0;
  const answerRate = stats?.answer_rate ?? 0;
  const avgDur    = fmtDur(stats?.avg_duration_sec ?? 0);
  // Show balance with 2 decimal places for accuracy
  const credits   = Number(stats?.credit_balance ?? 0).toFixed(2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <KPI Icon={Phone}      value={weekCalls}          label="Calls this week" tone="red"   trend={daily.slice(-12).map(d => d.calls || 0)} />
        <KPI Icon={Flame}      value={hotLeads}           label="Hot leads"       tone="gold"  trend={daily.slice(-12).map(d => d.hot_leads || 0)} />
        <KPI Icon={TrendingUp} value={`${answerRate}%`}   label="Answer rate"    tone="green" trend={[55,58,60,62,59,64,66,65,68,67,69,answerRate]} />
        <KPI Icon={Clock}      value={avgDur}             label="Avg duration"   tone="amber" />
      </div>

      {/* Chart + credits row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card-glass card-padded">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>Call volume</div>
              <div style={{ font: '500 12px/1 Inter', color: '#8B8B98', marginTop: 3 }}>Last 14 days</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="chip"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#E63946', display: 'inline-block' }} /> Calls</span>
              <span className="chip"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#F4B233', display: 'inline-block' }} /> Hot</span>
              {lastRefresh && (
                <span style={{ font: "500 10px/1 'Inter'", color: '#B0B0BE' }}>
                  {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => load()} style={{ padding: '4px 8px' }}><RefreshCw size={12} /></button>
            </div>
          </div>
          <VolumeChart daily={daily.slice(-14)} />
        </div>

        <div className="card-glass card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>Account</div>
          <div className="deboss" style={{ textAlign: 'center', padding: '16px 12px' }}>
            <div style={{ font: "italic 400 12px/1 'Instrument Serif',serif", color: '#52525F', marginBottom: 6 }}>Credits remaining</div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, lineHeight: 1, color: '#0B0B14', letterSpacing: '-0.02em' }}>₹{credits}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 10, background: 'rgba(31,138,91,0.07)', border: '1px solid rgba(31,138,91,0.14)' }}>
              <div style={{ font: "700 16px/1 'Inter Tight'", color: '#1F8A5B' }}>{stats?.total_calls ?? 0}</div>
              <div style={{ font: '500 11px/1 Inter', color: '#52525F', marginTop: 4 }}>Total calls</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 10, background: 'rgba(244,178,51,0.08)', border: '1px solid rgba(244,178,51,0.18)' }}>
              <div style={{ font: "700 16px/1 'Inter Tight'", color: '#C2810F' }}>{stats?.total_leads ?? 0}</div>
              <div style={{ font: '500 11px/1 Inter', color: '#52525F', marginTop: 4 }}>Leads</div>
            </div>
          </div>
          <a href="/billing" style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: 10, background: 'var(--grad-brand)', color: '#fff', font: '600 13px/1 Inter', textDecoration: 'none', cursor: 'pointer' }}>
            Top up →
          </a>
        </div>
      </div>

      {/* Recent calls */}
      <div className="card-glass" style={{ padding: '4px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px' }}>
          <div>
            <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>Recent calls</div>
            <div style={{ font: '500 12px/1 Inter', color: '#8B8B98', marginTop: 3 }}>Latest activity · {stats?.total_calls ?? 0} total</div>
          </div>
          <a href="/history" className="btn btn-secondary btn-sm">View all →</a>
        </div>
        {!calls.length ? (
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <div className="empty-icon"><Phone size={28} /></div>
            <h3>No calls yet</h3>
            <p>Launch a campaign to see call activity here.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Hot?</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0B0B14' }}>{c.leads?.name || '—'}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.leads?.phone || c.to_number || '—'}</td>
                  <td><StatusBadge status={c.outcome || c.call_status} /></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDur(c.duration_seconds)}</td>
                  <td>
                    {c.hot_lead && (
                      <span style={{ color: '#F4B233', display: 'inline-flex', alignItems: 'center' }}>
                        <Flame size={14} />
                      </span>
                    )}
                  </td>
                  <td style={{ color: '#8B8B98', fontSize: 12 }}>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
