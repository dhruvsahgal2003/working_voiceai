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

// Decide which AI agent places this call.
//
// Precedence, most specific first:
//   1. agent_id passed on the request  — an explicit pick made right before dialling
//   2. lead.agent_id                   — the agent last chosen for this lead
//   3. campaign.agent_id               — a campaign IS a choice of agent
//   4. the user's most recently updated agent  — legacy fallback, keeps old calls working
//
// An explicit agent_id that does not belong to the caller is a hard 400 rather
// than a silent fall-through: dialling a lead with a different agent than the
// one the operator selected is worse than not dialling at all.
async function resolveAgentForCall({ userId, lead, requestedAgentId }) {
  if (requestedAgentId) {
    const { data: agent } = await supabase.from('agents')
      .select('id, name, is_active').eq('id', requestedAgentId).eq('user_id', userId).maybeSingle();
    if (!agent) return { error: 'Agent not found' };
    if (agent.is_active === false) return { error: `Agent "${agent.name}" is disabled` };
    return { agentId: agent.id, agentName: agent.name, source: 'explicit' };
  }

  if (lead.agent_id) {
    const { data: agent } = await supabase.from('agents')
      .select('id, name').eq('id', lead.agent_id).eq('user_id', userId).maybeSingle();
    if (agent) return { agentId: agent.id, agentName: agent.name, source: 'lead' };
  }

  if (lead.campaign_id) {
    const { data: campaign } = await supabase.from('campaigns')
      .select('agent_id, agents(id, name)').eq('id', lead.campaign_id).eq('user_id', userId).maybeSingle();
    if (campaign?.agent_id) {
      return { agentId: campaign.agent_id, agentName: campaign.agents?.name || null, source: 'campaign' };
    }
  }

  const { data: agentRow } = await supabase.from('agents')
    .select('id, name').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return agentRow
    ? { agentId: agentRow.id, agentName: agentRow.name, source: 'fallback_most_recent' }
    : { agentId: null, agentName: null, source: 'none' };
}

// POST /api/calls/trigger
router.post('/trigger', checkCredits, async (req, res) => {
  try {
    const { lead_id, agent_id } = req.body;
    if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

    const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).eq('user_id', req.user.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { data: dncEntry } = await supabase.from('dnc_list').select('id').eq('phone', lead.phone).eq('user_id', req.user.id).single();
    if (dncEntry) return res.status(400).json({ error: 'Phone is on DNC list' });

    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const hour = istNow.getUTCHours();
    // Calling hours only enforced for automated campaigns, not manual single calls

    // Resolved BEFORE the call is placed. If the operator picked an agent that
    // is gone or disabled we must fail here — once triggerCall() runs the phone
    // is already ringing and the wrong agent would answer it.
    const resolved = await resolveAgentForCall({ userId: req.user.id, lead, requestedAgentId: agent_id });
    if (resolved.error) return res.status(400).json({ error: resolved.error });

    await supabase.from('leads').update({ status: 'calling', last_called: new Date().toISOString() }).eq('id', lead.id);

    // Write the call_log BEFORE dialling. dialOutbound() blocks until the callee
    // answers, and the agent asks the backend to start recording the instant it
    // sees the SIP participant — so on a fast answer that request used to arrive
    // before this row existed, 404, and the call went unrecorded.
    const callLogId = uuidv4();
    const roomName = `call-${lead.id}-${Date.now()}`;
    const callUuid = `LK-${uuidv4().slice(0, 12)}`;

    await supabase.from('call_logs').insert({
      id: callLogId, user_id: req.user.id, lead_id: lead.id, campaign_id: lead.campaign_id,
      agent_id: resolved.agentId,
      plivo_call_uuid: callUuid, livekit_room_name: roomName,
      from_number: process.env.PLIVO_FROM_NUMBER,
      to_number: lead.phone, call_status: 'initiated', started_at: new Date().toISOString(),
    });

    let dial;
    try {
      dial = await triggerCall({ phone: lead.phone, name: lead.name, city: lead.city, propertyType: lead.property_type, budget: lead.budget, language: lead.language, leadId: lead.id, userId: req.user.id, roomName, callUuid });
    } catch (dialErr) {
      // The row exists now, so a failed dial has to be cleaned up explicitly —
      // otherwise it sits at 'initiated' forever and the lead is stuck 'calling'.
      await supabase.from('call_logs').update({
        call_status: 'failed', outcome: 'failed', end_reason: 'dial_failed',
        ended_at: new Date().toISOString(),
      }).eq('id', callLogId);
      await supabase.from('leads').update({ status: 'pending' }).eq('id', lead.id);
      throw dialErr;
    }

    // LOCAL/LOAD_TEST modes mint their own identifiers; reconcile if they differ.
    const patch = {};
    if (dial.callUuid && dial.callUuid !== callUuid) patch.plivo_call_uuid = dial.callUuid;
    if (dial.roomName && dial.roomName !== roomName) patch.livekit_room_name = dial.roomName;
    if (dial.fromNumber) patch.from_number = dial.fromNumber;
    if (Object.keys(patch).length) await supabase.from('call_logs').update(patch).eq('id', callLogId);


    // NOTE: Egress recording is now started by the agent (agent.py) via
    // POST /api/internal/start-recording when it detects the SIP participant
    // joining the LiveKit room.  Starting egress here (before the human answers)
    // caused the SIP participant's audio to be missed in the recording.
    // The agent waits for the human to actually join → both channels captured.

    // Remember an explicit pick so the next call to this lead pre-selects it.
    // Only for explicit picks — writing back a fallback would silently pin the
    // lead to whichever agent happened to be most recent that day.
    if (resolved.source === 'explicit' && lead.agent_id !== resolved.agentId) {
      await supabase.from('leads').update({ agent_id: resolved.agentId }).eq('id', lead.id);
    }

    await createEvent(req.user.id, 'call.started', `Call started to ${lead.name || lead.phone}`, '', { lead_id: lead.id });
    await fireWebhooks(req.user.id, 'call.started', { lead_name: lead.name, lead_phone: lead.phone, lead_id: lead.id });

    res.json({
      success: true, call_uuid: dial.callUuid || callUuid, lead,
      agent: { id: resolved.agentId, name: resolved.agentName, source: resolved.source },
    });
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
