// Webhook routes — Plivo, LiveKit, agent call results, Paygic payment confirmations
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { buildAnswerXML, sendWhatsAppAlert } = require('../services/plivo');
const { deductCredits } = require('../services/billing');
const { addCredits } = require('../services/billing');
const { notifyHotLead, createEvent } = require('../services/notifications');
const { fireWebhooks } = require('../services/webhookFire');
const { stopRoomRecording } = require('../services/livekit');
const { upsertContact, getOrCreateConversation, bumpConversation, insertMessage, updateMessageStatus, mirrorOutboundSend, linkInboundToContext } = require('../services/whatsapp');

// GET /api/webhook/plivo/answer — Plivo calls this when lead picks up
router.get('/plivo/answer', async (req, res) => {
  const { lead_id, name, city, property_type, budget, room } = req.query;
  const xml = buildAnswerXML({
    leadId: lead_id, name: decodeURIComponent(name || ''),
    city: decodeURIComponent(city || ''), propertyType: decodeURIComponent(property_type || ''),
    budget: decodeURIComponent(budget || ''), room,
  });
  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

// Legacy answer route (backward compat)
router.get('/answer', async (req, res) => {
  const { lead_id, name, city, property_type, budget } = req.query;
  const xml = buildAnswerXML({ leadId: lead_id, name: decodeURIComponent(name || ''), city: decodeURIComponent(city || ''), propertyType: decodeURIComponent(property_type || ''), budget: decodeURIComponent(budget || '') });
  res.set('Content-Type', 'text/xml');
  res.send(xml);
});

// POST /api/webhook/plivo/machine — machine detection
router.post('/plivo/machine', async (req, res) => {
  const { CallUUID, MachineDetection } = req.body;
  if (MachineDetection === 'machine_start' || MachineDetection === 'machine_end_beep') {
    await supabase.from('call_logs').update({ call_status: 'voicemail', outcome: 'voicemail' }).eq('plivo_call_uuid', CallUUID);
    const { data: cl } = await supabase.from('call_logs').select('lead_id').eq('plivo_call_uuid', CallUUID).single();
    if (cl) await supabase.from('leads').update({ status: 'retry', updated_at: new Date().toISOString() }).eq('id', cl.lead_id);
  }
  res.set('Content-Type', 'text/xml');
  res.send('<Response><Hangup/></Response>');
});

// Legacy machine route
router.post('/machine', async (req, res) => {
  const { CallUUID, MachineDetection } = req.body;
  if (MachineDetection === 'machine_start' || MachineDetection === 'machine_end_beep') {
    await supabase.from('call_logs').update({ call_status: 'voicemail', outcome: 'voicemail' }).eq('plivo_call_uuid', CallUUID);
    const { data: cl } = await supabase.from('call_logs').select('lead_id').eq('plivo_call_uuid', CallUUID).single();
    if (cl) await supabase.from('leads').update({ status: 'retry' }).eq('id', cl.lead_id);
  }
  res.set('Content-Type', 'text/xml');
  res.send('<Response><Hangup/></Response>');
});

// POST /api/webhook/plivo/hangup
router.post('/plivo/hangup', (req, res) => res.sendStatus(200));
router.post('/hangup', (req, res) => res.sendStatus(200));

// POST /api/webhook/plivo/status — real-time status updates
router.post('/plivo/status', async (req, res) => {
  const { CallUUID, CallStatus } = req.body;
  if (CallUUID && CallStatus) {
    await supabase.from('call_logs').update({ call_status: CallStatus }).eq('plivo_call_uuid', CallUUID);
    if (CallStatus === 'in-progress') {
      const { data: cl } = await supabase.from('call_logs').select('user_id,lead_id,id').eq('plivo_call_uuid', CallUUID).single();
      if (cl?.user_id) {
        const { data: lead } = await supabase.from('leads').select('name,phone').eq('id', cl.lead_id).single();
        await fireWebhooks(cl.user_id, 'call.started', { call_id: cl.id, lead_name: lead?.name, lead_phone: lead?.phone });
      }
    }
  }
  res.sendStatus(200);
});

// POST /api/webhook/plivo — main post-call webhook (legacy mode without Python agent)
router.post('/plivo', async (req, res) => {
  try {
    const { CallUUID, To, From, Duration, CallStatus, RecordingUrl,
      interested, outcome, intent, bhk_preference, budget_range, location_preference,
      timeline, loan_required, callback_time, hot_lead, TranscriptText, transcript, lead_id } = req.body;

    console.log('[Webhook/Plivo]', { CallUUID, To, Duration, CallStatus, outcome });

    let leadId = lead_id;
    if (!leadId) {
      const { data: l } = await supabase.from('leads').select('id').eq('phone', To).order('created_at', { ascending: false }).limit(1).single();
      leadId = l?.id;
    }
    if (!leadId) return res.sendStatus(200);

    const resolvedOutcome = outcome || mapCallStatus(CallStatus);
    const isHot = interested === true || interested === 'true' || hot_lead === 'true';
    const durationSec = parseInt(Duration) || 0;

    const { data: cl } = await supabase.from('call_logs').select('id, user_id, campaign_id').eq('plivo_call_uuid', CallUUID).single();
    if (cl) {
      await supabase.from('call_logs').update({
        duration_seconds: durationSec, call_status: CallStatus, outcome: resolvedOutcome,
        recording_url: RecordingUrl || null, interested: isHot,
        intent: intent || null, bhk_preference: bhk_preference || null,
        budget_range: budget_range || null, location_preference: location_preference || null,
        timeline: timeline || null, loan_required: loan_required === 'true' || loan_required === true || null,
        callback_time: callback_time || null, hot_lead: isHot, ended_at: new Date().toISOString(),
      }).eq('plivo_call_uuid', CallUUID);

      // Deduct credits
      if (cl.user_id && durationSec > 0) {
        await deductCredits(cl.user_id, cl.id, durationSec);
      }
    }

    await supabase.from('leads').update({
      status: resolveLeadStatus(resolvedOutcome, CallStatus), last_called: new Date().toISOString(),
      callback_time: callback_time || null,
    }).eq('id', leadId);

    if (resolvedOutcome === 'dnc_requested') {
      const { data: lead } = await supabase.from('leads').select('phone, user_id').eq('id', leadId).single();
      if (lead) {
        await supabase.from('dnc_list').upsert({ id: uuidv4(), phone: lead.phone, user_id: lead.user_id, reason: 'DND requested on call' }, { onConflict: 'phone,user_id' });
        await supabase.from('leads').update({ status: 'dnc' }).eq('id', leadId);
      }
    }

    if (cl?.user_id) {
      const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
      const callData = { call_id: cl.id, lead_name: lead?.name, lead_phone: lead?.phone, outcome: resolvedOutcome, duration_seconds: durationSec, recording_url: RecordingUrl || null };
      await fireWebhooks(cl.user_id, 'call.completed', callData);
      await maybeMirrorWhatsApp(cl.user_id, lead, cl, resolvedOutcome, durationSec);
      if (RecordingUrl) await fireWebhooks(cl.user_id, 'recording.ready', { call_id: cl.id, recording_url: RecordingUrl });
      if (isHot) {
        await notifyHotLead(cl.user_id, lead, { id: cl.id, intent, budget_range, outcome: resolvedOutcome });
        await fireWebhooks(cl.user_id, 'call.hot_lead', { ...callData, intent, budget_range });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/Plivo] Error:', err.message);
    res.sendStatus(500);
  }
});

// POST /api/webhook/transcript-turn — agent pushes each turn in real-time for live transcription.
// Acks immediately (fire-and-forget from agent) then appends the turn to transcripts.turns.
router.post('/transcript-turn', async (req, res) => {
  res.sendStatus(200); // never block the agent

  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') return;

  const { room_name, turn } = req.body || {};
  if (!turn || !room_name || !turn.text) return;

  try {
    const { data: cl } = await supabase.from('call_logs')
      .select('id').eq('livekit_room_name', room_name).maybeSingle();
    if (!cl) return;

    const turnText = `${(turn.role || '').toUpperCase()}: ${turn.text || ''}`;
    // SQL JSONB append: insert if first turn, otherwise append to existing array
    await supabase.query(
      `INSERT INTO transcripts (call_id, turns, full_text)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (call_id) DO UPDATE SET
         turns     = transcripts.turns || $2::jsonb,
         full_text = CASE
           WHEN transcripts.full_text IS NULL OR transcripts.full_text = ''
           THEN $3
           ELSE transcripts.full_text || E'\\n' || $3
         END,
         word_count = array_length(regexp_split_to_array(
           COALESCE(transcripts.full_text,'') || ' ' || $3, '\\s+'), 1)`,
      [cl.id, JSON.stringify([turn]), turnText]
    );
  } catch (e) {
    console.warn('[LiveTranscript] append error:', e.message);
  }
});

// POST /api/webhook/agent — Python agent sends transcript + analysis here
router.post('/agent', async (req, res) => {
  // Internal secret check
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { room_name, duration_seconds, transcript, full_text, config, analysis,
            end_reason, transfer_status } = req.body;
    console.log('[Webhook/Agent] Call ended:', { room_name, duration_seconds, turns: transcript?.length ?? 0, outcome: analysis?.outcome });

    // Find call log by room name (1) exact match, (2) parse lead_id from room pattern: call-{lead_id}-{ts}
    let { data: cl, error: e1 } = await supabase.from('call_logs').select('*').eq('livekit_room_name', room_name).maybeSingle();
    if (e1) console.log('[Webhook/Agent] room lookup error:', e1.message);

    if (!cl) {
      const leadIdMatch = (room_name || '').match(/^call-([a-f0-9-]{36})-/);
      console.log('[Webhook/Agent] fallback lead_id parse:', leadIdMatch?.[1] || 'NO_MATCH');
      if (leadIdMatch) {
        const { data: rows, error: e2 } = await supabase.from('call_logs').select('*')
          .eq('lead_id', leadIdMatch[1]).order('started_at', { ascending: false }).limit(1);
        if (e2) console.log('[Webhook/Agent] lead_id lookup error:', e2.message);
        cl = rows?.[0] || null;
        console.log('[Webhook/Agent] fallback found:', cl ? `call_log ${cl.id}` : 'NONE');
      }
    }
    if (!cl) { console.log('[Webhook/Agent] No call log found for room:', room_name); return res.sendStatus(200); }

    const durationSec = parseInt(duration_seconds) || 0;
    const isHot = analysis?.interested === true || analysis?.outcome === 'interested';

    // Stop egress recording and get URL (fire-and-forget; don't block response)
    let recordingUrl = cl.recording_url || null;
    if (cl.livekit_egress_id && !recordingUrl) {
      stopRoomRecording(cl.livekit_egress_id, cl.id).then(url => {
        if (url) {
          supabase.from('call_logs').update({ recording_url: url }).eq('id', cl.id)
            .then(() => console.log(`[Recording] URL saved for call ${cl.id}: ${url}`));
        }
      }).catch(err => console.error('[Recording] stop error:', err.message));
    }

    const { error: updateErr } = await supabase.from('call_logs').update({
      duration_seconds: durationSec, call_status: 'completed',
      outcome: analysis?.outcome || 'completed', interested: analysis?.interested || false,
      hot_lead: isHot, intent: analysis?.intent, budget_range: analysis?.budget_range,
      bhk_preference: analysis?.bhk_preference, location_preference: analysis?.location_preference,
      timeline: analysis?.timeline, callback_time: analysis?.callback_time, analysis: analysis || {},
      ended_at: new Date().toISOString(),
      // Why the call ended, straight from the agent. Surfaced in the History tab
      // so "agent hung up because they weren't interested" is distinguishable
      // from "the line dropped".
      end_reason: end_reason || cl.end_reason || 'completed',
      // Only record an offer/decline here. A COMPLETED transfer is written by
      // /api/internal/transfer-call at the moment it happens — overwriting it
      // from this late-arriving payload would clobber the authoritative result.
      ...(transfer_status && !cl.transfer_status ? { transfer_status } : {}),
    }).eq('id', cl.id);
    if (updateErr) console.error('[Webhook/Agent] call_logs update error:', updateErr.message);

    // Save transcript — always save if there are turns (even just the greeting)
    const turns = Array.isArray(transcript) ? transcript : [];
    const textForSave = full_text || turns.map(t => `${(t.role || '').toUpperCase()}: ${t.text || ''}`).join('\n');
    if (turns.length > 0) {
      const { error: txErr } = await supabase.from('transcripts').upsert({
        id: uuidv4(), call_id: cl.id, turns,
        full_text: textForSave,
      }, { onConflict: 'call_id' });
      if (txErr) console.error('[Webhook/Agent] transcript upsert error:', txErr.message);
      else console.log(`[Webhook/Agent] Transcript saved: ${turns.length} turns, ${textForSave.split(/\s+/).filter(Boolean).length} words`);
    } else {
      console.log('[Webhook/Agent] No transcript turns to save');
    }

    // Update lead status
    const { error: leadErr } = await supabase.from('leads').update({
      status: isHot ? 'hot_lead' : resolveLeadStatus(analysis?.outcome, 'completed'),
      last_called: new Date().toISOString(),
      callback_time: analysis?.callback_time || null,
    }).eq('id', cl.lead_id);
    if (leadErr) console.error('[Webhook/Agent] leads update error:', leadErr.message);

    // Deduct credits
    if (cl.user_id && durationSec > 0) {
      await deductCredits(cl.user_id, cl.id, durationSec);
    }

    // Fire event subscriptions
    if (cl.user_id) {
      const { data: lead } = await supabase.from('leads').select('*').eq('id', cl.lead_id).single();
      // end_reason/transfer_status are what a downstream automation actually
      // branches on — "the agent closed by promising WhatsApp details" is a
      // different trigger from "the line dropped", and both arrive as outcome
      // 'completed'.
      const callData = {
        call_id: cl.id, lead_name: lead?.name, lead_phone: lead?.phone || cl.to_number,
        outcome: analysis?.outcome || 'completed', duration_seconds: durationSec,
        end_reason: end_reason || cl.end_reason || 'completed',
        transfer_status: transfer_status || cl.transfer_status || null,
      };
      await fireWebhooks(cl.user_id, 'call.completed', callData);
      await maybeMirrorWhatsApp(cl.user_id, lead, cl, analysis?.outcome || 'completed', durationSec);
      await fireWebhooks(cl.user_id, 'analysis.done', { ...callData, analysis: analysis || {} });
      if (isHot) {
        await notifyHotLead(cl.user_id, lead || { phone: cl.to_number }, cl);
        await fireWebhooks(cl.user_id, 'call.hot_lead', { ...callData, intent: analysis?.intent, budget_range: analysis?.budget_range });
      }
    }

    await createEvent(cl.user_id, 'call.ended', `Call ended`, `Duration: ${Math.round(durationSec / 60)}m, Outcome: ${analysis?.outcome || 'completed'}`, { call_id: cl.id });

    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/Agent] Error:', err.message, err.stack?.split('\n')[1]);
    res.sendStatus(500);
  }
});

// POST /api/webhook/agent-reset — called when session crashes before real conversation starts
// Resets the lead back to pending so the campaign retries it
router.post('/agent-reset', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { room_name, lead_id } = req.body;
    console.log('[Webhook/AgentReset] Resetting lead to pending:', { room_name, lead_id });
    if (lead_id) {
      await supabase.from('leads').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', lead_id);
    }
    // Also mark the call log as failed so we don't count it as completed
    await supabase.from('call_logs')
      .update({ call_status: 'failed', outcome: 'failed', ended_at: new Date().toISOString() })
      .eq('livekit_room_name', room_name);
    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/AgentReset] Error:', err.message);
    res.sendStatus(500);
  }
});

