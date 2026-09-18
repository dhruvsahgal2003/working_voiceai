// Agents page — create and manage AI voice agent configurations
import { useState, useEffect } from 'react';
import { Plus, Bot, Trash2, Edit, X, Mic, Globe, Cpu, Settings } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

const LANGUAGES = ['en-IN','hi-IN','ta-IN','te-IN','bn-IN','mr-IN','gu-IN','kn-IN','ml-IN','pa-IN','or-IN'];

// Model lookup tables — keep underlying values, show friendly labels
const STT_MODELS = [
  { value: 'saarika:v2.5', label: 'Latest — Hindi/English auto-detect (recommended)' },
  { value: 'saaras:v3',    label: 'Premium — enhanced accuracy' },
];
const TTS_MODELS = [
  { value: 'bulbul:v3', label: 'Natural Voice v3 (recommended)' },
  { value: 'bulbul:v2', label: 'Natural Voice v2' },
];
const TTS_SPEAKERS = [
  { value: 'priya',   label: 'Priya' },
  { value: 'anushka', label: 'Anushka' },
  { value: 'meera',   label: 'Meera' },
  { value: 'kalpana', label: 'Kalpana' },
  { value: 'arvind',  label: 'Arvind' },
];
const LLM_MODELS = [
  { value: 'llama-3.1-8b-instant', label: 'Fast AI — sub-150ms latency (recommended)' },
  { value: 'sarvam-30b',           label: 'Callora Intelligence 30B' },
  { value: 'sarvam-105b',          label: 'Callora Intelligence 105B' },
  { value: 'gpt-4o-mini',          label: 'GPT-4o Mini' },
  { value: 'gpt-4o',               label: 'GPT-4o' },
];

// Friendly short labels for agent cards
const STT_LABEL  = { 'saarika:v2.5': 'Voice Latest', 'saaras:v3': 'Voice Premium' };
const LLM_LABEL  = {
  'llama-3.1-8b-instant': 'Fast AI',
  'sarvam-30b': 'AI 30B', 'sarvam-105b': 'AI 105B',
  'gpt-4o-mini': 'GPT-4o Mini', 'gpt-4o': 'GPT-4o',
};

