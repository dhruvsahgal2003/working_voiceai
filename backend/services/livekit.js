// LiveKit service — room creation, SIP outbound dialing, agent dispatch, egress recording
const axios = require('axios');
const crypto = require('crypto');
const {
  RoomServiceClient, AccessToken, SipClient, AgentDispatchClient,
  EgressClient, EncodedFileOutput, EncodedFileType, S3Upload,
} = require('livekit-server-sdk');
const { SIPTransport, SIPMediaEncryption, AudioMixing } = require('@livekit/protocol');

const LIVEKIT_URL    = process.env.LIVEKIT_URL;
const LIVEKIT_KEY    = process.env.LIVEKIT_API_KEY;
const LIVEKIT_SECRET = process.env.LIVEKIT_API_SECRET;
const SIP_TRUNK_ID   = process.env.LIVEKIT_SIP_TRUNK_ID;

function getRoomClient(credentials = {}) {
  const url = credentials.livekit_url || LIVEKIT_URL;
  const key = credentials.livekit_api_key || LIVEKIT_KEY;
  const sec = credentials.livekit_api_secret || LIVEKIT_SECRET;
  if (!url || !key || !sec) return null;
  return new RoomServiceClient(url, key, sec);
}

function getSipClient(credentials = {}) {
  const url = credentials.livekit_url || LIVEKIT_URL;
  const key = credentials.livekit_api_key || LIVEKIT_KEY;
  const sec = credentials.livekit_api_secret || LIVEKIT_SECRET;
  if (!url || !key || !sec) return null;
  return new SipClient(url, key, sec);
}

function getDispatchClient(credentials = {}) {
  const url = credentials.livekit_url || LIVEKIT_URL;
  const key = credentials.livekit_api_key || LIVEKIT_KEY;
  const sec = credentials.livekit_api_secret || LIVEKIT_SECRET;
  if (!url || !key || !sec) return null;
  return new AgentDispatchClient(url, key, sec);
}

async function createRoom(roomName, credentials = {}) {
  const client = getRoomClient(credentials);
  if (!client) return { name: roomName, mock: true };
  try {
    return await client.createRoom({ name: roomName, emptyTimeout: 300, maxParticipants: 10 });
  } catch (err) {
    console.error('LiveKit createRoom error:', err.message);
    return { name: roomName, mock: true };
  }
}

async function deleteRoom(roomName, credentials = {}) {
  const client = getRoomClient(credentials);
  if (!client) return;
  try { await client.deleteRoom(roomName); } catch (err) { /* ignore */ }
}

