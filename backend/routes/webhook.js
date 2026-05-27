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

// POST /api/webhook/agent — Python agent sends transcript + analysis here
router.post('/agent', async (req, res) => {
  // Internal secret check
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET && process.env.INTERNAL_SECRET !== 'dev') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { room_name, duration_seconds, transcript, full_text, config, analysis } = req.body;
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
    }).eq('id', cl.id);
    if (updateErr) console.error('[Webhook/Agent] call_logs update error:', updateErr.message);

    // Save transcript — always save if there are turns (even just the greeting)
    const turns = Array.isArray(transcript) ? transcript : [];
    const textForSave = full_text || turns.map(t => `${(t.role || '').toUpperCase()}: ${t.text || ''}`).join('\n');
    if (turns.length > 0) {
      const { error: txErr } = await supabase.from('transcripts').upsert({
        id: uuidv4(), call_id: cl.id, turns,
        full_text: textForSave,
        word_count: textForSave.split(/\s+/).filter(Boolean).length,
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
      const callData = { call_id: cl.id, lead_name: lead?.name, lead_phone: lead?.phone || cl.to_number, outcome: analysis?.outcome || 'completed', duration_seconds: durationSec };
      await fireWebhooks(cl.user_id, 'call.completed', callData);
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
    const { order_id, payment_id, status, amount, user_id } = req.body;
    if (status !== 'success' && status !== 'paid') return res.sendStatus(200);

    // Verify signature if configured
    const webhookSecret = process.env.PAYGIC_WEBHOOK_SECRET;
    if (webhookSecret) {
      const sig = req.headers['x-paygic-signature'];
      const expected = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body)).digest('hex');
      if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });
    }

    const amountInr = parseFloat(amount) / 100; // convert paise to INR
    await addCredits(user_id, amountInr, order_id, payment_id);
    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook/Paygic] Error:', err.message);
    res.sendStatus(500);
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
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
