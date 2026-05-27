// Agents page — create and manage AI voice agent configurations
import { useState, useEffect } from 'react';
import { Plus, Bot, Trash2, Edit, X, Mic, Globe, Cpu, Settings } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

const LANGUAGES = ['en-IN','hi-IN','ta-IN','te-IN','bn-IN','mr-IN','gu-IN','kn-IN','ml-IN','pa-IN','or-IN'];
const STT_MODELS = ['saarika:v2.5','saaras:v3'];
const TTS_MODELS = ['bulbul:v3','bulbul:v2'];
const TTS_SPEAKERS = ['anushka','meera','kalpana','arvind'];
const LLM_MODELS = ['sarvam-30b','sarvam-105b','gpt-4o-mini','gpt-4o'];

function AgentModal({ agent, onClose, onSave }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(agent || {
    name: '', system_prompt: '', first_message: '', language: 'en-IN',
    stt_model: 'saarika:v2.5', tts_model: 'bulbul:v3', tts_speaker: 'anushka',
    llm_provider: 'sarvam', llm_model: 'sarvam-30b', llm_temperature: 0.7,
    max_duration_minutes: 5, silence_timeout_seconds: 10,
    voicemail_detection: true, recording_enabled: true,
    end_call_phrases: 'goodbye,bye,thank you',
  });
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = k => e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) }));
  const setBool = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function handleSave() {
    if (!form.name || !form.system_prompt) return showToast('Name and system prompt are required', 'error');
    setLoading(true);
    try {
      const payload = {
        ...form,
        end_call_phrases: typeof form.end_call_phrases === 'string'
          ? form.end_call_phrases.split(',').map(s => s.trim())
          : form.end_call_phrases,
      };
      const result = agent
        ? await api.agents.update(agent.id, payload)
        : await api.agents.create(payload);
      onSave(result.agent);
      showToast(`Agent ${agent ? 'updated' : 'created'}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <h2 className="modal-title">{agent ? 'Edit Agent' : 'New AI Agent'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Agent Name</label>
            <input className="form-input" placeholder='e.g. "Priya — Real Estate"' value={form.name} onChange={set('name')} />
          </div>
          <div className="form-group">
            <label className="form-label">System Prompt</label>
            <textarea className="form-textarea" style={{ minHeight: 120 }} placeholder="You are Priya, a professional property advisor..." value={form.system_prompt} onChange={set('system_prompt')} />
          </div>
          <div className="form-group">
            <label className="form-label">First Message <span className="text-muted text-sm">(what agent says when call connects)</span></label>
            <input className="form-input" placeholder='e.g. "Namaste! Am I speaking with you? This is Priya..."' value={form.first_message || ''} onChange={set('first_message')} />
          </div>

          <div className="divider" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Voice & Language Settings</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Language</label>
              <select className="form-select" value={form.language} onChange={set('language')}>
                {LANGUAGES.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">STT Model</label>
              <select className="form-select" value={form.stt_model} onChange={set('stt_model')}>
                {STT_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">TTS Model</label>
              <select className="form-select" value={form.tts_model} onChange={set('tts_model')}>
                {TTS_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Voice Speaker</label>
              <select className="form-select" value={form.tts_speaker} onChange={set('tts_speaker')}>
                {TTS_SPEAKERS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="divider" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>LLM Settings</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">LLM Model</label>
              <select className="form-select" value={form.llm_model} onChange={e => setForm(f => ({ ...f, llm_model: e.target.value, llm_provider: e.target.value.startsWith('sarvam') ? 'sarvam' : 'openai' }))}>
                {LLM_MODELS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Temperature (0.0 – 1.0)</label>
              <input className="form-input" type="number" min="0" max="1" step="0.1" value={form.llm_temperature} onChange={setNum('llm_temperature')} />
            </div>
          </div>

          <div className="divider" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Call Behavior</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Max Duration (minutes)</label>
              <input className="form-input" type="number" min="1" max="30" value={form.max_duration_minutes} onChange={setNum('max_duration_minutes')} />
            </div>
            <div className="form-group">
              <label className="form-label">Silence Timeout (seconds)</label>
              <input className="form-input" type="number" min="5" max="60" value={form.silence_timeout_seconds} onChange={setNum('silence_timeout_seconds')} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">End Call Phrases <span className="text-muted text-sm">(comma-separated)</span></label>
            <input className="form-input" placeholder="goodbye,bye,thank you,dhanyavaad" value={typeof form.end_call_phrases === 'string' ? form.end_call_phrases : (form.end_call_phrases || []).join(',')} onChange={set('end_call_phrases')} />
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.voicemail_detection} onChange={setBool('voicemail_detection')} /> Voicemail detection
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.recording_enabled} onChange={setBool('recording_enabled')} /> Enable recording
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : (agent ? 'Save Changes' : 'Create Agent')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Agents() {
  const { showToast } = useToast();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | agent object

  useEffect(() => {
    api.agents.list().then(d => setAgents(d.agents || [])).catch(() => setAgents([])).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this agent?')) return;
    try {
      await api.agents.delete(id);
      setAgents(prev => prev.filter(a => a.id !== id));
      showToast('Agent deleted', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  function handleSave(agent) {
    setAgents(prev => {
      const idx = prev.findIndex(a => a.id === agent.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = agent; return n; }
      return [agent, ...prev];
    });
    setModal(null);
  }

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Agents</h1>
          <p className="page-subtitle">Configure voice agents with Sarvam AI (STT + TTS + LLM)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}><Plus size={15} /> New Agent</button>
      </div>

      <div className="callout callout-info">
        <Settings size={16} />
        <div>Agents use <strong>Sarvam AI</strong> — Saarika v2.5 STT + Bulbul v3 TTS + Sarvam-30B LLM. Cost: ~₹1.70/min call.</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" /></div>
      ) : !agents.length ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Bot size={24} /></div>
          <h3>No agents yet</h3>
          <p>Create your first AI voice agent to start making calls.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('new')}><Plus size={14} /> Create Agent</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))', gap: 16 }}>
          {agents.map(a => (
            <div key={a.id} className="agent-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, background: 'var(--accent-light)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bot size={16} color="var(--accent)" />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => setModal(a)}><Edit size={14} /></button>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => handleDelete(a.id)} style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
                </div>
              </div>

              <div className="agent-badge-row">
                <span className="badge badge-accent"><Globe size={11} /> {a.language}</span>
                <span className="badge badge-blue"><Mic size={11} /> {a.stt_model}</span>
                <span className="badge badge-purple"><Cpu size={11} /> {a.llm_model}</span>
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {a.system_prompt}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{a.max_duration_minutes}m</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max duration</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{a.tts_speaker}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Voice</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{a.llm_temperature}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Temp</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AgentModal
          agent={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
