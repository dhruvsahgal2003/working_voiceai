// Notifications service — in-app events, Telegram alerts, webhook forwarding
const axios = require('axios');
const db = require('./supabase');
const { sendWhatsAppAlert } = require('./plivo');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    }, { timeout: 5000 });
  } catch (err) {
    console.error('Telegram notify error:', err.message);
  }
}

async function createEvent(userId, type, title, body, data = {}) {
  try {
    await db.from('events').insert({ user_id: userId, type, title, body, data });
  } catch (err) {
    console.error('createEvent error:', err.message);
  }
}

async function notifyHotLead(userId, lead, callLog) {
  await createEvent(userId, 'lead.hot', 'Hot lead detected 🔥', `${lead.name || lead.phone} is interested — ${callLog.intent || ''} ${callLog.budget_range || ''}`, { lead_id: lead.id, call_id: callLog.id });

  // Telegram alert
  await sendTelegram(
    `🔥 <b>Hot Lead!</b>\n` +
    `👤 ${lead.name || 'Unknown'} — ${lead.phone}\n` +
    `🏠 Intent: ${callLog.intent || '—'}  Budget: ${callLog.budget_range || '—'}\n` +
    `📞 Call outcome: ${callLog.outcome || '—'}`
  );

  // Fire user's custom webhook + WhatsApp if configured
  try {
    const { data: creds } = await db.from('user_credentials').select('sales_webhook_url, sales_whatsapp, plivo_auth_id, plivo_auth_token_encrypted').eq('user_id', userId).single();

    if (creds?.sales_whatsapp) {
      let authToken;
      try {
        const { decrypt } = require('./encryption');
        if (creds.plivo_auth_token_encrypted) authToken = decrypt(creds.plivo_auth_token_encrypted);
      } catch (_) {}
      await sendWhatsAppAlert({
        to: creds.sales_whatsapp,
        leadName: lead?.name, phone: lead?.phone,
        intent: callLog.intent, budget: callLog.budget_range,
        city: lead?.city, outcome: callLog.outcome,
        authId: creds.plivo_auth_id, authToken,
      });
    }

    if (creds?.sales_webhook_url) {
      await axios.post(creds.sales_webhook_url, {
        event: 'hot_lead',
        lead: { id: lead.id, name: lead.name, phone: lead.phone, city: lead.city },
        call: { id: callLog.id, intent: callLog.intent, budget: callLog.budget_range, outcome: callLog.outcome },
        timestamp: new Date().toISOString(),
      }, { timeout: 5000 });
    }
  } catch (err) {
    console.error('Sales webhook error:', err.message);
  }
}

async function notifyCreditLow(userId, balance) {
  await createEvent(userId, 'credit.low', 'Low credit balance ⚠️', `Your balance is ₹${balance}. Top up to keep campaigns running.`, { balance });
  await sendTelegram(`⚠️ <b>Low Credits</b>\nBalance dropped to ₹${balance}. Top up to keep campaigns running.`);
}

module.exports = { createEvent, notifyHotLead, notifyCreditLow };
