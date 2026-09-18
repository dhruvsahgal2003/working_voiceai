// Admin.jsx — comprehensive admin panel (admin-only)
import { useState, useEffect } from 'react';
import {
  Users, Phone, TrendingUp, CreditCard, Shield, Search,
  ToggleLeft, ToggleRight, Plus, RefreshCw, Flame, Calendar,
  ArrowUpRight, Activity, KeyRound, AlertTriangle, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

/* ── helpers ─────────────────────────────────────────────────────────── */
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtINR(n) { return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }

/* ── KPI tile ──────────────────────────────────────────────────────────── */
function KPI({ Icon, value, label, tone = 'red', sub }) {
  const colors = { red: '#E63946', gold: '#F4B233', green: '#1F8A5B', sky: '#475569', amber: '#F97316' };
  const c = colors[tone] || colors.red;
  return (
    <div className="deboss" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 8px ${c}40` }}>
          <Icon size={15} />
        </div>
        <div style={{ font: "italic 400 13px/1 'Instrument Serif',serif", color: '#52525F' }}>{label}</div>
      </div>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 38, lineHeight: 0.9, color: '#0B0B14', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ font: "500 11px/1 'Inter'", color: '#8B8B98' }}>{sub}</div>}
    </div>
  );
}

/* ── Daily call chart ──────────────────────────────────────────────────── */
function DailyChart({ daily }) {
  const calls = (daily || []).map(d => d.calls || 0);
  const revenue = (daily || []).map(d => d.revenue || 0);
  const labels = (daily || []).map(d => (d.date || '').slice(5));

  if (!calls.length) return null;

  const w = 700, h = 160, pad = 28;
  const maxC = Math.max(...calls, 1);
  const xs = i => pad + (i / (calls.length - 1)) * (w - pad * 2);
  const ys = v => h - pad - (v / maxC) * (h - pad * 2);
  const lineC = calls.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(v)}`).join(' ');
  const areaC = lineC + ` L${xs(calls.length - 1)},${h - pad} L${xs(0)},${h - pad} Z`;

  // Revenue as separate line (normalized to same scale)
  const maxR = Math.max(...revenue, 1);
  const yrRev = v => h - pad - (v / maxR) * (h - pad * 2);
  const lineR = revenue.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${yrRev(v)}`).join(' ');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>System-wide call volume</div>
          <div style={{ font: '500 12px/1 Inter', color: '#8B8B98', marginTop: 3 }}>Last 14 days</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="chip"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#E63946', display: 'inline-block' }} /> Calls</span>
          <span className="chip"><span style={{ width: 8, height: 8, borderRadius: 2, background: '#F4B233', display: 'inline-block' }} /> Revenue</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="ga-calls" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#E63946" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#E63946" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={pad} x2={w - pad} y1={ys(maxC * p)} y2={ys(maxC * p)} stroke="rgba(20,20,40,0.06)" strokeDasharray="3 3" />
        ))}
        {/* Y-axis labels */}
        {[0, Math.round(maxC / 2), maxC].map((v, i) => (
          <text key={i} x={pad - 6} y={ys(v) + 4} textAnchor="end" style={{ fontSize: 9, fill: '#8B8B98', fontFamily: 'Inter' }}>{v}</text>
        ))}
        {/* X-axis labels — every 2nd day */}
        {labels.map((l, i) => i % 2 === 0 && (
          <text key={i} x={xs(i)} y={h - 8} textAnchor="middle" style={{ fontSize: 9, fill: '#8B8B98', fontFamily: 'Inter' }}>{l}</text>
        ))}
        <path d={areaC} fill="url(#ga-calls)" />
        <path d={lineC} fill="none" stroke="#E63946" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={lineR} fill="none" stroke="#F4B233" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3" />
        {calls.length > 1 && (
          <circle cx={xs(calls.length - 1)} cy={ys(calls[calls.length - 1])} r="4" fill="#E63946" stroke="#fff" strokeWidth="2" />
        )}
      </svg>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export default function Admin() {
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  const [users, setUsers] = useState([]);
  const [recharges, setRecharges] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [checkingKeys, setCheckingKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('users');
  const [creditModal, setCreditModal] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [s, d, u, r, k] = await Promise.all([
        api.admin.stats(),
        api.admin.daily().catch(() => []),
        api.admin.users(),
        api.admin.recharges().catch(() => []),
        api.admin.apiKeys().catch(() => ({ keys: [] })),
      ]);
      setStats(s);
      setDaily(d || []);
      setUsers(u.users || []);
      setRecharges(r || []);
      setApiKeys(k?.keys || []);
    } catch (err) { showToast(err.message, 'error'); }
    setLoading(false);
  }

  // Force an immediate re-probe rather than waiting for the 5-minute cycle —
  // this is what you hit right after topping a key up.
  async function recheckKeys() {
    setCheckingKeys(true);
    try {
      const k = await api.admin.checkApiKeys();
      setApiKeys(k?.keys || []);
      showToast('API keys re-checked', 'success');
    } catch (err) { showToast(err.message, 'error'); }
    setCheckingKeys(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(user) {
    try {
      await api.admin.updateUser(user.id, { is_active: !user.is_active });
      setUsers(p => p.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
      showToast(`${user.name || user.email} ${!user.is_active ? 'activated' : 'suspended'}`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function addCredits() {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
    try {
      await api.admin.addCredits(creditModal.id, amount);
      setUsers(p => p.map(u => u.id === creditModal.id ? { ...u, credit_balance: (u.credit_balance || 0) + amount } : u));
      showToast(`${fmtINR(amount)} added to ${creditModal.name || creditModal.email}`, 'success');
      setCreditModal(null); setCreditAmount('');
    } catch (err) { showToast(err.message, 'error'); }
  }

  // Anything that is not a clean OK needs a human — surfaced on the tab label.
  const keyAlerts = apiKeys.filter(k => k.status !== 'ok').length;

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase())
  );

  const todayNew = users.filter(u => (u.created_at || '').startsWith(new Date().toISOString().slice(0, 10))).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <KPI Icon={Users}      value={stats?.total_users ?? '—'}    label="Total users"    tone="red"   sub={`${stats?.active_users ?? 0} active · ${todayNew} today`} />
        <KPI Icon={Phone}      value={stats?.total_calls ?? '—'}    label="Total calls"    tone="gold"  sub={`${stats?.today_calls ?? 0} today`} />
        <KPI Icon={TrendingUp} value={stats ? fmtINR(stats.total_revenue) : '—'} label="Revenue earned" tone="green" sub={`${fmtINR(stats?.total_recharges ?? 0)} recharged`} />
        <KPI Icon={CreditCard} value={stats ? fmtINR(stats.total_credits_held) : '—'} label="Credits held"  tone="sky"  sub={`${stats?.total_campaigns ?? 0} campaigns`} />
      </div>

      {/* Daily chart */}
      <div className="card-glass card-padded">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <DailyChart daily={daily} />
        )}
      </div>

      {/* Tab bar + content */}
      <div className="card-glass" style={{ padding: '4px 0' }}>
        {/* Tab header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 12px' }}>
          <div style={{ display: 'flex', gap: 0, borderRadius: 9, background: 'rgba(20,20,40,0.05)', padding: 3 }}>
            {[
              ['users', `Users (${filtered.length})`],
              ['recharges', `Recharges (${recharges.length})`],
              ['apikeys', `API Keys${keyAlerts ? ` (${keyAlerts}!)` : ''}`],
            ].map(([id, lbl]) => (
              <button
                key={id} onClick={() => setTab(id)}
                style={{
                  padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  font: `600 12.5px/1 'Inter'`,
                  background: tab === id ? 'rgba(255,255,255,0.9)' : 'transparent',
                  color: tab === id ? '#0B0B14' : '#52525F',
                  boxShadow: tab === id ? '0 1px 4px rgba(20,20,40,0.10)' : 'none',
                  transition: 'all 0.15s',
                }}
              >{lbl}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'users' && (
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8B8B98' }} />
                <input
                  className="input" style={{ paddingLeft: 30, width: 220, height: 34 }}
                  placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}
            <button className="btn btn-ghost btn-icon" onClick={load} title="Refresh"><RefreshCw size={13} /></button>
          </div>
        </div>

        {/* Users tab */}
        {tab === 'users' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : !filtered.length ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-icon"><Users size={28} /></div>
              <h3>No users found</h3>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Company</th>
                  <th>Calls</th>
                  <th>Balance</th>
                  <th>Last recharge</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0B0B14', fontSize: 13 }}>{u.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#8B8B98', marginTop: 2 }}>{u.email}</div>
                      {u.is_admin && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: "600 9px/1 'Inter'", letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(230,57,70,0.10)', color: '#9D1924', padding: '2px 6px', borderRadius: 4, marginTop: 2 }}>
                          <Shield size={8} /> Admin
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: '#52525F' }}>{u.company || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ font: "700 14px/1 'Inter Tight'", color: '#0B0B14' }}>{u.total_calls || 0}</span>
                        {u.total_calls > 0 && <Phone size={10} color="#8B8B98" />}
                      </div>
                    </td>
                    <td>
                      <span style={{ font: "700 13px/1 'Inter Tight'", color: (u.credit_balance || 0) < 100 ? '#C2180F' : '#0B0B14' }}>
                        {fmtINR(u.credit_balance)}
                      </span>
                    </td>
                    <td>
                      {u.last_recharge ? (
                        <div>
                          <div style={{ font: "600 12px/1 'Inter'", color: '#1F8A5B' }}>+{fmtINR(u.last_recharge.amount)}</div>
                          <div style={{ font: '500 10px/1 Inter', color: '#8B8B98', marginTop: 2 }}>{fmtDate(u.last_recharge.date)}</div>
                        </div>
                      ) : <span style={{ color: '#8B8B98', fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        font: "600 10px/1 'Inter'", letterSpacing: '0.06em', textTransform: 'uppercase',
                        padding: '4px 8px', borderRadius: 5,
                        background: u.is_active ? 'rgba(31,138,91,0.10)' : 'rgba(220,38,38,0.10)',
                        color: u.is_active ? '#16613F' : '#B91C1C',
                      }}>
                        {u.is_active ? '● Active' : '● Suspended'}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: '#8B8B98' }}>{fmtDate(u.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setCreditModal(u)} style={{ gap: 4, fontSize: 11 }}>
                          <Plus size={11} /> Credits
                        </button>
                        <button
                          className="btn btn-sm"
                          style={{ gap: 4, fontSize: 11, background: 'transparent', border: '1px solid rgba(20,20,40,0.12)', color: u.is_active ? '#B91C1C' : '#16613F' }}
                          onClick={() => toggleActive(u)}
                        >
                          {u.is_active ? <><ToggleRight size={12} /> Suspend</> : <><ToggleLeft size={12} /> Activate</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* Recharges tab */}
        {tab === 'recharges' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : !recharges.length ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="empty-icon"><CreditCard size={28} /></div>
              <h3>No recharges yet</h3>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Balance after</th>
                  <th>Description</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recharges.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0B0B14' }}>{r.user?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#8B8B98' }}>{r.user?.email || r.user_id?.slice(0, 8)}</div>
                    </td>
                    <td>
                      <span style={{ font: "700 14px/1 'Inter Tight'", color: '#1F8A5B' }}>+{fmtINR(r.amount)}</span>
                    </td>
                    <td style={{ font: "600 12px/1 'Inter'", color: '#52525F' }}>{fmtINR(r.balance_after)}</td>
                    <td style={{ fontSize: 12, color: '#52525F' }}>{r.description || '—'}</td>
                    <td style={{ fontSize: 11, color: '#8B8B98' }}>{fmtDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* API Keys tab */}
        {tab === 'apikeys' && (
          <ApiKeysPanel keys={apiKeys} onRecheck={recheckKeys} checking={checkingKeys} />
        )}
      </div>

      {/* Add Credits modal */}
      {creditModal && (
        <div className="modal-overlay" onClick={() => setCreditModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Credits</h2>
              <button className="modal-close" onClick={() => setCreditModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 18 }}>
                Adding credits to <strong>{creditModal.name || creditModal.email}</strong><br />
                Current balance: <strong>{fmtINR(creditModal.credit_balance)}</strong>
              </p>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="label">Amount (₹)</label>
                <input className="input" type="number" min="1" placeholder="500"
                  value={creditAmount} onChange={e => setCreditAmount(e.target.value)}
                  autoFocus onKeyDown={e => e.key === 'Enter' && addCredits()} />
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

// ─── API KEYS PANEL ──────────────────────────────────────────────────────────
// Sarvam, Groq and Plivo are the three keys that carry prepaid credit.
//
// Read this table knowing what each column can actually prove:
//   * Only Plivo reports a real balance. Sarvam and Groq have no balance API,
//     so for those two the honest answer to "how much is left?" is "unknown
//     until it fails" — which is why a live-call failure is shown separately
//     and outranks a green probe.
const KEY_STATUS = {
  ok:            { label: 'OK',            color: '#1F8A5B', bg: 'rgba(31,138,91,0.10)',  Icon: CheckCircle2, hint: 'Authenticated and responding.' },
  out_of_credit: { label: 'OUT OF CREDIT', color: '#C2410C', bg: 'rgba(194,65,12,0.10)',  Icon: AlertTriangle, hint: 'Recharge this key now — calls using it will fail.' },
  rate_limited:  { label: 'RATE LIMITED',  color: '#B45309', bg: 'rgba(180,83,9,0.10)',   Icon: Clock,        hint: 'Hitting rate limits, not necessarily out of credit.' },
  invalid:       { label: 'INVALID KEY',   color: '#B91C1C', bg: 'rgba(185,28,28,0.10)',  Icon: XCircle,      hint: 'Key was rejected — wrong, revoked, or not set.' },
  unreachable:   { label: 'UNREACHABLE',   color: '#52525F', bg: 'rgba(82,82,95,0.10)',   Icon: AlertTriangle, hint: 'Network or provider outage. Says nothing about the key.' },
  unknown:       { label: 'NOT CHECKED',   color: '#8B8B98', bg: 'rgba(139,139,152,0.10)', Icon: Clock,       hint: 'No probe has run yet.' },
};

function relTime(ts) {
  if (!ts) return 'never';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function ApiKeysPanel({ keys, onRecheck, checking }) {
  const recharge = keys.filter(k => k.status === 'out_of_credit');

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {recharge.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(194,65,12,0.08)', border: '1px solid rgba(194,65,12,0.30)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <AlertTriangle size={16} style={{ color: '#C2410C', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#7C2D12' }}>
            <strong>Recharge now:</strong> {recharge.map(k => k.label).join(', ')}. Calls that use{recharge.length > 1 ? '' : 's'} this key will fail until credit is added.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#8B8B98' }}>
          Checked automatically every 5 minutes, and whenever a real call hits a provider error.
        </div>
        <button className="btn btn-secondary btn-xs" onClick={onRecheck} disabled={checking}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {checking ? <span className="spinner spinner-sm" /> : <RefreshCw size={12} />}
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {keys.map(k => {
          const s = KEY_STATUS[k.status] || KEY_STATUS.unknown;
          const { Icon } = s;
          // A live failure that is newer than the last successful probe is the
          // real state of the world — the probe just has not caught up.
          const staleOk = k.status === 'ok' && k.last_failure_at &&
            new Date(k.last_failure_at) > new Date(k.last_ok_at || 0);
          return (
            <div key={k.provider} style={{ border: '1px solid var(--border, rgba(20,20,40,0.10))', borderRadius: 12, padding: '14px 16px', background: 'rgba(255,255,255,0.55)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <KeyRound size={15} style={{ color: '#52525F', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "600 13.5px/1.3 'Inter'", color: '#0B0B14' }}>{k.label}</div>
                    <div style={{ fontSize: 11, color: '#8B8B98', marginTop: 3 }}>
                      {k.env_var}{k.key_hint ? ` · ${k.key_hint}` : ' · not set'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {k.has_balance_api && k.balance !== null && k.balance !== undefined && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ font: "700 15px/1 'Inter Tight'", color: k.balance <= 0 ? '#C2410C' : '#0B0B14' }}>
                        {Number(k.balance).toFixed(2)} <span style={{ fontSize: 11, color: '#8B8B98' }}>{k.balance_currency || ''}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: '#8B8B98', marginTop: 2 }}>balance</div>
                    </div>
                  )}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: s.bg, color: s.color, borderRadius: 999, padding: '5px 11px', font: "700 11px/1 'Inter'", letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                    <Icon size={12} /> {s.label}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 12, color: '#52525F', marginTop: 10, lineHeight: 1.5 }}>
                {s.hint}
                {!k.has_balance_api && (
                  <span style={{ color: '#8B8B98' }}> This provider has no balance API — status is inferred from its responses.</span>
                )}
              </div>

              {k.detail && (
                <div style={{ fontSize: 11.5, color: '#8B8B98', marginTop: 6, wordBreak: 'break-word' }}>{k.detail}</div>
              )}

              {staleOk && (
                <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 6 }}>
                  A real call failed {relTime(k.last_failure_at)} even though the probe passes: {k.last_failure_detail}
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#8B8B98', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(20,20,40,0.06)' }}>
                <span>checked {relTime(k.checked_at)}{k.latency_ms ? ` · ${k.latency_ms}ms` : ''}</span>
                <span>last OK {relTime(k.last_ok_at)}</span>
                {k.last_failure_at && <span>last failure {relTime(k.last_failure_at)} ({k.last_failure_source || 'probe'})</span>}
                {k.consecutive_failures > 0 && <span style={{ color: '#C2410C' }}>{k.consecutive_failures} consecutive failures</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
