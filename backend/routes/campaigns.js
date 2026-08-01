// Campaigns routes — create/launch/pause campaigns, in-memory runner with BullMQ fallback
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { triggerCall } = require('../services/plivo');
const { startRoomRecording } = require('../services/livekit');
const { requireAuth } = require('../middleware/auth');
const { setRunnerActive, isRunnerActive } = require('../services/queue');
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

    // Run in background
    runCampaign({ ...campaign, user_id: req.user.id });
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
    setRunnerActive(req.params.id, false);
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
    setRunnerActive(req.params.id, false);
    await supabase.from('campaigns').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Background campaign runner
async function runCampaign(campaign) {
  setRunnerActive(campaign.id, true);
  const delayMs = Math.floor(60000 / (campaign.rate_per_min || 5));
  console.log(`[Campaign] Starting: ${campaign.name}`);

  try {
    while (isRunnerActive(campaign.id)) {
      // Check calling hours
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const t = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
      const [sh, sm] = (campaign.start_time || '10:00').split(':').map(Number);
      const [eh, em] = (campaign.end_time || '19:00').split(':').map(Number);
      if (t < sh * 60 + sm || t > eh * 60 + em) {
        console.log(`[Campaign] Outside hours, pausing: ${campaign.name}`);
        await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id);
        break;
      }

      // Fetch next pending lead
      const { data: leads } = await supabase.from('leads')
        .select('*').eq('campaign_id', campaign.id).eq('user_id', campaign.user_id).eq('status', 'pending')
        .order('created_at', { ascending: true }).limit(1);

      if (!leads?.length) {
        console.log(`[Campaign] Completed: ${campaign.name}`);
        await supabase.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
        await createEvent(campaign.user_id, 'campaign.completed', `Campaign "${campaign.name}" completed`, 'All leads have been processed', { campaign_id: campaign.id });
        break;
      }

      const lead = leads[0];
      const { data: dncEntry } = await supabase.from('dnc_list').select('id').eq('phone', lead.phone).eq('user_id', campaign.user_id).single();
      if (dncEntry) { await supabase.from('leads').update({ status: 'dnc' }).eq('id', lead.id); continue; }

      try {
        await supabase.from('leads').update({ status: 'calling', last_called: new Date().toISOString() }).eq('id', lead.id);
        const { callUuid, roomName, fromNumber } = await triggerCall({ phone: lead.phone, name: lead.name, city: lead.city, propertyType: lead.property_type, budget: lead.budget, language: lead.language, leadId: lead.id, userId: campaign.user_id });

        // Resolve agent: campaign.agent_id or user's most-recent agent
        let agentId = campaign.agent_id;
        if (!agentId) {
          const { data: agentRow } = await supabase.from('agents')
            .select('id').eq('user_id', campaign.user_id)
            .order('updated_at', { ascending: false }).limit(1).maybeSingle();
          agentId = agentRow?.id || null;
        }

        const callLogId = uuidv4();
        await supabase.from('call_logs').insert({
          id: callLogId, user_id: campaign.user_id, lead_id: lead.id, campaign_id: campaign.id,
          agent_id: agentId,
          plivo_call_uuid: callUuid, livekit_room_name: roomName || null,
          from_number: fromNumber || process.env.PLIVO_FROM_NUMBER,
          to_number: lead.phone, call_status: 'initiated', started_at: new Date().toISOString(),
        });

        // NOTE: Egress recording is started by the agent via POST /api/internal/start-recording
        // when it detects the SIP participant joining — ensures both channels are captured.
      } catch (err) {
        console.error(`[Campaign] Call failed ${lead.phone}:`, err.message);
        await supabase.from('leads').update({ status: 'pending' }).eq('id', lead.id);
      }

      await new Promise(r => setTimeout(r, delayMs));
    }
  } catch (err) {
    // Anything that escapes the per-lead try/catch above (e.g. the lead-fetch or
    // DNC-check query itself failing) would otherwise strand the campaign as
    // 'running' in the DB with no active runner — unrecoverable via the UI, since
    // /launch refuses to relaunch a campaign already marked 'running'. Fall back
    // to 'paused' so it's both accurate and re-launchable.
    console.error(`[Campaign] Unexpected error, pausing: ${campaign.name}`, err.message);
    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaign.id).catch(() => {});
  } finally {
    setRunnerActive(campaign.id, false);
  }
}

// Called once at server startup — resumes campaigns that were mid-flight when the
// process last crashed/restarted. A campaign left at status='running' in the DB
// can only mean that: activeRunners is always empty on a fresh process, so nothing
// is actually driving it anymore.
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

    runCampaign(campaign);
  }
}

module.exports = router;
module.exports.resumeInterruptedCampaigns = resumeInterruptedCampaigns;