function generateToken(roomName, participantName, credentials = {}) {
  const key = credentials.livekit_api_key || LIVEKIT_KEY;
  const sec = credentials.livekit_api_secret || LIVEKIT_SECRET;
  if (!key || !sec) return null;
  const at = new AccessToken(key, sec, { identity: participantName });
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

// Dispatch the Python agent worker to a room
async function dispatchAgent(roomName, metadata = {}, credentials = {}) {
  const client = getDispatchClient(credentials);
  if (!client) {
    console.log(`[LiveKit] No credentials — skipping agent dispatch for ${roomName}`);
    return null;
  }
  try {
    const dispatch = await client.createDispatch(roomName, 'propconnect', {
      metadata: JSON.stringify(metadata),
    });
    console.log(`[LiveKit] Agent dispatched → room: ${roomName}, dispatch: ${dispatch.dispatchId}`);
    return dispatch;
  } catch (err) {
    console.error('LiveKit dispatchAgent error:', err.message);
    return null;
  }
}

// Place an outbound SIP call through the Plivo Zentrunk into a LiveKit room
async function dialOutbound(roomName, phoneNumber, participantName = 'lead', metadata = {}, credentials = {}) {
  const client = getSipClient(credentials);
  const trunkId = credentials.livekit_sip_trunk_id || SIP_TRUNK_ID;

  if (!client || !trunkId) {
    console.log(`[LiveKit SIP] No client or trunk ID — skipping SIP dial for ${phoneNumber}`);
    return null;
  }

  try {
    const sipInfo = await client.createSipParticipant(
      trunkId,
      phoneNumber,
      roomName,
      {
        participantIdentity: `sip_${phoneNumber.replace(/\D/g, '')}`,
        participantName,
        participantMetadata: JSON.stringify(metadata),
        waitUntilAnswered: false, // fire-and-forget; don't block
        playDialtone: true,
      }
    );
    console.log(`[LiveKit SIP] Outbound call placed → ${phoneNumber} in room ${roomName}`, sipInfo.participantIdentity);
    return sipInfo;
  } catch (err) {
    console.error('LiveKit dialOutbound error:', err.message);
    throw err;
  }
}

// ─── EGRESS RECORDING ─────────────────────────────────────────────────────────
function getEgressClient(credentials = {}) {
  const url = credentials.livekit_url || LIVEKIT_URL;
  const key = credentials.livekit_api_key || LIVEKIT_KEY;
  const sec = credentials.livekit_api_secret || LIVEKIT_SECRET;
  if (!url || !key || !sec) return null;
  return new EgressClient(url, key, sec);
}

/**
 * Start recording a LiveKit room — uploads to local MinIO (S3-compatible).
 * Returns the egress ID (store in call_logs.livekit_egress_id), or null on failure.
 */
async function startRoomRecording(roomName, callId, credentials = {}) {
  const client = getEgressClient(credentials);
  if (!client) return null;

  const s3Endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const s3Key      = process.env.SUPABASE_S3_ACCESS_KEY;
  const s3Secret   = process.env.SUPABASE_S3_SECRET_KEY;
  const s3Bucket   = process.env.SUPABASE_S3_BUCKET || 'call-recordings';
  const s3Region   = process.env.SUPABASE_S3_REGION || 'us-east-1';

  if (!s3Key || !s3Secret || !s3Endpoint) {
    console.log('[LiveKit Recording] S3 env vars missing — skipping recording');
    return null;
  }

  try {
    const filePath = `recordings/${callId}.ogg`;
    // SDK v2 uses protobuf oneof — storage provider must be set via output.case/value
    const s3 = new S3Upload({
      accessKey: s3Key,
      secret:    s3Secret,
      endpoint:  s3Endpoint,
      region:    s3Region,
      bucket:    s3Bucket,
      forcePathStyle: true,  // required for Supabase S3-compat endpoint
    });
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: filePath,
      output: { case: 's3', value: s3 },
    });

    // DUAL_CHANNEL_AGENT: agent audio → left channel, SIP/participant audio → right channel.
    // This ensures the SIP participant's voice is captured on a dedicated channel rather than
    // being silently dropped by the DEFAULT_MIXING mode when the participant joins late.
    const egress = await client.startRoomCompositeEgress(roomName, output, {
      audioOnly: true,
      audioMixing: AudioMixing.DUAL_CHANNEL_AGENT,
    });

    console.log(`[LiveKit Recording] Started egress ${egress.egressId} for room ${roomName}`);
    return { egressId: egress.egressId, filePath, bucket: s3Bucket };
  } catch (err) {
    console.error('[LiveKit Recording] startRoomRecording error:', err.message);
    return null;
  }
}

// Where a recording for a given call lands. Deterministic — startRoomRecording
// writes to exactly this path, so both sides derive it the same way.
function recordingUrlFor(callId) {
  const endpoint = (process.env.SUPABASE_S3_ENDPOINT || '').replace(/\/$/, '');
  const bucket   = process.env.SUPABASE_S3_BUCKET || 'call-recordings';
  if (!endpoint) return null;
  return `${endpoint}/${bucket}/recordings/${callId}.ogg`;
}

// Poll until the object is actually fetchable. The upload to MinIO happens AFTER
// the egress finalises, so checking once immediately would usually 404 and we'd
// throw away a recording that lands a second later.
async function waitForRecording(url, { attempts = 12, delayMs = 2500 } = {}) {
  const axios = require('axios');
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await axios.head(url, { timeout: 5000, validateStatus: () => true });
      if (r.status === 200) return true;
    } catch { /* network blip — keep waiting */ }
    if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Finalise a room egress and return the public recording URL, or null.
 *
 * The bug this replaces: it called stopEgress() and treated ANY error as "no
 * recording". But LiveKit auto-finalises the egress when the room closes, so by
 * the time the call-completed webhook fires the egress is usually already
 * EGRESS_COMPLETE and stopEgress throws "egress with status EGRESS_COMPLETE
 * cannot be stopped". The .ogg was sitting in MinIO, perfectly playable, while
 * recording_url stayed NULL — 138 recordings on disk against 41 rows with a URL.
 *
 * So: a failed stop is not evidence of a failed recording. The only thing that
 * settles it is whether the object is actually fetchable.
 */
