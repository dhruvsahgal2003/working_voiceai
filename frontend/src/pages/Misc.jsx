import { useState, useEffect } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

export function DncPage() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true);
    try { const d = await api.dnc.list(); setList(d); } catch(e) {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!phone) return toast('Phone required', 'error');
    try {
      await api.dnc.add(phone, reason);
      toast('Added to DNC');
      setPhone(''); setReason(''); setShowAdd(false);
      load();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function remove(id) {
    try { await api.dnc.remove(id); toast('Removed from DNC'); load(); }
    catch(e) { toast(e.message, 'error'); }
  }

  return (
    <div className="page-body">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:'Syne', fontSize:22, fontWeight:800, letterSpacing:-0.5 }}>DNC List</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:4 }}>Do Not Call — these numbers will never be called</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={13}/> Add Number</button>
      </div>

      <div className="callout callout-red" style={{ marginBottom:16 }}>
        🚫 Numbers on this list are permanently blocked from calling. This includes TRAI DND numbers and manual opt-outs.
      </div>

      <div className="table-card">
        <div className="table-wrap">
          {loading ? <div style={{ textAlign:'center', padding:40 }}><span className="spinner"/></div>
          : list.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🛡️</div><div className="empty-title">DNC list is empty</div><div className="empty-sub">Numbers added here will never be called</div></div>
          ) : (
            <table>
              <thead><tr><th>Phone</th><th>Reason</th><th>Added</th><th>Action</th></tr></thead>
              <tbody>
                {list.map(d => (
                  <tr key={d.id}>
                    <td className="td-mono">{d.phone}</td>
                    <td style={{ color:'var(--text-muted)' }}>{d.reason || '—'}</td>
                    <td style={{ color:'var(--text-muted)', fontSize:12 }}>
                      {new Date(d.added_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(d.id)}><Trash2 size={12}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add to DNC</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" placeholder="+919876543210" value={phone} onChange={e => setPhone(e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">Reason</label>
                <input className="form-input" placeholder="e.g. DND registered, Requested on call" value={reason} onChange={e => setReason(e.target.value)}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={add}>Add to DNC</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="page-body">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Configure your AI agent and environment</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
        {[
          { title: 'Plivo Configuration', items: ['PLIVO_AUTH_ID', 'PLIVO_AUTH_TOKEN', 'PLIVO_FROM_NUMBER', 'PLIVO_AI_AGENT_ID'] },
          { title: 'Database', items: ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] },
          { title: 'App Config', items: ['WEBHOOK_BASE_URL', 'FRONTEND_URL', 'SALES_TEAM_WHATSAPP'] },
        ].map(section => (
          <div key={section.title} className="table-card" style={{ padding: 20 }}>
            <div style={{ fontFamily: 'Syne', fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{section.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {section.items.map(key => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                  <code style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'DM Mono', flex: 1 }}>{key}</code>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Set in .env file</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="callout callout-amber">
          All configuration is done via the <code style={{ fontSize:12 }}>.env</code> file in the <code style={{ fontSize:12 }}>backend/</code> folder.
          Copy <code style={{ fontSize:12 }}>.env.example</code> to <code style={{ fontSize:12 }}>.env</code> and fill in your values.
        </div>

        <div className="table-card" style={{ padding: 20 }}>
          <div style={{ fontFamily:'Syne', fontSize:14, fontWeight:700, marginBottom:12 }}>Compliance Reminders</div>
          {[
            '✅ Only call between 10am–7pm IST',
            '✅ Scrub numbers against NDNC/TRAI DND before uploading',
            '✅ Register on TRAI DLT as telemarketer',
            '✅ Include recording disclosure in every call',
            '✅ Honor all DND requests immediately',
            '✅ Do not collect Aadhaar/PAN over calls',
          ].map((note, i) => (
            <div key={i} style={{ fontSize:13, color:'var(--text-dim)', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>{note}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
