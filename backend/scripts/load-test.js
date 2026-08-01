// Synthetic load test for the BullMQ campaign queue (services/queue.js +
// routes/campaigns.js's processDialJob). Creates throwaway campaigns/leads, drives
// them through the REAL job-chain logic with LOAD_TEST_MODE forced on (so no real
// Plivo/LiveKit call is ever placed regardless of .env), and reports throughput and
// error counts. Always cleans up its own data, even on failure.
//
// This measures queue+DB throughput and correctness under concurrent load — NOT
// real call/audio capacity, which the box's actual STT/TTS/LLM pipeline determines
// separately (see resource-headroom-probe.js).
//
//   node scripts/load-test.js [--campaigns=20] [--leadsPerCampaign=50]
process.env.LOAD_TEST_MODE = 'true';
require('dotenv').config();
// Isolated queue name — runs alongside the live backend's own Worker (still
// consuming the real 'campaign-calls' queue) without sharing capacity or jobs, so
// throughput numbers here reflect exactly this script's own Worker/concurrency
// setting, not a mix of two workers pulling from the same queue.
const LOAD_TEST_QUEUE = 'campaign-calls-loadtest';
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { startWorker, enqueueDial, getQueue, removeCampaignJobs } = require('../services/queue');
const campaigns = require('../routes/campaigns');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v];
}));
const NUM_CAMPAIGNS = parseInt(args.campaigns || '20', 10);
const LEADS_PER_CAMPAIGN = parseInt(args.leadsPerCampaign || '50', 10);
const TOTAL_LEADS = NUM_CAMPAIGNS * LEADS_PER_CAMPAIGN;
// Aggressive pacing on purpose — we already know realistic rate_per_min values
// (~5/min) comfortably clear 1000/day in aggregate across even a handful of
// concurrent campaigns; the point of THIS test is to find where the queue/DB
// layer itself strains, so push well past any plausible real pacing.
const RATE_PER_MIN = parseInt(args.ratePerMin || '300', 10);

async function main() {
  const { data: user } = await supabase.from('users').select('id').eq('email', 'dhruvsahgal2003@gmail.com').single();
  if (!user) throw new Error('reference user not found — adjust the email in this script');

  console.log(`[LOAD-TEST] Creating ${NUM_CAMPAIGNS} campaigns x ${LEADS_PER_CAMPAIGN} leads = ${TOTAL_LEADS} total, rate_per_min=${RATE_PER_MIN}`);

  const campaignIds = [];
  for (let i = 0; i < NUM_CAMPAIGNS; i++) {
    const id = uuidv4();
    campaignIds.push(id);
    await supabase.from('campaigns').insert({
      id, user_id: user.id, name: `__LOAD_TEST_${i}__`, status: 'running',
      start_time: '00:00', end_time: '23:59', rate_per_min: RATE_PER_MIN,
    });
    const leadRows = Array.from({ length: LEADS_PER_CAMPAIGN }, () => ({
      id: uuidv4(), user_id: user.id, campaign_id: id,
      phone: `+91000${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
      name: 'Load Test', status: 'pending',
    }));
    for (const row of leadRows) await supabase.from('leads').insert(row); // sequential: simplicity over speed here, setup isn't what we're timing
  }
  console.log('[LOAD-TEST] Setup complete, starting worker...');

  let failedJobs = 0;
  const worker = startWorker(campaigns.processDialJob, LOAD_TEST_QUEUE);
  worker.on('failed', (job, err) => {
    failedJobs++;
    console.error(`[LOAD-TEST] job failed: campaign=${job?.data?.campaignId} err=${err.message}`);
  });

  const dbErrors = [];
  const origConsoleError = console.error;
  console.error = (...a) => { if (String(a[0]).includes('pool') || String(a[0]).includes('ECONN')) dbErrors.push(a.join(' ')); origConsoleError(...a); };

  const start = Date.now();
  await Promise.all(campaignIds.map(id => enqueueDial(id, user.id, 0, LOAD_TEST_QUEUE)));

  let lastLogged = 0;
  const pollInterval = setInterval(async () => {
    const { count } = await supabase.from('call_logs').select('id', { count: 'exact' }).in('campaign_id', campaignIds);
    if (count !== lastLogged) { console.log(`[LOAD-TEST] progress: ${count}/${TOTAL_LEADS} calls placed (${((Date.now() - start) / 1000).toFixed(1)}s elapsed)`); lastLogged = count; }
  }, 2000);

  const timeoutMs = 120000;
  let finalCount = 0;
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
    const { data: statuses } = await supabase.from('campaigns').select('status').in('id', campaignIds);
    const allDone = statuses.every(c => c.status === 'completed' || c.status === 'paused');
    if (allDone) break;
  }
  clearInterval(pollInterval);
  const durationSec = (Date.now() - start) / 1000;
  console.error = origConsoleError;

  const { count: finalCallCount } = await supabase.from('call_logs').select('id', { count: 'exact' }).in('campaign_id', campaignIds);
  finalCount = finalCallCount;

  console.log('\n[LOAD-TEST] ===== RESULTS =====');
  console.log(`  Calls placed:     ${finalCount} / ${TOTAL_LEADS}`);
  console.log(`  Duration:         ${durationSec.toFixed(1)}s`);
  console.log(`  Throughput:       ${(finalCount / durationSec).toFixed(1)} calls/sec (${(finalCount / durationSec * 3600).toFixed(0)} calls/hour equivalent)`);
  console.log(`  Failed jobs:      ${failedJobs}`);
  console.log(`  DB pool errors:   ${dbErrors.length}`);
  console.log(`  Worker concurrency setting: ${process.env.CAMPAIGN_QUEUE_CONCURRENCY || '8 (default)'}`);
  console.log(`  PG_POOL_MAX:      ${process.env.PG_POOL_MAX || '10 (default)'}`);
  console.log('=====================================\n');

  // Cleanup
  console.log('[LOAD-TEST] Cleaning up test data...');
  for (const id of campaignIds) await removeCampaignJobs(id, LOAD_TEST_QUEUE);
  await supabase.from('call_logs').delete().in('campaign_id', campaignIds);
  await supabase.from('leads').delete().in('campaign_id', campaignIds);
  await supabase.from('campaigns').delete().in('id', campaignIds);
  console.log('[LOAD-TEST] Cleanup done.');

  await worker.close();
  await getQueue(LOAD_TEST_QUEUE).close();

  const pass = finalCount === TOTAL_LEADS && failedJobs === 0 && dbErrors.length === 0;
  console.log(pass ? '[LOAD-TEST] PASS' : '[LOAD-TEST] INCOMPLETE/FAIL — see results above');
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error('[LOAD-TEST] FATAL', err);
  process.exit(1);
});
