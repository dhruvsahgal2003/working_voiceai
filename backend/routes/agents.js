// Agents routes — CRUD for AI voice agent configurations
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/agents
router.get('/', async (req, res) => {
  try {
    const { data, error } = await db.from('agents').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ agents: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await db.from('agents').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();
    if (error || !data) return res.status(404).json({ error: 'Agent not found' });
    res.json({ agent: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents
router.post('/', async (req, res) => {
  try {
    const {
      name, system_prompt, first_message, language = 'en-IN',
      stt_model = 'saarika:v2.5', tts_model = 'bulbul:v3', tts_speaker = 'anushka',
      llm_provider = 'sarvam', llm_model = 'sarvam-30b', llm_temperature = 0.7,
      realtime_voice,
      max_duration_minutes = 5, silence_timeout_seconds = 10,
      end_call_phrases = ['goodbye', 'bye', 'thank you'],
      analysis_schema = {}, tools = [],
      voicemail_detection = true, voicemail_message,
      recording_enabled = true,
    } = req.body;

    if (!name || !system_prompt) return res.status(400).json({ error: 'name and system_prompt are required' });

    const basePayload = {
      id: uuidv4(),
      user_id: req.user.id,
      name, system_prompt, first_message, language,
      stt_model, tts_model, tts_speaker,
      llm_provider, llm_model, llm_temperature,
      max_duration_minutes, end_call_phrases,
      analysis_schema, voicemail_detection, recording_enabled,
    };
    const extPayload = { ...basePayload, silence_timeout_seconds, tools, voicemail_message, realtime_voice };

    let { data, error } = await db.from('agents').insert(extPayload).select('*').single();
    // If extended columns are missing (42703/PGRST204), retry with base columns only
    if (error && (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('column'))) {
      ({ data, error } = await db.from('agents').insert(basePayload).select('*').single());
    }
    if (error) throw error;
    res.status(201).json({ agent: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/agents/:id
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'name', 'system_prompt', 'first_message', 'language',
      'stt_model', 'tts_model', 'tts_speaker', 'realtime_voice',
      'llm_provider', 'llm_model', 'llm_temperature',
      'max_duration_minutes', 'silence_timeout_seconds',
      'end_call_phrases', 'analysis_schema', 'tools',
      'voicemail_detection', 'voicemail_message', 'recording_enabled', 'is_active',
    ];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    const { data, error } = await db.from('agents').update(updates)
      .eq('id', req.params.id).eq('user_id', req.user.id).select('*').single();
    if (error || !data) return res.status(404).json({ error: error?.message || 'Agent not found' });
    res.json({ agent: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.from('agents').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/generate-prompt — AI-powered system prompt generation
router.post('/generate-prompt', async (req, res) => {
  try {
    const { company_name, industry, use_case, tone, language, extra } = req.body;
    if (!company_name || !use_case) return res.status(400).json({ error: 'company_name and use_case are required' });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: 'OpenAI API key not configured' });

    const axios = require('axios');
    const isHindi = (language || '').startsWith('hi');
    const langLabel = isHindi ? 'Hindi (Hinglish mix OK)' : 'English (Indian accent, natural)';

    const systemMsg = `You write comprehensive, production-ready system prompts for AI voice calling agents.
Output a structured script with these EXACT section headers (use ## prefix):

## Objective
## Response Guidelines
## Conversation Script
## Objection Handling
## Closing
## FAQs

Rules:
- Write in ${langLabel}
- Natural spoken language — no corporate jargon
- Conversation Script must have numbered Steps with branching (IF/THEN)
- FAQs must have 3–5 real questions with scripted answers
- Total length: 600–900 words
- Output ONLY the structured script. No preamble, no meta-commentary.`;

    const userMsg = `Create a voice agent script for:

Company: ${company_name}
Industry: ${industry || 'General'}
Use Case: ${use_case}
Tone: ${tone || 'Professional & Friendly'}
Language: ${langLabel}
${extra ? `Context: ${extra}` : ''}

Generate a complete, realistic calling script that sounds human and achieves the use case goal.`;

    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 1200,
      temperature: 0.7,
    }, { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } });

    const prompt = resp.data.choices[0].message.content.trim();

    // Generate first message separately
    const firstMsgResp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Write the opening line an AI voice agent says when a call connects. 1-2 sentences only. Warm, natural, introduces agent name and company. Language: ${langLabel}.` },
        { role: 'user', content: `Company: ${company_name}, Use case: ${use_case}. Agent should introduce themselves and state purpose. Use a common Indian name for the agent.` },
      ],
      max_tokens: 80,
      temperature: 0.8,
    }, { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } });

    const first_message = firstMsgResp.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

    res.json({ prompt, first_message });
  } catch (err) {
    console.error('generate-prompt error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// GET /api/internal/agent-config?room=xxx  (called by Python agent — no auth, uses internal secret)
// Registered separately in server.js under /api/internal

module.exports = router;
