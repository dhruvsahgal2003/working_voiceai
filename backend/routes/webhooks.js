// User webhook configuration CRUD
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const VALID_EVENTS = [
  'call.started', 'call.completed', 'call.failed',
  'call.hot_lead', 'call.voicemail', 'recording.ready',
  'analysis.done', 'campaign.completed', 'credit.low',
];

// GET /api/webhooks
router.get('/', async (req, res) => {
  try {
    const { data, error } = await db.from('user_webhooks')
      .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ webhooks: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks
router.post('/', async (req, res) => {
  try {
    const { name, url, events } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const invalidEvents = (events || []).filter(e => !VALID_EVENTS.includes(e));
    if (invalidEvents.length) return res.status(400).json({ error: `Invalid events: ${invalidEvents.join(', ')}` });

    const secret = crypto.randomBytes(20).toString('hex');
    const { data, error } = await db.from('user_webhooks').insert({
      id: uuidv4(),
      user_id: req.user.id,
      name: name || url,
      url,
      events: events || VALID_EVENTS,
      secret,
      is_active: true,
    }).select().single();

    if (error) throw error;
    res.json({ webhook: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/webhooks/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, url, events, is_active } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (url !== undefined) update.url = url;
    if (events !== undefined) update.events = events;
    if (is_active !== undefined) update.is_active = is_active;

    const { data, error } = await db.from('user_webhooks')
      .update(update).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json({ webhook: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await db.from('user_webhooks')
      .delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/:id/test — send a test event
router.post('/:id/test', async (req, res) => {
  try {
    const { data: hook } = await db.from('user_webhooks')
      .select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!hook) return res.status(404).json({ error: 'Webhook not found' });

    const { fireWebhooks } = require('../services/webhookFire');
    await fireWebhooks(req.user.id, 'call.completed', {
      test: true,
      call_id: 'test-123',
      lead_name: 'Test Lead',
      duration_seconds: 90,
      outcome: 'interested',
      cost: 9.0,
    });
    res.json({ success: true, message: 'Test event sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, VALID_EVENTS };
