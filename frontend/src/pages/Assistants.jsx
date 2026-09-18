import { useState, useEffect } from 'react';
import { Plus, Bot, Trash2, Sparkles, RotateCcw, X, Mic, Globe, Cpu, BookOpen, ArrowLeft, Save, Check, Webhook, ExternalLink, Zap } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';

const LANGUAGES = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'bn-IN', label: 'Bengali' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'gu-IN', label: 'Gujarati' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'ml-IN', label: 'Malayalam' },
  { value: 'pa-IN', label: 'Punjabi' },
];

const TTS_SPEAKERS = [
  // ── Female — Customer Care (phone-optimised) ──
  { value: 'meera',   label: 'Meera',   gender: 'F', note: '⭐ Sharp, crystal-clear · Best for sales', recommended: true },
  { value: 'ishita',  label: 'Ishita',  gender: 'F', note: '⭐ Crisp, professional · Great on phone', recommended: true },
  { value: 'pooja',   label: 'Pooja',   gender: 'F', note: 'Warm & friendly · Customer care' },
  { value: 'simran',  label: 'Simran',  gender: 'F', note: 'Confident, clear · Hinglish-ready' },
  { value: 'ritu',    label: 'Ritu',    gender: 'F', note: 'Soft, trustworthy · Relationship calls' },
  { value: 'shreya',  label: 'Shreya',  gender: 'F', note: 'Energetic, expressive' },
  { value: 'kavya',   label: 'Kavya',   gender: 'F', note: 'Upbeat, fast-paced' },
  { value: 'priya',   label: 'Priya',   gender: 'F', note: 'Neutral, natural tone' },
  // ── Female — Content / Richer Voice ──
  { value: 'neha',    label: 'Neha',    gender: 'F', note: 'Bright, broadcast quality' },
  { value: 'roopa',   label: 'Roopa',   gender: 'F', note: 'Mature, authoritative' },
  // ── Male — Customer Care ──
  { value: 'dev',     label: 'Dev',     gender: 'M', note: '⭐ Clear, professional · Great on phone', recommended: true },
  { value: 'rohan',   label: 'Rohan',   gender: 'M', note: 'Friendly, youthful energy' },
  { value: 'rahul',   label: 'Rahul',   gender: 'M', note: 'Warm, approachable' },
  { value: 'amit',    label: 'Amit',    gender: 'M', note: 'Calm, trustworthy' },
  { value: 'shubh',   label: 'Shubh',   gender: 'M', note: 'Smooth, customer care' },
  // ── Male — Content ──
  { value: 'kabir',   label: 'Kabir',   gender: 'M', note: 'Deep, confident' },
  { value: 'aditya',  label: 'Aditya',  gender: 'M', note: 'Dynamic, broadcast quality' },
  { value: 'varun',   label: 'Varun',   gender: 'M', note: 'Energetic, expressive' },
];

