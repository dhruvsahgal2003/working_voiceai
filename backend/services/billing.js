// Billing service — deduct credits per call, log transactions
const db = require('./supabase');

// Flat rate: ₹6 per minute (covers Plivo + STT + TTS + LLM + platform)
const RATE_PER_MIN = 6.00;

function calcCost(durationSeconds) {
  const mins = durationSeconds / 60;
  const total = +(RATE_PER_MIN * mins).toFixed(4);
  return {
    cost_plivo: +(1.80 * mins).toFixed(4),
    cost_stt:   +(1.50 * mins).toFixed(4),
    cost_tts:   +(0.70 * mins).toFixed(4),
    cost_llm:   +(0.50 * mins).toFixed(4),
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