// POST /api/webhook/livekit — LiveKit room events
router.post('/livekit', async (req, res) => {
  console.log('[Webhook/LiveKit]', req.body?.event);
  res.sendStatus(200);
});

// POST /api/webhook/paygic — payment confirmation
router.post('/paygic', async (req, res) => {
  try {
    const body = req.body;
    // Paygic may send status as 'success', 'paid', or 'PAID'
    const status = (body.status || '').toLowerCase();
    if (status !== 'success' && status !== 'paid') {
      console.log('[Webhook/Paygic] Non-success status:', status, '— ignoring');
      return res.sendStatus(200);
    }

    // Verify signature if configured
    const webhookSecret = process.env.PAYGIC_WEBHOOK_SECRET;
    if (webhookSecret) {
      const sig = req.headers['x-paygic-signature'];
      const expected = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(body)).digest('hex');
      if (sig && sig !== expected) {
        console.warn('[Webhook/Paygic] Signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // user_id can come as body.user_id, body.udf1, or inside body.metadata.user_id
    const userId = body.user_id || body.udf1 || body.metadata?.user_id;
    const orderId = body.order_id;
    const paymentId = body.payment_id || body.transaction_id;
    const amountPaise = parseFloat(body.amount || 0);
    const amountInr = amountPaise >= 100 ? amountPaise / 100 : amountPaise; // handle both paise and INR

    if (!userId) {
      console.error('[Webhook/Paygic] Missing user_id in webhook body:', body);
      return res.sendStatus(400);
    }

    console.log(`[Webhook/Paygic] Payment confirmed: order=${orderId} user=${userId} amount=₹${amountInr}`);
    await addCredits(userId, amountInr, orderId, paymentId);
    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/Paygic] Error:', err.message);
    res.sendStatus(500);
  }
});

// ─── WHATSAPP CLOUD API — WEBHOOK VERIFICATION ────────────────────────────────
// Meta verifies a callback URL with a GET carrying hub.verify_token and expects
// hub.challenge echoed back as plain text. The n8n inbound flow proxies that GET
// here rather than checking the token itself, so WHATSAPP_VERIFY_TOKEN stays in
// the backend env and is never stored in a workflow definition.
//
// No internal secret required: knowing the verify token IS the authentication,
// and Meta will not send one.
router.get('/whatsapp/verify', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) {
    console.error('[WhatsApp/verify] WHATSAPP_VERIFY_TOKEN not configured');
    return res.status(500).send('verify token not configured');
  }
  if (mode === 'subscribe' && token === expected) {
    console.log('[WhatsApp/verify] challenge accepted');
    return res.type('text/plain').send(String(challenge ?? ''));
  }
  console.warn('[WhatsApp/verify] rejected — mode=%s token match=%s', mode, token === expected);
  return res.sendStatus(403);
});

