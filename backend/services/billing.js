// Billing service — deduct credits per call, log transactions
const db = require('./supabase');

// What you charge clients
const RATE_PER_MIN = 6.00;

// Actual platform costs (for internal margin tracking only — does NOT affect client billing)
// Plivo outbound India: ₹0.60/min
// Sarvam STT (saarika:v2.5): ₹0.50/min  (₹30/hr)
// Sarvam TTS (bulbul:v3): ₹0.90/min     (₹30/10k chars, ~300 chars/min)
// Groq LLM (8b-instant): ~₹0/min        ($0.05/1M tokens — negligible)
// LiveKit: ~₹0.30/min                   (free tier 10k min/mo, then $0.004/participant-min)
// Total cost: ~₹2.30/min  →  Margin: ~₹3.70/min (62%)
const COST_PER_MIN = {
  plivo:   0.60,
  stt:     0.50,
  tts:     0.90,
  llm:     0.00,
  livekit: 0.30,
};

function calcCost(durationSeconds) {
  const mins = durationSeconds / 60;
  const total = +(RATE_PER_MIN * mins).toFixed(4);
  return {
    cost_plivo:   +(COST_PER_MIN.plivo   * mins).toFixed(4),
    cost_stt:     +(COST_PER_MIN.stt     * mins).toFixed(4),
    cost_tts:     +(COST_PER_MIN.tts     * mins).toFixed(4),
    cost_llm:     +(COST_PER_MIN.llm     * mins).toFixed(4),
    cost_livekit: +(COST_PER_MIN.livekit * mins).toFixed(4),
    cost_platform: +(Object.values(COST_PER_MIN).reduce((a, b) => a + b, 0) * mins).toFixed(4),
    cost_total: total,
  };
}

const RATES = { per_min: RATE_PER_MIN };

async function deductCredits(userId, callId, durationSeconds, description = 'Call charge') {
  const costs = calcCost(durationSeconds);

  // Fetch current balance
  const { data: user, error } = await db.from('users').select('credit_balance').eq('id', userId).single();
  if (error || !user) return costs;

  const balanceAfter = Math.max(0, (user.credit_balance || 0) - costs.cost_total);

  // Deduct from user
  await db.from('users').update({ credit_balance: balanceAfter }).eq('id', userId);

  // Log transaction
  await db.from('billing_transactions').insert({
    user_id: userId,
    type: 'call_charge',
    amount: -costs.cost_total,
    balance_after: balanceAfter,
    description,
    call_id: callId,
  });

  // Alert if low balance
  if (balanceAfter < 100) {
    await db.from('events').insert({
      user_id: userId,
      type: 'credit.low',
      title: 'Low credit balance',
      body: `Your credit balance is ₹${balanceAfter.toFixed(2)}. Please top up to continue calling.`,
      data: { balance: balanceAfter },
    });
  }

  return { ...costs, balance_after: balanceAfter };
}

async function addCredits(userId, amount, paygicOrderId, paygicPaymentId) {
  const { data: user } = await db.from('users').select('credit_balance').eq('id', userId).single();
  const balanceAfter = (user?.credit_balance || 0) + amount;

  await db.from('users').update({ credit_balance: balanceAfter }).eq('id', userId);

  await db.from('billing_transactions').insert({
    user_id: userId,
    type: 'credit_added',
    amount,
    balance_after: balanceAfter,
    description: `Credit top-up via Paygic`,
    paygic_order_id: paygicOrderId,
    paygic_payment_id: paygicPaymentId,
  });

  await db.from('events').insert({
    user_id: userId,
    type: 'credit.added',
    title: 'Credits added',
    body: `₹${amount} has been added to your account. New balance: ₹${balanceAfter.toFixed(2)}`,
    data: { amount, balance: balanceAfter },
  });

  return balanceAfter;
}

module.exports = { calcCost, deductCredits, addCredits, RATES };
