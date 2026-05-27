// BullMQ campaign calling queue — reliable outbound call scheduling
const { Queue, Worker, QueueEvents } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

let campaignQueue = null;
let isRedisAvailable = false;

// In-memory fallback when Redis is not available
const inMemoryJobs = new Map();
const activeRunners = new Map();

function getQueue() {
  if (campaignQueue) return campaignQueue;
  try {
    campaignQueue = new Queue('campaign-calls', { connection });
    isRedisAvailable = true;
    return campaignQueue;
  } catch (err) {
    console.warn('Redis not available, using in-memory campaign runner');
    return null;
  }
}

async function enqueueCampaign(campaignId, userId, options = {}) {
  const queue = getQueue();
  if (queue) {
    return queue.add('run-campaign', { campaignId, userId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      ...options,
    });
  }
  // Fallback: store in map for in-memory runner
  inMemoryJobs.set(campaignId, { campaignId, userId, status: 'queued' });
  return { id: campaignId };
}

async function removeCampaignJob(campaignId) {
  inMemoryJobs.delete(campaignId);
  if (activeRunners.has(campaignId)) {
    activeRunners.set(campaignId, false);
  }
}

function setRunnerActive(campaignId, active) {
  activeRunners.set(campaignId, active);
}

function isRunnerActive(campaignId) {
  return activeRunners.get(campaignId) === true;
}

module.exports = { getQueue, enqueueCampaign, removeCampaignJob, setRunnerActive, isRunnerActive, connection };
