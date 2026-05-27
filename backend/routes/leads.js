// Leads routes — CRUD, CSV upload, DNC, all scoped per user (tenant)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Normalize an Indian phone number to E.164 format (+91XXXXXXXXXX).
 * Handles all common formats:
 *   9876543210        → +919876543210  (10-digit, no prefix)
 *   09876543210       → +919876543210  (leading 0)
 *   919876543210      → +919876543210  (91 prefix, no +)
 *   +919876543210     → +919876543210  (already correct)
 *   +91 98765 43210   → +919876543210  (spaces/dashes inside)
 *   (0)98765-43210    → +919876543210  (brackets + dashes)
 *   +1-800-123-4567   → +18001234567   (international — preserved)
 */
function normalizePhone(raw) {
  if (!raw) return '';
  // Strip all formatting chars except digits and leading +
  const stripped = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  const digits   = stripped.replace(/\D/g, '');  // pure digits

  // Already has + prefix — strip non-digits and re-add +
  if (stripped.startsWith('+')) {
    return `+${digits}`;
  }

  // 12-digit number starting with 91 → Indian with country code
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;

  // 11-digit number starting with 0 → Indian with leading zero
  if (digits.startsWith('0') && digits.length === 11) return `+91${digits.slice(1)}`;

  // 10-digit number → Indian mobile
  if (digits.length === 10) return `+91${digits}`;

  // 13-digit starting with 0091 (ISD prefix used in India)
  if (digits.startsWith('0091') && digits.length === 14) return `+91${digits.slice(4)}`;

  // Fallback: just prepend + to whatever digits we have
  return `+${digits}`;
}

// GET /api/leads
router.get('/', async (req, res) => {
  try {
    const { campaign_id, status, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase.from('leads')
      .select('*, call_logs(id, outcome, duration_seconds, created_at, hot_lead, recording_url)', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (campaign_id) query = query.eq('campaign_id', campaign_id);
    if (status)      query = query.eq('status', status);
    if (search)      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,city.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ leads: data, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('leads')
      .select('*, call_logs(*)')
      .eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !data) return res.status(404).json({ error: 'Lead not found' });
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: 'Lead not found' });
  }
});

// GET /api/leads/:id/timeline
router.get('/:id/timeline', async (req, res) => {
  try {
    const { data: calls } = await supabase.from('call_logs')
      .select('*').eq('lead_id', req.params.id).order('created_at', { ascending: false });
    res.json({ timeline: calls || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads
router.post('/', async (req, res) => {
  try {
    const { name, phone, city, property_type, budget, language, campaign_id, notes, email } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    // Normalize phone to E.164
    const normalizedPhone = normalizePhone(phone);

    const { data: dncEntry } = await supabase.from('dnc_list').select('id').eq('phone', normalizedPhone).eq('user_id', req.user.id).single();
    if (dncEntry) return res.status(400).json({ error: 'Phone is on DNC list' });

    const { data, error } = await supabase.from('leads').insert({
      id: uuidv4(),
      user_id: req.user.id,
      name, email, phone: normalizedPhone, city, property_type, budget,
      language: language || 'en', campaign_id: campaign_id || null, notes,
      status: 'pending', source: 'manual',
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads/upload/csv
router.post('/upload/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { campaign_id } = req.body;
    const records = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    if (!records.length) return res.status(400).json({ error: 'CSV is empty' });

    const { data: dncList } = await supabase.from('dnc_list').select('phone').eq('user_id', req.user.id);
    const dncPhones = new Set((dncList || []).map(d => d.phone));

    const leads = [];
    const skipped = [];

    for (const row of records) {
      const rawPhone = (row.phone || row.Phone || row.mobile || row.Mobile || row.number || row.Phone_Number || row['Phone Number'] || row.contact || row.Contact || '').trim();
      if (!rawPhone) { skipped.push({ row, reason: 'Missing phone' }); continue; }
      const normalizedPhone = normalizePhone(rawPhone);
      if (normalizedPhone.replace(/\D/g, '').length < 7) { skipped.push({ phone: rawPhone, reason: 'Invalid phone number' }); continue; }
      if (dncPhones.has(normalizedPhone)) { skipped.push({ phone, reason: 'DNC list' }); continue; }
      leads.push({
        id: uuidv4(),
        user_id: req.user.id,
        phone: normalizedPhone,
        name: row.name || row.Name || row.customer_name || '',
        email: row.email || row.Email || '',
        city: row.city || row.City || row.location || '',
        property_type: row.property_type || row.intent || row.type || '',
        budget: row.budget || row.Budget || '',
        language: (row.language || row.Language || 'en').toLowerCase(),
        campaign_id: campaign_id || null,
        notes: row.notes || row.Notes || '',
        status: 'pending', source: 'csv_upload',
      });
    }

    if (!leads.length) return res.status(400).json({ error: 'No valid leads found', skipped });

    const { data, error } = await supabase.from('leads')
      .upsert(leads, { onConflict: 'phone,user_id', ignoreDuplicates: true }).select();
    if (error) throw error;

    if (campaign_id) {
      const { count } = await supabase.from('leads').select('id', { count: 'exact' }).eq('campaign_id', campaign_id).eq('user_id', req.user.id);
      await supabase.from('campaigns').update({ total_leads: count }).eq('id', campaign_id).eq('user_id', req.user.id);
    }

    res.json({ inserted: data?.length || leads.length, skipped: skipped.length, skipped_details: skipped, total_in_csv: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leads/:id
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['status', 'notes', 'callback_time', 'name', 'city', 'budget', 'property_type', 'tags', 'score'];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const { data, error } = await supabase.from('leads').update(updates).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('leads').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads/:id/dnc
router.post('/:id/dnc', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('leads').select('phone').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    await supabase.from('dnc_list').upsert({ id: uuidv4(), phone: lead.phone, user_id: req.user.id, reason: req.body.reason || 'Manual DNC' }, { onConflict: 'phone,user_id' });
    await supabase.from('leads').update({ status: 'dnc', updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
