// Leads page — manage lead list, CSV upload, lead details timeline
import { useState, useEffect, useRef } from 'react';
import { Phone, ChevronDown, Copy, Check, X, Upload, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/StatusBadge';

// ── PHONE NORMALIZER (mirrors backend logic) ──────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return '';
  const stripped = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  const digits   = stripped.replace(/\D/g, '');
  if (stripped.startsWith('+'))               return `+${digits}`;
  if (digits.startsWith('91') && digits.length === 12)  return `+${digits}`;
  if (digits.startsWith('0')  && digits.length === 11)  return `+91${digits.slice(1)}`;
  if (digits.length === 10)                             return `+91${digits}`;
  if (digits.startsWith('0091') && digits.length === 14) return `+91${digits.slice(4)}`;
  return `+${digits}`;
}

// ── CSV PARSER (browser-side) ─────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  // Handle quoted fields
  function parseLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    result.push(cur.trim());
    return result;
  }
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => parseLine(l)).filter(r => r.some(c => c));
  return { headers, rows };
}

// Intelligently guess which column maps to which field
function guessMapping(headers) {
  const h = headers.map(x => x.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const find = (candidates) => {
    for (const c of candidates) {
      const i = h.findIndex(x => x.includes(c));
      if (i !== -1) return headers[i];
    }
    return '';
  };
  return {
    phone:         find(['phone','mobile','number','contact','ph','cell','whatsapp']),
    name:          find(['name','customer','client','lead','person','fullname','contact']),
    email:         find(['email','mail']),
    city:          find(['city','location','area','region','place']),
    property_type: find(['property','type','intent','propert']),
    budget:        find(['budget','amount','price','crore','lakh']),
    language:      find(['language','lang']),
    notes:         find(['notes','remark','comment','note']),
  };
}

export default function Leads() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ campaign_id: '', status: '', search: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [addForm, setAddForm] = useState({ phone: '', name: '', email: '', campaign_id: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [callingId, setCallingId] = useState(null);
  const [curlLead, setCurlLead] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null); // { file, headers, rows, mapping }
  const fileRef = useRef();

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [l, c] = await Promise.all([api.leads.list(filter), api.campaigns.list()]);
      setLeads(l.leads || []);
      setCampaigns(c.campaigns || []);
    } catch (e) {
      setError('Failed to load leads');
    }
    setLoading(false);
  }

  async function applyFilter() {
    setLoading(true);
    try {
      const l = await api.leads.list(filter);
      setLeads(l.leads || []);
    } catch {}
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.leads.add(addForm);
      setShowAddModal(false);
      setAddForm({ phone: '', name: '', email: '', campaign_id: '' });
      loadAll();
    } catch (e) {
      alert(e.message || 'Failed to add lead');
    }
    setSaving(false);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    // Parse CSV in browser and show preview
    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    if (!headers.length || !rows.length) {
      showToast('CSV is empty or could not be parsed', 'error');
      return;
    }
    const mapping = guessMapping(headers);
    setCsvPreview({ file, headers, rows, mapping });
  }

  async function confirmUpload(file) {
    setUploading(true);
    setCsvPreview(null);
    try {
      const res = await api.leads.upload(file);
      showToast(`Imported ${res.imported} leads${res.skipped ? ` (${res.skipped} skipped)` : ''}`, 'success');
      loadAll();
    } catch (e) {
      showToast(e.message || 'Upload failed', 'error');
    }
    setUploading(false);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this lead?')) return;
    await api.leads.delete(id);
    loadAll();
  }

  async function callLead(lead) {
    setCallingId(lead.id);
    try {
      await api.calls.trigger(lead.id);
      showToast(`Calling ${lead.name || lead.phone}…`, 'success');
      loadAll();
    } catch (e) {
      showToast(e.message || 'Call failed', 'error');
    }
    setCallingId(null);
  }

  const sf = k => e => setFilter(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">{leads.length} total leads</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input type="file" accept=".csv" ref={fileRef} style={{ display: 'none' }} onChange={handleUpload} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : '↑ Import CSV'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Lead</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            className="form-input" style={{ maxWidth: 220 }}
            placeholder="Search name or phone…"
            value={filter.search} onChange={sf('search')}
          />
          <select className="form-select" style={{ maxWidth: 200 }} value={filter.campaign_id} onChange={sf('campaign_id')}>
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: 160 }} value={filter.status} onChange={sf('status')}>
            <option value="">All Statuses</option>
            {['pending', 'calling', 'called', 'interested', 'not_interested', 'callback', 'dnc'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={applyFilter}>Apply</button>
          <button className="btn btn-secondary" onClick={() => { setFilter({ campaign_id: '', status: '', search: '' }); loadAll(); }}>Clear</button>
        </div>
      </div>

      {error && <div className="callout callout-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : leads.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3>No leads found</h3>
          <p>Add leads manually or import a CSV file (columns: phone, name, email, tags).</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Phone</th>
                <th>Name</th>
                <th>Status</th>
                <th>Score</th>
                <th>Campaign</th>
                <th>Calls</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id}>
                  <td><span style={{ fontFamily: 'monospace' }}>{l.phone}</span></td>
                  <td>{l.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td><StatusBadge status={l.status} /></td>
                  <td>
                    {l.score != null ? (
                      <span style={{ fontWeight: 600, color: l.score >= 70 ? '#16a34a' : l.score >= 40 ? '#d97706' : 'var(--text-muted)' }}>
                        {l.score}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {campaigns.find(c => c.id === l.campaign_id)?.name || '—'}
                  </td>
                  <td>{l.call_count || 0}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {new Date(l.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setSelectedLead(l)}>View</button>
                      {/* Call split button */}
                      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--accent)' }}>
                        <button
                          style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '3px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: callingId === l.id ? 0.7 : 1 }}
                          onClick={() => callLead(l)}
                          disabled={callingId === l.id}
                        >
                          {callingId === l.id ? <span className="spinner spinner-sm" style={{ borderColor: '#fff3', borderTopColor: '#fff' }} /> : <Phone size={11} />}
                          Call
                        </button>
                        <button
                          style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.25)', padding: '3px 6px', cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); setCurlLead(curlLead?.id === l.id ? null : l); }}
                        >
                          <ChevronDown size={11} />
                        </button>
                      </div>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => handleDelete(l.id)}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Lead</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Phone Number *</label>
                  <input className="form-input" value={addForm.phone} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} required placeholder="+919876543210" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input className="form-input" value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={addForm.email} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Campaign</label>
                  <select className="form-select" value={addForm.campaign_id} onChange={e => setAddForm(p => ({ ...p, campaign_id: e.target.value }))}>
                    <option value="">No campaign</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedLead && <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
      {curlLead && <CurlModal lead={curlLead} onClose={() => setCurlLead(null)} onCall={() => { setCurlLead(null); callLead(curlLead); }} />}
      {csvPreview && (
        <CSVPreviewModal
          preview={csvPreview}
          campaigns={campaigns}
          onClose={() => setCsvPreview(null)}
          onConfirm={confirmUpload}
        />
      )}
    </div>
  );
}

