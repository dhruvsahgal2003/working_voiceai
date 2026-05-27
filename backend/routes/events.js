// Events routes — activity feed for the dashboard sidebar
const router = require('express').Router();
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/events
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200);
    const { data, error } = await db.from('events')
      .select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/events/:id/read
router.patch('/:id/read', async (req, res) => {
  try {
    await db.from('events').update({ read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events/read-all
router.post('/read-all', async (req, res) => {
  try {
    await db.from('events').update({ read: true }).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
