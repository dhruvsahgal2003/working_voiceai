import { useState, useEffect } from 'react';
import { Save, CheckCircle, XCircle, Zap, MessageCircle, AlertTriangle, Phone, Loader, Unlink } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const TABS = ['Profile', 'Connect Plivo', 'Notifications', 'Compliance'];

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ user, refreshUser }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: user?.name || '', company: user?.company || '', timezone: user?.timezone || 'Asia/Kolkata' });
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  async function save() {
    setLoading(true);
    try { await api.auth.updateProfile(form); refreshUser(); showToast('Profile saved', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  }
  return (
    <div style={{ maxWidth: 540 }}>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={set('name')} /></div>
        <div className="form-group"><label className="form-label">Company</label><input className="form-input" value={form.company} onChange={set('company')} /></div>
      </div>
      <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={user?.email || ''} disabled style={{ opacity: .6 }} /></div>
      <div className="form-group">
        <label className="form-label">Timezone</label>
        <select className="form-select" value={form.timezone} onChange={set('timezone')}>
          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
          <option value="Asia/Dubai">Asia/Dubai (GST)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={loading}>
        {loading ? <span className="spinner spinner-sm" /> : <><Save size={14} /> Save Profile</>}
      </button>
    </div>
  );
}

// ── Connect Plivo Tab ─────────────────────────────────────────────────────────
function ConnectPlivoTab() {
  const { showToast } = useToast();
  const [creds, setCreds] = useState({ plivo_auth_id: '', plivo_auth_token: '' });
  const [status, setStatus] = useState(null); // null | 'connected' | 'not_connected'
  const [trunkId, setTrunkId] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    api.settings.getCredentials().then(d => {
      const c = d.credentials || {};
      setCreds({ plivo_auth_id: c.plivo_auth_id || '', plivo_auth_token: c.plivo_auth_token || '' });
      setStatus(c.plivo_auth_id ? 'connected' : 'not_connected');
      setTrunkId(c.sip_trunk_id || '');
    }).finally(() => setLoading(false));
  }, []);

  async function connect() {
    if (!creds.plivo_auth_id || !creds.plivo_auth_token) {
      showToast('Enter your Plivo Auth ID and Auth Token first', 'error'); return;
    }
    if (creds.plivo_auth_token === '__SAVED__') {
      showToast('Enter a new Auth Token to reconnect', 'error'); return;
    }
    setConnecting(true);
    try {
      const res = await api.settings.connectPlivo(creds);
      setStatus('connected');
      setTrunkId(res.sip_trunk_provisioned ? '✅ Auto-configured' : '⚠️ Partial (no LiveKit env)');
      showToast(`Connected! ${res.numbers_synced} number${res.numbers_synced !== 1 ? 's' : ''} synced automatically.`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    setConnecting(false);
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Plivo? Your numbers and call history will remain, but new calls will stop working.')) return;
    setDisconnecting(true);
    try {
      await api.settings.disconnectPlivo();
      setStatus('not_connected');
      setTrunkId('');
      setCreds({ plivo_auth_id: '', plivo_auth_token: '' });
      showToast('Plivo disconnected', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
    setDisconnecting(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;

  const isConnected = status === 'connected';

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Status banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', borderRadius: 10, marginBottom: 28,
        background: isConnected ? '#f0fdf4' : '#fafafa',
        border: `1px solid ${isConnected ? '#86efac' : 'var(--border)'}`,
      }}>
        {isConnected
          ? <CheckCircle size={20} color="#16a34a" />
          : <XCircle size={20} color="#94a3b8" />}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: isConnected ? '#15803d' : 'var(--text)' }}>
            {isConnected ? 'Plivo Connected' : 'Plivo Not Connected'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {isConnected
              ? `Account: ${creds.plivo_auth_id} · Voice infra configured automatically`
              : 'Add your Plivo credentials to start making AI calls'}
          </div>
        </div>
        {isConnected && (
          <button
            className="btn btn-ghost btn-xs"
            style={{ marginLeft: 'auto', color: '#dc2626' }}
            onClick={disconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <Loader size={12} className="spin" /> : <><Unlink size={12} /> Disconnect</>}
          </button>
        )}
      </div>

      {/* What we handle automatically */}
      <div style={{
        background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
        border: '1px solid #c7d2fe',
        borderRadius: 10, padding: '14px 18px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4338ca', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          ⚡ What Callora handles automatically
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {[
            'LiveKit voice infrastructure',
            'SIP trunk configuration',
            'Sarvam AI (Hindi/English STT+TTS)',
            'AI model routing',
            'Call recording & storage',
            'Number sync from Plivo',
          ].map(item => (
            <div key={item} style={{ fontSize: 12, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={11} color="#6366f1" /> {item}
            </div>
          ))}
        </div>
      </div>

      {/* Plivo credentials form */}
      <div className="settings-section">
        <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={14} /> Your Plivo Credentials
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Find these on your <a href="https://console.plivo.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Plivo console homepage</a>.
          We use them to make calls from your number with your Plivo billing.
        </p>

        <div className="form-group">
          <label className="form-label">Auth ID</label>
          <input
            className="form-input"
            placeholder="MAODHJZTIXXXXXXXXXXX"
            value={creds.plivo_auth_id}
            onChange={e => setCreds(c => ({ ...c, plivo_auth_id: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Auth Token</label>
          <input
            className="form-input"
            type="password"
            placeholder={creds.plivo_auth_token === '__SAVED__' ? '••••••••  (saved — enter new value to update)' : 'Your Plivo Auth Token'}
            value={creds.plivo_auth_token === '__SAVED__' ? '' : creds.plivo_auth_token}
            onChange={e => setCreds(c => ({ ...c, plivo_auth_token: e.target.value }))}
          />
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={connect}
        disabled={connecting}
        style={{ minWidth: 180 }}
      >
        {connecting
          ? <><Loader size={14} className="spin" /> Setting up…</>
          : isConnected
            ? <><CheckCircle size={14} /> Reconnect Plivo</>
            : <><Zap size={14} /> Connect Plivo</>}
      </button>

      {connecting && (
        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>✓ Validating Plivo credentials…</div>
          <div>✓ Syncing your phone numbers…</div>
          <div>✓ Configuring voice infrastructure…</div>
        </div>
      )}

      {isConnected && trunkId && (
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          SIP trunk: <code style={{ fontSize: 11 }}>{trunkId}</code>
        </div>
      )}
    </div>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────
function NotificationsTab() {
  const { showToast } = useToast();
  const [creds, setCreds] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings.getCredentials().then(d => setCreds(d.credentials || {})).finally(() => setLoading(false));
  }, []);

  const set = k => e => setCreds(c => ({ ...c, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try { await api.settings.saveCredentials(creds); showToast('Saved', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;

  return (
    <div style={{ maxWidth: 580 }}>
      <div className="settings-section">
        <div className="settings-section-title">Hot Lead Alerts</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          When a lead is marked <strong>interested</strong> after a call, get an instant alert so your team can follow up.
        </p>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={13} color="var(--accent)" /> Webhook URL
          </label>
          <input className="form-input" placeholder="https://hooks.zapier.com/..." value={creds.sales_webhook_url || ''} onChange={set('sales_webhook_url')} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Fires a POST request with lead name, phone, outcome, and transcript. Works with Zapier, n8n, your CRM, or any webhook.
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={13} color="#25d366" /> WhatsApp Number
          </label>
          <input className="form-input" placeholder="+919876543210" value={creds.sales_whatsapp || ''} onChange={set('sales_whatsapp')} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Sends a WhatsApp message with the hot lead's details. Must be a WhatsApp Business number.
          </div>
        </div>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? <span className="spinner spinner-sm" /> : <><Save size={14} /> Save</>}
      </button>
    </div>
  );
}

// ── Compliance Tab ────────────────────────────────────────────────────────────
function ComplianceTab() {
  return (
    <div style={{ maxWidth: 620 }}>
      <div className="callout callout-warn">
        <AlertTriangle size={16} />
        <div>
          <strong>TRAI Compliance Requirements for India</strong>
          <ul style={{ marginTop: 8, paddingLeft: 16, lineHeight: 2 }}>
            <li>Calling hours: <strong>9:00 AM – 9:00 PM IST</strong> (platform enforces 10 AM – 7 PM)</li>
            <li>Register with TRAI DLT before commercial bulk calling</li>
            <li>Scrub against NDNC (National Do Not Call) registry</li>
            <li>Disclose: <em>"This call may be recorded for quality purposes"</em></li>
            <li>Plivo India numbers require KYC documents</li>
            <li>Honor DND requests within 7 days</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState(0);

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Profile, integrations, and notification preferences</p>
        </div>
      </div>
      <div className="card">
        <div className="tabs" style={{ padding: '0 20px' }}>
          {TABS.map((t, i) => (
            <button key={t} className={`tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
        <div className="card-body">
          {tab === 0 && <ProfileTab user={user} refreshUser={refreshUser} />}
          {tab === 1 && <ConnectPlivoTab />}
          {tab === 2 && <NotificationsTab />}
          {tab === 3 && <ComplianceTab />}
        </div>
      </div>
    </div>
  );
}
