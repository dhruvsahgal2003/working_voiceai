// WhatsApp inbox routes — read-only conversation list + thread view for the UI.
// Ingestion (inbound/status/outbound-log) lives in routes/webhook.js.
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

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
