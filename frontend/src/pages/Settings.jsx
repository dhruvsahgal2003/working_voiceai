import { useState, useEffect } from 'react';
import { Save, CheckCircle, XCircle, Key, Bell, AlertTriangle, Zap, MessageCircle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const TABS = ['Profile', 'Credentials', 'Notifications', 'Compliance'];

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
      <div className="form-group"><label className="form-label">Timezone</label>
        <select className="form-select" value={form.timezone} onChange={set('timezone')}>
          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
          <option value="Asia/Dubai">Asia/Dubai (GST)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>
      <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? <span className="spinner spinner-sm" /> : <><Save size={14} /> Save Profile</>}</button>
    </div>
  );
}

function CredRow({ label, value, onChange, placeholder, type = 'text', onTest, testStatus, hint }) {
  const isSaved = value === '__SAVED__';
  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label className="form-label" style={{ margin: 0 }}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSaved && !onTest && <span style={{ fontSize: 11, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle size={11} /> Saved</span>}
          {onTest && (
            <>
              {testStatus === 'ok' && <span style={{ color: 'var(--green)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><CheckCircle size={11} /> Connected</span>}
              {testStatus === 'err' && <span style={{ color: 'var(--red)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><XCircle size={11} /> Failed</span>}
              {testStatus === 'loading' && <span className="spinner spinner-sm" />}
              <button className="btn btn-ghost btn-xs" onClick={onTest}>Test connection</button>
            </>
          )}
        </div>
      </div>
      <input
        className="form-input"
        type={type}
        placeholder={isSaved ? '••••••••  (saved — leave blank to keep)' : placeholder}
        value={isSaved ? '' : value}
        onChange={onChange}
      />
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function CredentialsTab() {
  const { showToast } = useToast();
  const [creds, setCreds] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState({});

  useEffect(() => {
    api.settings.getCredentials().then(d => setCreds(d.credentials || {})).finally(() => setLoading(false));
  }, []);

  const set = k => e => setCreds(c => ({ ...c, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try { await api.settings.saveCredentials(creds); showToast('Credentials saved', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function testPlivo() {
    setTestStatus(s => ({ ...s, plivo: 'loading' }));
    try {
      await api.settings.testPlivo({ plivo_auth_id: creds.plivo_auth_id, plivo_auth_token: creds.plivo_auth_token });
      setTestStatus(s => ({ ...s, plivo: 'ok' }));
    } catch { setTestStatus(s => ({ ...s, plivo: 'err' })); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;

  return (
    <div style={{ maxWidth: 660 }}>
      <div className="callout callout-info" style={{ marginBottom: 24 }}>
        <Key size={14} />
        <div>All credentials are stored <strong>AES-256 encrypted</strong>. Never logged or exposed in API responses.</div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Plivo (Telephony)</div>
        <div className="form-row">
          <CredRow label="Auth ID" placeholder="MAODHJZTIXYZETZWJMZS" value={creds.plivo_auth_id || ''} onChange={set('plivo_auth_id')} onTest={testPlivo} testStatus={testStatus.plivo} />
          <CredRow label="Auth Token" placeholder="••••••••" type="password" value={creds.plivo_auth_token || ''} onChange={set('plivo_auth_token')} />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">LiveKit (Voice AI)</div>
        <CredRow label="LiveKit URL" placeholder="wss://your-project.livekit.cloud" value={creds.livekit_url || ''} onChange={set('livekit_url')} />
        <div className="form-row">
          <CredRow label="API Key" placeholder="APIxxx..." value={creds.livekit_api_key || ''} onChange={set('livekit_api_key')} />
          <CredRow label="API Secret" placeholder="••••••••" type="password" value={creds.livekit_api_secret || ''} onChange={set('livekit_api_secret')} />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Sarvam AI (Speech & Language)</div>
        <CredRow label="Sarvam API Key" placeholder="••••••••" type="password" value={creds.sarvam_api_key || ''} onChange={set('sarvam_api_key')} />
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner spinner-sm" /> : <><Save size={14} /> Save Credentials</>}</button>
    </div>
  );
}

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
    try { await api.settings.saveCredentials(creds); showToast('Notification settings saved', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>;

  return (
    <div style={{ maxWidth: 580 }}>
      <div className="settings-section">
        <div className="settings-section-title">Hot Lead Alerts</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          When a call ends and a lead is marked as <strong>interested</strong>, the platform instantly sends an alert so your sales team can follow up.
        </p>

        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={13} color="var(--accent)" /> Webhook URL
          </label>
          <input className="form-input" placeholder="https://hooks.zapier.com/..." value={creds.sales_webhook_url || ''} onChange={set('sales_webhook_url')} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Fires a POST request with lead name, phone, outcome, and call transcript. Works with Zapier, n8n, your CRM, or any webhook endpoint.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={13} color="#25d366" /> WhatsApp Number
          </label>
          <input className="form-input" placeholder="+919876543210" value={creds.sales_whatsapp || ''} onChange={set('sales_whatsapp')} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Sends a WhatsApp message to this number with the hot lead's details. Must be a WhatsApp Business number.
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner spinner-sm" /> : <><Save size={14} /> Save</>}</button>
    </div>
  );
}

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

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState(0);

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Profile, credentials, and notification preferences</p>
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
          {tab === 1 && <CredentialsTab />}
          {tab === 2 && <NotificationsTab />}
          {tab === 3 && <ComplianceTab />}
        </div>
      </div>
    </div>
  );
}
