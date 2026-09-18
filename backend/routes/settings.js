// Settings routes — Plivo credentials + auto-provision SIP trunk
// LiveKit, Sarvam, OpenAI are PLATFORM-LEVEL secrets in .env — never exposed to users.
const router = require('express').Router();
const axios = require('axios');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');
const {
  SECURE_TRUNKING, serializeProvision, parseProvision,
  provisionPlivoZentrunk, teardownPlivoZentrunk, createLiveKitOutboundTrunk, deleteLiveKitTrunk,
} = require('../services/livekit');

router.use(requireAuth);

// GET /api/settings/credentials  — returns only user-facing fields (Plivo + notification prefs)
router.get('/credentials', async (req, res) => {
  try {
    const { data } = await db.from('user_credentials').select('*').eq('user_id', req.user.id).single();
    if (!data) return res.json({ credentials: {} });
    const prov = parseProvision(data.livekit_url);
    res.json({
      credentials: {
        plivo_auth_id:    data.plivo_auth_id || '',
        plivo_auth_token: data.plivo_auth_token_encrypted ? '__SAVED__' : '',
        sales_webhook_url: data.sales_webhook_url || '',
        sales_whatsapp:    data.sales_whatsapp || '',
        // Expose provisioning status — not the actual keys
        sip_trunk_provisioned: !!prov?.lk_trunk,
        sip_trunk_id: prov?.lk_trunk || '',
        from_number: prov?.from || '',
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
// One-click plug-and-play: validate → provision Plivo Zentrunk outbound trunk +
// SIP credential on the user's account → create matching LiveKit trunk → save.
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

    // ── Step 2: Fetch the account's Plivo numbers (caller IDs) ────────────────
    let plivoNumbers = [];
    try {
      const numResp = await axios.get(`https://api.plivo.com/v1/Account/${plivo_auth_id}/Number/`, {
        auth: { username: plivo_auth_id, password: plivo_auth_token },
        timeout: 8000,
      });
      plivoNumbers = (numResp.data?.objects || []).map(n =>
        n.number.startsWith('+') ? n.number : `+${n.number}`
      );
    } catch { /* best-effort */ }
    if (!plivoNumbers.length) {
      return res.status(400).json({
        error: 'No phone numbers found on this Plivo account. Buy a number in Plivo first, then reconnect.',
      });
    }

    // ── Step 3: Tear down any previous provisioning (clean re-connect) ────────
    const { data: existing } = await db.from('user_credentials')
      .select('livekit_url').eq('user_id', req.user.id).single();
    const prevProv = parseProvision(existing?.livekit_url);
    if (prevProv) {
      await teardownPlivoZentrunk(plivo_auth_id, plivo_auth_token, prevProv.plivo_trunk, prevProv.cred_uuid);
      await deleteLiveKitTrunk(prevProv.lk_trunk);
    }

    // ── Step 4: Provision Plivo Zentrunk (credential + outbound trunk) ────────
    let pz;
    try {
      pz = await provisionPlivoZentrunk(plivo_auth_id, plivo_auth_token);
    } catch (e) {
      const detail = e.response?.data?.error || e.response?.data?.message || e.message;
      console.error('[ConnectPlivo] Plivo Zentrunk error:', e.response?.data || e.message);
      return res.status(400).json({ error: `Couldn't set up the SIP trunk on your Plivo account: ${detail}` });
    }

    // ── Step 5: Create the matching LiveKit outbound trunk ───────────────────
    const fromNumber = plivoNumbers[0];
    let lkTrunkId;
    try {
      lkTrunkId = await createLiveKitOutboundTrunk({
        userId: req.user.id,
        address: pz.trunkDomain,
        numbers: plivoNumbers,
        authUsername: pz.sipUser,
        authPassword: pz.sipPass,
        secure: SECURE_TRUNKING,
      });
    } catch (e) {
      // Roll back the Plivo side so we don't leave orphaned trunks/credentials
      await teardownPlivoZentrunk(plivo_auth_id, plivo_auth_token, pz.plivoTrunkId, pz.credentialUuid);
      console.error('[ConnectPlivo] LiveKit trunk error:', e.message);
      return res.status(500).json({ error: `Provisioned Plivo but failed to create the LiveKit trunk: ${e.message}` });
    }

    // ── Step 6: Persist the provisioning blob (JSON in livekit_url) ──────────
    const provision = serializeProvision({
      lk_trunk:    lkTrunkId,
      plivo_trunk: pz.plivoTrunkId,
      cred_uuid:   pz.credentialUuid,
      sip_user:    pz.sipUser,
      sip_pass_enc: encrypt(pz.sipPass),
      from:        fromNumber,
      domain:      pz.trunkDomain,
      secure:      SECURE_TRUNKING,
    });
    await db.from('user_credentials').upsert({
      user_id: req.user.id,
      plivo_auth_id,
      plivo_auth_token_encrypted: encrypt(plivo_auth_token),
      livekit_url: provision,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // ── Step 7: Sync numbers into phone_numbers table ─────────────────────────
    let syncedCount = 0;
    for (const num of plivoNumbers) {
      await db.from('phone_numbers').upsert({
        user_id: req.user.id, number: num, plivo_number_id: num, country: 'IN', is_active: true,
      }, { onConflict: 'number,user_id' });
      syncedCount++;
    }

    console.log(`[ConnectPlivo] User ${req.user.id} — LK trunk ${lkTrunkId}, Plivo trunk ${pz.plivoTrunkId}, domain ${pz.trunkDomain}, from ${fromNumber}, numbers ${syncedCount}`);
    res.json({
      success: true,
      account_name: plivoAccount.account_type || 'Plivo Account',
      numbers_synced: syncedCount,
      from_number: fromNumber,
      sip_trunk_provisioned: true,
    });
  } catch (err) {
    console.error('[ConnectPlivo] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/disconnect-plivo — tear down SIP trunks (both sides) + wipe creds
router.post('/disconnect-plivo', async (req, res) => {
  try {
    const { data: creds } = await db.from('user_credentials')
      .select('livekit_url, plivo_auth_id, plivo_auth_token_encrypted').eq('user_id', req.user.id).single();
    const prov = parseProvision(creds?.livekit_url);
    if (prov) {
      await deleteLiveKitTrunk(prov.lk_trunk);
      if (creds?.plivo_auth_id && creds?.plivo_auth_token_encrypted && (prov.plivo_trunk || prov.cred_uuid)) {
        try {
          await teardownPlivoZentrunk(
            creds.plivo_auth_id, decrypt(creds.plivo_auth_token_encrypted),
            prov.plivo_trunk, prov.cred_uuid,
          );
        } catch (e) { console.warn('[DisconnectPlivo] Plivo teardown:', e.message); }
      }
      console.log(`[DisconnectPlivo] Torn down trunks for user ${req.user.id}`);
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
