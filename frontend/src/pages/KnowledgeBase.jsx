import { useState, useEffect, useRef } from 'react';
import { Plus, BookOpen, Trash2, Edit, X, Upload, FileText, Search, File } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

const TYPE_LABELS = {
  text: { label: 'Text / FAQ', color: 'badge-blue' },
  script: { label: 'Call Script', color: 'badge-purple' },
  objections: { label: 'Objections', color: 'badge-amber' },
  product: { label: 'Product Info', color: 'badge-green' },
  document: { label: 'Document', color: 'badge-gray' },
  policy: { label: 'Policy', color: 'badge-cyan' },
};

function DocModal({ doc, onClose, onSave }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(doc || { title: '', content: '', type: 'text' });
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!form.title || !form.content) return showToast('Title and content required', 'error');
    setLoading(true);
    try {
      const res = doc ? await api.knowledge.update(doc.id, form) : await api.knowledge.create(form);
      onSave(res.document);
      showToast(`Document ${doc ? 'updated' : 'added'}`, 'success');
    } catch (err) { showToast(err.message, 'error'); } finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2 className="modal-title">{doc ? 'Edit Document' : 'Add Knowledge'}</h2>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 1' }}>
              <label className="form-label">Title</label>
              <input className="form-input" placeholder="e.g. Objection Handling Guide" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="text">Text / FAQ</option>
                <option value="script">Call Script</option>
                <option value="objections">Objection Handling</option>
                <option value="product">Product Info</option>
                <option value="policy">Policy / Compliance</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Content</label>
            <textarea className="form-textarea" style={{ minHeight: 220 }}
              placeholder="Paste your knowledge content here. The AI will use this as context during calls."
              value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : (doc ? 'Save' : 'Add Document')}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadModal({ onClose, onSave }) {
  const { showToast } = useToast();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  function handleFile(f) {
    if (!f) return;
    const allowed = ['.pdf', '.docx', '.txt'];
    const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
    if (!allowed.includes(ext)) return showToast('Only PDF, DOCX, and TXT files are supported', 'error');
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
  }

  async function handleUpload() {
    if (!file) return showToast('Select a file first', 'error');
    setLoading(true);
    try {
      const res = await api.knowledge.upload(file, title);
      onSave(res.document);
      showToast(`Uploaded and parsed: ${res.document.word_count} words`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const icons = { pdf: '📄', docx: '📝', txt: '📃' };
  const ext = file?.name.toLowerCase().slice(file.name.lastIndexOf('.') + 1);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Document</h2>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body">
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            style={{ border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border2)'}`, borderRadius: 12, padding: '32px 24px', textAlign: 'center', cursor: 'pointer', background: drag ? 'var(--accent-light)' : 'var(--surface2)', transition: 'all 0.2s', marginBottom: 16 }}
          >
            <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            {file ? (
              <div>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{icons[ext] || '📄'}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div>
                <Upload size={28} style={{ color: 'var(--text-dim)', marginBottom: 10 }} />
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Drag & drop or click to upload</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>PDF, DOCX, or TXT · Max 20MB</div>
              </div>
            )}
          </div>

          {file && (
            <div className="form-group">
              <label className="form-label">Document Title</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Name for this document" />
            </div>
          )}

          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Text is extracted from your file and stored as context. The AI agent will reference it during calls.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpload} disabled={loading || !file}>
            {loading ? <><span className="spinner spinner-sm" /> Parsing...</> : <><Upload size={14} /> Upload & Parse</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeBase() {
  const { showToast } = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.knowledge.list().then(d => setDocs(d.documents || [])).catch(() => setDocs([])).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this document?')) return;
    try {
      await api.knowledge.delete(id);
      setDocs(prev => prev.filter(d => d.id !== id));
      showToast('Document deleted', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  function handleSave(doc) {
    setDocs(prev => {
      const idx = prev.findIndex(d => d.id === doc.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = doc; return n; }
      return [doc, ...prev];
    });
    setModal(null);
    setShowUpload(false);
  }

  const filtered = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Knowledge Base</h1>
          <p className="page-subtitle">Documents and text the AI references during calls</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowUpload(true)}>
            <Upload size={14} /> Upload File
          </button>
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <Plus size={14} /> Add Text
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Search documents..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <h3>{search ? 'No results found' : 'No documents yet'}</h3>
          <p>{search ? 'Try a different search term.' : 'Upload PDFs, Word docs, or paste text. The AI uses these as context during calls.'}</p>
          {!search && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowUpload(true)}><Upload size={14} /> Upload File</button>
              <button className="btn btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Add Text</button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Words</th>
                <th>Added</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => {
                const t = TYPE_LABELS[doc.type] || TYPE_LABELS.text;
                return (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {doc.type === 'document' ? <File size={14} color="var(--text-muted)" /> : <FileText size={14} color="var(--accent)" />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{doc.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.content.slice(0, 80)}...</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${t.color}`}>{t.label}</span></td>
                    <td className="cell-muted">{(doc.word_count || 0).toLocaleString()}</td>
                    <td className="cell-muted">{new Date(doc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm btn-icon-sm" onClick={() => setModal(doc)}><Edit size={13} /></button>
                        <button className="btn btn-ghost btn-sm btn-icon-sm" onClick={() => handleDelete(doc.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSave={handleSave} />}
      {modal && <DocModal doc={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSave={handleSave} />}
    </div>
  );
}
