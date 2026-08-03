// WhatsApp inbox routes — conversation list, thread view, and sending a reply.
// Ingestion (inbound/status/outbound-log) lives in routes/webhook.js.
const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { insertMessage, bumpConversation, getLastInboundAt } = require('../services/whatsapp');

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

router.use(requireAuth);

// GET /api/messages/conversations
router.get('/conversations', async (req, res) => {
  try {
    const { data, error } = await supabase.from('whatsapp_conversations')
      .select('*, whatsapp_contacts(*)')
      .eq('user_id', req.user.id)
      .order('last_message_at', { ascending: false });
    if (error) throw error;
    res.json({ conversations: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/conversations/:id/messages — most recent 100, oldest-first for the UI
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const { data: conv } = await supabase.from('whatsapp_conversations')
      .select('id').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { data, error } = await supabase.from('whatsapp_messages')
      .select('*').eq('conversation_id', req.params.id)
      .order('wa_timestamp', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ messages: (data || []).reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/conversations/:id/send — free-text reply, only within Meta's
// 24h customer-service window (enforced here, not just hidden in the UI).
router.post('/conversations/:id/send', async (req, res) => {
  try {
    const text = (req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text required' });

    const { data: conv } = await supabase.from('whatsapp_conversations')
      .select('*, whatsapp_contacts(*)').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const lastInboundAt = await getLastInboundAt(conv.id);
    if (!lastInboundAt || Date.now() - new Date(lastInboundAt).getTime() > REPLY_WINDOW_MS) {
      return res.status(400).json({
        error: "Outside the 24-hour reply window — WhatsApp only allows free-text replies within 24h of the contact's last message.",
        code: 'OUTSIDE_WINDOW',
      });
    }

    const webhookUrl = process.env.WHATSAPP_SEND_REPLY_WEBHOOK_URL;
    if (!webhookUrl) return res.status(500).json({ error: 'WHATSAPP_SEND_REPLY_WEBHOOK_URL not configured' });

    const n8nRes = await axios.post(webhookUrl,
      { to: conv.whatsapp_contacts.wa_id, text },
      { headers: { 'x-internal-secret': process.env.INTERNAL_SECRET }, timeout: 15000 });

    const wamid = n8nRes.data?.messages?.[0]?.id;
    if (!wamid) return res.status(502).json({ error: 'Send failed: no message id returned from WhatsApp' });

    const now = new Date().toISOString();
    const saved = await insertMessage({
      conversationId: conv.id, userId: req.user.id, direction: 'outbound',
      wamid, body: text, messageType: 'text', status: 'sent',
      rawPayload: n8nRes.data, waTimestamp: now,
    });
    if (saved) await bumpConversation(conv.id, { preview: text.slice(0, 120), at: now, incrementUnread: false });

    res.json({ message: saved });
  } catch (err) {
    console.error('[Messages/send] error:', err.response?.data || err.message);
    res.status(err.response?.status === 401 ? 502 : 500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// POST /api/messages/conversations/:id/read
router.post('/conversations/:id/read', async (req, res) => {
  try {
    await supabase.from('whatsapp_conversations').update({ unread_count: 0 })
      .eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
