// Calls routes — trigger individual calls, get history, retry failed leads
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { triggerCall } = require('../services/plivo');
const { startRoomRecording, deleteRoom, stopRoomRecording } = require('../services/livekit');
const { requireAuth } = require('../middleware/auth');
const { checkCredits } = require('../middleware/checkCredits');
const { createEvent } = require('../services/notifications');
const { fireWebhooks } = require('../services/webhookFire');

router.use(requireAuth);

// POST /api/calls/trigger
router.post('/trigger', checkCredits, async (req, res) => {
  try {
    const { lead_id } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

    const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).eq('user_id', req.user.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { data: dncEntry } = await supabase.from('dnc_list').select('id').eq('phone', lead.phone).eq('user_id', req.user.id).single();
    if (dncEntry) return res.status(400).json({ error: 'Phone is on DNC list' });

    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const hour = istNow.getUTCHours();
    // Calling hours only enforced for automated campaigns, not manual single calls

    await supabase.from('leads').update({ status: 'calling', last_called: new Date().toISOString() }).eq('id', lead.id);

    const { callUuid, roomName } = await triggerCall({ phone: lead.phone, name: lead.name, city: lead.city, propertyType: lead.property_type, budget: lead.budget, language: lead.language, leadId: lead.id });

    // Link call to user's most-recently-updated active agent so agent-config endpoint can find it
    const { data: agentRow } = await supabase.from('agents')
      .select('id').eq('user_id', req.user.id)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();

    const callLogId = uuidv4();
    await supabase.from('call_logs').insert({
      id: callLogId, user_id: req.user.id, lead_id: lead.id, campaign_id: lead.campaign_id,
      agent_id: agentRow?.id || null,
      plivo_call_uuid: callUuid, livekit_room_name: roomName || null,
      from_number: process.env.PLIVO_FROM_NUMBER,
      to_number: lead.phone, call_status: 'initiated', started_at: new Date().toISOString(),
    });

    // Start LiveKit egress recording (fire-and-forget — don't block the response)
    if (roomName) {
      const agentData = agentRow?.id
        ? (await supabase.from('agents').select('recording_enabled').eq('id', agentRow.id).single())?.data
        : null;
      const recordingEnabled = agentData?.recording_enabled !== false; // default true
      if (recordingEnabled) {
        startRoomRecording(roomName, callLogId).then(egress => {
          if (egress?.egressId) {
            supabase.from('call_logs')
              .update({ livekit_egress_id: egress.egressId })
              .eq('id', callLogId)
              .then(() => console.log(`[Recording] Egress ${egress.egressId} linked to call ${callLogId}`));
          }
        }).catch(err => console.error('[Recording] start error:', err.message));
      }
    }

    await createEvent(req.user.id, 'call.started', `Call started to ${lead.name || lead.phone}`, '', { lead_id: lead.id });
    await fireWebhooks(req.user.id, 'call.started', { lead_name: lead.name, lead_phone: lead.phone, lead_id: lead.id });

    res.json({ success: true, call_uuid: callUuid, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/history
router.get('/history', async (req, res) => {
  try {
    const { campaign_id, outcome, hot_lead, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase.from('call_logs')
      .select('*, leads(id, name, phone, city, property_type, budget, status)', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    if (outcome)     query = query.eq('outcome', outcome);
    if (hot_lead)    query = query.eq('hot_lead', hot_lead === 'true');

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ calls: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calls/:id/end — force-terminate an active call
router.post('/:id/end', async (req, res) => {
  try {
    const { data: call, error } = await supabase.from('call_logs')
      .select('id, user_id, lead_id, livekit_room_name, livekit_egress_id, call_status')
      .eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !call) return res.status(404).json({ error: 'Call not found' });

    const activeStatuses = ['initiated', 'ringing', 'in-progress', 'calling'];
    if (!activeStatuses.includes(call.call_status)) {
      return res.status(400).json({ error: 'Call is not active' });
    }

    // Delete the LiveKit room — disconnects all participants instantly
    if (call.livekit_room_name) {
      await deleteRoom(call.livekit_room_name);
      console.log(`[EndCall] Room deleted: ${call.livekit_room_name}`);
    }

    // Stop egress recording if one was running
    if (call.livekit_egress_id) {
      stopRoomRecording(call.livekit_egress_id, call.id).then(url => {
        if (url) supabase.from('call_logs').update({ recording_url: url }).eq('id', call.id).catch(() => {});
      }).catch(() => {});
    }

    // Mark call as terminated
    await supabase.from('call_logs').update({
      call_status: 'completed', outcome: 'completed', ended_at: new Date().toISOString(),
    }).eq('id', call.id);

    // Reset lead from 'calling' back to 'called' (don't re-queue)
    await supabase.from('leads').update({ status: 'called', last_called: new Date().toISOString() }).eq('id', call.lead_id);

    console.log(`[EndCall] Call ${call.id} terminated by user`);
    res.json({ success: true });
  } catch (err) {
    console.error('[EndCall] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calls/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('call_logs')
      .select('*, leads(*)').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !data) return res.status(404).json({ error: 'Call log not found' });
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Call log not found' });
  }
});

// POST /api/calls/retry
router.post('/retry', async (req, res) => {
  try {
    const { campaign_id } = req.body;
    let query = supabase.from('leads').select('*').eq('user_id', req.user.id).eq('status', 'retry');
    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    const { data: leads } = await query;
    const eligible = (leads || []).filter(l => (l.retry_count || 0) < 3);
    for (const lead of eligible) {
      await supabase.from('leads').update({ status: 'pending', retry_count: (lead.retry_count || 0) + 1 }).eq('id', lead.id);
    }
    res.json({ reset: eligible.length, skipped: (leads?.length || 0) - eligible.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
