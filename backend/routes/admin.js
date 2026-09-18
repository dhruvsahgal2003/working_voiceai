// Admin routes — only accessible by users with is_admin=true
const express = require('express');
const router = express.Router();
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(requireAuth, requireAdmin);

// GET /api/admin/stats — system-wide stats
router.get('/stats', async (req, res) => {
  try {
    const [users, calls, campaigns, recharges] = await Promise.all([
      db.from('users').select('id, email, name, company, credit_balance, is_active, created_at', { count: 'exact' }),
      db.from('call_logs').select('id, cost_total, call_status, created_at', { count: 'exact' }),
      db.from('campaigns').select('id, status', { count: 'exact' }),
      db.from('billing_transactions').select('amount').eq('type', 'credit_added'),
    ]);

    const totalRevenue = (calls.data || []).reduce((s, c) => s + (c.cost_total || 0), 0);
    const activeUsers = (users.data || []).filter(u => u.is_active).length;
    const totalCredits = (users.data || []).reduce((s, u) => s + (u.credit_balance || 0), 0);
    const totalRecharges = (recharges.data || []).reduce((s, r) => s + (r.amount || 0), 0);

    // Today's calls
    const today = new Date().toISOString().slice(0, 10);
    const todayCalls = (calls.data || []).filter(c => (c.created_at || '').startsWith(today)).length;

    res.json({
      total_users: users.count || 0,
      active_users: activeUsers,
      total_calls: calls.count || 0,
      today_calls: todayCalls,
      total_revenue: +totalRevenue.toFixed(2),
      total_credits_held: +totalCredits.toFixed(2),
      total_campaigns: campaigns.count || 0,
      total_recharges: +totalRecharges.toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/daily — system-wide daily call volumes (last 14 days)
router.get('/daily', async (req, res) => {
  try {
    const days = 14;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: calls } = await db.from('call_logs')
      .select('created_at, call_status, cost_total')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    // Group by date
    const byDate = {};
    (calls || []).forEach(c => {
      const date = (c.created_at || '').slice(0, 10);
      if (!date) return;
      if (!byDate[date]) byDate[date] = { date, calls: 0, revenue: 0, answered: 0 };
      byDate[date].calls++;
      byDate[date].revenue += c.cost_total || 0;
      if (c.call_status === 'completed') byDate[date].answered++;
    });

    // Fill missing days
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      result.push(byDate[d] || { date: d, calls: 0, revenue: 0, answered: 0 });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/recharges — recent credit top-ups across all users
router.get('/recharges', async (req, res) => {
  try {
    const { data, error } = await db.from('billing_transactions')
      .select('id, user_id, amount, balance_after, description, created_at')
      .eq('type', 'credit_added')
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) throw error;

    // Fetch user details for all unique user_ids
    const userIds = [...new Set((data || []).map(r => r.user_id).filter(Boolean))];
    let usersMap = {};
    if (userIds.length) {
      const { data: usersData } = await db.from('users')
        .select('id, name, email')
        .in('id', userIds);
      (usersData || []).forEach(u => { usersMap[u.id] = u; });
    }

    const enriched = (data || []).map(r => ({
      ...r,
      user: usersMap[r.user_id] || null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — list all users with call counts
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 100, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = db.from('users')
      .select('id, email, name, company, credit_balance, is_active, is_admin, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);

    const { data: users, error, count } = await query;
    if (error) throw error;

    // Get call counts per user
    const userIds = (users || []).map(u => u.id);
    let callCountsMap = {};
    let lastRechargeMap = {};

    if (userIds.length) {
      // Call counts
      const { data: callCounts } = await db.from('call_logs')
        .select('user_id')
        .in('user_id', userIds);
      (callCounts || []).forEach(c => {
        callCountsMap[c.user_id] = (callCountsMap[c.user_id] || 0) + 1;
      });

      // Last recharge per user
      const { data: recharges } = await db.from('billing_transactions')
        .select('user_id, amount, created_at')
        .eq('type', 'credit_added')
        .in('user_id', userIds)
        .order('created_at', { ascending: false });

      // Only keep the latest per user
      (recharges || []).forEach(r => {
        if (!lastRechargeMap[r.user_id]) {
          lastRechargeMap[r.user_id] = { amount: r.amount, date: r.created_at };
        }
      });
    }

    const enriched = (users || []).map(u => ({
      ...u,
      total_calls: callCountsMap[u.id] || 0,
      last_recharge: lastRechargeMap[u.id] || null,
    }));

    res.json({ users: enriched, total: count, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id — toggle active/admin
router.patch('/users/:id', async (req, res) => {
  try {
    const { is_active, is_admin, credit_balance } = req.body;
    const update = {};
    if (is_active !== undefined) update.is_active = is_active;
    if (is_admin !== undefined) update.is_admin = is_admin;
    if (credit_balance !== undefined) update.credit_balance = credit_balance;

    const { data, error } = await db.from('users').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/credits — add credits to a user
router.post('/users/:id/credits', async (req, res) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Positive amount required' });

    const billing = require('../services/billing');
    const newBalance = await billing.addCredits(req.params.id, amount, null, null);
    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API KEY MONITORING ──────────────────────────────────────────────────────
// Sarvam, Groq and Plivo are the three keys that carry prepaid credit. See
// services/keyHealth.js for why Plivo is the only one with a real balance and
// why live-call failures are tracked separately from the periodic probe.

// GET /api/admin/api-keys — current health of all three keys
router.get('/api-keys', async (req, res) => {
  try {
    const keyHealth = require('../services/keyHealth');
    const keys = await keyHealth.getAll();
    // needs_attention drives the alert badge: anything that is not a clean OK.
    const needsAttention = keys.filter(k => k.status !== 'ok');
    res.json({
      keys,
      needs_attention: needsAttention.map(k => k.provider),
      recharge_now: keys.filter(k => k.status === 'out_of_credit').map(k => k.provider),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/api-keys/check — force an immediate re-probe (the "Check now"
// button), optionally for a single provider.
router.post('/api-keys/check', async (req, res) => {
  try {
    const keyHealth = require('../services/keyHealth');
    const { provider } = req.body || {};
    if (provider) {
      if (!keyHealth.PROVIDER_IDS.includes(provider)) {
        return res.status(400).json({ error: `Unknown provider: ${provider}` });
      }
      await keyHealth.probeProvider(provider);
    } else {
      await keyHealth.probeAll();
    }
    res.json({ keys: await keyHealth.getAll() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
