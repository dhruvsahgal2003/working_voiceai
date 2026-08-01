// BullMQ campaign calling queue — durable, concurrency-capped outbound call scheduling.
// Replaces the old in-process setTimeout loop: campaigns.js enqueues one
// "dial the next lead" job per step, and a single shared Worker (concurrency-capped
// below) processes them. That cap is a hard, platform-wide ceiling on how many calls
// can be in the middle of being placed at once, across every client's campaigns
// combined — the old per-campaign-independent-loop design had no such ceiling.
const { Queue, Worker } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // required by BullMQ for Worker/blocking connections
};

const QUEUE_NAME = 'campaign-calls';
const CONCURRENCY = parseInt(process.env.CAMPAIGN_QUEUE_CONCURRENCY || '8', 10);

let campaignQueue = null;
function getQueue() {
  if (!campaignQueue) campaignQueue = new Queue(QUEUE_NAME, { connection });
  return campaignQueue;
}

let worker = null;
// Starts the shared Worker exactly once; safe to call repeatedly (returns the
// existing instance). `processor` is campaigns.js's processDialJob.
function startWorker(processor) {
  if (worker) return worker;
  worker = new Worker(QUEUE_NAME, processor, { connection, concurrency: CONCURRENCY });
  worker.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job?.id} (campaign ${job?.data?.campaignId}) failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`, err.message);
  });
  worker.on('error', (err) => console.error('[Queue] Worker error:', err.message));
  return worker;
}

// Enqueue the next "dial one lead" step for a campaign.
function enqueueDial(campaignId, userId, delayMs = 0) {
  return getQueue().add('dial-next-lead', { campaignId, userId }, {
    delay: delayMs,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });
}

// Remove all not-yet-processed jobs for a campaign — used by /pause and /delete so a
// stopped campaign can't have a stray already-queued step fire later. A job that's
// already mid-processing when this runs isn't cancelled (can't safely interrupt an
// in-flight call trigger), but processDialJob re-checks campaign.status at the start
// of every step, so the chain self-terminates within at most one more hop regardless.
async function removeCampaignJobs(campaignId) {
  const queue = getQueue();
  const jobs = await queue.getJobs(['delayed', 'waiting']);
  await Promise.all(jobs.filter(j => j.data?.campaignId === campaignId).map(j => j.remove()));
}

module.exports = { connection, getQueue, startWorker, enqueueDial, removeCampaignJobs };
