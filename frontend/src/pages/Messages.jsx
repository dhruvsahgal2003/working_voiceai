// Messages — WhatsApp-style inbox. Velryx design system (matches CallHistory/Dashboard).
import { useState, useEffect, useRef, useMemo } from 'react';
import { MessageSquare, Check, CheckCheck, Send, Clock } from 'lucide-react';
import { api } from '../services/api';

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

function fmtListTime(d) {
  if (!d) return '';
  const now = Date.now(), dt = new Date(d).getTime(), diff = now - dt;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
  return new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
function fmtBubbleTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function contactLabel(contact) {
  return contact?.name || contact?.phone || 'Unknown';
}
function avatarLetter(contact) {
  return (contact?.name || contact?.phone || '?').trim().slice(0, 1).toUpperCase();
}

export default function Messages() {
  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const threadEndRef = useRef(null);

  useEffect(() => {
    loadConversations();
    const iv = setInterval(loadConversations, 12000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId);
    const iv = setInterval(() => loadThread(selectedId, true), 4000);
    return () => clearInterval(iv);
  }, [selectedId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function loadConversations() {
    try {
      const r = await api.messages.conversations();
      setConversations(r.conversations || []);
    } catch (e) { console.error(e); }
    setLoadingList(false);
  }

  async function loadThread(id, silent) {
    if (!silent) setLoadingThread(true);
    try {
      const r = await api.messages.thread(id);
      setMessages(r.messages || []);
    } catch (e) { console.error(e); }
    if (!silent) setLoadingThread(false);
  }

  async function openConversation(c) {
    setSelectedId(c.id);
    setReplyText('');
    setSendError('');
    if (c.unread_count > 0) {
      try {
        await api.messages.markRead(c.id);
        setConversations(prev => prev.map(x => x.id === c.id ? { ...x, unread_count: 0 } : x));
      } catch (e) { console.error(e); }
    }
  }

  // WhatsApp only allows free-text replies within 24h of the contact's last
  // inbound message (Meta's rule) — computed from the thread already in hand,
  // but the backend enforces this independently too.
  const lastInboundAt = useMemo(() => {
    const inbound = messages.filter(m => m.direction === 'inbound');
    return inbound.length ? inbound[inbound.length - 1].wa_timestamp : null;
  }, [messages]);
  const canReply = lastInboundAt && (Date.now() - new Date(lastInboundAt).getTime() < REPLY_WINDOW_MS);

  async function handleSend() {
    const text = replyText.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setSendError('');
    try {
      const { message } = await api.messages.send(selectedId, text);
      if (message) setMessages(prev => [...prev, message]);
      setReplyText('');
      loadConversations();
    } catch (e) {
      setSendError(e.message || 'Failed to send');
    }
    setSending(false);
  }

  const selected = conversations.find(c => c.id === selectedId);

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 160px)', minHeight: 480 }}>

      {/* Conversation list */}
      <div className="card-glass" style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(20,20,40,0.08)' }}>
          <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>Conversations</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingList ? (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, margin: '0 auto' }} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 20px' }}>
              <div className="empty-icon"><MessageSquare size={24} /></div>
              <h3 style={{ fontSize: 14 }}>No conversations yet</h3>
              <p style={{ fontSize: 12 }}>Conversations appear here when you message a lead on WhatsApp, or when they reply.</p>
            </div>
          ) : conversations.map(c => {
            const contact = c.whatsapp_contacts;
            const active = c.id === selectedId;
            return (
              <div
                key={c.id}
                onClick={() => openConversation(c)}
                style={{
                  padding: '12px 16px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start',
                  background: active ? 'rgba(230,57,70,0.06)' : 'transparent',
                  borderLeft: `3px solid ${active ? 'var(--red-500)' : 'transparent'}`,
                  borderBottom: '1px solid rgba(20,20,40,0.05)',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {avatarLetter(contact)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ font: "600 13px/1 'Inter'", color: '#0B0B14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {contactLabel(contact)}
                    </span>
                    <span style={{ font: "500 10px/1 'Inter'", color: '#8B8B98', flexShrink: 0 }}>{fmtListTime(c.last_message_at)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3, gap: 6 }}>
                    <span style={{ font: "500 12px/1.3 'Inter'", color: '#8B8B98', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.last_message_preview || '—'}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {c.has_replied
                        ? <span title="This contact has replied at least once"
                                style={{ font: "700 9px/1 'Inter'", letterSpacing: '0.05em', textTransform: 'uppercase', color: '#1F8A5B', background: 'rgba(31,138,91,0.10)', borderRadius: 4, padding: '3px 5px' }}>replied</span>
                        : <span title="Message sent — no reply yet"
                                style={{ font: "700 9px/1 'Inter'", letterSpacing: '0.05em', textTransform: 'uppercase', color: '#8B8B98', background: 'rgba(139,139,152,0.10)', borderRadius: 4, padding: '3px 5px' }}>no reply</span>}
                      {c.unread_count > 0 && (
                        <span style={{ background: 'var(--red-500)', color: '#fff', font: "700 10px/1 'Inter'", borderRadius: 999, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                          {c.unread_count}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thread */}
      <div className="card-glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        {!selected ? (
          <div className="empty-state" style={{ margin: 'auto' }}>
            <div className="empty-icon"><MessageSquare size={28} /></div>
            <h3>Select a conversation</h3>
            <p>Choose a conversation from the list to view messages.</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(20,20,40,0.08)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                {avatarLetter(selected.whatsapp_contacts)}
              </div>
              <div>
                <div style={{ font: "700 14px/1 'Inter Tight'", letterSpacing: '-0.01em', color: '#0B0B14' }}>{contactLabel(selected.whatsapp_contacts)}</div>
                <div style={{ font: "500 11px/1 'JetBrains Mono'", color: '#8B8B98', marginTop: 3 }}>{selected.whatsapp_contacts?.phone}</div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(20,20,40,0.015)' }}>
              {loadingThread ? (
                <div style={{ margin: 'auto' }}><div className="spinner" /></div>
              ) : messages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', font: "italic 400 14px/1 'Instrument Serif',serif", color: '#8B8B98' }}>
                  No messages yet
                </div>
              ) : messages.map(m => {
                const isOutbound = m.direction === 'outbound';
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: isOutbound ? 'row-reverse' : 'row' }}>
                    <div style={{
                      maxWidth: '65%', padding: '9px 13px',
                      borderRadius: isOutbound ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: isOutbound ? 'rgba(230,57,70,0.08)' : 'rgba(255,253,247,0.9)',
                      border: `1px solid ${isOutbound ? 'rgba(230,57,70,0.18)' : 'rgba(20,20,40,0.08)'}`,
                      font: "500 13px/1.5 'Inter'", color: '#0B0B14',
                    }}>
                      <MessageContext m={m} isOutbound={isOutbound} />
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 5 }}>
                        <span style={{ font: "500 10px/1 'JetBrains Mono'", color: '#8B8B98' }}>{fmtBubbleTime(m.wa_timestamp)}</span>
                        {isOutbound && <StatusTicks status={m.status} simulated={m.raw_payload?.simulated} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Compose bar */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(20,20,40,0.08)', flexShrink: 0 }}>
              {canReply ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Type a reply…"
                    rows={1}
                    className="input"
                    style={{ flex: 1, resize: 'none', maxHeight: 100, font: "500 13px/1.4 'Inter'" }}
                  />
                  <button className="btn btn-primary btn-icon" style={{ width: 36, height: 36, flexShrink: 0 }}
                    onClick={handleSend} disabled={sending || !replyText.trim()} title="Send">
                    {sending ? '…' : <Send size={14} />}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'rgba(20,20,40,0.03)', border: '1px dashed rgba(20,20,40,0.12)', borderRadius: 10, font: "500 12px/1.4 'Inter'", color: '#8B8B98' }}>
                  <Clock size={13} style={{ flexShrink: 0 }} />
                  Outside the 24-hour reply window — WhatsApp only allows free-text replies within 24h of the contact's last message. New template sends still go out automatically after calls.
                </div>
              )}
              {sendError && (
                <div style={{ marginTop: 6, font: "500 11px/1.3 'Inter'", color: '#E11D48' }}>{sendError}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A mirrored send has no delivery receipt behind it — WhatsApp Business reports
// nothing back. Showing the normal tick would imply a confirmation we never got,
// so these are labelled instead.
function StatusTicks({ status, simulated }) {
  if (status === 'failed') return <span style={{ font: "600 10px/1 'Inter'", color: '#E11D48' }}>failed</span>;
  if (simulated) return <span title="Sent via WhatsApp Business — delivery is not reported back" style={{ font: "500 10px/1 'Inter'", color: '#8B8B98' }}>sent · not tracked</span>;
  if (status === 'read') return <CheckCheck size={13} color="var(--red-500)" />;
  if (status === 'delivered') return <CheckCheck size={13} color="#8B8B98" />;
  return <Check size={13} color="#8B8B98" />;
}


// ─── WHY THIS MESSAGE EXISTS ─────────────────────────────────────────────────
// A follow-up inbox is unreadable without provenance: every thread looked like an
// anonymous bubble with no indication of which agent messaged the lead, about
// which call, or whether the reply below it was answering that call at all.
// Outbound rows carry the agent + call directly; inbound replies inherit them
// from the outbound message they answer (linkInboundToContext, backend side).
function MessageContext({ m, isOutbound }) {
  const agent = m.agents?.name;
  const call = m.call;
  if (!agent && !call && !m.template_name) return null;

  const bits = [];
  if (isOutbound) {
    if (agent) bits.push(`sent by ${agent}`);
    if (m.template_name) bits.push(`template "${m.template_name}"`);
  } else if (agent || call) {
    bits.push(`reply to ${agent ? agent + "'s" : 'the'} follow-up`);
  }
  if (call) {
    const dur = call.duration_seconds ? `${call.duration_seconds}s ` : '';
    const outcome = (call.outcome || '').replace(/_/g, ' ');
    bits.push(`after ${dur}call${outcome ? ' · ' + outcome : ''}`);
  }
  if (!bits.length) return null;

  return (
    <div style={{
      font: "500 10px/1.4 'Inter'", color: '#8B8B98', marginBottom: 5,
      paddingBottom: 4, borderBottom: '1px solid rgba(20,20,40,0.06)',
    }}>
      {bits.join(' · ')}
    </div>
  );
}
