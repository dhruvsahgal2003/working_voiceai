// Auth routes — register, login, Google OAuth, profile
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/supabase');
const { signToken, requireAuth } = require('../middleware/auth');

const TEMPLATE_AGENTS = [
  {
    name: 'Lead Qualifier (English)',
    first_message: "Hello! I'm calling to follow up on your recent enquiry. Is this a good time for a quick 2-minute conversation?",
    system_prompt: `You are a professional AI calling agent. Your goal is to qualify inbound leads who have shown interest in the company's products or services.

Objectives for each call:
1. Confirm the lead's interest and understand their requirement
2. Find out their budget or investment capacity
3. Ask about their timeline — when do they need this?
4. Identify the decision-maker and any blockers
5. If interested, schedule a callback with the sales team

Be friendly, concise, and professional. Keep the conversation under 3 minutes. Speak naturally — never sound scripted. End the call politely if the person is not interested or is a wrong number.`,
    language: 'en-IN',
    tts_speaker: 'anushka',
    voicemail_message: "Hi, this is a call regarding your recent enquiry. Please call us back at your convenience. Thank you.",
    analysis_schema: { interested: 'boolean', budget_range: 'string', timeline: 'string', decision_maker: 'boolean', callback_time: 'string' },
  },
  {
    name: 'Lead Qualifier (Hindi)',
    first_message: "Namaste! Main aapki recent enquiry ke baare mein call kar raha hoon. Kya aap 2 minute baat kar sakte hain?",
    system_prompt: `Aap ek professional AI calling agent hain. Aapka kaam un leads ko qualify karna hai jo company ke products ya services mein interested hain.

Har call ke liye objectives:
1. Lead ki interest confirm karein aur requirement samjhein
2. Unka budget ya investment capacity poochhen
3. Timeline check karein — kab chahiye unhe?
4. Decision maker kaun hai aur koi blocker hai?
5. Agar interested ho toh sales team ke saath callback schedule karein

Dosto ki tarah baat karein — natural aur professional. Call 3 minute se kam rakhein. Agar interested nahi hain toh shaalinta se call khatam karein.`,
    language: 'hi-IN',
    tts_speaker: 'meera',
    voicemail_message: "Namaste, yeh aapki enquiry ke baare mein ek call hai. Kripaya humein wapas call karein. Dhanyawad.",
    analysis_schema: { interested: 'boolean', budget_range: 'string', timeline: 'string', callback_time: 'string' },
  },
  {
    name: 'Payment Reminder',
    first_message: "Hello! Am I speaking with [Name]? This is a reminder call regarding your upcoming payment. Do you have a moment?",
    system_prompt: `You are a polite and professional payment reminder agent. Your goal is to remind customers about upcoming or overdue payments and collect a commitment date.

Objectives:
1. Confirm you are speaking with the right person
2. Inform them of the outstanding amount and due date
3. Ask if they are able to make the payment today or give a specific date
4. If they face difficulty, offer to escalate to a human agent
5. Always be respectful — never threatening or aggressive

Keep the call brief and professional. Record the commitment date if given. Thank them for their time before ending.`,
    language: 'en-IN',
    tts_speaker: 'anushka',
    voicemail_message: "Hello, this is a reminder regarding your payment. Please call us back or visit our website to complete your payment. Thank you.",
    analysis_schema: { payment_confirmed: 'boolean', commitment_date: 'string', reason_for_delay: 'string', escalation_needed: 'boolean' },
  },
];

async function seedTemplateAgents(userId) {
  for (const tmpl of TEMPLATE_AGENTS) {
    await db.from('agents').insert({
      id: uuidv4(),
      user_id: userId,
      name: tmpl.name,
      system_prompt: tmpl.system_prompt,
      first_message: tmpl.first_message,
      language: tmpl.language || 'en-IN',
      stt_model: 'saarika:v2.5',
      tts_model: 'bulbul:v3',
      tts_speaker: tmpl.tts_speaker || 'anushka',
      llm_provider: 'sarvam',
      llm_model: 'sarvam-30b',
      llm_temperature: 0.7,
      max_duration_minutes: 5,
      silence_timeout_seconds: 10,
      end_call_phrases: ['goodbye', 'bye', 'thank you', 'dhanyawad', 'shukriya'],
      analysis_schema: tmpl.analysis_schema || {},
      tools: [],
      voicemail_detection: true,
      voicemail_message: tmpl.voicemail_message,
      recording_enabled: true,
      is_active: true,
    });
  }
}

