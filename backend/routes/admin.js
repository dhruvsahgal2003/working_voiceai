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
    const [users, calls, campaigns] = await Promise.all([
      db.from('users').select('id, email, name, company, credit_balance, is_active, created_at', { count: 'exact' }),
      db.from('call_logs').select('id, cost_total, call_status, created_at', { count: 'exact' }),
      db.from('campaigns').select('id, status', { count: 'exact' }),
    ]);

    const totalRevenue = (calls.data || []).reduce((s, c) => s + (c.cost_total || 0), 0);
    const activeUsers = (users.data || []).filter(u => u.is_active).length;
    const totalCredits = (users.data || []).reduce((s, u) => s + (u.credit_balance || 0), 0);

    res.json({
      total_users: users.count || 0,
      active_users: activeUsers,
      total_calls: calls.count || 0,
      total_revenue: +totalRevenue.toFixed(2),
      total_credits_held: +totalCredits.toFixed(2),
      total_campaigns: campaigns.count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = db.from('users')
      .select('id, email, name, company, credit_balance, is_active, is_admin, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ users: data || [], total: count, page: parseInt(page) });
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

module.exports = router;
