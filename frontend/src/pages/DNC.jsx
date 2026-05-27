// DNC page — Do Not Call list management with CSV import
import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

export default function DNC() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const fileRef = useRef();

  useEffect(() => { loadDNC(); }, []);

  async function loadDNC() {
    setLoading(true);
    try {
      const r = await api.dnc.list();
      setEntries(r.dnc || []);
    } catch {}
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setAdding(true);
    try {
      await api.dnc.add(phone.trim());
      setPhone('');
      loadDNC();
    } catch (err) {
      alert(err.message || 'Failed to add number');
    }
    setAdding(false);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.dnc.import(file);
      alert(`Imported ${res.imported} numbers (${res.skipped || 0} skipped)`);
      loadDNC();
    } catch (err) {
      alert(err.message || 'Import failed');
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleRemove(id) {
    if (!confirm('Remove from DNC list?')) return;
    try {
      await api.dnc.remove(id);
      loadDNC();
    } catch (err) {
      alert(err.message || 'Failed to remove');
    }
  }

  const filtered = entries.filter(e =>
    !search || e.phone?.includes(search) || e.reason?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Do Not Call List</h1>
          <p className="page-subtitle">{entries.length} numbers blocked from calling</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input type="file" accept=".csv,.txt" ref={fileRef} style={{ display: 'none' }} onChange={handleUpload} />
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Importing…' : '↑ Import CSV'}
          </button>
        </div>
      </div>

      <div className="callout callout-info" style={{ marginBottom: '1.5rem' }}>
        Numbers on this list will never be called. TRAI mandates honouring DNC requests within 7 days. Import a CSV with a single <code>phone</code> column, or paste numbers one per line in a .txt file.
      </div>

      {/* Add form */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="form-input"
            style={{ flex: 1, maxWidth: 320 }}
            placeholder="+919876543210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <button type="submit" className="btn btn-danger" disabled={adding || !phone.trim()}>
            {adding ? 'Adding…' : 'Block Number'}
          </button>
        </form>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          className="form-input"
          style={{ maxWidth: 280 }}
          placeholder="Search phone or reason…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🚫</div>
          <h3>{search ? 'No matches' : 'DNC list is empty'}</h3>
          <p>{search ? 'Try a different search.' : 'Add numbers manually or import a CSV file.'}</p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Phone Number</th>
                <th>Reason</th>
                <th>Source</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{e.phone}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>{e.reason || '—'}</td>
                  <td>
                    <span className={`badge ${e.source === 'manual' ? 'badge-blue' : e.source === 'trai' ? 'badge-red' : 'badge-gray'}`}>
                      {e.source || 'manual'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {new Date(e.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
                      onClick={() => handleRemove(e.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
