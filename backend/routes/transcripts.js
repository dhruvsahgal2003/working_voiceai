// Transcripts routes — retrieve call transcripts
const router = require('express').Router();
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/transcripts/:call_id
router.get('/:call_id', async (req, res) => {
  try {
    // Verify call belongs to user
    const { data: call } = await db.from('call_logs').select('id,user_id').eq('id', req.params.call_id).single();
    if (!call || call.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

    const { data: transcript } = await db.from('transcripts').select('*').eq('call_id', req.params.call_id).single();
    res.json({ transcript: transcript || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