const LLM_MODELS = [
  { value: 'llama-3.1-8b-instant',    label: 'Ultra-Fast',             badge: '⚡ Fastest · Best for most calls', recommended: true },
  { value: 'llama-3.3-70b-versatile', label: 'Standard',               badge: '⚡ Fast · Smarter responses' },
  { value: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini Live', badge: '🔊 Speech-to-speech · Natural tone', realtime: true },
  { value: 'sarvam-m',                label: 'Hindi Specialist (Fast)', badge: 'Optimised for Hindi conversations' },
  { value: 'sarvam-30b',              label: 'Hindi Specialist',        badge: 'Hindi native · Balanced' },
  { value: 'sarvam-105b',             label: 'Hindi Specialist (Pro)',  badge: 'Hindi native · Smartest' },
  { value: 'gpt-4o-mini',             label: 'GPT-4o mini',            badge: 'Premium · High accuracy' },
  { value: 'gpt-4o',                  label: 'GPT-4o',                 badge: 'Premium · Best quality' },
];

// Friendly display labels for agent card badges (no internal model names)
const LLM_BADGE = {
  'llama-3.1-8b-instant': 'Fast AI', 'llama-3.3-70b-versatile': 'AI',
  'sarvam-m': 'Hindi AI', 'sarvam-30b': 'AI 30B', 'sarvam-105b': 'AI 105B',
  'gpt-4o-mini': 'GPT-4o Mini', 'gpt-4o': 'GPT-4o',
  'gemini-2.5-flash-native-audio-preview-12-2025': 'Gemini Live',
};

// Gemini Live voices (used only when a realtime model is selected)
const GEMINI_VOICES = [
  { value: 'Aoede',   label: 'Aoede',   gender: 'F', note: 'Warm, conversational' },
  { value: 'Kore',    label: 'Kore',    gender: 'F', note: 'Neutral, professional' },
  { value: 'Leda',    label: 'Leda',    gender: 'F', note: 'Soft, friendly' },
  { value: 'Zephyr',  label: 'Zephyr',  gender: 'F', note: 'Bright, energetic' },
  { value: 'Puck',    label: 'Puck',    gender: 'M', note: 'Cheerful, upbeat' },
  { value: 'Charon',  label: 'Charon',  gender: 'M', note: 'Deep, authoritative' },
  { value: 'Fenrir',  label: 'Fenrir',  gender: 'M', note: 'Strong, confident' },
  { value: 'Orus',    label: 'Orus',    gender: 'M', note: 'Calm, measured' },
];

const isRealtimeModel = (m) => LLM_MODELS.find(x => x.value === m)?.realtime;

const INDUSTRIES = ['Real Estate', 'Financial Services', 'Healthcare', 'Education', 'Logistics', 'E-commerce', 'Insurance', 'HR & Recruitment', 'Other'];
const USE_CASES = ['Lead Qualification', 'Appointment Booking', 'Payment Reminders', 'Customer Follow-up', 'Survey / Feedback', 'Loan Collections', 'Admissions Enquiry', 'Order Confirmation', 'Welcome Call', 'Other'];
const TONES = ['Professional & Friendly', 'Formal & Authoritative', 'Casual & Conversational', 'Empathetic & Caring', 'Energetic & Sales-oriented'];

const TABS = [
  { id: 'prompt', label: 'Prompt' },
  { id: 'voice', label: 'Voice' },
  { id: 'call', label: 'Call Settings' },
  { id: 'kb', label: 'Knowledge Base' },
  { id: 'analysis', label: 'Custom Analysis' },
  { id: 'events', label: 'Event Subscription' },
];

const WEBHOOK_EVENTS = [
  { id: 'call.started', label: 'Call Started', desc: 'Fires when a call connects' },
  { id: 'call.completed', label: 'Call Completed', desc: 'Fires when any call ends' },
  { id: 'recording.ready', label: 'Recording Ready', desc: 'Recording URL available' },
  { id: 'analysis.done', label: 'Platform Analysis Done', desc: 'Post-call AI analysis complete' },
  { id: 'call.hot_lead', label: 'Hot Lead', desc: 'Lead marked as interested' },
  { id: 'campaign.completed', label: 'All Processing Done', desc: 'All leads in campaign processed' },
];

// ── AI WIZARD ──────────────────────────────────────────────────────────────────
function AIWizard({ onClose, onDone }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ company_name: '', industry: '', use_case: '', tone: TONES[0], language: 'hi-IN', extra: '' });
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleGenerate() {
    if (!form.company_name || !form.use_case) return showToast('Company name and use case are required', 'error');
    setLoading(true);
    try {
      const res = await api.agents.generatePrompt(form);
      setGenerated({ prompt: res.prompt, first_message: res.first_message });
    } catch (err) { showToast('AI generation failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await api.agents.create({
        name: `${form.company_name} — ${form.use_case}`,
        system_prompt: generated.prompt,
        first_message: generated.first_message,
        language: form.language,
        stt_model: 'saarika:v2.5', tts_model: 'bulbul:v3',
        tts_speaker: form.language.startsWith('hi') ? 'priya' : 'priya',
        llm_provider: 'groq', llm_model: 'llama-3.1-8b-instant', llm_temperature: 0.6,
        max_duration_minutes: 5, silence_timeout_seconds: 10,
        voicemail_detection: true, recording_enabled: true,
        end_call_phrases: ['goodbye', 'bye', 'thank you', 'dhanyawad', 'shukriya'],
      });
      showToast('Assistant created!', 'success');
      onDone(res.agent);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: generated ? 700 : 480 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#5b5bd6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={14} color="white" />
            </div>
            <h2 className="modal-title">Build with AI</h2>
          </div>
          <button className="modal-close" onClick={onClose}><X size={15} /></button>
        </div>

        <div className="modal-body">
          {!generated ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Answer 4 questions — AI writes a full conversation script in seconds.
              </div>
              <div className="form-group">
                <label className="form-label">Company / Brand Name *</label>
                <input className="form-input" placeholder="e.g. Axis Bank, Ahuja Real Estate" value={form.company_name} onChange={set('company_name')} autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Industry</label>
                  <select className="form-select" value={form.industry} onChange={set('industry')}>
                    <option value="">Select industry</option>
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Use Case *</label>
                  <select className="form-select" value={form.use_case} onChange={set('use_case')}>
                    <option value="">Select use case</option>
                    {USE_CASES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Language</label>
                  <select className="form-select" value={form.language} onChange={set('language')}>
                    {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tone</label>
                  <select className="form-select" value={form.tone} onChange={set('tone')}>
                    {TONES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Additional context <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span></label>
                <textarea className="form-textarea" placeholder="e.g. Focus on premium home buyers in Mumbai, budget 1–2 Cr..." value={form.extra} onChange={set('extra')} style={{ minHeight: 70 }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI-generated — edit freely before creating</div>
                <button className="btn btn-ghost btn-sm" onClick={handleGenerate} disabled={loading}>
                  <RotateCcw size={12} /> Regenerate
                </button>
              </div>
              <div className="form-group">
                <label className="form-label">Opening Message</label>
                <input className="form-input" value={generated.first_message}
                  onChange={e => setGenerated(g => ({ ...g, first_message: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">System Prompt / Script</label>
                <textarea className="form-textarea" style={{ minHeight: 320, fontSize: 12.5, fontFamily: 'monospace' }}
                  value={generated.prompt}
                  onChange={e => setGenerated(g => ({ ...g, prompt: e.target.value }))} />
              </div>
            </>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={generated ? () => setGenerated(null) : onClose}>
            {generated ? '← Back' : 'Cancel'}
          </button>
          {!generated ? (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={loading || !form.company_name || !form.use_case}>
              {loading ? <><span className="spinner spinner-sm" /> Generating...</> : <><Sparkles size={14} /> Generate Script</>}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? <span className="spinner spinner-sm" /> : 'Create Assistant'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PROMPT TAB ─────────────────────────────────────────────────────────────────

const BLANK_SPEC = (language) => ({
  persona: { agent_name: '', company: '', role: '', tone: '' },
  language: {
    primary: (language || '').startsWith('hi') ? 'hi' : 'en',
    script: (language || '').startsWith('hi') ? 'devanagari' : 'latin',
    roman_terms: [],
  },
  goal: '',
  opening_line: '',
  facts: [{ label: '', value: '' }],
  deflections: [{ when: '', say: '' }],
  closing: { success: '', not_interested: '' },
  constraints: { max_words_per_reply: 15 },
});

const hint = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 };
const rowStyle = { display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' };

function SectionTitle({ children, note }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="settings-section-title" style={{ marginBottom: 2 }}>{children}</div>
      {note && <div style={hint}>{note}</div>}
    </div>
  );
}

/** Repeatable {a, b} rows — used for both facts and deflections. */
function PairRows({ rows, onChange, aKey, bKey, aPlaceholder, bPlaceholder, addLabel }) {
  const set = (i, key, val) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={rowStyle}>
          <input className="form-input" style={{ flex: '0 0 30%' }} placeholder={aPlaceholder}
            value={r[aKey] || ''} onChange={e => set(i, aKey, e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder={bPlaceholder}
            value={r[bKey] || ''} onChange={e => set(i, bKey, e.target.value)} />
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', flexShrink: 0 }}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}><X size={13} /></button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 18 }}
        onClick={() => onChange([...rows, { [aKey]: '', [bKey]: '' }])}>
        <Plus size={13} /> {addLabel}
      </button>
    </>
  );
}

function PromptTab({ form, update }) {
  const { showToast } = useToast();
  const spec = form.prompt_spec || null;
  const [compiled, setCompiled] = useState(form.system_prompt || '');
  const [converting, setConverting] = useState(false);

  // Preview what the model will actually receive. Debounced because it runs on
  // every keystroke; the endpoint is a pure function so there is nothing to undo.
  useEffect(() => {
    if (!spec) return;
    const t = setTimeout(() => {
      api.agents.compilePrompt(spec)
        .then(d => setCompiled(d.system_prompt))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [spec]);

  const setSpec = (patch) => update('prompt_spec', { ...spec, ...patch });
  const setIn = (section, key, val) => setSpec({ [section]: { ...(spec[section] || {}), [key]: val } });

  async function convertFromText() {
    if (!form.system_prompt?.trim()) return showToast('Nothing to convert — write a prompt first', 'error');
    setConverting(true);
    try {
      const d = await api.agents.parsePrompt({ system_prompt: form.system_prompt, language: form.language });
      update('prompt_spec', d.prompt_spec);
      setCompiled(d.system_prompt);
      showToast('Converted — check the fields, then Save', 'success');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setConverting(false); }
  }

  const firstMessage = (
    <div className="form-group">
      <label className="form-label">First Message</label>
      <div style={hint}>
        The first thing the agent says when the call connects.{' '}
        Variables:{' '}
        {['{{name}}', '{{city}}', '{{budget}}', '{{property_type}}'].map(v => (
          <code key={v} style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>{v}</code>
        ))}
        {' '}are replaced with lead data.
      </div>
      <textarea className="form-textarea" style={{ minHeight: 72 }}
        placeholder="e.g. नमस्ते {{name}} जी! मैं Riya बोल रही हूं Real Concept से।"
        value={form.first_message || ''}
        onChange={e => update('first_message', e.target.value)} />
    </div>
  );

  // ── Legacy free-text mode ──
  if (!spec) {
    return (
      <div style={{ maxWidth: 780 }}>
        {firstMessage}
        <div className="form-group">
          <label className="form-label">System Prompt / Script</label>
          <div style={hint}>
            Free-text prompt. Switching to structured fields is strongly recommended: the
            compiler enforces one-sentence replies, stops the agent repeating itself, and
            tells it the caller's number is already on file.
          </div>
          <textarea className="form-textarea" style={{ minHeight: 380, fontSize: 13, lineHeight: 1.65 }}
            placeholder="## Objective&#10;You are Priya, a lead qualification agent for ABC Company...&#10;&#10;## Conversation Script&#10;Step 1: Opening..."
            value={form.system_prompt || ''}
            onChange={e => update('system_prompt', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={convertFromText} disabled={converting}>
            {converting ? <span className="spinner spinner-sm" /> : <><Sparkles size={13} /> Convert to structured</>}
          </button>
          <button className="btn btn-secondary btn-sm"
            onClick={() => update('prompt_spec', BLANK_SPEC(form.language))}>
            <Plus size={13} /> Start structured from scratch
          </button>
        </div>
      </div>
    );
  }

  // ── Structured mode ──
  const p = spec.persona || {};
  const lang = spec.language || {};
  const closing = spec.closing || {};
  const constraints = spec.constraints || {};

  return (
    <div style={{ maxWidth: 820 }}>
      {firstMessage}

      <div className="settings-section">
        <SectionTitle note="Who the agent is. The greeting has already happened, so it will not re-introduce itself.">Identity</SectionTitle>
        <div style={rowStyle}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Agent name, e.g. Priya"
            value={p.agent_name || ''} onChange={e => setIn('persona', 'agent_name', e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder="Company, e.g. Real Concept"
            value={p.company || ''} onChange={e => setIn('persona', 'company', e.target.value)} />
        </div>
        <div style={rowStyle}>
          <input className="form-input" style={{ flex: 1 }} placeholder="Role, e.g. sales executive"
            value={p.role || ''} onChange={e => setIn('persona', 'role', e.target.value)} />
          <input className="form-input" style={{ flex: 1 }} placeholder="Tone, e.g. casual and friendly"
            value={p.tone || ''} onChange={e => setIn('persona', 'tone', e.target.value)} />
        </div>
      </div>

      <div className="settings-section">
        <SectionTitle note="Devanagari is required for Hindi — the voice engine reads Roman Hindi with English pronunciation. Terms below stay in Latin script.">Language</SectionTitle>
        <div style={rowStyle}>
          <select className="form-select" style={{ flex: '0 0 220px' }} value={lang.script || 'latin'}
            onChange={e => setIn('language', 'script', e.target.value)}>
            <option value="devanagari">Hindi — Devanagari script</option>
            <option value="latin">English — Latin script</option>
          </select>
          <input className="form-input" style={{ flex: 1 }}
            placeholder="Keep in Roman: WhatsApp, 3BHK, RERA"
            value={(lang.roman_terms || []).join(', ')}
            onChange={e => setIn('language', 'roman_terms', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
        </div>
      </div>

      <div className="settings-section">
        <SectionTitle>Goal</SectionTitle>
        <textarea className="form-textarea" style={{ minHeight: 60, marginBottom: 14 }}
          placeholder="e.g. Property की short pitch दीजिए और सवालों के जवाब दीजिए।"
          value={spec.goal || ''} onChange={e => setSpec({ goal: e.target.value })} />

        <SectionTitle note="The single line the agent opens with after the greeting. Keep it to one sentence.">Opening line</SectionTitle>
        <textarea className="form-textarea" style={{ minHeight: 60 }}
          placeholder="e.g. Elaira Residences — 5.5 acre की premium township है। details भेज दूं?"
          value={spec.opening_line || ''} onChange={e => setSpec({ opening_line: e.target.value })} />
      </div>

      <div className="settings-section">
        <SectionTitle note="The only things the agent is allowed to state. It is told never to invent a price, size or amenity beyond these.">Facts</SectionTitle>
        <PairRows rows={spec.facts || []} onChange={v => setSpec({ facts: v })}
          aKey="label" bKey="value" aPlaceholder="Project" bPlaceholder="Conscient Elaira Residences, 5.5 acre township"
          addLabel="Add fact" />
      </div>

      <div className="settings-section">
        <SectionTitle note="What to say when it does not know. Each of these is automatically limited to once per call, which is what stops the endless 'WhatsApp पर भेज दूं' loop.">Deflections</SectionTitle>
        <PairRows rows={spec.deflections || []} onChange={v => setSpec({ deflections: v })}
          aKey="when" bKey="say" aPlaceholder="price, floor plan" bPlaceholder="वो details मैं WhatsApp पर भेज देती हूं"
          addLabel="Add deflection" />
      </div>

      <div className="settings-section">
        <SectionTitle note="Saying either of these ends the call — the agent hangs up a few seconds later.">Closing</SectionTitle>
        <input className="form-input" style={{ marginBottom: 6 }} placeholder="On success, e.g. मैं WhatsApp पर floor plans भेज देती हूं।"
          value={closing.success || ''} onChange={e => setIn('closing', 'success', e.target.value)} />
        <input className="form-input" placeholder="If not interested, e.g. कोई बात नहीं, ज़रूरत हो तो हम यहाँ हैं।"
          value={closing.not_interested || ''} onChange={e => setIn('closing', 'not_interested', e.target.value)} />
      </div>

      <div className="settings-section">
        <SectionTitle>Limits</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Max words per reply</span>
          <input className="form-input" type="number" min={5} max={40} style={{ width: 90 }}
            value={constraints.max_words_per_reply ?? 15}
            onChange={e => setIn('constraints', 'max_words_per_reply', parseInt(e.target.value) || 15)} />
        </div>
      </div>

      <div className="settings-section">
        <SectionTitle note="Generated from the fields above — this exact text is what the model receives. Edit the fields, not the text.">Compiled prompt</SectionTitle>
        <pre style={{
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
          padding: 14, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          maxHeight: 360, overflowY: 'auto', color: 'var(--text-muted)', margin: 0,
        }}>{compiled}</pre>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => update('prompt_spec', null)}>
          Switch back to free text
        </button>
      </div>
    </div>
  );
}

// ── VOICE TAB ──────────────────────────────────────────────────────────────────
function VoiceTab({ form, update }) {
  const isRealtime = isRealtimeModel(form.llm_model);
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="settings-section">
        <div className="settings-section-title">Language</div>
        <div className="form-group" style={{ maxWidth: 320 }}>
          <select className="form-select" value={form.language || 'en-IN'} onChange={e => update('language', e.target.value)}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          Voice
          {isRealtime && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: 'var(--accent)', background: 'var(--accent-light)', padding: '2px 8px', borderRadius: 4 }}>Gemini Live voices</span>}
        </div>
        {isRealtime ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, maxWidth: 680 }}>
            {GEMINI_VOICES.map(s => (
              <div key={s.value}
                onClick={() => update('realtime_voice', s.value)}
                style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${(form.realtime_voice || 'Aoede') === s.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: (form.realtime_voice || 'Aoede') === s.value ? 'var(--accent-light)' : 'var(--surface)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.gender === 'F' ? '#fce7f3' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                    {s.gender === 'F' ? '👩' : '👨'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.note}</div>
                  </div>
                </div>
                {(form.realtime_voice || 'Aoede') === s.value && <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={11} /> Selected</div>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 580 }}>
            {TTS_SPEAKERS.map(s => (
              <div key={s.value}
                onClick={() => update('tts_speaker', s.value)}
                style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                  border: `2px solid ${form.tts_speaker === s.value ? 'var(--accent)' : s.recommended ? '#a5b4fc' : 'var(--border)'}`,
                  background: form.tts_speaker === s.value ? 'var(--accent-light)' : s.recommended ? '#f5f3ff' : 'var(--surface)',
                  position: 'relative',
                }}>
                {s.recommended && form.tts_speaker !== s.value && (
                  <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 9, fontWeight: 700, color: '#6d28d9', background: '#ede9fe', borderRadius: 4, padding: '1px 5px' }}>TOP</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.gender === 'F' ? '#fce7f3' : '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                    {s.gender === 'F' ? '👩' : '👨'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.gender === 'F' ? 'Female' : 'Male'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: s.recommended ? '#5b21b6' : 'var(--text-muted)', lineHeight: 1.3, minHeight: 26 }}>{s.note}</div>
                {form.tts_speaker === s.value && <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}><Check size={11} /> Selected</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Language Models</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 540 }}>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">LLM Model</label>
            <select className="form-select" value={form.llm_model || 'sarvam-30b'}
              onChange={e => update('llm_model', e.target.value)}>
              {LLM_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}{m.recommended ? ' ★' : ''}</option>)}
            </select>
            {isRealtime && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--accent-light)', borderRadius: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                🚀 <strong>Speech-to-speech mode.</strong> Gemini Live handles audio in/out directly — no separate STT/TTS. Set <code style={{ fontSize: 11, background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>GEMINI_API_KEY</code> in agent/.env. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>aistudio.google.com/apikey</a>.
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Temperature <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(0 = focused, 1 = creative)</span></label>
            <input className="form-input" type="number" min="0" max="1" step="0.1"
              value={form.llm_temperature ?? 0.7}
              onChange={e => update('llm_temperature', parseFloat(e.target.value))} />
          </div>
          {!isRealtime && (
            <>
              <div className="form-group">
                <label className="form-label">Speech Recognition</label>
                <select className="form-select" value={form.stt_model || 'saarika:v2.5'}
                  onChange={e => update('stt_model', e.target.value)}>
                  <option value="saarika:v2.5">Latest (recommended)</option>
                  <option value="saarika:v1">Standard</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Voice Synthesis</label>
                <select className="form-select" value={form.tts_model || 'bulbul:v3'}
                  onChange={e => update('tts_model', e.target.value)}>
                  <option value="bulbul:v3">Latest (recommended)</option>
                  <option value="bulbul:v2">Standard</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CALL SETTINGS TAB ──────────────────────────────────────────────────────────
function CallTab({ form, update }) {
  return (
    <div style={{ maxWidth: 620 }}>
      <div className="settings-section">
        <div className="settings-section-title">Call Duration & Timing</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Max Duration (minutes)</label>
            <input className="form-input" type="number" min="1" max="30"
              value={form.max_duration_minutes || 5}
              onChange={e => update('max_duration_minutes', parseInt(e.target.value))} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Call auto-ends after this time</div>
          </div>
          <div className="form-group">
            <label className="form-label">Silence Timeout (seconds)</label>
            <input className="form-input" type="number" min="5" max="60"
              value={form.silence_timeout_seconds || 10}
              onChange={e => update('silence_timeout_seconds', parseInt(e.target.value))} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>End call after this silence</div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">End Call Triggers</div>
        <div className="form-group">
          <label className="form-label">End Call Phrases <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(comma-separated)</span></label>
          <input className="form-input"
            placeholder="goodbye, bye, thank you, dhanyawad, shukriya"
            value={typeof form.end_call_phrases === 'string' ? form.end_call_phrases : (form.end_call_phrases || []).join(', ')}
            onChange={e => update('end_call_phrases', e.target.value)} />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>When the agent hears these phrases it ends the call</div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Not Interested</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={form.hangup_on_not_interested !== false}
            onChange={e => update('hangup_on_not_interested', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
          Hang up when the caller says they are not interested
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          The agent says a closing line first, then ends the call — instead of staying on until the max-duration cap.
        </div>
        {form.hangup_on_not_interested !== false && (
          <>
            <div className="form-group">
              <label className="form-label">Closing Line <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(blank = default)</span></label>
              <input className="form-input"
                placeholder="Bilkul, koi baat nahi. Aapka time dene ke liye dhanyavaad. Namaste!"
                value={form.not_interested_message || ''}
                onChange={e => update('not_interested_message', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Extra Phrases <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(comma-separated, optional)</span></label>
              <input className="form-input"
                placeholder="budget nahi hai, abhi nahi soch rahe"
                value={typeof form.not_interested_phrases === 'string' ? form.not_interested_phrases : (form.not_interested_phrases || []).join(', ')}
                onChange={e => update('not_interested_phrases', e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Added on top of the built-in Hindi and English phrases</div>
            </div>
          </>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Transfer to a Human</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={!!form.transfer_enabled}
            onChange={e => update('transfer_enabled', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
          Offer to transfer the caller to a human
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          When the caller asks for a person, the agent offers to connect them and transfers the call if they accept.
        </div>
        {form.transfer_enabled && (
          <>
            <div className="form-group">
              <label className="form-label">Transfer to Number <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(E.164, e.g. +919876543210)</span></label>
              <input className="form-input" placeholder="+919876543210"
                value={form.transfer_phone_number || ''}
                onChange={e => update('transfer_phone_number', e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Blank uses the platform default. If neither is set, transfers are refused rather than dialling a wrong number.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">What It Asks First</label>
              <input className="form-input"
                placeholder="Kya main aapki call ek human colleague ko transfer kar doon?"
                value={form.transfer_prompt || ''}
                onChange={e => update('transfer_prompt', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">What It Says While Connecting</label>
              <input className="form-input"
                placeholder="Theek hai, main abhi aapko connect kar rahi hoon. Ek moment."
                value={form.transfer_message || ''}
                onChange={e => update('transfer_message', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Extra Trigger Phrases <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(comma-separated, optional)</span></label>
              <input className="form-input"
                placeholder="senior se baat, manager se baat"
                value={typeof form.transfer_trigger_phrases === 'string' ? form.transfer_trigger_phrases : (form.transfer_trigger_phrases || []).join(', ')}
                onChange={e => update('transfer_trigger_phrases', e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Voicemail</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={!!form.voicemail_detection}
              onChange={e => update('voicemail_detection', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
            Detect voicemail and leave a message
          </label>
        </div>
        {form.voicemail_detection && (
          <div className="form-group">
            <label className="form-label">Voicemail Message</label>
            <textarea className="form-textarea" style={{ minHeight: 72 }}
              placeholder="Hi, this is [Name] from [Company]. I was calling regarding your enquiry. Please call us back. Thank you."
              value={form.voicemail_message || ''}
              onChange={e => update('voicemail_message', e.target.value)} />
          </div>
        )}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Recording</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={!!form.recording_enabled}
            onChange={e => update('recording_enabled', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
          Record all calls
        </label>
      </div>
    </div>
  );
}

// ── KNOWLEDGE BASE TAB ─────────────────────────────────────────────────────────
function KBTab({ form, kbDocs }) {
  return (
    <div style={{ maxWidth: 680 }}>
      <div className="callout callout-info" style={{ marginBottom: 20 }}>
        <BookOpen size={14} />
        <div style={{ fontSize: 13 }}>Documents added to Knowledge Base are available for all agents. Go to Knowledge Base to upload PDFs, DOCX, or text.</div>
      </div>
      {!kbDocs.length ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
          <h3>No documents yet</h3>
          <p>Upload product brochures, FAQs, or price lists so the agent can answer detailed questions.</p>
          <a href="/knowledge" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} /> Upload Documents
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kbDocs.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{doc.doc_type} · {doc.word_count ? `${doc.word_count} words` : ''}</div>
              </div>
              <span className="badge badge-green">Active</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ANALYSIS TAB ───────────────────────────────────────────────────────────────
function AnalysisTab({ form, update }) {
  const [raw, setRaw] = useState(
    form.analysis_schema ? JSON.stringify(form.analysis_schema, null, 2) : ''
  );
  const [err, setErr] = useState('');

  function handleChange(v) {
    setRaw(v);
    try {
      if (v.trim()) { JSON.parse(v); update('analysis_schema', JSON.parse(v)); }
      else update('analysis_schema', {});
      setErr('');
    } catch { setErr('Invalid JSON'); }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Custom Analysis Schema</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Define fields to extract from each call. After every call, the AI fills these fields automatically.
        </div>
      </div>
      <div className="callout callout-info" style={{ marginBottom: 16 }}>
        <span>💡</span>
        <div style={{ fontSize: 12 }}>
          Example: <code style={{ fontSize: 11 }}>{'{"interested": "boolean", "budget_range": "string", "callback_time": "string"}'}</code>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Schema (JSON)</label>
        <textarea className="form-textarea" style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12.5 }}
          value={raw}
          onChange={e => handleChange(e.target.value)}
          placeholder={'{\n  "interested": "boolean",\n  "budget_range": "string",\n  "timeline": "string",\n  "callback_time": "string"\n}'} />
        {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{err}</div>}
      </div>
    </div>
  );
}

// ── EVENT SUBSCRIPTION TAB ────────────────────────────────────────────────────
function EventsTab() {
  const { showToast } = useToast();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ url: '', events: [], headers: [] });
  const [saving, setSaving] = useState(false);
  const [headerKey, setHeaderKey] = useState('');
  const [headerVal, setHeaderVal] = useState('');

  useEffect(() => {
    api.webhooks.list().then(d => setWebhooks(d.webhooks || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function toggleEvent(id) {
    setForm(f => ({
      ...f,
      events: f.events.includes(id) ? f.events.filter(e => e !== id) : [...f.events, id],
    }));
  }

  function addHeader() {
    if (!headerKey.trim()) return;
    setForm(f => ({ ...f, headers: [...f.headers, { key: headerKey.trim(), value: headerVal.trim() }] }));
    setHeaderKey(''); setHeaderVal('');
  }

  function removeHeader(i) {
    setForm(f => ({ ...f, headers: f.headers.filter((_, idx) => idx !== i) }));
  }

  async function handleSave() {
    if (!form.url) return showToast('Callback URL is required', 'error');
    if (!form.events.length) return showToast('Select at least one event', 'error');
    setSaving(true);
    try {
      const res = await api.webhooks.create({ url: form.url, events: form.events, name: form.url });
      setWebhooks(prev => [res.webhook, ...prev]);
      setForm({ url: '', events: [], headers: [] });
      showToast('Webhook saved', 'success');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    try {
      await api.webhooks.delete(id);
      setWebhooks(prev => prev.filter(w => w.id !== id));
      showToast('Webhook removed', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function handleTest(id) {
    try {
      await api.webhooks.test(id);
      showToast('Test event sent', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Active Subscriptions */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Active Subscriptions</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Manage your webhook subscriptions for call events.
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div>
        ) : !webhooks.length ? (
          <div style={{ padding: '24px 20px', border: '1px dashed var(--border)', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No active subscriptions yet. Add one below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {webhooks.map(w => (
              <div key={w.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#1e293b', color: '#fff', padding: '2px 7px', borderRadius: 4 }}>POST</span>
                      <span style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(w.events || []).map(e => (
                        <span key={e} style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', color: 'var(--text-muted)' }}>
                          {WEBHOOK_EVENTS.find(ev => ev.id === e)?.label || e}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleTest(w.id)} title="Send test event">
                      <Zap size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(w.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new webhook */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 20, background: 'var(--surface)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Webhook Settings</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Configure your webhook endpoint and select events to subscribe to.</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 100, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Method</div>
            <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontWeight: 600 }}>POST</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Callback URL</div>
            <input className="form-input" placeholder="https://your-domain.com/webhook"
              value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          </div>
        </div>

        {/* Event checkboxes */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select Events</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {WEBHOOK_EVENTS.map(ev => (
            <label key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1px solid ${form.events.includes(ev.id) ? 'var(--accent)' : 'var(--border)'}`, background: form.events.includes(ev.id) ? 'var(--accent-light)' : 'var(--bg)', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={form.events.includes(ev.id)} onChange={() => toggleEvent(ev.id)}
                style={{ marginTop: 1, accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {/* Custom headers */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Custom Headers</div>
        {form.headers.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <div style={{ flex: 1, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 }}>{h.key}</div>
            <div style={{ flex: 1, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>{h.value}</div>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeHeader(i)}><X size={13} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input className="form-input" placeholder="Header key" value={headerKey} onChange={e => setHeaderKey(e.target.value)} style={{ flex: 1 }} />
          <input className="form-input" placeholder="Value" value={headerVal} onChange={e => setHeaderVal(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={addHeader} style={{ flexShrink: 0 }}>
            <Plus size={13} /> Add Header
          </button>
        </div>

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner spinner-sm" /> : 'Save Webhook'}
        </button>
      </div>
    </div>
  );
}

// ── AGENT DETAIL VIEW ──────────────────────────────────────────────────────────
function AgentDetail({ agent: initialAgent, onBack, onSave, onDelete }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(initialAgent);
  const [activeTab, setActiveTab] = useState('prompt');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [kbDocs, setKbDocs] = useState([]);

  useEffect(() => {
    setForm(initialAgent);
    setDirty(false);
  }, [initialAgent.id]);

  useEffect(() => {
    api.knowledge.list().then(d => setKbDocs(d.items || [])).catch(() => {});
  }, []);

  function update(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    setDirty(true);
  }

  const isNew = initialAgent.id === '__new__';

  async function handleSave() {
    // In structured mode system_prompt is derived from prompt_spec by the
    // backend compiler, so the spec alone is enough to satisfy this.
    if (!form.name || !(form.system_prompt || form.prompt_spec)) {
      return showToast('Name and a prompt (or prompt spec) are required', 'error');
    }
    setSaving(true);
    try {
      const toList = v => typeof v === 'string'
        ? v.split(',').map(s => s.trim()).filter(Boolean)
        : (v || []);
      const payload = {
        ...form,
        end_call_phrases: toList(form.end_call_phrases),
        not_interested_phrases: toList(form.not_interested_phrases),
        transfer_trigger_phrases: toList(form.transfer_trigger_phrases),
        // '' would fail the E.164 check server-side; null means "use the default".
        transfer_phone_number: (form.transfer_phone_number || '').trim() || null,
      };
      if (payload.transfer_enabled && payload.transfer_phone_number &&
          !/^\+[1-9]\d{7,14}$/.test(payload.transfer_phone_number)) {
        throw new Error('Transfer number must be E.164, e.g. +919876543210');
      }
      const res = isNew ? await api.agents.create(payload) : await api.agents.update(initialAgent.id, payload);
      setForm(res.agent);
      setDirty(false);
      onSave(res.agent);
      showToast(isNew ? 'Assistant created!' : 'Saved', 'success');
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Assistants
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <input
          value={form.name}
          onChange={e => update('name', e.target.value)}
          style={{ flex: 1, fontSize: 16, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', minWidth: 0 }}
          placeholder="Assistant name"
        />
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {dirty && (
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner spinner-sm" /> : <><Save size={13} /> Save</>}
            </button>
          )}
          {!isNew && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete(initialAgent.id)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400,
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'}`,
              transition: 'all 0.15s', marginBottom: -1, flexShrink: 0,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'prompt' && <PromptTab form={form} update={update} />}
      {activeTab === 'voice' && <VoiceTab form={form} update={update} />}
      {activeTab === 'call' && <CallTab form={form} update={update} />}
      {activeTab === 'kb' && <KBTab form={form} kbDocs={kbDocs} />}
      {activeTab === 'analysis' && <AnalysisTab form={form} update={update} />}
      {activeTab === 'events' && <EventsTab />}

      {/* Save bar */}
      {dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={() => { setForm(initialAgent); setDirty(false); }}>Discard</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner spinner-sm" /> : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function Assistants() {
  const { showToast } = useToast();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    api.agents.list().then(d => setAgents(d.agents || [])).catch(() => setAgents([])).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    if (!confirm('Delete this assistant?')) return;
    try {
      await api.agents.delete(id);
      setAgents(prev => prev.filter(a => a.id !== id));
      if (selected?.id === id) setSelected(null);
      showToast('Assistant deleted', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  function handleSave(agent) {
    setAgents(prev => {
      const idx = prev.findIndex(a => a.id === agent.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = agent; return n; }
      return [agent, ...prev];
    });
    if (selected?.id === agent.id) setSelected(agent);
  }

  function handleWizardDone(agent) {
    setAgents(prev => [agent, ...prev]);
    setShowWizard(false);
    setSelected(agent);
  }

  // Show detail view when agent selected
  if (selected) {
    return (
      <AgentDetail
        agent={selected}
        onBack={() => setSelected(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    );
  }

  // List view
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Assistants</h1>
          <p className="page-subtitle">AI voice agents that handle calls on your behalf</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowWizard(true)}>
            <Sparkles size={14} /> Build with AI
          </button>
          <button className="btn btn-primary" onClick={() => {
            const blank = { id: '__new__', name: '', system_prompt: '', first_message: '', language: 'en-IN', tts_speaker: 'priya', tts_model: 'bulbul:v3', stt_model: 'saarika:v2.5', llm_provider: 'sarvam', llm_model: 'sarvam-30b', llm_temperature: 0.7, max_duration_minutes: 5, silence_timeout_seconds: 10, voicemail_detection: true, recording_enabled: true, end_call_phrases: ['goodbye', 'bye', 'thank you'], analysis_schema: {} };
            setSelected(blank);
          }}>
            <Plus size={14} /> New Assistant
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : !agents.length ? (
        <div className="empty-state">
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <h3>No assistants yet</h3>
          <p>Create your first AI voice assistant. Use "Build with AI" to get started in seconds.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => setShowWizard(true)}><Sparkles size={14} /> Build with AI</button>
            <button className="btn btn-primary" onClick={() => setSelected({ id: '__new__', name: '', system_prompt: '', first_message: '', language: 'en-IN', tts_speaker: 'priya', tts_model: 'bulbul:v3', stt_model: 'saarika:v2.5', llm_provider: 'sarvam', llm_model: 'sarvam-30b', llm_temperature: 0.7, max_duration_minutes: 5, silence_timeout_seconds: 10, voicemail_detection: true, recording_enabled: true, end_call_phrases: ['goodbye', 'bye', 'thank you'], analysis_schema: {} })}><Plus size={14} /> Manual Setup</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {agents.map(a => (
            <div key={a.id} className="card" onClick={() => setSelected(a)}
              style={{ padding: 18, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, background: 'var(--accent-light)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={17} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{LANGUAGES.find(l => l.value === a.language)?.label || a.language} · {a.tts_speaker}</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm btn-icon-sm" style={{ color: 'var(--red)' }}
                  onClick={e => { e.stopPropagation(); handleDelete(a.id); }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {a.system_prompt}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge badge-purple"><Cpu size={10} /> {LLM_BADGE[a.llm_model] || 'AI'}</span>
                <span className="badge badge-blue"><Mic size={10} /> Voice</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{a.max_duration_minutes}m max · Click to edit</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showWizard && <AIWizard onClose={() => setShowWizard(false)} onDone={handleWizardDone} />}
    </div>
  );
}