// Helper: run a supabase query silently (swallow errors)
async function tryDb(query) { try { await query; } catch (_) {} }

// ─── REGISTER ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, company } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const cleanEmail = email.toLowerCase().trim();
    const isAdmin = cleanEmail === (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const passwordHash = await bcrypt.hash(password, 12);

    const userId = uuidv4();
    const { data: user, error } = await db.from('users').insert({
      id: userId,
      email: cleanEmail,
      password_hash: passwordHash,
      name: name || '',
      company: company || '',
      credit_balance: 500,
    }).select('id,email,name,company,credit_balance,created_at').single();

    if (error) {
      if (error.message?.includes('unique') || error.code === '23505')
        return res.status(409).json({ error: 'Email already registered' });
      throw error;
    }

    // Set is_admin — silently fails if column not yet migrated
    if (isAdmin) {
      await tryDb(db.from('users').update({ is_admin: true }).eq('id', user.id));
    }
    user.is_admin = isAdmin;

    // Non-critical post-registration work — never block the response
    await tryDb(db.from('user_credentials').insert({ user_id: user.id }));
    await tryDb(db.from('events').insert({
      user_id: user.id, type: 'account.created', title: 'Welcome to Callora!',
      body: 'You have ₹500 free credits to get started. Configure your first assistant and launch a campaign.',
    }));

    // Seed template agents so new users see real examples
    try { await seedTemplateAgents(user.id); } catch (_) {}

    const token = signToken({ id: user.id, email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data: user } = await db.from('users').select('*').eq('email', email.toLowerCase().trim()).single();
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ id: user.id, email: user.email });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── GOOGLE OAUTH ─────────────────────────────────────────────────────────────
// GET /api/auth/google — redirect to Google
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'Google OAuth not configured' });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.WEBHOOK_BASE_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;
  if (oauthError || !code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_cancelled`);

  try {
    const axios = require('axios');
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.WEBHOOK_BASE_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    });

    // Get user profile
    const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });
    const profile = profileRes.data;
    const email = profile.email.toLowerCase();

    // Find or create user
    let { data: user } = await db.from('users').select('*').eq('email', email).single();
    if (!user) {
      const isAdmin = email === (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
      const { data: newUser, error } = await db.from('users').insert({
        id: uuidv4(),
        email,
        password_hash: '',
        name: profile.name || '',
        google_id: profile.sub,
        credit_balance: 500,
        is_admin: isAdmin,
      }).select('*').single();
      if (error) throw error;
      user = newUser;
      await tryDb(db.from('user_credentials').insert({ user_id: user.id }));
      await tryDb(db.from('events').insert({
        user_id: user.id, type: 'account.created', title: 'Welcome to Callora!',
        body: 'You have ₹500 free credits. Configure your first assistant and launch a campaign.',
      }));
      try { await seedTemplateAgents(user.id); } catch (_) {}
    } else if (!user.google_id) {
      await db.from('users').update({ google_id: profile.sub }).eq('id', user.id);
    }

    if (!user.is_active) return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_suspended`);

    const token = signToken({ id: user.id, email: user.email });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=google_failed`);
  }
});

// ─── ME ───────────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: user, error } = await db.from('users').select('*').eq('id', req.user.id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (error) throw error;
    const { password_hash, ...safe } = user;
    res.json({ user: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PROFILE ──────────────────────────────────────────────────────────────────
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const allowed = ['name', 'company', 'timezone', 'credit_alert_threshold'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (req.body.password) {
      if (req.body.password.length < 8) return res.status(400).json({ error: 'Password too short' });
      updates.password_hash = await bcrypt.hash(req.body.password, 12);
    }
    const { data: user } = await db.from('users').update(updates).eq('id', req.user.id).select('*').single();
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
