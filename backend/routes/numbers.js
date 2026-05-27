// Phone numbers routes — manage user's Plivo numbers
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { decrypt } = require('../services/encryption');

router.use(requireAuth);

async function getPlivoClient(userId) {
  const { data: creds } = await db.from('user_credentials').select('*').eq('user_id', userId).single();
  const authId = creds?.plivo_auth_id || process.env.PLIVO_AUTH_ID;
  const authToken = creds?.plivo_auth_token_encrypted ? decrypt(creds.plivo_auth_token_encrypted) : process.env.PLIVO_AUTH_TOKEN;
  if (!authId || authId.includes('PLACEHOLDER') || authId.includes('your_')) return null;
  return { authId, authToken };
}

// GET /api/numbers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await db.from('phone_numbers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ numbers: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers — manually add an existing Plivo number
router.post('/', async (req, res) => {
  try {
    const { number, plivo_number_id, monthly_cost } = req.body;
    if (!number) return res.status(400).json({ error: 'number is required' });

    const { data, error } = await db.from('phone_numbers').insert({
      id: uuidv4(),
      user_id: req.user.id,
      number,
      plivo_number_id,
      monthly_cost: monthly_cost || 0,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json({ number: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/numbers/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.from('phone_numbers').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/numbers/sync — pull numbers from Plivo API
router.post('/sync', async (req, res) => {
  try {
    const plivo = await getPlivoClient(req.user.id);
    if (!plivo) return res.json({ synced: 0, message: 'Plivo credentials not configured' });

    const axios = require('axios');
    const resp = await axios.get(`https://api.plivo.com/v1/Account/${plivo.authId}/Number/`, {
      auth: { username: plivo.authId, password: plivo.authToken },
    });

    const numbers = resp.data?.objects || [];
    let synced = 0;
    for (const n of numbers) {
      await db.from('phone_numbers').upsert({
        user_id: req.user.id,
        number: n.number,
        plivo_number_id: n.number,
        country: 'IN',
        monthly_cost: 0,
        is_active: true,
      }, { onConflict: 'number,user_id' });
      synced++;
    }
    res.json({ synced, total: numbers.length });
  } catch (err) {
    console.error('sync numbers error:', err.message);
    if (err.response?.status === 401) {
      return res.status(400).json({ error: 'Plivo auth failed — verify your Auth ID and Token in Settings → Credentials.' });
    }
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

module.exports = router;