// ─── WHATSAPP CLOUD API — INBOUND MESSAGES ─────────────────────────────────────
// Called by the n8n receive flow (not directly by Meta) with the raw Meta webhook
// body forwarded as-is. Single-client MVP: WHATSAPP_USER_ID identifies which
// Callora user these messages belong to (see .env) — becomes a real lookup (e.g.
// by value.metadata.phone_number_id) if/when more than one client's numbers are
// in play.
router.post('/whatsapp/inbound', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.sendStatus(200); // ack n8n immediately, process after

  const userId = process.env.WHATSAPP_USER_ID;
  if (!userId) { console.warn('[WhatsApp/inbound] WHATSAPP_USER_ID not configured'); return; }

  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const nameByWaId = Object.fromEntries((value.contacts || []).map(c => [c.wa_id, c.profile?.name]));
        for (const msg of value.messages || []) {
          const waId = msg.from;
          const contact = await upsertContact(userId, waId, nameByWaId[waId]);
          const conversation = await getOrCreateConversation(userId, contact.id);

          const body = msg.text?.body || msg.button?.text || `[${msg.type}]`;
          const waTimestamp = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString() : new Date().toISOString();

          // Inherit the call/lead/agent from the outbound message this replies to,
          // so a reply is traceable back to the call that prompted it.
          const replyCtx = await linkInboundToContext(conversation.id);

          const saved = await insertMessage({
            conversationId: conversation.id, userId, direction: 'inbound',
            wamid: msg.id, body, messageType: msg.type || 'text', status: 'received',
            rawPayload: msg, waTimestamp, ...replyCtx,
          });
          if (saved) await bumpConversation(conversation.id, { preview: body.slice(0, 120), at: waTimestamp, incrementUnread: true });
        }
      }
    }
  } catch (e) {
    console.error('[WhatsApp/inbound] error:', e.message);
  }
});

