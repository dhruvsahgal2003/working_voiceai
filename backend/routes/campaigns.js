// Campaigns routes — create/launch/pause campaigns, in-memory runner with BullMQ fallback
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { triggerCall } = require('../services/plivo');
const { startRoomRecording } = require('../services/livekit');
const { requireAuth } = require('../middleware/auth');
const { enqueueDial, removeCampaignJobs } = require('../services/queue');
const { createEvent } = require('../services/notifications');

router.use(requireAuth);

// GET /api/campaigns
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('campaigns').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;

    const enriched = await Promise.all((data || []).map(async (c) => {
      const [{ count: total }, { count: pending }, { count: hot }, { count: called }] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact' }).eq('campaign_id', c.id).eq('user_id', req.user.id),
        supabase.from('leads').select('id', { count: 'exact' }).eq('campaign_id', c.id).eq('user_id', req.user.id).eq('status', 'pending'),
        supabase.from('leads').select('id', { count: 'exact' }).eq('campaign_id', c.id).eq('user_id', req.user.id).eq('status', 'hot_lead'),
        supabase.from('leads').select('id', { count: 'exact' }).eq('campaign_id', c.id).eq('user_id', req.user.id).neq('status', 'pending'),
      ]);
      return { ...c, total_leads: total, pending, hot_leads: hot, called_count: called };
    }));

    res.json({ campaigns: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('campaigns').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !data) return res.status(404).json({ error: 'Campaign not found' });
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Campaign not found' });
  }
});

