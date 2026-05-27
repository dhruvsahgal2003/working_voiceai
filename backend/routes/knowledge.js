const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth);

// GET /api/knowledge
router.get('/', async (req, res) => {
  try {
    const { agent_id } = req.query;
    let query = db.from('knowledge_base').select('*')
      .eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (agent_id) query = query.eq('agent_id', agent_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ documents: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/knowledge/upload — upload PDF, DOCX, TXT
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    let content = '';
    const name = file.originalname.toLowerCase();
    const mime = file.mimetype;

    if (name.endsWith('.pdf') || mime === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(file.buffer);
      content = data.text;
    } else if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else if (name.endsWith('.doc')) {
      return res.status(400).json({ error: 'Old .doc format not supported. Please save as .docx' });
    } else if (name.endsWith('.txt') || mime === 'text/plain') {
      content = file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Upload PDF, DOCX, or TXT.' });
    }

    content = content.replace(/\n{3,}/g, '\n\n').replace(/\r/g, '').trim();
    if (!content || content.length < 10) return res.status(400).json({ error: 'Could not extract text from file' });

    const title = (req.body.title || file.originalname).replace(/\.[^/.]+$/, '');

    const { data, error } = await db.from('knowledge_base').insert({
      id: uuidv4(),
      user_id: req.user.id,
      agent_id: req.body.agent_id || null,
      title,
      content,
      type: 'document',
      word_count: content.split(/\s+/).filter(Boolean).length,
    }).select().single();
    if (error) throw error;

    res.json({ document: data });
  } catch (err) {
    console.error('upload error:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// POST /api/knowledge
router.post('/', async (req, res) => {
  try {
    const { title, content, type = 'text', agent_id } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });

    const { data, error } = await db.from('knowledge_base').insert({
      id: uuidv4(),
      user_id: req.user.id,
      agent_id: agent_id || null,
      title, content, type,
      word_count: content.split(/\s+/).filter(Boolean).length,
    }).select().single();
    if (error) throw error;
    res.json({ document: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/knowledge/:id
router.patch('/:id', async (req, res) => {
  try {
    const { title, content, agent_id } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (content !== undefined) { update.content = content; update.word_count = content.split(/\s+/).filter(Boolean).length; }
    if (agent_id !== undefined) update.agent_id = agent_id;

    const { data, error } = await db.from('knowledge_base')
      .update(update).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json({ document: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/knowledge/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.from('knowledge_base').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