// ─── WHATSAPP CLOUD API — STATUS UPDATES (sent/delivered/read/failed) ─────────
router.post('/whatsapp/status', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.sendStatus(200);

  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        for (const status of change.value?.statuses || []) {
          await updateMessageStatus(status.id, status.status);
        }
      }
    }
  } catch (e) {
    console.error('[WhatsApp/status] error:', e.message);
  }
});

// ─── WHATSAPP CLOUD API — OUTBOUND SEND LOG ────────────────────────────────────
// Called by the (modified) real_concept_whatsapp_bot n8n flow right after a
// successful Graph API send, so outgoing messages show up in the same inbox.
// Responds with real success/failure (unlike the two above) since this is the
// definitive record that a send happened — worth n8n knowing if the log write itself failed.
router.post('/whatsapp/outbound-log', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = process.env.WHATSAPP_USER_ID;
  if (!userId) return res.status(500).json({ error: 'WHATSAPP_USER_ID not configured' });

  try {
    const { to, template_name, wamid, lead_name, text, call_id } = req.body || {};
    // wamid is optional: if the send succeeded but n8n couldn't parse an id back out
    // of the Graph response, we still want the recipient to appear in the inbox.
    // Without this the contact is invisible in Messages even though we messaged them.
    if (!to) return res.status(400).json({ error: 'to required' });

    // call_id is what makes "who did the agent message, and about which call?"
    // answerable. n8n has been sending it all along; this handler used to discard
    // it, which is why every thread was context-free.
    let ctx = {};
    if (call_id) {
      const { data: cl } = await supabase.from('call_logs')
        .select('id, lead_id, agent_id').eq('id', call_id).maybeSingle();
      if (cl) ctx = { callId: cl.id, leadId: cl.lead_id, agentId: cl.agent_id };
      else console.warn(`[WhatsApp/outbound-log] unknown call_id ${call_id} — logging without context`);
    }

    const contact = await upsertContact(userId, to, lead_name);
    const conversation = await getOrCreateConversation(userId, contact.id);
    // Keep the contact pointed at the lead we called, so the inbox row can show
    // which lead a thread belongs to.
    if (ctx.leadId && !contact.lead_id) {
      await supabase.from('whatsapp_contacts').update({ lead_id: ctx.leadId }).eq('id', contact.id);
    }
    // Prefer the real message text so the thread shows what the lead actually got;
    // fall back to the template name when only that is available.
    const body = (text || '').trim() || `Template: ${template_name || 'unknown'}`;
    const preview = body.slice(0, 120);
    const now = new Date().toISOString();

    const saved = await insertMessage({
      conversationId: conversation.id, userId, direction: 'outbound',
      wamid, body, messageType: text ? 'text' : 'template', status: 'sent',
      rawPayload: req.body, waTimestamp: now,
      templateName: template_name || null, ...ctx,
    });
    // saved === null means a duplicate wamid (Meta/n8n retry) — the conversation was
    // already bumped by the original delivery, so don't bump it again.
    if (saved) await bumpConversation(conversation.id, { preview, at: now, incrementUnread: false });

    res.json({ success: true, conversation_id: conversation.id, contact_id: contact.id });
  } catch (e) {
    console.error('[WhatsApp/outbound-log] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Outcomes where nobody actually picked up, so no follow-up template is sent and
// nothing should appear in the inbox.
const NO_CONTACT_OUTCOMES = new Set(['no_answer', 'voicemail', 'wrong_number', 'failed', 'busy', 'dnc_requested']);

// Mirror the post-call WhatsApp follow-up into the inbox. See mirrorOutboundSend
// in services/whatsapp.js for why this is written locally rather than logged by
// the sender. Best-effort: a failure here must never break call completion.
async function maybeMirrorWhatsApp(userId, lead, callLog, outcome, durationSec) {
  if (process.env.WHATSAPP_MIRROR_SENDS === 'false') return;
  if (!userId || !process.env.WHATSAPP_USER_ID) return;
  if (NO_CONTACT_OUTCOMES.has(outcome) || !durationSec) return;

  const phone = lead?.phone || callLog?.to_number;
  if (!phone) return;

  try {
    await mirrorOutboundSend(userId, {
      phone, name: lead?.name, callId: callLog?.id,
      leadId: lead?.id || callLog?.lead_id || null, agentId: callLog?.agent_id || null,
    });
  } catch (e) {
    console.error('[WhatsApp/mirror] error:', e.message);
  }
}

function mapCallStatus(s) {
  return { completed: 'completed', 'no-answer': 'no_answer', busy: 'busy', failed: 'failed', canceled: 'failed' }[s] || 'unknown';
}

function resolveLeadStatus(outcome, callStatus) {
  const map = {
    interested: 'hot_lead', not_interested: 'not_interested', callback: 'callback',
    no_answer: 'retry', busy: 'retry', wrong_number: 'invalid',
    voicemail: 'retry', dnc_requested: 'dnc', failed: 'retry', completed: 'called',
  };
  return map[outcome] || map[callStatus] || 'called';
}

module.exports = router;