// POST /api/campaigns
router.post('/', async (req, res) => {
  try {
    const { name, description, agent_id, phone_number_id, start_time, end_time, rate_per_min, max_concurrent_calls, max_attempts_per_lead } = req.body;
    if (!name) return res.status(400).json({ error: 'Campaign name is required' });

    const basePayload = {
      id: uuidv4(),
      user_id: req.user.id,
      name, description: description || '',
      agent_id: agent_id || null,
      phone_number_id: phone_number_id || null,
      status: 'draft',
      start_time: start_time || '10:00',
      end_time: end_time || '19:00',
    };
    const extPayload = {
      ...basePayload,
      rate_per_min: rate_per_min || 5,
      max_concurrent_calls: max_concurrent_calls || 5,
      max_attempts_per_lead: max_attempts_per_lead || 3,
    };
    let { data, error } = await supabase.from('campaigns').insert(extPayload).select().single();
    if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('column'))) {
      ({ data, error } = await supabase.from('campaigns').insert(basePayload).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/campaigns/:id
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'description', 'start_time', 'end_time', 'rate_per_min', 'agent_id', 'phone_number_id', 'max_concurrent_calls', 'max_attempts_per_lead'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });
    let { data, error } = await supabase.from('campaigns').update({ updated_at: new Date().toISOString(), ...updates }).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error && error.message?.includes('updated_at')) {
      ({ data, error } = await supabase.from('campaigns').update(updates).eq('id', req.params.id).eq('user_id', req.user.id).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/launch
router.post('/:id/launch', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaignId).eq('user_id', req.user.id).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'running') return res.status(400).json({ error: 'Campaign already running' });

    // Check calling hours (IST = UTC+5:30)
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const t = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
    const [sh, sm] = (campaign.start_time || '10:00').split(':').map(Number);
    const [eh, em] = (campaign.end_time || '19:00').split(':').map(Number);
    const isLocalMode = !process.env.PLIVO_AUTH_ID || process.env.PLIVO_AUTH_ID.includes('PLACEHOLDER');
    if (!isLocalMode && (t < sh * 60 + sm || t > eh * 60 + em)) {
      return res.status(400).json({ error: `Outside calling window. Allowed: ${campaign.start_time} – ${campaign.end_time} IST` });
    }

    // ── PRE-LAUNCH: count pending leads ─────────────────────────────────────
    const { count: pendingCount } = await supabase.from('leads')
      .select('id', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .eq('user_id', req.user.id)
      .eq('status', 'pending');

    if (!pendingCount || pendingCount === 0) {
      return res.status(400).json({
        error: 'No leads assigned to this campaign. Go to Leads → Import CSV and select this campaign, or use "Add Leads" to assign existing leads.',
        code: 'NO_LEADS',
      });
    }

    await supabase.from('campaigns').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', campaignId);
    await createEvent(req.user.id, 'campaign.launched', `Campaign "${campaign.name}" launched`, `${pendingCount} leads queued`, { campaign_id: campaignId });

    await enqueueDial(campaignId, req.user.id, 0);
    res.json({ success: true, message: `Campaign launched — ${pendingCount} leads queued` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/add-leads — bulk assign existing unassigned leads to a campaign
router.post('/:id/add-leads', async (req, res) => {
  try {
    const { lead_ids } = req.body; // optional: specific lead IDs; if omitted, assign ALL unassigned pending leads
    const campaignId = req.params.id;

    const { data: campaign } = await supabase.from('campaigns').select('id').eq('id', campaignId).eq('user_id', req.user.id).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    let query = supabase.from('leads').update({ campaign_id: campaignId }).eq('user_id', req.user.id);

    if (lead_ids?.length) {
      query = query.in('id', lead_ids);
    } else {
      // Assign all pending leads that have no campaign
      query = query.is('campaign_id', null).eq('status', 'pending');
    }

    const { data, error } = await query.select('id');
    if (error) throw error;

    // Update campaign total_leads count
    const { count } = await supabase.from('leads').select('id', { count: 'exact' }).eq('campaign_id', campaignId).eq('user_id', req.user.id);
    await supabase.from('campaigns').update({ total_leads: count || 0 }).eq('id', campaignId);

    res.json({ success: true, assigned: data?.length || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', async (req, res) => {
  try {
    await removeCampaignJobs(req.params.id);
    await supabase.from('campaigns').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('user_id', req.user.id);
    await createEvent(req.user.id, 'campaign.paused', 'Campaign paused', '', { campaign_id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req, res) => {
  try {
    await removeCampaignJobs(req.params.id);
    await supabase.from('campaigns').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atomically claim the next pending lead for a campaign. Uses SELECT ... FOR UPDATE
// SKIP LOCKED so that if two job-chains for the same campaign are ever alive at once
// (see resumeInterruptedCampaigns below), they can never both claim the same lead —
// each gets a distinct row, or null if none are free. Plain SELECT-then-UPDATE would
// race here now that a concurrency>1 Worker pool replaces the old single loop.
async function claimNextLead(campaignId, userId) {
  const { rows } = await supabase.query(
    `UPDATE leads SET status = 'calling', last_called = now()
     WHERE id = (
       SELECT id FROM leads
       WHERE campaign_id = $1 AND user_id = $2 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [campaignId, userId]
  );
  return rows[0] || null;
}

// BullMQ job processor — handles exactly one "dial the next pending lead" step for a
// campaign, then (if more leads remain and the campaign's still running) enqueues the
// next step with the campaign's own rate_per_min delay, chaining itself forward. The
// shared Worker's `concurrency` (services/queue.js) caps how many of these steps —
// across every campaign/client combined — can be actively processing at once, which
// the old independent-per-campaign-loop design had no way to do.
async function processDialJob(job) {
  const { campaignId, userId, queueName } = job.data;

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', campaignId).single();
  if (!campaign || campaign.status !== 'running') return; // paused/deleted since this step was queued

  const delayMs = Math.floor(60000 / (campaign.rate_per_min || 5));

  // Check calling hours
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const t = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const [sh, sm] = (campaign.start_time || '10:00').split(':').map(Number);
  const [eh, em] = (campaign.end_time || '19:00').split(':').map(Number);
  if (t < sh * 60 + sm || t > eh * 60 + em) {
    console.log(`[Campaign] Outside hours, pausing: ${campaign.name}`);
    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaignId);
    return;
  }

  const lead = await claimNextLead(campaignId, userId);
  if (!lead) {
    // Nothing claimable right now — either genuinely done, or every remaining
    // pending lead is momentarily locked by a sibling step. Check the real count
    // before declaring completion; if leads remain, let the sibling chain continue
    // (starting another chain here too risks two chains both idling forever).
    const { count } = await supabase.from('leads').select('id', { count: 'exact' })
      .eq('campaign_id', campaignId).eq('user_id', userId).eq('status', 'pending');
    if (!count) {
      console.log(`[Campaign] Completed: ${campaign.name}`);
      await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaignId);
      await createEvent(userId, 'campaign.completed', `Campaign "${campaign.name}" completed`, 'All leads have been processed', { campaign_id: campaignId });
    }
    return;
  }

  const { data: dncEntry } = await supabase.from('dnc_list').select('id').eq('phone', lead.phone).eq('user_id', userId).single();
  if (dncEntry) {
    await supabase.from('leads').update({ status: 'dnc' }).eq('id', lead.id);
    await enqueueDial(campaignId, userId, 0, queueName); // skip immediately, no pacing delay
    return;
  }

  try {
    // Resolve agent: campaign.agent_id → lead.agent_id → user's most-recent agent.
    //
    // The campaign's agent deliberately outranks the lead's here, which is the
    // opposite of the manual-dial precedence in routes/calls.js. A campaign IS a
    // choice of agent, so a campaign run must be uniform: if a lead had been
    // pinned to another agent by an earlier one-off call, letting that win would
    // make the campaign silently dial some leads with the wrong agent.
    let agentId = campaign.agent_id || lead.agent_id || null;
    if (!agentId) {
      const { data: agentRow } = await supabase.from('agents')
        .select('id').eq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      agentId = agentRow?.id || null;
    }

    // Insert BEFORE dialling — see routes/calls.js for why: dialOutbound blocks
    // until answer, and the agent's start-recording request must find this row.
    const callLogId = uuidv4();
    const roomName = `call-${lead.id}-${Date.now()}`;
    const callUuid = `LK-${uuidv4().slice(0, 12)}`;

    await supabase.from('call_logs').insert({
      id: callLogId, user_id: userId, lead_id: lead.id, campaign_id: campaignId,
      agent_id: agentId,
      plivo_call_uuid: callUuid, livekit_room_name: roomName,
      from_number: process.env.PLIVO_FROM_NUMBER,
      to_number: lead.phone, call_status: 'initiated', started_at: new Date().toISOString(),
    });

    let dial;
    try {
      dial = await triggerCall({ phone: lead.phone, name: lead.name, city: lead.city, propertyType: lead.property_type, budget: lead.budget, language: lead.language, leadId: lead.id, userId, roomName, callUuid });
    } catch (dialErr) {
      await supabase.from('call_logs').update({
        call_status: 'failed', outcome: 'failed', end_reason: 'dial_failed',
        ended_at: new Date().toISOString(),
      }).eq('id', callLogId);
      throw dialErr;
    }

    const patch = {};
    if (dial.callUuid && dial.callUuid !== callUuid) patch.plivo_call_uuid = dial.callUuid;
    if (dial.roomName && dial.roomName !== roomName) patch.livekit_room_name = dial.roomName;
    if (dial.fromNumber) patch.from_number = dial.fromNumber;
    if (Object.keys(patch).length) await supabase.from('call_logs').update(patch).eq('id', callLogId);

    // NOTE: Egress recording is started by the agent via POST /api/internal/start-recording
    // when it detects the SIP participant joining — ensures both channels are captured.
  } catch (err) {
    console.error(`[Campaign] Call failed ${lead.phone}:`, err.message);
    await supabase.from('leads').update({ status: 'pending' }).eq('id', lead.id);
  }

  // A truly unexpected error above this point (not the per-call try/catch, but e.g.
  // a DB blip in the campaign/DNC lookups) throws out of processDialJob entirely —
  // BullMQ retries the job itself (attempts+backoff, see queue.js) instead of
  // stranding the whole campaign the way an uncaught error in the old single loop did.
  await enqueueDial(campaignId, userId, delayMs, queueName);
}

// Called once at server startup — backstop for campaigns left at status='running'
// with no live job chain (e.g. Redis data was lost/flushed independently of
// Postgres). Normally unnecessary: BullMQ jobs persist in Redis (AOF) across a
// backend restart on their own. Safe even if a real chain turns out to still be
// alive — claimNextLead's FOR UPDATE SKIP LOCKED means two concurrent chains for
// the same campaign can never claim the same lead, so at worst this adds one
// redundant chain that quickly finds nothing to do and stops.
async function resumeInterruptedCampaigns() {
  const { data: orphaned, error } = await supabase.from('campaigns').select('*').eq('status', 'running');
  if (error) { console.error('[Campaign] resumeInterruptedCampaigns query failed:', error.message); return; }
  if (!orphaned?.length) return;

  for (const campaign of orphaned) {
    console.log(`[Campaign] Resuming after restart: ${campaign.name} (${campaign.id})`);
    // A lead stuck in 'calling' when the process died gets requeued — 10min grace
    // window so we don't yank a call that's still genuinely in progress.
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase.from('leads')
      .update({ status: 'pending' })
      .eq('campaign_id', campaign.id)
      .eq('status', 'calling')
      .lt('last_called', staleCutoff);

    await enqueueDial(campaign.id, campaign.user_id, 0);
  }
}

module.exports = router;
module.exports.processDialJob = processDialJob;
module.exports.resumeInterruptedCampaigns = resumeInterruptedCampaigns;
