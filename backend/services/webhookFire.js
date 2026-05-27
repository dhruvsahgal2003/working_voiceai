// Fire user-configured webhooks on call events
const crypto = require('crypto');
const axios = require('axios');
const db = require('./supabase');

const TIMEOUT_MS = 8000;

function sign(secret, payload) {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

async function fireWebhooks(userId, event, data) {
  try {
    const { data: hooks } = await db
      .from('user_webhooks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .contains('events', [event]);

    if (!hooks?.length) return;

    const payload = { event, data, timestamp: Date.now() };

    await Promise.allSettled(
      hooks.map(async (hook) => {
        const sig = sign(hook.secret, payload);
        try {
          await axios.post(hook.url, payload, {
            timeout: TIMEOUT_MS,
            headers: {
              'Content-Type': 'application/json',
              'X-Callora-Event': event,
              ...(sig && { 'X-Callora-Signature': `sha256=${sig}` }),
            },
          });
          // Log success
          await db.from('user_webhooks').update({
            last_triggered_at: new Date().toISOString(),
            last_status: 'success',
          }).eq('id', hook.id);
        } catch (err) {
          await db.from('user_webhooks').update({
            last_triggered_at: new Date().toISOString(),
            last_status: `error: ${err.message?.slice(0, 100)}`,
          }).eq('id', hook.id);
        }
      })
    );
  } catch (err) {
    console.error('[webhookFire] Error:', err.message);
  }
}

module.exports = { fireWebhooks };
