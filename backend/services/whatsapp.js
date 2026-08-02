// WhatsApp Cloud API inbox — shared helpers for the inbound/status/outbound-log
// ingest endpoints in routes/webhook.js.
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabase');

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

async function insertMessage({ conversationId, userId, direction, wamid, body, messageType, status, rawPayload, waTimestamp }) {
  const { data, error } = await supabase.from('whatsapp_messages').insert({
    id: uuidv4(), conversation_id: conversationId, user_id: userId, direction,
    wamid: wamid || null, body: body || null, message_type: messageType || 'text',
    status: status || (direction === 'inbound' ? 'received' : 'sent'),
    raw_payload: rawPayload || {}, wa_timestamp: waTimestamp || new Date().toISOString(),
  }).select().single();
  // Meta can redeliver webhooks — a duplicate wamid hitting the unique index is
  // an expected retry, not a real error; treat it as a no-op.
  if (error && error.message?.includes('idx_whatsapp_messages_wamid_unique')) return null;
  if (error) throw error;
  return data;
}

async function updateMessageStatus(wamid, status) {
  if (!wamid) return;
  await supabase.from('whatsapp_messages').update({ status }).eq('wamid', wamid);
}

module.exports = { normalizePhone, upsertContact, getOrCreateConversation, bumpConversation, insertMessage, updateMessageStatus };
