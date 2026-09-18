require('dotenv').config();
const express   = require('express');
require('express-async-errors'); // makes rejected promises in async route handlers flow to the error middleware below instead of crashing the process (Express 4 doesn't do this natively)
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const http      = require('http');
const WebSocket = require('ws');

const app    = express();
const server = http.createServer(app);

// Trust nginx reverse proxy (fixes X-Forwarded-For in rate limiter)
app.set('trust proxy', 1);

// ─── PROCESS-LEVEL CRASH GUARDS ────────────────────────────────────────────────
// unhandledRejection: log and keep running. Most rejections here come from
// fire-and-forget background work (webhook delivery, notifications, the campaign
// dialing loop) that outlives the request that started it — killing the whole
// process over one such failure would drop every other in-flight call too.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});
// uncaughtException: a synchronous throw outside Express's request handling means
// the process is in an unknown state — log with full context, then exit so PM2
// restarts into a clean process rather than continuing to serve from a bad state.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err);
  process.exit(1);
});

// ─── SECURITY MIDDLEWARE ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://velryx.in', 'https://www.velryx.in',
    'http://localhost:5174', 'http://localhost:3000',
  ],
  credentials: true,
}));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// ─── BODY PARSING ─────────────────────────────────────────────────────────────
app.use('/api/webhook', express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/agents',      require('./routes/agents'));
app.use('/api/leads',       require('./routes/leads'));
app.use('/api/campaigns',   require('./routes/campaigns'));
app.use('/api/calls',       require('./routes/calls'));
app.use('/api/webhook',     require('./routes/webhook'));
app.use('/api/analytics',   require('./routes/analytics'));
app.use('/api/dnc',         require('./routes/dnc'));
app.use('/api/billing',     require('./routes/billing'));
app.use('/api/numbers',     require('./routes/numbers'));
app.use('/api/recordings',  require('./routes/recordings'));
app.use('/api/transcripts', require('./routes/transcripts'));
app.use('/api/events',      require('./routes/events'));
app.use('/api/settings',    require('./routes/settings'));
app.use('/api/webhooks',    require('./routes/webhooks').router);
app.use('/api/knowledge',   require('./routes/knowledge'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/messages',    require('./routes/messages'));

// ─── INTERNAL — Python agent fetches agent config ─────────────────────────────
app.get('/api/internal/agent-config', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db = require('./services/supabase');
    const { room } = req.query;

    // Try exact room name match first, then parse lead_id from room name pattern
    let cl = null;
    const { data: byRoom } = await db.from('call_logs').select('*, agents(*), leads(name, city, budget, phone, property_type, language, agent_id)').eq('livekit_room_name', room).single();
    cl = byRoom;
    if (!cl) {
      const leadIdMatch = (room || '').match(/^call-([a-f0-9-]{36})-/);
      if (leadIdMatch) {
        const { data: fallback } = await db.from('call_logs')
          .select('*, agents(*), leads(name, city, budget, phone, property_type, language, agent_id)')
          .eq('lead_id', leadIdMatch[1]).order('started_at', { ascending: false }).limit(1).single();
        cl = fallback;
      }
    }

    // Lead metadata for variable substitution in prompts
    const lead = cl?.leads || {};
    const leadMeta = {
      name: lead.name || 'there',
      city: lead.city || 'Gurgaon',
      budget: lead.budget || '',
      phone: lead.phone || '',
      property_type: lead.property_type || '',
      language: lead.language || '',
    };

    // Platform-level keys are always injected — never stored per-user
    // livekit_url column in user_credentials holds the per-user SIP trunk ID (ST_xxx)
    const platformKeys = {
      sarvam_api_key: process.env.SARVAM_API_KEY,
      openai_api_key: process.env.OPENAI_API_KEY,
      groq_api_key:   process.env.GROQ_API_KEY,
      livekit_url:    process.env.LIVEKIT_URL,
      livekit_api_key: process.env.LIVEKIT_API_KEY,
      livekit_api_secret: process.env.LIVEKIT_API_SECRET,
    };

    // Attach per-user SIP trunk ID so the call uses their Plivo account
    if (cl?.user_id) {
      const { data: userCreds } = await db.from('user_credentials')
        .select('livekit_url').eq('user_id', cl.user_id).single();
      const prov = require('./services/livekit').parseProvision(userCreds?.livekit_url);
      if (prov?.lk_trunk) {
        platformKeys.livekit_sip_trunk_id = prov.lk_trunk;
      }
    }

    // The agent is told WHETHER it may transfer, never the number — that is
    // resolved server-side in /api/internal/transfer-call so it can be changed
    // without redeploying agents and never lands in agent logs.
    // prompt_spec is dropped too: system_prompt already holds its compiled form,
    // and shipping both invites the agent to read the wrong one.
    const stripSecrets = (a) => { const { transfer_phone_number, prompt_spec, ...rest } = a; return rest; };

    if (cl?.agents) return res.json({ ...stripSecrets(cl.agents), ...platformKeys, lead_metadata: leadMeta });

    // FALLBACK 1: call_log has no agent linked, but the lead is pinned to one.
    // Reachable for call_logs written before per-lead agents existed, or by a
    // caller that inserted a call_log directly. Both dial paths set agent_id now.
    if (!cl?.agents && cl?.leads?.agent_id) {
      const { data: leadAgent } = await db.from('agents')
        .select('*').eq('id', cl.leads.agent_id).maybeSingle();
      if (leadAgent) {
        console.log(`[agent-config] room=${room} using lead's pinned agent: ${leadAgent.name}`);
        return res.json({ ...stripSecrets(leadAgent), ...platformKeys, lead_metadata: leadMeta });
      }
    }

    // FALLBACK 2: nothing pinned anywhere → the user's most recently updated agent
    if (cl?.user_id) {
      const { data: userAgent } = await db.from('agents')
        .select('*').eq('user_id', cl.user_id)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (userAgent) {
        console.log(`[agent-config] room=${room} fallback to user's agent: ${userAgent.name} (${userAgent.llm_model})`);
        return res.json({ ...stripSecrets(userAgent), ...platformKeys, lead_metadata: leadMeta });
      }
    }

    // Return default config
    res.json({
      system_prompt: 'You are Riya, a professional property consultant at Real Concept, Gurgaon. Always start with "This call may be recorded for quality purposes." You are speaking with {{name}}. Understand their property needs, pitch premium projects on Golf Course Road and Dwarka Expressway, and try to book a site visit. Collect: intent (buy/sell/rent), BHK preference, budget, preferred location, timeline. Keep responses short — 1-2 sentences max. Be warm, confident, and consultative.',
      first_message: "Namaste {{name}} ji! Main Riya bol rahi hoon Real Concept se — Gurgaon ki premium properties mein specialist. Kya aap abhi baat kar sakte hain?",
      language: 'hi-IN', stt_model: 'saarika:v2.5', tts_model: 'bulbul:v3', tts_speaker: 'priya',
      llm_model: 'sarvam-30b', llm_temperature: 0.7, max_duration_minutes: 5,
      lead_metadata: leadMeta,
      analysis_schema: { interested: 'boolean', outcome: 'string', intent: 'string', budget_range: 'string', bhk_preference: 'string', location_preference: 'string', timeline: 'string', callback_time: 'string' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── INTERNAL — agent triggers egress when SIP participant joins ──────────────
// Called by agent.py via POST /api/internal/start-recording when it detects
// the SIP/human participant connected to the room.  At that point both the agent
// and the human are in the room → egress will capture both channels correctly.
app.post('/api/internal/start-recording', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { room_name } = req.body;
  if (!room_name) return res.status(400).json({ error: 'room_name required' });

  try {
    const db = require('./services/supabase');
    const { startRoomRecording } = require('./services/livekit');

    // Look up call_log — only start egress if not already recording
    const { data: cl } = await db
      .from('call_logs')
      .select('id, livekit_egress_id, user_id')
      .eq('livekit_room_name', room_name)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!cl) {
      console.log(`[Recording/internal] No call_log found for room ${room_name}`);
      return res.status(404).json({ error: 'Call log not found' });
    }

    if (cl.livekit_egress_id) {
      // Already recording (immediate start beat us here) — no-op
      console.log(`[Recording/internal] Room ${room_name} already recording (${cl.livekit_egress_id})`);
      return res.json({ success: true, alreadyRecording: true, egressId: cl.livekit_egress_id });
    }

    // Stop any orphan egress started at call-init time (before SIP participant joined)
    // — We'll let the DB-guided egress above handle dedup; if none exists, start fresh.
    const egress = await startRoomRecording(room_name, cl.id);
    if (egress?.egressId) {
      await db.from('call_logs')
        .update({ livekit_egress_id: egress.egressId })
        .eq('id', cl.id);
      console.log(`[Recording/internal] Egress ${egress.egressId} started for ${room_name} (agent-triggered)`);
      return res.json({ success: true, egressId: egress.egressId });
    }
    return res.status(500).json({ error: 'Failed to start egress' });
  } catch (err) {
    console.error('[Recording/internal] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── INTERNAL — warm transfer to a human ─────────────────────────────────────
// agent.py calls this once the caller has accepted the offer to be transferred.
// The transfer target is resolved here rather than in the agent so the number is
// never shipped into the call config, and so a per-agent number can override the
// platform default without redeploying the agent.
app.post('/api/internal/transfer-call', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { room_name, participant_identity, reason } = req.body || {};
  if (!room_name || !participant_identity) {
    return res.status(400).json({ error: 'room_name and participant_identity required' });
  }

  try {
    const db = require('./services/supabase');
    const { transferSipCall } = require('./services/livekit');

    const { data: cl } = await db.from('call_logs')
      .select('id, user_id, agent_id, agents(transfer_enabled, transfer_phone_number, name)')
      .eq('livekit_room_name', room_name)
      .order('started_at', { ascending: false }).limit(1).maybeSingle();

    if (!cl) return res.status(404).json({ error: 'Call log not found' });

    const agent = cl.agents || {};
    const target = agent.transfer_phone_number || process.env.TRANSFER_DEFAULT_NUMBER || null;

    // Refuse rather than dial a stale number: transfer_enabled is the operator's
    // explicit consent for this agent to hand calls to a person.
    if (!agent.transfer_enabled) {
      await db.from('call_logs').update({
        transfer_status: 'failed', transfer_at: new Date().toISOString(),
        transfer_detail: 'transfer not enabled for this agent',
      }).eq('id', cl.id);
      return res.status(400).json({ error: 'Transfer is not enabled for this agent' });
    }
    if (!target) {
      await db.from('call_logs').update({
        transfer_status: 'failed', transfer_at: new Date().toISOString(),
        transfer_detail: 'no transfer number configured (agent or TRANSFER_DEFAULT_NUMBER)',
      }).eq('id', cl.id);
      return res.status(400).json({ error: 'No transfer number configured' });
    }

    const result = await transferSipCall(room_name, participant_identity, target);

    await db.from('call_logs').update({
      transfer_status: result.ok ? 'completed' : 'failed',
      transfer_to: target,
      transfer_at: new Date().toISOString(),
      transfer_detail: result.ok ? (reason || 'caller accepted transfer') : result.error,
      ...(result.ok ? { end_reason: 'transferred', outcome: 'transferred' } : {}),
    }).eq('id', cl.id);

    if (result.ok) {
      await createEventSafe(db, cl.user_id, 'call.transferred',
        `Call transferred to ${target}`, reason || '', { call_id: cl.id, transfer_to: target });
    }

    return res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    console.error('[transfer-call] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Events are a nice-to-have on the transfer path — never let a failed notification
// turn a successful transfer into a 500.
async function createEventSafe(db, userId, type, title, body, data) {
  try {
    const { createEvent } = require('./services/notifications');
    await createEvent(userId, type, title, body, data);
  } catch (e) {
    console.warn('[transfer-call] event write failed:', e.message);
  }
}

// ─── INTERNAL — agent.py reports a provider failure seen during a live call ───
// The periodic probe in services/keyHealth.js can be green while real traffic
// fails (Groq's /models stays 200 after the chat quota is spent, and rate limits
// only appear under concurrency). This is the path that catches that.
app.post('/api/internal/key-failure', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { provider, detail, http_status } = req.body || {};
  if (!provider) return res.status(400).json({ error: 'provider required' });
  try {
    const keyHealth = require('./services/keyHealth');
    const result = await keyHealth.recordLiveFailure(provider, detail, http_status || null);
    // Unknown providers are ignored rather than rejected: the agent should never
    // fail a call because it reported a provider this backend does not track.
    return res.json({ success: true, recorded: !!result });
  } catch (err) {
    console.error('[key-failure] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── WEBSOCKET — real-time dashboard updates ───────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws/dashboard' });
const clients = new Map(); // userId → Set<ws>

wss.on('connection', (ws, req) => {
  // Parse token from query string: /ws/dashboard?token=xxx
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  let userId = null;

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_in_production');
      userId = payload.id;
      if (!clients.has(userId)) clients.set(userId, new Set());
      clients.get(userId).add(ws);
    } catch {}
  }

  ws.on('close', () => {
    if (userId && clients.has(userId)) clients.get(userId).delete(ws);
  });

  ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
});

// Broadcast helper — call this from routes/services when state changes
function broadcast(userId, event) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const msg = JSON.stringify(event);
  for (const ws of userClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}
app.locals.broadcast = broadcast;

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ─── SERVE REACT FRONTEND ─────────────────────────────────────────────────────
const path = require('path');
const frontendDist = path.join(__dirname, '../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Webhook URL: ${process.env.WEBHOOK_BASE_URL || 'http://localhost:' + PORT}/api/webhook/plivo`);
  console.log(`🔗 Frontend:   ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);

  const campaigns = require('./routes/campaigns');
  require('./services/queue').startWorker(campaigns.processDialJob);
  campaigns.resumeInterruptedCampaigns()
    .catch(err => console.error('[Campaign] Resume-on-startup failed:', err.message));

  // Periodic health check of the Sarvam / Groq / Plivo keys for the admin panel.
  require('./services/keyHealth').startScheduler();
});
