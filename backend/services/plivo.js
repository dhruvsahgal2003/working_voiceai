const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const livekit = require('./livekit');
const db = require('./supabase');

const isLocal = !process.env.PLIVO_AUTH_ID ||
  process.env.PLIVO_AUTH_ID.includes('PLACEHOLDER');

// Resolve the SIP trunk + caller-ID number for a given user. Prefers the user's
// own auto-provisioned trunk (plug-and-play), falls back to the platform .env trunk.
async function resolveUserTrunk(userId) {
  let trunkId   = process.env.LIVEKIT_SIP_TRUNK_ID || null;
  let fromNumber = process.env.PLIVO_FROM_NUMBER || null;
  if (userId) {
    try {
      const { data: uc } = await db.from('user_credentials')
        .select('livekit_url').eq('user_id', userId).single();
      const prov = livekit.parseProvision(uc?.livekit_url);
      if (prov?.lk_trunk) {
        trunkId = prov.lk_trunk;
        if (prov.from) fromNumber = prov.from;
      }
    } catch { /* fall back to platform defaults */ }
  }
  return { trunkId, fromNumber };
}

// ─── TRIGGER CALL ─────────────────────────────────────────────────────────────
async function triggerCall({ phone, name, city, propertyType, budget, language, leadId, userId }) {
  if (process.env.LOAD_TEST_MODE === 'true') {
    // Explicit load-testing flag — deliberately separate from `isLocal` above, which
    // is keyed off real Plivo credentials being absent. Here real credentials ARE
    // configured (this is prod); this flag exists purely so scripts/load-test.js can
    // drive the full campaign-queue path without ever touching real Plivo/LiveKit or
    // placing a real call, no matter what's in .env.
    const fakeUuid = `LOADTEST-${uuidv4().slice(0, 8)}`;
    return { success: true, callUuid: fakeUuid, roomName: `loadtest-${fakeUuid}`, fromNumber: 'LOADTEST' };
  }

  if (isLocal) {
    // Simulate call in local mode — returns a fake UUID instantly
    const fakeUuid = `LOCAL-${uuidv4().slice(0, 8)}`;
    console.log(`[Plivo LOCAL] 📞 Simulated call to ${phone} (${name}) → UUID: ${fakeUuid}`);

    // Auto-fire a fake webhook after 4 seconds to simulate call completion
    setTimeout(async () => {
      try {
        const outcomes = ['interested', 'not_interested', 'callback', 'no_answer', 'busy'];
        const intents  = ['buy', 'sell', 'rent'];
        const outcome  = outcomes[Math.floor(Math.random() * outcomes.length)];
        const intent   = intents[Math.floor(Math.random() * intents.length)];
        const isHot    = outcome === 'interested';

        const webhookUrl = process.env.WEBHOOK_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
        await axios.post(`${webhookUrl}/api/webhook/plivo`, {
          CallUUID:       fakeUuid,
          To:             phone,
          From:           process.env.PLIVO_FROM_NUMBER,
          Duration:       String(60 + Math.floor(Math.random() * 180)),
          CallStatus:     outcome === 'no_answer' ? 'no-answer' : 'completed',
          RecordingUrl:   null,
          lead_id:        leadId,
          outcome,
          interested:     String(isHot),
          hot_lead:       String(isHot),
          intent,
          bhk_preference: ['2BHK','3BHK','1BHK'][Math.floor(Math.random()*3)],
          budget_range:   budget || '1 crore',
          location_preference: city || 'Mumbai',
          timeline:       ['immediately','3 months','6 months'][Math.floor(Math.random()*3)],
          loan_required:  String(Math.random() > 0.5),
          callback_time:  outcome === 'callback' ? 'Tomorrow 11am' : '',
          TranscriptText: `Agent: Namaste! Am I speaking with ${name || 'you'}?\nLead: Yes speaking.\nAgent: This call may be recorded for quality. I'm Priya from PropConnect. Do you have 2 minutes?\nLead: Yes.\nAgent: Are you looking to ${intent} a property in ${city || 'your city'}?\nLead: Yes, I am.\nAgent: What's your budget range?\nLead: Around ${budget || '1 crore'}.\nAgent: When are you looking to finalize?\nLead: In the next 3 months.\nAgent: Perfect! Thank you so much, ${(name||'').split(' ')[0] || 'Sir'}!`,
        });
        console.log(`[Plivo LOCAL] ✅ Webhook auto-fired for ${phone} → outcome: ${outcome}`);
      } catch (e) {
        console.error('[Plivo LOCAL] Webhook fire failed:', e.message);
      }
    }, 4000);

    return { success: true, callUuid: fakeUuid };
  }

  // ─── LIVEKIT SIP (via Plivo Zentrunk) ───────────────────────────────────────
  const { trunkId, fromNumber } = await resolveUserTrunk(userId);
  if (trunkId) {
    try {
      const roomName = `call-${leadId}-${Date.now()}`;
      const callUuid = `LK-${uuidv4().slice(0, 12)}`;
      const metadata = { leadId, name, city, propertyType, budget, language, callUuid };

      // Create room first, then dispatch agent + dial in parallel.
      // Pass the user's own trunk so the call routes through THEIR Plivo account.
      await livekit.createRoom(roomName);

      await Promise.all([
        livekit.dispatchAgent(roomName, metadata),
        livekit.dialOutbound(roomName, phone, name || phone, metadata, { livekit_sip_trunk_id: trunkId }),
      ]);

      console.log(`[LiveKit SIP] Call initiated → room: ${roomName}, to: ${phone}, trunk: ${trunkId}`);
      return { success: true, callUuid, roomName, fromNumber };
    } catch (err) {
      console.error('[LiveKit SIP] triggerCall error:', err.message);
      throw new Error(err.message);
    }
  }

  // ─── LEGACY PLIVO REST API ───────────────────────────────────────────────────
  try {
    const response = await axios.post(
      `https://api.plivo.com/v1/Account/${process.env.PLIVO_AUTH_ID}/Call/`,
      {
        from: process.env.PLIVO_FROM_NUMBER,
        to:   phone,
        answer_url:    `${process.env.WEBHOOK_BASE_URL}/api/webhook/answer?lead_id=${leadId}&name=${encodeURIComponent(name)}&city=${encodeURIComponent(city||'')}&property_type=${encodeURIComponent(propertyType||'')}&budget=${encodeURIComponent(budget||'')}`,
        answer_method: 'GET',
        hangup_url:    `${process.env.WEBHOOK_BASE_URL}/api/webhook/hangup`,
        hangup_method: 'POST',
        machine_detection: 'true',
        machine_detection_url: `${process.env.WEBHOOK_BASE_URL}/api/webhook/machine`,
        machine_detection_method: 'POST',
        time_limit:  300,
        ring_timeout: 30,
      },
      { auth: { username: process.env.PLIVO_AUTH_ID, password: process.env.PLIVO_AUTH_TOKEN } }
    );
    return { success: true, callUuid: response.data.request_uuid || response.data.call_uuid, fromNumber };
  } catch (err) {
    console.error('[Plivo] triggerCall error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error || err.message);
  }
}

async function getCallDetails(callUuid) { return null; }
async function getRecordings(callUuid)  { return null; }

async function sendWhatsAppAlert({ to, leadName, phone, outcome, budget, intent, city, authId, authToken }) {
  if (!to) return;
  if (isLocal && !authId) {
    console.log(`[WhatsApp LOCAL] Hot lead alert → ${leadName} (${phone}) | ${outcome} | Budget: ${budget}`);
    return;
  }
  const aid = authId || process.env.PLIVO_AUTH_ID;
  const tok = authToken || process.env.PLIVO_AUTH_TOKEN;
  if (!aid || !tok) return;
  try {
    const text = `Hot Lead Alert!\nName: ${leadName || 'Unknown'}\nPhone: ${phone}\nIntent: ${intent || '-'}\nBudget: ${budget || '-'}\nCity: ${city || '-'}\nOutcome: ${outcome}`;
    await axios.post(`https://api.plivo.com/v1/Account/${aid}/Message/`, {
      src: 'PropConnect',
      dst: to.replace(/[^0-9+]/g, ''),
      text,
      type: 'whatsapp',
      template: null,
    }, { auth: { username: aid, password: tok }, timeout: 8000 });
    console.log(`[WhatsApp] Alert sent to ${to}`);
  } catch (err) {
    console.error('[WhatsApp] Send failed:', err.response?.data || err.message);
  }
}

function buildAnswerXML({ leadId, name, city, propertyType, budget }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Agent agentId="${process.env.PLIVO_AI_AGENT_ID}">
    <FirstMessage>Namaste! Am I speaking with ${name}? This is Priya from PropConnect. This call may be recorded. I have property options in ${city}. Do you have 2 minutes?</FirstMessage>
    <CustomData><lead_id>${leadId}</lead_id></CustomData>
    <WebhookUrl>${process.env.WEBHOOK_BASE_URL}/api/webhook/plivo</WebhookUrl>
  </Agent>
</Response>`;
}

module.exports = { triggerCall, getCallDetails, getRecordings, sendWhatsAppAlert, buildAnswerXML };
