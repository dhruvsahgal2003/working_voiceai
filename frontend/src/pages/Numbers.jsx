// Numbers page — manage Plivo phone numbers
import { useState, useEffect } from 'react';
import { Hash, Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

function AddModal({ onClose, onAdd }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ number: '' });
  const [loading, setLoading] = useState(false);
  async function handleSave() {
    if (!form.number) return showToast('Number is required', 'error');
    setLoading(true);
    try {
      const r = await api.numbers.add(form);
      onAdd(r.number);
      showToast('Number added', 'success');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  }
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Add Phone Number</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="form-input" placeholder="+918035340776" value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>{loading ? <span className="spinner spinner-sm" /> : 'Add Number'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Numbers() {
  const { showToast } = useToast();
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.numbers.list().then(d => setNumbers(d.numbers || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await api.numbers.sync();
      showToast(`Synced ${r.synced} numbers from Plivo`, 'success');
      api.numbers.list().then(d => setNumbers(d.numbers || []));
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSyncing(false); }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this number?')) return;
    await api.numbers.delete(id);
    setNumbers(prev => prev.filter(n => n.id !== id));
    showToast('Number removed', 'success');
  }

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Phone Numbers</h1>
          <p className="page-subtitle">Manage your Plivo DID numbers for outbound calling</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}><RefreshCw size={13} /> {syncing ? 'Syncing…' : 'Sync from Plivo'}</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> Add Number</button>
        </div>
      </div>

      <div className="table-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : !numbers.length ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Hash size={24} /></div>
            <h3>No numbers added</h3>
            <p>Add your Plivo DID number or sync from your Plivo account.</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Number</th><th>Country</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {numbers.map(n => (
                <tr key={n.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{n.number}</td>
                  <td>{n.country || 'IN'}</td>
                  <td><span className={`badge ${n.is_active !== false ? 'badge-green' : 'badge-gray'}`}>{n.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => handleDelete(n.id)} style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={n => { setNumbers(prev => [n, ...prev]); setShowAdd(false); }} />}
    </div>
  );
}
