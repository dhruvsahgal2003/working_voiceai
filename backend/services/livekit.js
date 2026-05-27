// LiveKit service — room creation, SIP outbound dialing, agent dispatch, egress recording
const {
  RoomServiceClient, AccessToken, SipClient, AgentDispatchClient,
  EgressClient, EncodedFileOutput, EncodedFileType, S3Upload,
} = require('livekit-server-sdk');

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
 * Start recording a LiveKit room to Supabase S3 storage.
 * Returns the egress ID (store in call_logs.livekit_egress_id), or null on failure.
 */
async function startRoomRecording(roomName, callId, credentials = {}) {
  const client = getEgressClient(credentials);
  if (!client) return null;

  const s3Endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const s3Key      = process.env.SUPABASE_S3_ACCESS_KEY;
  const s3Secret   = process.env.SUPABASE_S3_SECRET_KEY;
  const s3Bucket   = process.env.SUPABASE_S3_BUCKET || 'call-recordings';
  const s3Region   = process.env.SUPABASE_S3_REGION || 'ap-south-1';

  if (!s3Key || !s3Secret || !s3Endpoint) {
    console.log('[LiveKit Recording] S3 env vars missing — skipping recording');
    return null;
  }

  try {
    const filePath = `recordings/${callId}.ogg`;
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.OGG,
      filepath: filePath,
      s3: new S3Upload({
        accessKey: s3Key,
        secret:    s3Secret,
        endpoint:  s3Endpoint,
        region:    s3Region,
        bucket:    s3Bucket,
        forcePathStyle: true,  // required for Supabase S3-compat endpoint
      }),
    });

    const egress = await client.startRoomCompositeEgress(roomName, { file: output }, {
      audioOnly: true,
    });

    console.log(`[LiveKit Recording] Started egress ${egress.egressId} for room ${roomName}`);
    return { egressId: egress.egressId, filePath, bucket: s3Bucket };
  } catch (err) {
    console.error('[LiveKit Recording] startRoomRecording error:', err.message);
    return null;
  }
}

/**
 * Stop a room egress and return the public recording URL, or null.
 */
async function stopRoomRecording(egressId, callId, credentials = {}) {
  const client = getEgressClient(credentials);
  if (!client || !egressId) return null;

  try {
    const egress = await client.stopEgress(egressId);
    // Build the public Supabase storage URL
    const supabaseProject = (process.env.SUPABASE_URL || '').match(/\/\/([^.]+)\./)?.[1];
    const bucket  = process.env.SUPABASE_S3_BUCKET || 'call-recordings';
    const filePath = `recordings/${callId}.ogg`;
    if (supabaseProject) {
      const url = `https://${supabaseProject}.supabase.co/storage/v1/object/public/${bucket}/${filePath}`;
      console.log(`[LiveKit Recording] Egress ${egressId} stopped. URL: ${url}`);
      return url;
    }
    return null;
  } catch (err) {
    console.error('[LiveKit Recording] stopRoomRecording error:', err.message);
    return null;
  }
}

module.exports = { createRoom, deleteRoom, generateToken, dispatchAgent, dialOutbound, getRoomClient, startRoomRecording, stopRoomRecording };
