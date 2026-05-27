// Analytics routes — dashboard stats, daily volume, outcomes, cities, cost breakdown
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/analytics/summary
router.get('/summary', async (req, res) => {
  try {
    const { campaign_id } = req.query;
    const uid = req.user.id;

    let leadsQ = supabase.from('leads').select('status', { count: 'exact' }).eq('user_id', uid);
    let callsQ = supabase.from('call_logs').select('duration_seconds, outcome, hot_lead, call_status, cost_total, created_at', { count: 'exact' }).eq('user_id', uid);
    if (campaign_id) { leadsQ = leadsQ.eq('campaign_id', campaign_id); callsQ = callsQ.eq('campaign_id', campaign_id); }

    const [{ data: leads }, { data: calls, count: totalCalls }] = await Promise.all([leadsQ, callsQ]);

    const statusCounts = {};
    (leads || []).forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

    const outcomeCounts = {};
    let totalDuration = 0, hotLeadsCount = 0, totalCost = 0, completedCalls = 0;
    (calls || []).forEach(c => {
      outcomeCounts[c.outcome || 'unknown'] = (outcomeCounts[c.outcome || 'unknown'] || 0) + 1;
      totalDuration += parseInt(c.duration_seconds) || 0;
      totalCost += parseFloat(c.cost_total) || 0;
      if (c.hot_lead) hotLeadsCount++;
      if (c.call_status !== 'initiated') completedCalls++;
    });

    const answerRate = (totalCalls || 0) > 0 ? ((completedCalls / totalCalls) * 100).toFixed(1) : 0;
    const avgDuration = completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0;
    const conversionRate = (totalCalls || 0) > 0 ? ((hotLeadsCount / totalCalls) * 100).toFixed(1) : 0;

    const today = new Date().toISOString().split('T')[0];
    const { count: todayCalls } = await supabase.from('call_logs').select('id', { count: 'exact' }).eq('user_id', uid).gte('created_at', `${today}T00:00:00`);

    const { data: userBal } = await supabase.from('users').select('credit_balance').eq('id', uid).single();

    res.json({
      total_leads: (leads || []).length, total_calls: totalCalls || 0, today_calls: todayCalls || 0,
      hot_leads: hotLeadsCount, answer_rate: parseFloat(answerRate), avg_duration_sec: avgDuration,
      conversion_rate: parseFloat(conversionRate), total_cost_inr: +totalCost.toFixed(2),
      credit_balance: userBal?.credit_balance || 0,
      lead_status_breakdown: statusCounts, call_outcome_breakdown: outcomeCounts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/daily
router.get('/daily', async (req, res) => {
  try {
    const { campaign_id } = req.query;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase.from('call_logs').select('created_at, outcome, hot_lead, duration_seconds, cost_total')
      .eq('user_id', req.user.id).gte('created_at', thirtyDaysAgo).order('created_at', { ascending: true });
    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    const { data, error } = await query;
    if (error) throw error;

    const byDate = {};
    (data || []).forEach(c => {
      const date = c.created_at.split('T')[0];
      if (!byDate[date]) byDate[date] = { date, calls: 0, hot_leads: 0, total_duration: 0, cost: 0 };
      byDate[date].calls++;
      if (c.hot_lead) byDate[date].hot_leads++;
      byDate[date].total_duration += parseInt(c.duration_seconds) || 0;
      byDate[date].cost += parseFloat(c.cost_total) || 0;
    });
    res.json(Object.values(byDate));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/outcomes
router.get('/outcomes', async (req, res) => {
  try {
    const { campaign_id } = req.query;
    let query = supabase.from('call_logs').select('outcome').eq('user_id', req.user.id);
    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    const { data, error } = await query;
    if (error) throw error;

    const counts = {};
    (data || []).forEach(c => { const k = c.outcome || 'unknown'; counts[k] = (counts[k] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json(Object.entries(counts).map(([outcome, count]) => ({
      outcome, count, percentage: total > 0 ? +((count / total) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.count - a.count));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/cities
router.get('/cities', async (req, res) => {
  try {
    const { data, error } = await supabase.from('leads').select('city, status').eq('user_id', req.user.id).not('city', 'is', null);
    if (error) throw error;
    const cities = {};
    (data || []).forEach(l => {
      const city = l.city || 'Unknown';
      if (!cities[city]) cities[city] = { city, total: 0, hot: 0 };
      cities[city].total++;
      if (l.status === 'hot_lead') cities[city].hot++;
    });
    res.json(Object.values(cities).sort((a, b) => b.total - a.total).slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/export
router.get('/export', async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = supabase.from('call_logs')
      .select('*, leads(name, phone, city, property_type)').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5000);
    if (from) query = query.gte('created_at', from);
    if (to)   query = query.lte('created_at', to);
    const { data } = await query;

    const headers = ['date', 'lead_name', 'phone', 'city', 'outcome', 'duration_s', 'hot_lead', 'intent', 'budget', 'cost'];
    const rows = (data || []).map(c => [
      c.created_at?.split('T')[0], c.leads?.name, c.leads?.phone, c.leads?.city,
      c.outcome, c.duration_seconds, c.hot_lead, c.intent, c.budget_range, c.cost_total,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="calls-export.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