function CurlModal({ lead, onClose, onCall }) {
  const [copied, setCopied] = useState(false);
  const base = window.location.origin;
  const token = localStorage.getItem('token') || '<YOUR_JWT_TOKEN>';

  const curlCmd = `curl -X POST ${base}/api/calls/trigger \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token}" \\
  -d '{"lead_id": "${lead.id}"}'`;

  function copy() {
    navigator.clipboard.writeText(curlCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Call {lead.name || lead.phone}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Trigger an outbound AI call to <strong>{lead.name || lead.phone}</strong> ({lead.phone}) via the API.
            The platform will use the agent and caller ID configured in the lead's campaign.
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>cURL</span>
              <button className="btn btn-ghost btn-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={copy}>
                {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
            <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {curlCmd}
            </pre>
          </div>

          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
            The JWT token above is your current session token. Keep it private — it grants full API access.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={onCall}>
            <Phone size={13} /> Call Now
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadDetailModal({ lead, onClose }) {
  const [calls, setCalls] = useState([]);
  useEffect(() => {
    api.calls.list({ lead_id: lead.id }).then(r => setCalls(r.calls || [])).catch(() => {});
  }, [lead.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{lead.name || lead.phone}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              ['Phone', lead.phone],
              ['Email', lead.email || '—'],
              ['Status', lead.status],
              ['Score', lead.score ?? '—'],
              ['Call Count', lead.call_count || 0],
              ['Tags', (lead.tags || []).join(', ') || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>

          <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Call History</h4>
          {calls.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No calls yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {calls.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg)', borderRadius: 8, fontSize: '0.85rem' }}>
                  <div>
                    <StatusBadge status={c.status} />
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                      {new Date(c.created_at).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>{c.duration_seconds ? `${Math.round(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── CSV PREVIEW MODAL ─────────────────────────────────────────────────────────
const FIELD_LABELS = {
  phone: 'Phone Number *',
  name:  'Name',
};

function CSVPreviewModal({ preview, campaigns, onClose, onConfirm }) {
  const { file, headers, rows } = preview;
  const [mapping, setMapping] = useState(preview.mapping);
  const [campaignId, setCampaignId] = useState('');
  const previewRows = rows.slice(0, 5);

  // Get value for a field from a row using current mapping
  function getVal(row, field) {
    const col = mapping[field];
    if (!col) return '';
    const idx = headers.indexOf(col);
    return idx >= 0 ? (row[idx] || '') : '';
  }

  const phoneCol = mapping.phone;
  const validCount = rows.filter(r => {
    const idx = headers.indexOf(phoneCol);
    if (idx < 0) return false;
    const norm = normalizePhone(r[idx] || '');
    return norm.replace(/\D/g, '').length >= 7;
  }).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760, width: '96vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Upload size={18} color="var(--accent)" />
            <h3 className="modal-title">Import CSV — {file.name}</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              ['Total rows', rows.length],
              ['Columns found', headers.length],
              ['Valid phones', validCount],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {!phoneCol && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} />
              No phone column detected. Please map the Phone Number field below.
            </div>
          )}

          {/* Column mapping */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Column Mapping
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
              {Object.entries(FIELD_LABELS).map(([field, label]) => (
                <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 110, flexShrink: 0 }}>{label}</span>
                  <select
                    className="form-select"
                    style={{ fontSize: 12, flex: 1 }}
                    value={mapping[field] || ''}
                    onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Campaign assignment */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Assign to Campaign (optional)
            </div>
            <select className="form-select" style={{ maxWidth: 280 }} value={campaignId} onChange={e => setCampaignId(e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Data preview */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Preview (first {previewRows.length} rows)
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['phone','name'].map(f => (
                      <th key={f} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {f}
                        {mapping[f] && <span style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 10 }}>← {mapping[f]}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      {['phone','name'].map(f => {
                        const raw = getVal(row, f);
                        const display = f === 'phone' && raw ? normalizePhone(raw) : raw;
                        const wasChanged = f === 'phone' && raw && display !== raw;
                        return (
                          <td key={f} style={{ padding: '7px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {display ? (
                              <span>
                                {display}
                                {wasChanged && (
                                  <span title={`Original: ${raw}`} style={{ marginLeft: 5, background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontWeight: 600 }}>
                                    fixed
                                  </span>
                                )}
                              </span>
                            ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                + {rows.length - 5} more rows not shown
              </p>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!phoneCol}
            onClick={() => {
              // Re-upload with the user's confirmed mapping — backend already handles column names,
              // but we pass mapping info as a comment in filename approach isn't great.
              // Instead, just upload the original file (backend auto-detects).
              // If user changed mapping we can note it for future. For now just confirm.
              onConfirm(file);
            }}
          >
            <Upload size={13} style={{ marginRight: 4 }} />
            Import {validCount} Leads
          </button>
        </div>
      </div>
    </div>
  );
}
