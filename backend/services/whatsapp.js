// WhatsApp Cloud API inbox — shared helpers for the inbound/status/outbound-log
// ingest endpoints in routes/webhook.js.
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabase');

// What the agent promises on the call; override per deployment without a code change.
const DEFAULT_FOLLOWUP_TEXT = process.env.WHATSAPP_FOLLOWUP_TEXT
  || 'Details shared on WhatsApp — floor plans, pricing and the project brochure.';

// Meta sends wa_id as bare digits with country code (e.g. "919876543210"); our
// leads.phone convention is "+91XXXXXXXXXX" — normalize so contacts correlate
// with existing leads by phone.
function normalizePhone(raw) {
  if (!raw) return raw;
  const digits = String(raw).trim().replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

// Finds or creates the contact for (userId, waId); links to an existing lead by
// phone on first creation (same phone numbers are used for calling and WhatsApp).
async function upsertContact(userId, waId, name) {
  const phone = normalizePhone(waId);

  const { data: existing } = await supabase.from('whatsapp_contacts')
    .select('*').eq('user_id', userId).eq('wa_id', waId).maybeSingle();
  if (existing) {
    if (name && name !== existing.name) {
      await supabase.from('whatsapp_contacts').update({ name, updated_at: new Date().toISOString() }).eq('id', existing.id);
      return { ...existing, name };
    }
    return existing;
  }

  const { data: lead } = await supabase.from('leads').select('id').eq('user_id', userId).eq('phone', phone).maybeSingle();
  const { data: created } = await supabase.from('whatsapp_contacts').insert({
    id: uuidv4(), user_id: userId, wa_id: waId, phone, name: name || null, lead_id: lead?.id || null,
  }).select().single();
  return created;
}

// Conversations are 1:1 with contacts for the Cloud API model (no group threads).
async function getOrCreateConversation(userId, contactId) {
  const { data: existing } = await supabase.from('whatsapp_conversations')
    .select('*').eq('contact_id', contactId).maybeSingle();
  if (existing) return existing;

  const { data: created } = await supabase.from('whatsapp_conversations').insert({
    id: uuidv4(), user_id: userId, contact_id: contactId, unread_count: 0,
  }).select().single();
  return created;
}

async function bumpConversation(conversationId, { preview, at, incrementUnread }) {
  const updates = { last_message_at: at, last_message_preview: preview, updated_at: new Date().toISOString() };
  if (incrementUnread) {
    const { data: conv } = await supabase.from('whatsapp_conversations').select('unread_count').eq('id', conversationId).single();
    updates.unread_count = (conv?.unread_count || 0) + 1;
  }
  await supabase.from('whatsapp_conversations').update(updates).eq('id', conversationId);
}

async function insertMessage({ conversationId, userId, direction, wamid, body, messageType, status, rawPayload, waTimestamp, callId, leadId, agentId, templateName }) {
  const { data, error } = await supabase.from('whatsapp_messages').insert({
    id: uuidv4(), conversation_id: conversationId, user_id: userId, direction,
    wamid: wamid || null, body: body || null, message_type: messageType || 'text',
    status: status || (direction === 'inbound' ? 'received' : 'sent'),
    raw_payload: rawPayload || {}, wa_timestamp: waTimestamp || new Date().toISOString(),
    // Provenance: which call/lead/agent produced this message. Outbound rows get
    // it from the sender; inbound replies inherit it from the message they answer
    // (see linkInboundToContext) so a reply is traceable to the call that caused it.
    call_id: callId || null, lead_id: leadId || null, agent_id: agentId || null,
    template_name: templateName || null,
  }).select().single();
  // Meta can redeliver webhooks — a duplicate wamid hitting the unique index is
  // an expected retry, not a real error; treat it as a no-op.
  if (error && error.message?.includes('idx_whatsapp_messages_wamid_unique')) return null;
  if (error) throw error;
  return data;
}

// Template sends go out through n8n -> Meta's Graph API. WhatsApp Business gives
// us no delivery callback we can attribute back to a lead, so a message we sent
// would otherwise be invisible in the inbox. Mirror it at trigger time instead:
// the thread shows who was contacted and what they got, even though the send
// itself is untracked. Status stays 'sent' — we genuinely never learn more.
//
// wamid is a synthetic "sim:<callId>" so the partial unique index on wamid makes
// this idempotent for free: a redelivered call.completed webhook is a no-op
// rather than a duplicate bubble in the thread.
async function mirrorOutboundSend(userId, { phone, name, text, callId, leadId, agentId }) {
  if (!userId || !phone) return null;

  const contact = await upsertContact(userId, normalizePhone(phone).replace(/^\+/, ''), name);
  if (!contact) return null;
  const conversation = await getOrCreateConversation(userId, contact.id);
  if (!conversation) return null;

  const body = (text || '').trim() || DEFAULT_FOLLOWUP_TEXT;
  const now = new Date().toISOString();

  const saved = await insertMessage({
    conversationId: conversation.id, userId, direction: 'outbound',
    wamid: callId ? `sim:${callId}` : null,
    body, messageType: 'template', status: 'sent',
    // Marked so the thread can label it honestly and so these are separable from
    // genuinely tracked sends if WhatsApp delivery reporting ever becomes available.
    rawPayload: { simulated: true, source: 'call.completed', call_id: callId || null },
    waTimestamp: now,
    callId, leadId, agentId,
  });
  if (saved) await bumpConversation(conversation.id, { preview: body.slice(0, 120), at: now, incrementUnread: false });
  return saved;
}

// An inbound reply carries no context of its own — Meta just tells us "this
// number sent this text". To answer "did the person we called reply?", inherit
// the call/lead/agent from the most recent OUTBOUND message in the same thread.
// Scoped to 7 days so a reply months later is not misattributed to an old call.
const REPLY_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function linkInboundToContext(conversationId) {
  const { data } = await supabase.from('whatsapp_messages')
    .select('call_id, lead_id, agent_id, wa_timestamp')
    .eq('conversation_id', conversationId).eq('direction', 'outbound')
    .order('wa_timestamp', { ascending: false }).limit(1).maybeSingle();
  if (!data?.call_id && !data?.lead_id) return {};
  const age = Date.now() - new Date(data.wa_timestamp || 0).getTime();
  if (age > REPLY_ATTRIBUTION_WINDOW_MS) return {};
  return { callId: data.call_id || null, leadId: data.lead_id || null, agentId: data.agent_id || null };
}

async function updateMessageStatus(wamid, status) {
  if (!wamid) return;
  await supabase.from('whatsapp_messages').update({ status }).eq('wamid', wamid);
}

// WhatsApp only allows free-text replies within 24h of the contact's last inbound
// message (Meta's customer-service-window rule, not ours) — used to gate sending.
async function getLastInboundAt(conversationId) {
  const { data } = await supabase.from('whatsapp_messages')
    .select('wa_timestamp').eq('conversation_id', conversationId).eq('direction', 'inbound')
    .order('wa_timestamp', { ascending: false }).limit(1).maybeSingle();
  return data?.wa_timestamp || null;
}

module.exports = { normalizePhone, linkInboundToContext, upsertContact, getOrCreateConversation, bumpConversation, insertMessage, updateMessageStatus, getLastInboundAt, mirrorOutboundSend };
