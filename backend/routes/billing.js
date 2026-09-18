// billing.js — Paygic payment gateway + credit management
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { addCredits } = require('../services/billing');

router.use(requireAuth);

const MIN_AMOUNT = 500; // ₹500 minimum

// GET /api/billing/balance
router.get('/balance', async (req, res) => {
  try {
    const { data: user } = await db.from('users').select('credit_balance').eq('id', req.user.id).single();
    res.json({ balance: user?.credit_balance || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/history
router.get('/history', async (req, res) => {
  try {
    const { data, error } = await db.from('billing_transactions')
      .select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ transactions: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/billing/usage
router.get('/usage', async (req, res) => {
  try {
    const { data: calls } = await db.from('call_logs')
      .select('cost_total,cost_plivo,cost_stt,cost_tts,cost_llm,duration_seconds,created_at')
      .eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(500);

    const usage = (calls || []).reduce((acc, c) => ({
      total_cost: acc.total_cost + (c.cost_total || 0),
      total_minutes: acc.total_minutes + (c.duration_seconds || 0) / 60,
      plivo_cost: acc.plivo_cost + (c.cost_plivo || 0),
      stt_cost: acc.stt_cost + (c.cost_stt || 0),
      tts_cost: acc.tts_cost + (c.cost_tts || 0),
      llm_cost: acc.llm_cost + (c.cost_llm || 0),
    }), { total_cost: 0, total_minutes: 0, plivo_cost: 0, stt_cost: 0, tts_cost: 0, llm_cost: 0 });

    res.json({ usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/create-order — Paygic payment initiation
router.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < MIN_AMOUNT) {
      return res.status(400).json({ error: `Minimum recharge is ₹${MIN_AMOUNT}` });
    }

    const username = process.env.PAYGIC_USERNAME;
    const password = process.env.PAYGIC_PASSWORD;

    if (!username || !password) {
      return res.status(503).json({ error: 'Payment gateway not configured (PAYGIC_USERNAME / PAYGIC_PASSWORD missing)' });
    }

    const orderId = `velryx-${req.user.id.slice(0, 8)}-${Date.now()}`;
    const backendUrl = process.env.FRONTEND_URL || 'https://velryx.in';
    const webhookUrl = `${process.env.BACKEND_URL || 'https://velryx.in'}/api/webhook/paygic`;
    const redirectUrl = `${backendUrl}/billing?payment=success&order=${orderId}`;

    // Paygic REST API — creates a hosted payment page
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    const pgRes = await fetch('https://api.paygic.in/v1/payment/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),   // paise
        currency: 'INR',
        order_id: orderId,
        customer_name: req.user.name || req.user.email,
        customer_email: req.user.email,
        description: `Velryx credits top-up — ₹${amount}`,
        callback_url: webhookUrl,
        redirect_url: redirectUrl,
        udf1: req.user.id,   // Paygic passes udf fields back in webhook as user_id etc.
      }),
    });

    if (!pgRes.ok) {
      const errBody = await pgRes.json().catch(() => ({}));
      console.error('[Billing/Paygic] create-order error:', pgRes.status, errBody);
      throw new Error(errBody.message || errBody.error || `Paygic error ${pgRes.status}`);
    }

    const data = await pgRes.json();
    const paymentUrl = data.payment_url || data.url || data.checkout_url || data.payment_link;

    if (!paymentUrl) {
      console.error('[Billing/Paygic] No payment URL in response:', data);
      throw new Error('Paygic did not return a payment URL — check API credentials');
    }

    console.log(`[Billing/Paygic] Order created: ${orderId} ₹${amount} → ${paymentUrl}`);
    res.json({ payment_url: paymentUrl, order_id: orderId, amount });
  } catch (err) {
    console.error('[Billing/Paygic] create-order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/billing/verify — manual credit verification (legacy / fallback)
router.post('/verify', async (req, res) => {
  try {
    const { order_id, amount } = req.body;
    if (!order_id || !amount) return res.status(400).json({ error: 'order_id and amount required' });
    const credits = Math.round(amount);
    await addCredits(req.user.id, credits, order_id, null);
    res.json({ success: true, credits_added: credits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
