const router = require('express').Router();
const crypto = require('crypto');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const { addCredits } = require('../services/billing');

router.use(requireAuth);

const MIN_AMOUNT = 100; // ₹100 minimum

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

// POST /api/billing/create-order — Razorpay order
router.post('/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < MIN_AMOUNT) {
      return res.status(400).json({ error: `Minimum recharge is ₹${MIN_AMOUNT}` });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(503).json({
        error: 'Payment gateway not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env. Get keys at razorpay.com/dashboard',
      });
    }

    const Razorpay = require('razorpay');
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const order = await rzp.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: `callora-${req.user.id.slice(0, 8)}-${Date.now()}`,
      notes: { user_id: req.user.id, user_email: req.user.email },
    });

    res.json({
      order_id: order.id,
      key_id: keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Callora',
      description: `Add ₹${amount} credits`,
      prefill: { email: req.user.email },
    });
  } catch (err) {
    console.error('create-order error:', err.message);
    res.status(500).json({ error: err.error?.description || err.message || 'Failed to create payment order' });
  }
});

// POST /api/billing/verify — verify Razorpay payment signature
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) return res.status(503).json({ error: 'Payment gateway not configured' });

    const expectedSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });
    }

    // Credits to add = amount in rupees
    const credits = Math.round(amount / 100); // amount is in paise
    await addCredits(req.user.id, credits, `Razorpay top-up — ₹${credits}`, null, razorpay_payment_id);

    res.json({ success: true, credits_added: credits });
  } catch (err) {
    console.error('verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