async function stopRoomRecording(egressId, callId, credentials = {}) {
  if (!egressId || !callId) return null;
  const client = getEgressClient(credentials);

  if (client) {
    try {
      await client.stopEgress(egressId);
      console.log(`[LiveKit Recording] Egress ${egressId} stopped`);
    } catch (err) {
      // Expected on the normal path — the room closed and LiveKit already
      // finalised it. Log at debug level and go check for the file anyway.
      console.log(`[LiveKit Recording] Egress ${egressId} not stoppable (${err.message}) — checking for the file`);
    }
  }

  const url = recordingUrlFor(callId);
  if (!url) {
    console.warn('[LiveKit Recording] SUPABASE_S3_ENDPOINT unset — cannot build recording URL');
    return null;
  }

  const exists = await waitForRecording(url);
  if (!exists) {
    console.warn(`[LiveKit Recording] No object at ${url} after waiting — recording lost`);
    return null;
  }
  console.log(`[LiveKit Recording] Recording available: ${url}`);
  return url;
}

/**
 * Warm-transfer the human caller off to another number (SIP REFER).
 *
 * This moves the CALLER's leg — the agent stays behind and the room ends for it.
 * `toNumber` must be E.164; it is wrapped as a tel: URI, which is what LiveKit
 * hands to the SIP trunk.
 *
 * Returns { ok: true } or { ok: false, error } — never throws, because the
 * caller is mid-conversation and a failed transfer must degrade into the agent
 * apologising, not into a dropped call.
 */
