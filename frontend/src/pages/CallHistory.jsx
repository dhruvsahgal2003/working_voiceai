import { useState, useEffect, useRef } from 'react';
import { Phone, Flame, Mic, FileText, X, Download, Clock, Activity, User, PhoneOff } from 'lucide-react';
import { api } from '../services/api';

const ACTIVE_STATUSES = new Set(['initiated', 'ringing', 'in-progress', 'calling']);

const OUTCOME_COLORS = {
  interested:     'badge-green',
  hot_lead:       'badge-green',
  not_interested: 'badge-red',
  callback:       'badge-yellow',
  no_answer:      'badge-gray',
  busy:           'badge-gray',
  voicemail:      'badge-gray',
  failed:         'badge-red',
  completed:      'badge-blue',
};

function fmt(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ outcome: '', date_from: '', date_to: '' });
  const [selectedCall, setSelectedCall] = useState(null);
  const [endingCall, setEndingCall] = useState(null); // id of call being terminated

  useEffect(() => { loadCalls(); }, []);

  async function loadCalls() {
    setLoading(true);
    try {
      const r = await api.calls.list(filter);
      setCalls(r.calls || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function endCall(e, callId) {
    e.stopPropagation();
    if (!window.confirm('End this call now?')) return;
    setEndingCall(callId);
    try {
      await api.calls.end(callId);
      await loadCalls(); // refresh list
    } catch (err) {
      alert(err.message || 'Failed to end call');
    }
    setEndingCall(null);
  }

  const sf = k => e => setFilter(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="page-body">
      <div className="page-header">
        <div>
          <h1 className="page-title">Call History</h1>
          <p className="page-subtitle">{calls.length} calls</p>
        </div>
        <button className="btn btn-secondary" onClick={() => api.analytics.export()}>↓ Export CSV</button>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-select" style={{ maxWidth: 180 }} value={filter.outcome} onChange={sf('outcome')}>
            <option value="">All Outcomes</option>
            {['interested','not_interested','callback','no_answer','busy','voicemail','failed','completed'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input className="form-input" type="date" style={{ maxWidth: 150 }} value={filter.date_from} onChange={sf('date_from')} />
          <span style={{ color: 'var(--text-muted)' }}>to</span>
          <input className="form-input" type="date" style={{ maxWidth: 150 }} value={filter.date_to} onChange={sf('date_to')} />
          <button className="btn btn-secondary" onClick={loadCalls}>Apply</button>
          <button className="btn btn-ghost" onClick={() => { setFilter({ outcome: '', date_from: '', date_to: '' }); setTimeout(loadCalls, 50); }}>Clear</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : calls.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Phone size={28} /></div>
          <h3>No calls found</h3>
          <p>Calls will appear here after your first campaign runs.</p>
        </div>
      ) : (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Date</th>
                <th>Rec</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedCall(c)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {(c.hot_lead || c.outcome === 'interested') && <Flame size={13} color="var(--accent)" />}
                      <span style={{ fontWeight: 500 }}>{c.leads?.name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.to_number || '—'}</td>
                  <td>
                    <span className={`badge ${OUTCOME_COLORS[c.outcome] || 'badge-gray'}`}>
                      {c.outcome?.replace(/_/g, ' ') || c.call_status || '—'}
                    </span>
                  </td>
                  <td>{fmt(c.duration_seconds)}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {c.started_at ? new Date(c.started_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td>
                    {c.recording_url
                      ? <span className="badge badge-blue" style={{ display: 'flex', alignItems: 'center', gap: 3, width: 'fit-content' }}><Mic size={10} /> Yes</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); setSelectedCall(c); }} title="View details">
                        <FileText size={13} />
                      </button>
                      {ACTIVE_STATUSES.has(c.call_status) && (
                        <button
                          className="btn btn-ghost btn-xs"
                          style={{ color: '#dc2626' }}
                          onClick={e => endCall(e, c.id)}
                          disabled={endingCall === c.id}
                          title="End call"
                        >
                          {endingCall === c.id ? '…' : <PhoneOff size={13} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCall && (
        <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </div>
  );
}

// ── CALL DETAIL MODAL ─────────────────────────────────────────────────────────
function CallDetailModal({ call, onClose }) {
  const audioRef = useRef();
  const [transcript, setTranscript] = useState(null);
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details'); // 'details' | 'transcript'
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    setTab('details');
    Promise.all([
      api.transcripts.get(call.id).catch(() => null),
      api.recordings.get(call.id).catch(() => null),
    ]).then(([t, rec]) => {
      setTranscript(t?.transcript || null);
      setRecording(rec?.recording || (call.recording_url ? { url: call.recording_url } : null));
      setLoading(false);
    });
  }, [call.id]);

  const isHot = call.hot_lead || call.outcome === 'interested';
  const turns = transcript?.turns || [];
  const analysis = call.analysis || {};
  const firstResponseMs = analysis.first_response_ms;

  // Analysis fields
  const analysisFields = [
    { label: 'Intent',         value: analysis.intent || call.intent },
    { label: 'Budget',         value: analysis.budget_range || call.budget_range },
    { label: 'BHK Preference', value: analysis.bhk_preference || call.bhk_preference },
    { label: 'Location',       value: analysis.location_preference || call.location_preference },
    { label: 'Timeline',       value: analysis.timeline || call.timeline },
    { label: 'Loan Required',  value: (analysis.loan_required != null ? analysis.loan_required : call.loan_required) != null
        ? ((analysis.loan_required ?? call.loan_required) ? 'Yes' : 'No') : null },
    { label: 'Callback Time',  value: analysis.callback_time || call.callback_time },
  ].filter(f => f.value != null && f.value !== '');

  // Lead custom variables
  const lead = call.leads || {};
  const customVars = [
    { label: 'Callee Name',    value: lead.name },
    { label: 'City',           value: lead.city },
    { label: 'Property Type',  value: lead.property_type },
    { label: 'Budget',         value: lead.budget },
  ].filter(f => f.value);

  // Audio helpers
  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }
  function seek(e) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
  }
  function fmtTime(s) {
    if (!s && s !== 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, width: '95vw', borderRadius: 14, overflow: 'hidden', padding: 0 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%', background: isHot ? '#fef3c7' : 'var(--bg)',
                border: `2px solid ${isHot ? '#f59e0b' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isHot ? <Flame size={18} color="#f59e0b" /> : <User size={18} color="var(--text-muted)" />}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{lead.name || call.to_number}</h3>
                  {isHot && <span className="badge badge-green" style={{ fontSize: 10 }}>🔥 Hot Lead</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {call.to_number} · {call.started_at ? new Date(call.started_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                </div>
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
          </div>

          {/* Stat chips */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <StatChip label="Call Duration" value={fmt(call.duration_seconds)} />
            <StatChip label="Call Status" value={
              <span className={`badge ${OUTCOME_COLORS[call.outcome] || 'badge-gray'}`} style={{ fontSize: 11 }}>
                {call.outcome?.replace(/_/g, ' ') || call.call_status || '—'}
              </span>
            } />
            <StatChip label="From Number" value={call.from_number || process.env.REACT_APP_FROM_NUMBER || '—'} />
            <StatChip label="Call Origin" value="API" />
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {[['details', 'Call Details'], ['transcript', 'Transcript']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                  fontWeight: tab === id ? 600 : 400,
                  fontSize: 13,
                  color: tab === id ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {label}
                {id === 'transcript' && turns.length > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 10 }}>
                    {turns.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ maxHeight: '62vh', overflowY: 'auto', padding: '20px 24px' }}>

          {tab === 'details' && (
            <>
              {/* Recording player */}
              {(recording?.url || call.recording_url) && (
                <Section title="Recording" icon={<Mic size={14} />}>
                  <audio
                    ref={audioRef}
                    src={recording?.url || call.recording_url}
                    onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                    onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
                    onEnded={() => setPlaying(false)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--border)' }}>
                    <button
                      onClick={togglePlay}
                      style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      {playing
                        ? <svg width="12" height="12" viewBox="0 0 12 12" fill="#fff"><rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>
                        : <svg width="12" height="12" viewBox="0 0 12 12" fill="#fff"><polygon points="2,1 11,6 2,11"/></svg>
                      }
                    </button>
                    {/* Waveform bar progress */}
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={seek}>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${duration ? (currentTime / duration) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.1s linear' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {fmtTime(currentTime)} / {fmtTime(duration)}
                    </span>
                    <a
                      href={recording?.url || call.recording_url}
                      download target="_blank" rel="noreferrer"
                      style={{ color: 'var(--text-muted)', display: 'flex' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <Download size={15} />
                    </a>
                  </div>
                </Section>
              )}

              {/* Latency */}
              {firstResponseMs != null && (
                <Section title="Call Latency" icon={<Activity size={14} />}>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: firstResponseMs < 800 ? '#16a34a' : firstResponseMs < 2000 ? '#d97706' : '#dc2626' }}>
                      {(firstResponseMs / 1000).toFixed(2)}s
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      First utterance began at {(firstResponseMs / 1000).toFixed(2)} seconds
                    </div>
                  </div>
                </Section>
              )}

              {/* AI Analysis */}
              {analysisFields.length > 0 && (
                <Section title="AI Analysis" icon={<Activity size={14} />}>
                  <div style={{ background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {analysisFields.map(({ label, value }, i) => (
                      <div key={label} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px', fontSize: 13,
                        borderBottom: i < analysisFields.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                        <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Custom Variables (lead fields) */}
              {customVars.length > 0 && (
                <Section title="Custom Variables" icon={<User size={14} />}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {customVars.map(({ label, value }) => (
                      <div key={label} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{label} </span>
                        <span style={{ background: '#e0e7ff', color: '#3730a3', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 500 }}>String</span>
                        <div style={{ fontWeight: 600, marginTop: 3 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {!loading && analysisFields.length === 0 && customVars.length === 0 && !recording?.url && !call.recording_url && (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>
                  No analysis data available for this call.
                </div>
              )}
            </>
          )}

          {tab === 'transcript' && (
            <TranscriptTab transcript={transcript} loading={loading} turns={turns} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-subtle, var(--bg))' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ID: <code style={{ fontSize: 11 }}>{call.id?.slice(0, 8)}…</code>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
            {(recording?.url || call.recording_url) && (
              <a className="btn btn-primary" href={recording?.url || call.recording_url} download target="_blank" rel="noreferrer">
                <Download size={13} style={{ marginRight: 4 }} /> Recording
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', minWidth: 100 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function TranscriptTab({ transcript, loading, turns }) {
  const [showRaw, setShowRaw] = useState(false);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>;
  }

  if (turns.length === 0 && !transcript?.full_text) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        <FileText size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>No transcript available</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>The transcript will appear here after the call ends.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {transcript?.full_text && (
          <button className="btn btn-ghost btn-xs" onClick={() => setShowRaw(r => !r)} style={{ fontSize: 11 }}>
            {showRaw ? '💬 Chat view' : '📄 Raw text'}
          </button>
        )}
      </div>

      {showRaw && transcript?.full_text ? (
        <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', fontSize: 12, lineHeight: 1.8, overflowX: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
          {transcript.full_text}
        </pre>
      ) : turns.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {turns.map((t, i) => {
            const isAgent = t.role === 'agent' || t.role === 'assistant';
            return (
              <div key={i} style={{ display: 'flex', gap: 8, flexDirection: isAgent ? 'row' : 'row-reverse' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  background: isAgent ? 'var(--accent)' : '#64748b',
                }}>
                  {isAgent ? 'AI' : 'U'}
                </div>
                <div style={{
                  maxWidth: '75%', borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                  padding: '9px 13px', fontSize: 13, lineHeight: 1.55,
                  background: isAgent ? 'var(--accent-light, #ede9fe)' : 'var(--bg)',
                  border: '1px solid var(--border)',
                }}>
                  <div>{t.text || t.content || t.message}</div>
                  {t.timestamp != null && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      {typeof t.timestamp === 'number' ? `${(t.timestamp / 1000).toFixed(1)}s` : t.timestamp}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', fontSize: 12, lineHeight: 1.8, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
          {transcript.full_text}
        </pre>
      )}
    </div>
  );
}
