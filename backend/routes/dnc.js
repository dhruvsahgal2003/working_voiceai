// DNC (Do Not Call) list routes — per-user scoped
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const supabase = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/dnc
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('dnc_list').select('*').eq('user_id', req.user.id).order('added_at', { ascending: false });
    if (error) throw error;
    res.json({ dnc: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dnc
router.post('/', async (req, res) => {
  try {
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const raw = phone.trim().replace(/\s/g, '');
    const normalizedPhone = raw.startsWith('+91') ? raw : raw.startsWith('91') ? `+${raw}` : raw.length === 10 ? `+91${raw}` : raw;
    const { data, error } = await supabase.from('dnc_list')
      .upsert({ id: uuidv4(), phone: normalizedPhone, user_id: req.user.id, reason: reason || 'Manual' }, { onConflict: 'phone,user_id' }).select().single();
    if (error) throw error;
    await supabase.from('leads').update({ status: 'dnc', updated_at: new Date().toISOString() }).eq('phone', normalizedPhone).eq('user_id', req.user.id);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dnc/:id
router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('dnc_list').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dnc/import — bulk CSV import
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const records = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    let added = 0;
    for (const row of records) {
      const phone = (row.phone || row.Phone || row.mobile || '').trim().replace(/\s/g, '');
      if (!phone) continue;
      const normalized = phone.startsWith('+91') ? phone : phone.startsWith('91') ? `+${phone}` : phone.length === 10 ? `+91${phone}` : phone;
      await supabase.from('dnc_list').upsert({ id: uuidv4(), phone: normalized, user_id: req.user.id, reason: 'CSV import' }, { onConflict: 'phone,user_id' });
      await supabase.from('leads').update({ status: 'dnc' }).eq('phone', normalized).eq('user_id', req.user.id);
      added++;
    }
    res.json({ added, total: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
