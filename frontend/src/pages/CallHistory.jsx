// CallHistory — Velryx design system
import { useState, useEffect, useRef } from 'react';
import { Phone, Flame, Mic, FileText, X, Download, Clock, Activity, User, PhoneOff, RefreshCw, Search, PhoneForwarded } from 'lucide-react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';

const ACTIVE_STATUSES = new Set(['initiated', 'ringing', 'in-progress', 'calling']);

function fmtDur(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function fmtDate(d) {
  if (!d) return '—';
  const now = Date.now(), dt = new Date(d).getTime(), diff = now - dt;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ outcome: '', date_from: '', date_to: '' });
  const [selectedCall, setSelectedCall] = useState(null);
  const [endingCall, setEndingCall] = useState(null);

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
      await loadCalls();
    } catch (err) { alert(err.message || 'Failed to end call'); }
    setEndingCall(null);
  }

  const sf = k => e => setFilter(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Filter bar */}
      <div className="card-glass card-padded" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" style={{ maxWidth: 180, height: 36, paddingTop: 0, paddingBottom: 0 }} value={filter.outcome} onChange={sf('outcome')}>
            <option value="">All outcomes</option>
            {['interested','not_interested','callback','no_answer','busy','voicemail','failed','completed'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input className="input" type="date" style={{ maxWidth: 152, height: 36 }} value={filter.date_from} onChange={sf('date_from')} />
          <span style={{ font: "500 12px/1 'Inter'", color: '#8B8B98' }}>→</span>
          <input className="input" type="date" style={{ maxWidth: 152, height: 36 }} value={filter.date_to} onChange={sf('date_to')} />
          <button className="btn btn-primary btn-sm" onClick={loadCalls}>Apply</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilter({ outcome: '', date_from: '', date_to: '' }); setTimeout(loadCalls, 50); }}>Clear</button>
          <div style={{ flex: 1 }} />
          <span style={{ font: "500 12px/1 'Inter'", color: '#8B8B98' }}>{calls.length} calls</span>
          <button className="btn btn-ghost btn-icon" onClick={loadCalls} title="Refresh"><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}><div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto' }} /></div>
      ) : calls.length === 0 ? (
        <div className="card-glass">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <div className="empty-icon"><Phone size={28} /></div>
            <h3>No calls found</h3>
            <p>Calls will appear here after your first campaign runs.</p>
          </div>
        </div>
      ) : (
        <div className="card-glass" style={{ padding: '4px 0' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Phone</th>
                <th>Outcome</th>
                <th>Ended / Transfer</th>
                <th>Duration</th>
                <th>Hot</th>
                <th>Recording</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedCall(c)}>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0B0B14', fontSize: 13 }}>{c.leads?.name || '—'}</div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.to_number || '—'}</td>
                  <td><StatusBadge status={c.outcome || c.call_status} /></td>
                  <td><EndReasonCell call={c} /></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDur(c.duration_seconds)}</td>
                  <td>
                    {c.hot_lead && <Flame size={14} color="#F4B233" />}
                  </td>
                  <td>
                    {c.recording_url
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: "600 10px/1 'Inter'", letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1F8A5B', background: 'rgba(31,138,91,0.08)', padding: '3px 7px', borderRadius: 4 }}><Mic size={9} /> Yes</span>
                      : <span style={{ color: '#8B8B98', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ color: '#8B8B98', fontSize: 12 }}>{fmtDate(c.created_at || c.started_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={e => { e.stopPropagation(); setSelectedCall(c); }} title="View details">
                        <FileText size={12} />
                      </button>
                      {ACTIVE_STATUSES.has(c.call_status) && (
                        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: '#dc2626' }} onClick={e => endCall(e, c.id)} disabled={endingCall === c.id} title="End call">
                          {endingCall === c.id ? '…' : <PhoneOff size={12} />}
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

      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </div>
  );
}

/* ── CALL DETAIL MODAL ──────────────────────────────────────────────────── */
function CallDetailModal({ call, onClose }) {
  const audioRef = useRef();
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    setTab(call.call_status === 'initiated' ? 'transcript' : 'details');
    setPlaying(false);
    api.transcripts.get(call.id).catch(() => null).then(t => {
      setTranscript(t?.transcript || null);
      setLoading(false);
    });
  }, [call.id]);

  // Live polling: refresh transcript every 2s while call is still in progress
  const isLive = call.call_status === 'initiated';
  useEffect(() => {
    if (!isLive) return;
    const iv = setInterval(() => {
      api.transcripts.get(call.id).catch(() => null).then(t => {
        if (t?.transcript) setTranscript(t.transcript);
      });
    }, 2000);
    return () => clearInterval(iv);
  }, [call.id, isLive]);

  const recordingUrl = call.recording_url;
  const isHot = call.hot_lead || call.outcome === 'interested';
  const turns = transcript?.turns || [];
  const analysis = call.analysis || {};

  const analysisFields = [
    { label: 'Outcome',        value: analysis.outcome || call.outcome },
    { label: 'Intent',         value: analysis.intent || call.intent },
    { label: 'Budget',         value: analysis.budget_range || call.budget_range },
    { label: 'BHK Preference', value: analysis.bhk_preference || call.bhk_preference },
    { label: 'Location',       value: analysis.location_preference || call.location_preference },
    { label: 'Timeline',       value: analysis.timeline || call.timeline },
    { label: 'Loan Required',  value: (analysis.loan_required ?? call.loan_required) != null ? ((analysis.loan_required ?? call.loan_required) ? 'Yes' : 'No') : null },
    { label: 'Callback Time',  value: analysis.callback_time || call.callback_time },
    { label: 'First Response', value: analysis.first_response_ms ? `${(analysis.first_response_ms / 1000).toFixed(2)}s` : null },
  ].filter(f => f.value != null && f.value !== '');

  const lead = call.leads || {};

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }
  function seek(e) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }
  function fmtTime(s) {
    if (!s && s !== 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  const TABS = [
    { id: 'details',    label: 'Details' },
    { id: 'transcript', label: isLive ? '⏺ Live' : `Transcript${turns.length ? ` (${turns.length})` : ''}` },
    { id: 'analysis',   label: 'Analysis' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass-strong"
        style={{ maxWidth: 700, width: '96vw', borderRadius: 20, overflow: 'hidden', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid rgba(20,20,40,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: isHot ? 'rgba(244,178,51,0.15)' : 'rgba(20,20,40,0.05)',
                border: `1.5px solid ${isHot ? 'rgba(244,178,51,0.40)' : 'rgba(20,20,40,0.10)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isHot ? <Flame size={20} color="#F4B233" /> : <User size={18} color="#8B8B98" />}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ margin: 0, font: "700 16px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>
                    {lead.name || call.to_number}
                  </h3>
                  {isHot && (
                    <span style={{ font: "700 9px/1 'JetBrains Mono'", letterSpacing: '0.12em', background: 'var(--red-500)', color: '#fff', padding: '3px 6px', borderRadius: 4 }}>
                      🔥 HOT
                    </span>
                  )}
                </div>
                <div style={{ font: "500 12px/1 'Inter'", color: '#8B8B98', marginTop: 4 }}>
                  {call.to_number} · {fmtDate(call.started_at || call.created_at)}
                </div>
              </div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
          </div>

          {/* Stat chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['Duration', fmtDur(call.duration_seconds)],
              ['Status', call.outcome?.replace(/_/g, ' ') || call.call_status || '—'],
              ['Ended because', END_REASON_LABELS[call.end_reason] || call.end_reason?.replace(/_/g, ' ') || '—'],
              ['Transfer', call.transfer_status
                ? `${TRANSFER_LABELS[call.transfer_status] || call.transfer_status}${call.transfer_to ? ' → ' + call.transfer_to : ''}${call.transfer_detail ? ' (' + call.transfer_detail + ')' : ''}`
                : '—'],
              ['Cost', call.cost_total ? `₹${Number(call.cost_total).toFixed(2)}` : '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ background: 'rgba(255,253,247,0.7)', border: '1px solid rgba(20,20,40,0.08)', borderRadius: 8, padding: '6px 12px' }}>
                <div style={{ font: "500 10px/1 'Inter'", letterSpacing: '0.05em', textTransform: 'uppercase', color: '#8B8B98', marginBottom: 3 }}>{l}</div>
                <div style={{ font: "600 13px/1 'Inter'", color: '#0B0B14' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
                font: `${tab === t.id ? 600 : 500} 13px/1 'Inter'`,
                color: tab === t.id ? 'var(--red-600)' : '#52525F',
                borderBottom: tab === t.id ? '2px solid var(--red-500)' : '2px solid transparent',
                transition: 'all 0.12s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px 24px' }}>

          {/* DETAILS tab */}
          {tab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Recording player */}
              {recordingUrl ? (
                <div>
                  <SectionHeader icon={<Mic size={13} />} title="Recording" />
                  <audio ref={audioRef} src={recordingUrl}
                    onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                    onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
                    onEnded={() => setPlaying(false)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,253,247,0.70)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(20,20,40,0.08)' }}>
                    <button onClick={togglePlay} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--red-500)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {playing
                        ? <svg width="12" height="12" viewBox="0 0 12 12" fill="#fff"><rect x="2" y="1" width="3" height="10" /><rect x="7" y="1" width="3" height="10" /></svg>
                        : <svg width="12" height="12" viewBox="0 0 12 12" fill="#fff"><polygon points="2,1 11,6 2,11" /></svg>}
                    </button>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={seek}>
                      <div style={{ height: 4, background: 'rgba(20,20,40,0.10)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${duration ? (currentTime / duration) * 100 : 0}%`, background: 'var(--red-500)', borderRadius: 2, transition: 'width 0.1s linear' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#8B8B98', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {fmtTime(currentTime)} / {fmtTime(duration)}
                    </span>
                    <a href={recordingUrl} download target="_blank" rel="noreferrer" style={{ color: '#8B8B98', display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(20,20,40,0.03)', border: '1px dashed rgba(20,20,40,0.10)', textAlign: 'center', font: "italic 400 13px/1 'Instrument Serif',serif", color: '#8B8B98' }}>
                  No recording available for this call
                </div>
              )}

              {/* Lead info */}
              {(lead.name || lead.city || lead.budget) && (
                <div>
                  <SectionHeader icon={<User size={13} />} title="Lead info" />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[['Name', lead.name], ['City', lead.city], ['Budget', lead.budget], ['Property', lead.property_type]].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ background: 'rgba(255,253,247,0.70)', border: '1px solid rgba(20,20,40,0.08)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ font: "500 10px/1 'Inter'", color: '#8B8B98', marginBottom: 3 }}>{l}</div>
                        <div style={{ font: "600 12px/1 'Inter'", color: '#0B0B14' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!recordingUrl && analysisFields.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', font: "italic 400 14px/1 'Instrument Serif',serif", color: '#8B8B98' }}>
                  No details available yet.
                </div>
              )}
            </div>
          )}

          {/* TRANSCRIPT tab */}
          {tab === 'transcript' && (
            loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : turns.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {isLive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(230,57,70,0.07)', borderRadius: 8, border: '1px solid rgba(230,57,70,0.18)', marginBottom: 2 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E63946', display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite' }} />
                    <span style={{ font: "600 11px/1 'Inter'", color: '#E63946', letterSpacing: '0.04em' }}>LIVE — updating every 2s</span>
                  </div>
                )}
                {turns.map((t, i) => {
                  const isAgent = t.role === 'agent' || t.role === 'assistant';
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, flexDirection: isAgent ? 'row' : 'row-reverse' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: isAgent ? 'var(--red-500)' : '#334155' }}>
                        {isAgent ? 'AI' : 'U'}
                      </div>
                      <div style={{ maxWidth: '75%', padding: '9px 13px', borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px', background: isAgent ? 'rgba(230,57,70,0.06)' : 'rgba(255,253,247,0.85)', border: `1px solid ${isAgent ? 'rgba(230,57,70,0.15)' : 'rgba(20,20,40,0.08)'}`, font: "500 13px/1.55 'Inter'", color: '#0B0B14' }}>
                        {t.text || t.content || t.message}
                        {t.timestamp != null && (
                          <div style={{ font: "500 10px/1 'JetBrains Mono'", color: '#8B8B98', marginTop: 5 }}>
                            {typeof t.timestamp === 'number' ? `${(t.timestamp / 1000).toFixed(1)}s` : t.timestamp}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isLive && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: 'var(--red-500)', opacity: 0.5 }}>AI</div>
                    <div style={{ padding: '10px 14px', borderRadius: '4px 12px 12px 12px', background: 'rgba(230,57,70,0.04)', border: '1px solid rgba(230,57,70,0.10)', display: 'flex', gap: 4, alignItems: 'center' }}>
                      {[0,1,2].map(d => <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: '#E63946', opacity: 0.5, animation: `pulse ${1 + d * 0.3}s ease-in-out infinite` }} />)}
                    </div>
                  </div>
                )}
              </div>
            ) : transcript?.full_text ? (
              <pre style={{ background: 'rgba(255,253,247,0.70)', border: '1px solid rgba(20,20,40,0.08)', borderRadius: 10, padding: '14px 16px', font: "500 12px/1.8 'JetBrains Mono'", overflowX: 'auto', whiteSpace: 'pre-wrap', color: '#0B0B14' }}>
                {transcript.full_text}
              </pre>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <FileText size={32} style={{ opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
                {isLive ? (
                  <>
                    <div style={{ font: "italic 400 15px/1 'Instrument Serif',serif", color: '#8B8B98' }}>Waiting for conversation to begin…</div>
                    <div style={{ font: "500 12px/1 'Inter'", color: '#8B8B98', marginTop: 6 }}>Words appear here as the agent speaks.</div>
                  </>
                ) : (
                  <>
                    <div style={{ font: "italic 400 15px/1 'Instrument Serif',serif", color: '#8B8B98' }}>No transcript available</div>
                    <div style={{ font: "500 12px/1 'Inter'", color: '#8B8B98', marginTop: 6 }}>Transcripts appear after the call ends.</div>
                  </>
                )}
              </div>
            )
          )}

          {/* ANALYSIS tab */}
          {tab === 'analysis' && (
            analysisFields.length > 0 ? (
              <div>
                <div style={{ background: 'rgba(255,253,247,0.70)', borderRadius: 12, border: '1px solid rgba(20,20,40,0.08)', overflow: 'hidden' }}>
                  {analysisFields.map(({ label, value }, i) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', font: "500 13px/1 'Inter'", borderBottom: i < analysisFields.length - 1 ? '1px solid rgba(20,20,40,0.07)' : 'none' }}>
                      <span style={{ color: '#52525F' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: '#0B0B14', textTransform: 'capitalize' }}>{String(value)}</span>
                    </div>
                  ))}
                </div>
                {isHot && (
                  <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 10, background: 'rgba(244,178,51,0.10)', border: '1px solid rgba(244,178,51,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Flame size={16} color="#F4B233" />
                    <div style={{ font: "600 13px/1 'Inter'", color: '#92640A' }}>This lead was marked HOT by the AI agent</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Activity size={32} style={{ opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
                <div style={{ font: "italic 400 15px/1 'Instrument Serif',serif", color: '#8B8B98' }}>No analysis data available</div>
                <div style={{ font: "500 12px/1 'Inter'", color: '#8B8B98', marginTop: 6 }}>Analysis is generated after the call completes.</div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(20,20,40,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,253,247,0.5)' }}>
          <span style={{ font: "500 11px/1 'JetBrains Mono'", color: '#8B8B98' }}>ID: {call.id?.slice(0, 8)}…</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
            {recordingUrl && (
              <a className="btn btn-primary btn-sm" href={recordingUrl} download target="_blank" rel="noreferrer">
                <Download size={12} /> Recording
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ color: '#8B8B98' }}>{icon}</span>
      <span style={{ font: "700 10px/1 'Inter'", letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B8B98' }}>{title}</span>
    </div>
  );
}


// ─── HOW THE CALL ENDED ──────────────────────────────────────────────────────
// Worth its own column: "the agent hung up because they said they weren't
// interested" and "the line dropped" both look like a short completed call
// otherwise, and only one of them is a problem.
const END_REASON_LABELS = {
  not_interested: 'Not interested — agent hung up',
  goodbye: 'Said goodbye',
  whatsapp_close: 'Closed after WhatsApp offer',
  max_duration: 'Hit max duration',
  transferred: 'Transferred to a human',
  crashed: 'Session error',
  dial_failed: 'Dial failed',
  completed: 'Completed',
};

const TRANSFER_LABELS = {
  offered: 'Offered', declined: 'Declined', accepted: 'Accepted',
  completed: 'Transferred', failed: 'Transfer failed',
};

const TRANSFER_STYLE = {
  completed: { color: '#1F8A5B', bg: 'rgba(31,138,91,0.10)' },
  accepted:  { color: '#1F8A5B', bg: 'rgba(31,138,91,0.10)' },
  offered:   { color: '#B45309', bg: 'rgba(180,83,9,0.10)' },
  declined:  { color: '#52525F', bg: 'rgba(82,82,95,0.10)' },
  failed:    { color: '#B91C1C', bg: 'rgba(185,28,28,0.10)' },
};

function EndReasonCell({ call }) {
  const t = call.transfer_status;
  if (t) {
    const s = TRANSFER_STYLE[t] || TRANSFER_STYLE.declined;
    return (
      <span
        title={[TRANSFER_LABELS[t] || t, call.transfer_to, call.transfer_detail].filter(Boolean).join(' · ')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: "600 10px/1 'Inter'",
                 letterSpacing: '0.04em', textTransform: 'uppercase', color: s.color,
                 background: s.bg, padding: '3px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>
        <PhoneForwarded size={9} /> {TRANSFER_LABELS[t] || t}
      </span>
    );
  }
  if (!call.end_reason) return <span style={{ color: '#8B8B98', fontSize: 12 }}>—</span>;
  const isHangup = call.end_reason === 'not_interested';
  return (
    <span title={END_REASON_LABELS[call.end_reason] || call.end_reason}
          style={{ fontSize: 11.5, color: isHangup ? '#B45309' : '#52525F', whiteSpace: 'nowrap' }}>
      {END_REASON_LABELS[call.end_reason] || call.end_reason.replace(/_/g, ' ')}
    </span>
  );
}
