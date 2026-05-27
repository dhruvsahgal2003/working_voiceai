// Recordings routes — retrieve/stream call recordings from R2 or Plivo URL
const router = require('express').Router();
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/recordings/:call_id
router.get('/:call_id', async (req, res) => {
  try {
    const { data: call } = await db.from('call_logs')
      .select('id,user_id,recording_url').eq('id', req.params.call_id).single();
    if (!call || call.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

    const { data: recording } = await db.from('recordings').select('*').eq('call_id', req.params.call_id).single();
    res.json({ recording: recording || (call.recording_url ? { url: call.recording_url } : null) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