async function transferSipCall(roomName, participantIdentity, toNumber, credentials = {}) {
  const client = getSipClient(credentials);
  if (!client) return { ok: false, error: 'LiveKit SIP client not configured' };
  if (!roomName || !participantIdentity) return { ok: false, error: 'room and participant identity required' };

  const digits = String(toNumber || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
    return { ok: false, error: `transfer number must be E.164 (got "${digits}")` };
  }

  try {
    await client.transferSipParticipant(roomName, participantIdentity, `tel:${digits}`, {
      // Without this the caller hears dead air while the human's phone rings and
      // usually assumes the call dropped.
      playDialtone: true,
    });
    console.log(`[LiveKit Transfer] ${participantIdentity} in ${roomName} → ${digits}`);
    return { ok: true };
  } catch (err) {
    console.error('[LiveKit Transfer] failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─── PLUG-AND-PLAY SIP PROVISIONING (Plivo Zentrunk + LiveKit) ────────────────
// Onboarding flow: user pastes Plivo Auth ID + Token → backend creates a Plivo
// Zentrunk outbound trunk + SIP credential on THEIR account, then a matching
// LiveKit outbound trunk that authenticates against it. Zero manual SIP setup.

const PLIVO_ZENTRUNK = (authId) => `https://api.plivo.com/v1/Account/${authId}/Zentrunk`;
// Plain SIP/RTP is the most reliable first-call config with Plivo Zentrunk: no
// TLS handshake + SRTP key exchange to misnegotiate. When this was `true`, Plivo
// created the trunk with secure=true (SRTP REQUIRED) but the LiveKit trunk only
// set TLS for *signaling* and left media encryption DISABLED — so RTP was refused
// both ways and calls had no audio. Flip back to `true` for end-to-end TLS+SRTP
// (the code below now also sets matching media encryption when secure).
const SECURE_TRUNKING = false;

function randToken(bytes = 12) { return crypto.randomBytes(bytes).toString('hex'); }

/**
 * Generate a Plivo-compliant SIP credential password.
 * Plivo rule: length 5–20, alphanumeric ONLY plus at least one special char
 * from the set ~!@#$%^&*()_+ . We build 14 alphanumeric chars + 2 specials = 16.
 */
function randSipPassword() {
  const alnum = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no ambiguous 0/O/1/I/l
  const special = '~!@#$%^&*()_+';
  const pick = (set) => set[crypto.randomBytes(1)[0] % set.length];
  const chars = [];
  for (let i = 0; i < 14; i++) chars.push(pick(alnum));
  chars.push(pick(special), pick(special));
  // Fisher–Yates shuffle so the specials aren't always at the end
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * The per-user SIP provisioning state is persisted as a JSON blob in
 * user_credentials.livekit_url (no schema migration needed). These helpers
 * read/write it, with backward-compat for the legacy "ST_xxx" plain-string form.
 */
function serializeProvision(p) { return JSON.stringify(p); }
function parseProvision(str) {
  if (!str) return null;
  if (typeof str === 'object') return str;
  if (str.startsWith('ST_')) return { lk_trunk: str };  // legacy: bare trunk id
  try { return JSON.parse(str); } catch { return null; }
}

/**
 * Delete any leftover Zentrunk trunk + credential whose name matches our
 * deterministic label. A previous Connect attempt can die mid-way (e.g. after
 * the credential/trunk are created but before the domain is readable), leaving
 * orphans that make the next attempt fail with "… already exists". Running this
 * first makes provisioning idempotent — Connect can always be retried cleanly.
 */
async function cleanupPlivoByName(base, label, auth) {
  // Trunks first (a credential can't be deleted while a trunk references it).
  try {
    const r = await axios.get(`${base}/Trunk/`, { auth, timeout: 12000 });
    for (const t of (r.data?.objects || [])) {
      if (t.name === label && t.trunk_id) {
        try { await axios.delete(`${base}/Trunk/${t.trunk_id}/`, { auth, timeout: 10000 }); }
        catch (e) { console.warn('[Provision] stale trunk delete:', e.response?.status || e.message); }
      }
    }
  } catch (e) { console.warn('[Provision] list trunks:', e.response?.status || e.message); }

  try {
    const r = await axios.get(`${base}/Credential/`, { auth, timeout: 12000 });
    for (const c of (r.data?.objects || [])) {
      if (c.name === label && c.credential_uuid) {
        try { await axios.delete(`${base}/Credential/${c.credential_uuid}/`, { auth, timeout: 10000 }); }
        catch (e) { console.warn('[Provision] stale credential delete:', e.response?.status || e.message); }
      }
    }
  } catch (e) { console.warn('[Provision] list credentials:', e.response?.status || e.message); }
}

/**
 * Provision a Plivo Zentrunk OUTBOUND trunk + digest credential on the user's
 * own Plivo account. Returns the termination SIP domain + generated SIP creds.
 * Throws on failure (caller decides how to surface it).
 */
async function provisionPlivoZentrunk(authId, authToken) {
  const auth = { username: authId, password: authToken };
  const base = PLIVO_ZENTRUNK(authId);
  const label = `velryx-${authId.slice(0, 8)}`;

  // 0. Remove leftovers from any previous partial/failed attempt (idempotent).
  await cleanupPlivoByName(base, label, auth);

  // 1. Create a SIP credential (username/password for outbound digest auth)
  const sipUser = `velryx${authId.slice(0, 6).toLowerCase()}${randToken(2)}`;
  const sipPass = randSipPassword();
  const credResp = await axios.post(`${base}/Credential/`,
    { username: sipUser, password: sipPass, name: label },
    { auth, timeout: 12000 });
  const credentialUuid = credResp.data.credential_uuid;
  if (!credentialUuid) throw new Error('Plivo did not return a credential_uuid');

  // 2. Create the outbound trunk bound to that credential
  const trunkResp = await axios.post(`${base}/Trunk/`,
    { name: label, trunk_direction: 'outbound', credential_uuid: credentialUuid, secure: SECURE_TRUNKING },
    { auth, timeout: 12000 });
  const plivoTrunkId = trunkResp.data.trunk_id;
  if (!plivoTrunkId) throw new Error('Plivo did not return a trunk_id');

  // 3. Read back the termination SIP domain (where LiveKit will send INVITEs).
  //    Plivo doesn't always populate trunk_domain the instant the trunk is
  //    created, so poll a few times before giving up.
  //    Plivo nests the trunk under an `object` key: { api_id, object: { trunk_domain, … } }.
  let trunkDomain = null;
  for (let i = 0; i < 4 && !trunkDomain; i++) {
    if (i) await new Promise(r => setTimeout(r, 1500));
    try {
      const detail = await axios.get(`${base}/Trunk/${plivoTrunkId}/`, { auth, timeout: 12000 });
      const obj = detail.data?.object || detail.data || {};
      trunkDomain = obj.trunk_domain || obj.domain || null;
    } catch (e) { console.warn('[Provision] read trunk domain:', e.response?.status || e.message); }
  }
  if (!trunkDomain) {
    // Don't leak the just-created resources if we can't get a usable domain.
    await teardownPlivoZentrunk(authId, authToken, plivoTrunkId, credentialUuid);
    throw new Error('Plivo trunk created but no termination domain returned');
  }

  return { plivoTrunkId, credentialUuid, sipUser, sipPass, trunkDomain };
}

/** Best-effort teardown of a user's Plivo Zentrunk trunk + credential. */
async function teardownPlivoZentrunk(authId, authToken, plivoTrunkId, credentialUuid) {
  const auth = { username: authId, password: authToken };
  const base = PLIVO_ZENTRUNK(authId);
  if (plivoTrunkId) {
    try { await axios.delete(`${base}/Trunk/${plivoTrunkId}/`, { auth, timeout: 10000 }); }
    catch (e) { console.warn('[Teardown] Plivo trunk:', e.response?.status || e.message); }
  }
  if (credentialUuid) {
    try { await axios.delete(`${base}/Credential/${credentialUuid}/`, { auth, timeout: 10000 }); }
    catch (e) { console.warn('[Teardown] Plivo credential:', e.response?.status || e.message); }
  }
}

/**
 * Create the LiveKit outbound trunk that points at the user's Plivo termination
 * domain, authenticating with the generated SIP credential. One platform-level
 * LiveKit project; this just creates a lightweight per-user trunk object.
 * @returns {string} LiveKit SIP trunk id (ST_xxx)
 */
async function createLiveKitOutboundTrunk({ userId, address, numbers, authUsername, authPassword, secure }) {
  const client = getSipClient();   // platform-level LiveKit env vars
  if (!client) throw new Error('LiveKit SipClient unavailable — check LIVEKIT_URL/KEY/SECRET');
  const trunk = await client.createSipOutboundTrunk(
    `velryx-${userId.slice(0, 8)}`,
    address,
    numbers,
    {
      authUsername,
      authPassword,
      // Always TLS for SIP signaling — TCP is reliable through NAT where UDP
      // packets can be silently dropped, causing 45s timeouts and no ringing.
      // `secure` (SECURE_TRUNKING) only controls *media* encryption (SRTP), not
      // the signaling transport.
      transport: SIPTransport.SIP_TRANSPORT_TLS,
      mediaEncryption: secure
        ? SIPMediaEncryption.SIP_MEDIA_ENCRYPT_REQUIRE
        : SIPMediaEncryption.SIP_MEDIA_ENCRYPT_DISABLE,
    },
  );
  return trunk.sipTrunkId;
}

/** Best-effort delete of a LiveKit outbound trunk. */
async function deleteLiveKitTrunk(trunkId) {
  const client = getSipClient();
  if (!client || !trunkId) return;
  try { await client.deleteSipTrunk(trunkId); }
  catch (e) { console.warn('[Teardown] LiveKit trunk:', e.message); }
}

module.exports = {
  recordingUrlFor, waitForRecording,
  createRoom, deleteRoom, generateToken, dispatchAgent, dialOutbound, getRoomClient,
  startRoomRecording, stopRoomRecording, transferSipCall,
  SECURE_TRUNKING, serializeProvision, parseProvision,
  provisionPlivoZentrunk, teardownPlivoZentrunk, createLiveKitOutboundTrunk, deleteLiveKitTrunk,
};
