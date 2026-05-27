// Settings routes — Plivo credentials + auto-provision SIP trunk
// LiveKit, Sarvam, OpenAI are PLATFORM-LEVEL secrets in .env — never exposed to users.
const router = require('express').Router();
const axios = require('axios');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');
const { autoProvisionTrunk } = require('../services/livekit');

router.use(requireAuth);

// GET /api/settings/credentials  — returns only user-facing fields (Plivo + notification prefs)
router.get('/credentials', async (req, res) => {
  try {
    const { data } = await db.from('user_credentials').select('*').eq('user_id', req.user.id).single();
    if (!data) return res.json({ credentials: {} });
    res.json({
      credentials: {
        plivo_auth_id:    data.plivo_auth_id || '',
        plivo_auth_token: data.plivo_auth_token_encrypted ? '__SAVED__' : '',
        sales_webhook_url: data.sales_webhook_url || '',
        sales_whatsapp:    data.sales_whatsapp || '',
        // Expose provisioning status — not the actual keys
        sip_trunk_provisioned: !!data.livekit_url,
        sip_trunk_id: data.livekit_url || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/credentials  — save notification prefs only (Plivo is via /connect-plivo)
router.put('/credentials', async (req, res) => {
  try {
    const { sales_webhook_url, sales_whatsapp } = req.body;
    const updates = { user_id: req.user.id, updated_at: new Date().toISOString() };
    if (sales_webhook_url !== undefined) updates.sales_webhook_url = sales_webhook_url;
    if (sales_whatsapp    !== undefined) updates.sales_whatsapp    = sales_whatsapp;
    await db.from('user_credentials').upsert(updates, { onConflict: 'user_id' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/connect-plivo
// One-click Plivo setup: validate → auto-provision SIP trunk → save everything
router.post('/connect-plivo', async (req, res) => {
  try {
    const { plivo_auth_id, plivo_auth_token } = req.body;
    if (!plivo_auth_id || !plivo_auth_token) {
      return res.status(400).json({ error: 'Plivo Auth ID and Auth Token are required' });
    }

    // ── Step 1: Validate Plivo credentials ───────────────────────────────────
    let plivoAccount;
    try {
      const resp = await axios.get(`https://api.plivo.com/v1/Account/${plivo_auth_id}/`, {
        auth: { username: plivo_auth_id, password: plivo_auth_token },
        timeout: 8000,
      });
      plivoAccount = resp.data;
    } catch {
      return res.status(400).json({ error: 'Invalid Plivo credentials — check your Auth ID and Token' });
    }

    // ── Step 2: Fetch user's Plivo numbers (for trunk From numbers) ───────────
    let plivoNumbers = [];
    try {
      const numResp = await axios.get(`https://api.plivo.com/v1/Account/${plivo_auth_id}/Number/`, {
        auth: { username: plivo_auth_id, password: plivo_auth_token },
        timeout: 8000,
      });
      plivoNumbers = (numResp.data?.objects || []).map(n =>
        n.number.startsWith('+') ? n.number : `+${n.number}`
      );
    } catch {
      // Numbers fetch is best-effort — trunk still works without them
    }

    // ── Step 3: Auto-provision LiveKit SIP trunk (uses platform LiveKit keys) ─
    const { data: existing } = await db.from('user_credentials')
      .select('livekit_url').eq('user_id', req.user.id).single();
    const existingTrunkId = existing?.livekit_url || null;

    const trunkId = await autoProvisionTrunk(
      req.user.id,
      plivo_auth_id,
      plivo_auth_token,
      plivoNumbers,
      existingTrunkId,
    );

    // ── Step 4: Save credentials + trunk ID ──────────────────────────────────
    const updates = {
      user_id: req.user.id,
      plivo_auth_id,
      plivo_auth_token_encrypted: encrypt(plivo_auth_token),
      updated_at: new Date().toISOString(),
    };
    if (trunkId) updates.livekit_url = trunkId;  // reuse livekit_url col for per-user SIP trunk ID

    await db.from('user_credentials').upsert(updates, { onConflict: 'user_id' });

    // ── Step 5: Sync numbers into phone_numbers table ─────────────────────────
    let syncedCount = 0;
    for (const num of plivoNumbers) {
      await db.from('phone_numbers').upsert({
        user_id: req.user.id,
        number: num,
        plivo_number_id: num,
        country: 'IN',
        is_active: true,
      }, { onConflict: 'number,user_id' });
      syncedCount++;
    }

    console.log(`[ConnectPlivo] User ${req.user.id} — trunk: ${trunkId}, numbers synced: ${syncedCount}`);
    res.json({
      success: true,
      account_name: plivoAccount.account_type || 'Plivo Account',
      numbers_synced: syncedCount,
      sip_trunk_provisioned: !!trunkId,
    });
  } catch (err) {
    console.error('[ConnectPlivo] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/disconnect-plivo — remove SIP trunk + wipe credentials
router.post('/disconnect-plivo', async (req, res) => {
  try {
    const { data: creds } = await db.from('user_credentials')
      .select('livekit_url').eq('user_id', req.user.id).single();
    if (creds?.livekit_url) {
      try {
        const { SipClient } = require('livekit-server-sdk');
        const sipClient = new SipClient(
          process.env.LIVEKIT_URL, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET,
        );
        await sipClient.deleteSipTrunk(creds.livekit_url);
        console.log(`[DisconnectPlivo] Deleted SIP trunk ${creds.livekit_url}`);
      } catch (e) { console.warn('[DisconnectPlivo] Could not delete SIP trunk:', e.message); }
    }
    await db.from('user_credentials').upsert({
      user_id: req.user.id,
      plivo_auth_id: null,
      plivo_auth_token_encrypted: null,
      livekit_url: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/test-plivo
router.post('/test-plivo', async (req, res) => {
  try {
    let { plivo_auth_id, plivo_auth_token } = req.body;
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
  } catch {
    res.status(400).json({ success: false, error: 'Invalid Plivo credentials' });
  }
});

module.exports = router;
