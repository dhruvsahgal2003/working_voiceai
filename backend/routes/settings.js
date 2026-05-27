// Settings routes — save/load/test user credentials (Plivo, LiveKit, Sarvam)
const router = require('express').Router();
const axios = require('axios');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');

router.use(requireAuth);

// GET /api/settings/credentials
router.get('/credentials', async (req, res) => {
  try {
    const { data } = await db.from('user_credentials').select('*').eq('user_id', req.user.id).single();
    if (!data) return res.json({ credentials: {} });

    // Return plain-text for non-secret fields; use sentinel for secrets so UI knows they're saved
    res.json({
      credentials: {
        plivo_auth_id: data.plivo_auth_id || '',
        plivo_auth_token: data.plivo_auth_token_encrypted ? '__SAVED__' : '',
        livekit_url: data.livekit_url || '',
        livekit_api_key: data.livekit_api_key || '',
        livekit_api_secret: data.livekit_api_secret_encrypted ? '__SAVED__' : '',
        sarvam_api_key: data.sarvam_api_key_encrypted ? '__SAVED__' : '',
        openai_api_key: data.openai_api_key_encrypted ? '__SAVED__' : '',
        sales_webhook_url: data.sales_webhook_url || '',
        sales_whatsapp: data.sales_whatsapp || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/credentials
router.put('/credentials', async (req, res) => {
  try {
    const { plivo_auth_id, plivo_auth_token, livekit_url, livekit_api_key, livekit_api_secret, sarvam_api_key, openai_api_key, sales_webhook_url, sales_whatsapp } = req.body;

    const updates = {
      user_id: req.user.id,
      updated_at: new Date().toISOString(),
    };
    // Only update non-secret fields freely; only update secrets when a real new value is provided
    const isReal = v => v && v !== '__SAVED__';
    if (plivo_auth_id !== undefined) updates.plivo_auth_id = plivo_auth_id;
    if (isReal(plivo_auth_token)) updates.plivo_auth_token_encrypted = encrypt(plivo_auth_token);
    if (livekit_url !== undefined) updates.livekit_url = livekit_url;
    if (livekit_api_key !== undefined) updates.livekit_api_key = livekit_api_key;
    if (isReal(livekit_api_secret)) updates.livekit_api_secret_encrypted = encrypt(livekit_api_secret);
    if (isReal(sarvam_api_key)) updates.sarvam_api_key_encrypted = encrypt(sarvam_api_key);
    if (isReal(openai_api_key)) updates.openai_api_key_encrypted = encrypt(openai_api_key);
    if (sales_webhook_url !== undefined) updates.sales_webhook_url = sales_webhook_url;
    if (sales_whatsapp !== undefined) updates.sales_whatsapp = sales_whatsapp;

    await db.from('user_credentials').upsert(updates, { onConflict: 'user_id' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/test-plivo
router.post('/test-plivo', async (req, res) => {
  try {
    let { plivo_auth_id, plivo_auth_token } = req.body;

    // If token is sentinel or missing, load the saved credentials from DB
    if (!plivo_auth_token || plivo_auth_token === '__SAVED__') {
      const { data: saved } = await db.from('user_credentials').select('*').eq('user_id', req.user.id).single();
      if (!plivo_auth_id) plivo_auth_id = saved?.plivo_auth_id;
      if (saved?.plivo_auth_token_encrypted) plivo_auth_token = decrypt(saved.plivo_auth_token_encrypted);
    }

    if (!plivo_auth_id || !plivo_auth_token) return res.status(400).json({ error: 'No Plivo credentials saved yet' });

    const resp = await axios.get(`https://api.plivo.com/v1/Account/${plivo_auth_id}/`, {
      auth: { username: plivo_auth_id, password: plivo_auth_token },
      timeout: 8000,
    });
    res.json({ success: true, account: { name: resp.data.account_type, city: resp.data.city } });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid Plivo credentials — check your Auth ID and Token' });
  }
});

// POST /api/settings/test-livekit
router.post('/test-livekit', async (req, res) => {
  try {
    const { livekit_url, livekit_api_key, livekit_api_secret } = req.body;
    if (!livekit_url || !livekit_api_key || !livekit_api_secret) return res.status(400).json({ error: 'Credentials required' });

    const { RoomServiceClient } = require('livekit-server-sdk');
    const client = new RoomServiceClient(livekit_url, livekit_api_key, livekit_api_secret);
    await client.listRooms();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid LiveKit credentials' });
  }
});

module.exports = router;
