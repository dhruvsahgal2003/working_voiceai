// Agents routes — CRUD for AI voice agent configurations
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');
const promptCompiler = require('../services/promptCompiler');

// When prompt_spec is supplied, system_prompt becomes derived state: the operator
// edits the spec, we compile it. Accepting a hand-edited system_prompt alongside a
// spec would let the two drift, and the call only ever reads system_prompt.
function applyPromptSpec(payload, body) {
  if (body.prompt_spec === undefined) return payload;
  if (body.prompt_spec === null) {
    return { ...payload, prompt_spec: null };
  }
  return {
    ...payload,
    prompt_spec: body.prompt_spec,
    system_prompt: promptCompiler.compile(body.prompt_spec),
  };
}

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
      hangup_on_not_interested = true, not_interested_message, not_interested_phrases,
      transfer_enabled = false, transfer_phone_number, transfer_prompt, transfer_message,
      transfer_trigger_phrases,
      prompt_spec,
    } = req.body;

    // A spec compiles into system_prompt, so it satisfies the requirement on its own.
    let compiledPrompt = system_prompt;
    if (prompt_spec) {
      try {
        compiledPrompt = promptCompiler.compile(prompt_spec);
      } catch (e) {
        return res.status(400).json({ error: `Invalid prompt_spec: ${e.message}` });
      }
    }
    if (!name || !compiledPrompt) return res.status(400).json({ error: 'name and system_prompt (or prompt_spec) are required' });

    const basePayload = {
      id: uuidv4(),
      user_id: req.user.id,
      name, system_prompt: compiledPrompt, first_message, language,
      stt_model, tts_model, tts_speaker,
      llm_provider, llm_model, llm_temperature,
      max_duration_minutes, end_call_phrases,
      analysis_schema, voicemail_detection, recording_enabled,
    };
    const extPayload = {
      ...basePayload, silence_timeout_seconds, tools, voicemail_message, realtime_voice,
      hangup_on_not_interested, not_interested_message,
      not_interested_phrases: not_interested_phrases || [],
      transfer_enabled, transfer_phone_number, transfer_prompt, transfer_message,
      transfer_trigger_phrases: transfer_trigger_phrases || [],
      ...(prompt_spec ? { prompt_spec } : {}),
    };

    let { data, error } = await db.from('agents').insert(extPayload).select('*').single();
    // If extended columns are missing (42703/PGRST204), retry with base columns only
    // Log loudly: this fallback silently discarded every extended field for months
    // because `realtime_voice` was missing from the schema. A quiet fallback that
    // drops user data is worse than a failed insert.
    if (error) console.error('[agents] extended insert failed, falling back to base columns:', error.code, error.message);
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
      // Auto-hangup on disinterest + warm transfer to a human
      'hangup_on_not_interested', 'not_interested_message', 'not_interested_phrases',
      'transfer_enabled', 'transfer_phone_number', 'transfer_prompt', 'transfer_message',
      'transfer_trigger_phrases',
    ];
    let updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    try {
      updates = applyPromptSpec(updates, req.body);
    } catch (e) {
      return res.status(400).json({ error: `Invalid prompt_spec: ${e.message}` });
    }
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

// POST /api/agents/compile-prompt — live preview of what a spec compiles to.
// Pure function, no DB write: the editor calls this on every change so the
// operator can see the exact text the model will receive.
router.post('/compile-prompt', (req, res) => {
  try {
    res.json({ system_prompt: promptCompiler.compile(req.body.prompt_spec || req.body) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents/parse-prompt — turn a pasted free-text prompt into a spec.
//
// This is what makes "whatever format the operator writes, the output is
// standardized" actually true: the extraction is allowed to be messy and
// model-driven, because everything downstream of the spec is deterministic.
// The model only fills fields — it never writes the rules or the section order.
router.post('/parse-prompt', async (req, res) => {
  try {
    const { system_prompt, language } = req.body;
    if (!system_prompt || !system_prompt.trim()) {
      return res.status(400).json({ error: 'system_prompt is required' });
    }
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(503).json({ error: 'OpenAI API key not configured' });

    const isHindi = (language || '').startsWith('hi');
    const schema = {
      persona: { agent_name: '', company: '', role: '', tone: '' },
      // 'roman' is the house default for Hindi now (Hinglish, as people actually
      // text it) — promptCompiler.js only writes Devanagari when script is
      // explicitly 'devanagari'. See gotcha_hindi_stt_tts_script memory.
      language: { primary: isHindi ? 'hi' : 'en', script: isHindi ? 'roman' : 'latin', roman_terms: [] },
      goal: '',
      opening_line: '',
      facts: [{ label: '', value: '' }],
      deflections: [{ when: '', say: '' }],
      closing: { success: '', not_interested: '' },
      constraints: { max_words_per_reply: 15 },
    };

    const axios = require('axios');
    const resp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract a structured spec from a voice-agent system prompt. ' +
            'Return ONLY JSON matching this shape:\n' + JSON.stringify(schema, null, 2) +
            '\n\nRules:\n' +
            '- Copy wording from the source prompt verbatim where possible. Do not invent facts.\n' +
            '- facts: only concrete, checkable claims (project name, tower count, configurations, builder). ' +
            'Anything the prompt says to defer belongs in deflections, not facts.\n' +
            '- deflections: {when, say} for topics the agent must NOT answer directly.\n' +
            '- opening_line: the single line the prompt says to open with, if any.\n' +
            '- roman_terms: brand names and technical terms that must stay in Latin script.\n' +
            '- Omit behavioural rules (length limits, "no markdown", "do not repeat"). ' +
            'Those are applied automatically and must not appear in any field.\n' +
            '- Use empty strings / empty arrays for anything not present.',
        },
        { role: 'user', content: system_prompt },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    }, { headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } });

    const spec = JSON.parse(resp.data.choices[0].message.content);
    res.json({ prompt_spec: spec, system_prompt: promptCompiler.compile(spec) });
  } catch (err) {
    console.error('parse-prompt error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
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
