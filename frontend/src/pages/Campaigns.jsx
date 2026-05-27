import { useState, useEffect } from 'react';
import { Users, Play, Pause, Trash2, Plus, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';

const EMPTY_FORM = {
  name: '', agent_id: '', phone_number_id: '', description: '',
  start_time: '10:00', end_time: '19:00', max_concurrent_calls: 3,
};

export default function Campaigns() {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [agents, setAgents]       = useState([]);
  const [numbers, setNumbers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, a, n] = await Promise.all([api.campaigns.list(), api.agents.list(), api.numbers.list()]);
      setCampaigns(c.campaigns || []);
      setAgents(a.agents || []);
      setNumbers(n.numbers || []);
    } catch { showToast('Failed to load data', 'error'); }
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.campaigns.create(form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      showToast('Campaign created!', 'success');
      loadAll();
    } catch (e) { showToast(e.message || 'Failed to create campaign', 'error'); }
    setSaving(false);
  }

  async function handleAction(id, action) {
    setActionLoading(p => ({ ...p, [id]: action }));
    try {
      if (action === 'launch') {
        await api.campaigns.launch(id);
        showToast('Campaign launched!', 'success');
      } else if (action === 'pause') {
        await api.campaigns.pause(id);
        showToast('Campaign paused', 'info');
      } else if (action === 'delete') {
        if (!confirm('Delete this campaign?')) { setActionLoading(p => ({ ...p, [id]: null })); return; }
        await api.campaigns.delete(id);
        showToast('Campaign deleted', 'info');
      } else if (action === 'add-leads') {
        const res = await api.campaigns.addLeads(id);
        showToast(`${res.assigned} leads added to campaign`, 'success');
      }
      loadAll();
    } catch (e) {
      showToast(e.message || 'Action failed', 'error');
    }
    setActionLoading(p => ({ ...p, [id]: null }));
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Manage your outbound calling campaigns</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={14} style={{ marginRight: 4 }} /> New Campaign
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📣</div>
          <h3>No campaigns yet</h3>
          <p>Create a campaign, import leads, then launch.</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Campaign</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c} actionLoading={actionLoading[c.id]} onAction={handleAction} />
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">New Campaign</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Campaign Name *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} required placeholder="e.g. Gurgaon Leads Nov" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">AI Assistant *</label>
                    <select className="form-select" value={form.agent_id} onChange={set('agent_id')} required>
                      <option value="">Select assistant…</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Caller Number</label>
                    <select className="form-select" value={form.phone_number_id} onChange={set('phone_number_id')}>
                      <option value="">Default</option>
                      {numbers.map(n => <option key={n.id} value={n.id}>{n.number || n.phone_number}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Start Time (IST)</label>
                    <input className="form-input" type="time" value={form.start_time} onChange={set('start_time')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time (IST)</label>
                    <input className="form-input" type="time" value={form.end_time} onChange={set('end_time')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Max Concurrent Calls</label>
                  <input className="form-input" type="number" min="1" max="20" value={form.max_concurrent_calls} onChange={set('max_concurrent_calls')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows="2" value={form.description} onChange={set('description')} placeholder="Optional notes" />
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534' }}>
                  <strong>After creating:</strong> Go to <strong>Leads → Import CSV</strong> and select this campaign, or click <strong>Add Leads</strong> on the card to assign existing leads.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Campaign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign: c, actionLoading, onAction }) {
  const totalLeads = c.total_leads || 0;
  const pending    = c.pending     || 0;
  const hotLeads   = c.hot_leads   || 0;
  const called     = totalLeads - pending;
  const progress   = totalLeads > 0 ? Math.round((called / totalLeads) * 100) : 0;
  const isRunning  = c.status === 'running';
  const isDone     = c.status === 'completed';
  const noLeads    = totalLeads === 0;

  return (
    <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{c.name}</h3>
          {c.description && <p style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{c.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={c.status} />

          {!isDone && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.28rem 0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => onAction(c.id, 'add-leads')}
              disabled={!!actionLoading}
              title="Assign all pending leads without a campaign to this one"
            >
              <Users size={11} /> Add Leads
            </button>
          )}

          {!isDone && (
            <button
              className={`btn ${isRunning ? 'btn-warning' : 'btn-primary'}`}
              style={{ fontSize: '0.78rem', padding: '0.28rem 0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => onAction(c.id, isRunning ? 'pause' : 'launch')}
              disabled={!!actionLoading}
            >
              {actionLoading === (isRunning ? 'pause' : 'launch') ? '…' :
                isRunning ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Launch</>}
            </button>
          )}

          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.78rem', padding: '0.28rem 0.6rem', color: '#dc2626' }}
            onClick={() => onAction(c.id, 'delete')}
            disabled={!!actionLoading}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* No-leads warning */}
      {noLeads && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={13} />
          No leads assigned yet — click <strong style={{ margin: '0 2px' }}>Add Leads</strong> to assign unassigned leads, or re-import your CSV with this campaign selected.
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Total Leads', value: totalLeads },
          { label: 'Pending',     value: pending },
          { label: 'Hot Leads',   value: hotLeads },
          { label: 'Called',      value: called },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center', background: 'var(--bg)', borderRadius: 8, padding: '8px 4px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress */}
      {totalLeads > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Progress</span>
            <span>{progress}%{isDone && <span style={{ color: '#16a34a', marginLeft: 6 }}>✓ Completed</span>}</span>
          </div>
          <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: isDone ? '#16a34a' : 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}
    </div>
  );
}