function AgentModal({ agent, onClose, onSave }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(agent || {
    name: '', system_prompt: '', first_message: '', language: 'en-IN',
    stt_model: 'saarika:v2.5', tts_model: 'bulbul:v3', tts_speaker: 'priya',
    llm_provider: 'groq', llm_model: 'llama-3.1-8b-instant', llm_temperature: 0.7,
    max_duration_minutes: 5, silence_timeout_seconds: 10,
    voicemail_detection: true, recording_enabled: true,
    end_call_phrases: 'goodbye,bye,thank you',
    hangup_on_not_interested: true, not_interested_message: '', not_interested_phrases: '',
    transfer_enabled: false, transfer_phone_number: '', transfer_prompt: '',
    transfer_message: '', transfer_trigger_phrases: '',
  });
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNum = k => e => setForm(f => ({ ...f, [k]: parseFloat(e.target.value) }));
  const setBool = k => e => setForm(f => ({ ...f, [k]: e.target.checked }));

  async function handleSave() {
    if (!form.name || !form.system_prompt) return showToast('Name and system prompt are required', 'error');
    setLoading(true);
    try {
      const toList = v => typeof v === 'string'
        ? v.split(',').map(s => s.trim()).filter(Boolean)
        : (v || []);
      const payload = {
        ...form,
        end_call_phrases: toList(form.end_call_phrases),
        not_interested_phrases: toList(form.not_interested_phrases),
        transfer_trigger_phrases: toList(form.transfer_trigger_phrases),
        // Empty string would fail the E.164 check server-side; NULL means
        // "fall back to the platform default number".
        transfer_phone_number: (form.transfer_phone_number || '').trim() || null,
      };
      if (payload.transfer_enabled && payload.transfer_phone_number &&
          !/^\+[1-9]\d{7,14}$/.test(payload.transfer_phone_number)) {
        setLoading(false);
        return showToast('Transfer number must be in E.164 format, e.g. +919876543210', 'error');
      }
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
              <label className="form-label">Speech Recognition</label>
              <select className="form-select" value={form.stt_model} onChange={set('stt_model')}>
                {STT_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Voice Engine</label>
              <select className="form-select" value={form.tts_model} onChange={set('tts_model')}>
                {TTS_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Voice</label>
              <select className="form-select" value={form.tts_speaker} onChange={set('tts_speaker')}>
                {TTS_SPEAKERS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="divider" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>AI Model</div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">AI Model</label>
              <select className="form-select" value={form.llm_model} onChange={e => {
                const v = e.target.value;
                const provider = v.startsWith('gpt') ? 'openai' : 'groq';
                setForm(f => ({ ...f, llm_model: v, llm_provider: provider }));
              }}>
                {LLM_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
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

          <div className="divider" />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>Ending &amp; Transfers</div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 10 }}>
            <input type="checkbox" checked={!!form.hangup_on_not_interested} onChange={setBool('hangup_on_not_interested')} />
            Hang up when the caller says they are not interested
          </label>
          <p className="text-muted text-sm" style={{ marginTop: -4, marginBottom: 12 }}>
            The agent says a closing line first, then ends the call — instead of staying on until the max-duration cap.
          </p>

          {form.hangup_on_not_interested && (
            <>
              <div className="form-group">
                <label className="form-label">Closing line <span className="text-muted text-sm">(leave blank for the default)</span></label>
                <input className="form-input" placeholder="Bilkul, koi baat nahi. Aapka time dene ke liye dhanyavaad. Namaste!"
                       value={form.not_interested_message || ''} onChange={set('not_interested_message')} />
              </div>
              <div className="form-group">
                <label className="form-label">Extra "not interested" phrases <span className="text-muted text-sm">(comma-separated, optional)</span></label>
                <input className="form-input" placeholder="budget nahi hai, abhi nahi soch rahe"
                       value={typeof form.not_interested_phrases === 'string' ? form.not_interested_phrases : (form.not_interested_phrases || []).join(',')}
                       onChange={set('not_interested_phrases')} />
                <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                  Added on top of the built-in Hindi and English phrases.
                </p>
              </div>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginTop: 8, marginBottom: 10 }}>
            <input type="checkbox" checked={!!form.transfer_enabled} onChange={setBool('transfer_enabled')} />
            Offer to transfer the caller to a human
          </label>
          <p className="text-muted text-sm" style={{ marginTop: -4, marginBottom: 12 }}>
            When the caller asks for a person, the agent offers to connect them and transfers the call if they accept.
          </p>

          {form.transfer_enabled && (
            <>
              <div className="form-group">
                <label className="form-label">Transfer to number <span className="text-muted text-sm">(E.164, e.g. +919876543210)</span></label>
                <input className="form-input" placeholder="+919876543210"
                       value={form.transfer_phone_number || ''} onChange={set('transfer_phone_number')} />
                <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                  Leave blank to use the platform default. If neither is set, transfers are refused rather than dialling a wrong number.
                </p>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">What it asks first</label>
                  <input className="form-input" placeholder="Kya main aapki call ek human colleague ko transfer kar doon?"
                         value={form.transfer_prompt || ''} onChange={set('transfer_prompt')} />
                </div>
                <div className="form-group">
                  <label className="form-label">What it says while connecting</label>
                  <input className="form-input" placeholder="Theek hai, main abhi aapko connect kar rahi hoon."
                         value={form.transfer_message || ''} onChange={set('transfer_message')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Extra transfer trigger phrases <span className="text-muted text-sm">(comma-separated, optional)</span></label>
                <input className="form-input" placeholder="site visit book karni hai, senior se baat"
                       value={typeof form.transfer_trigger_phrases === 'string' ? form.transfer_trigger_phrases : (form.transfer_trigger_phrases || []).join(',')}
                       onChange={set('transfer_trigger_phrases')} />
              </div>
            </>
          )}

          <div className="divider" />

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
          <p className="page-subtitle">Configure your AI voice agents — prompt, voice, and call behaviour</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}><Plus size={15} /> New Agent</button>
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
                <span className="badge badge-blue"><Mic size={11} /> {STT_LABEL[a.stt_model] || 'Voice'}</span>
                <span className="badge badge-purple"><Cpu size={11} /> {LLM_LABEL[a.llm_model] || 'AI'}</span>
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
