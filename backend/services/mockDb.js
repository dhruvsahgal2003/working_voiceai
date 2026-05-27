// LOCAL MOCK DATABASE — in-memory Supabase API shim for local dev (no Supabase needed)
const { v4: uuidv4 } = require('uuid');

const DEMO_USER_ID = 'demo-user-id-000';
const DEMO_PASS_HASH = '$2b$10$oUW3n0qkPktyjloevcXmMeJaqL5u9MfNT8eSxQfb.PZZsNiRH.ywm'; // "password123"

const store = {
  users: [],
  user_credentials: [],
  campaigns: [],
  leads: [],
  call_logs: [],
  dnc_list: [],
  transcripts: [],
  recordings: [],
  agents: [],
  phone_numbers: [],
  billing_transactions: [],
  events: [],
  user_webhooks: [],
  knowledge_base: [],
};

// ─── QUERY BUILDER ────────────────────────────────────────────────────────────
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._offset = 0;
    this._single = false;
    this._count = false;
    this._select = null;
  }

  select(cols, opts = {}) {
    this._select = cols;
    if (opts && opts.count) this._count = true;
    return this;
  }

  eq(col, val) { this._filters.push(r => String(r[col]) === String(val)); return this; }
  neq(col, val) { this._filters.push(r => String(r[col]) !== String(val)); return this; }

  not(col, op, val) {
    if (op === 'is' && val === null) this._filters.push(r => r[col] !== null && r[col] !== undefined);
    return this;
  }

  gte(col, val) { this._filters.push(r => new Date(r[col]) >= new Date(val)); return this; }
  lte(col, val) { this._filters.push(r => new Date(r[col]) <= new Date(val)); return this; }

  or(query) {
    const parts = query.split(',');
    this._filters.push(r => parts.some(p => {
      const [col, op, val] = p.split('.');
      if (op === 'ilike') return String(r[col] || '').toLowerCase().includes(val.replace(/%/g, '').toLowerCase());
      return false;
    }));
    return this;
  }

  order(col, opts = {}) { this._order = { col, ascending: opts.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  range(from, to) { this._offset = from; this._limit = to - from + 1; return this; }
  single() { this._single = true; return this; }

  _execSync() {
    let data = [...(store[this.table] || [])];
    this._filters.forEach(f => { data = data.filter(f); });
    if (this._order) {
      const { col, ascending } = this._order;
      data.sort((a, b) => { const av = a[col], bv = b[col]; const c = av < bv ? -1 : av > bv ? 1 : 0; return ascending ? c : -c; });
    }
    const total = data.length;
    if (this._offset) data = data.slice(this._offset);
    if (this._limit !== null) data = data.slice(0, this._limit);

    // Resolve relations
    const sel = this._select || '';
    if (sel.includes('call_logs')) {
      data = data.map(row => ({ ...row, call_logs: store.call_logs.filter(cl => cl.lead_id === row.id) }));
    }
    if (sel.includes('leads(')) {
      data = data.map(row => ({ ...row, leads: store.leads.find(l => l.id === row.lead_id) || null }));
    }
    if (sel.includes('leads(*)')) {
      data = data.map(row => ({ ...row, leads: store.leads.find(l => l.id === row.lead_id) || null }));
    }

    if (this._single) {
      if (!data.length) return { data: null, error: { message: 'Not found', code: '404' } };
      return { data: data[0], error: null };
    }
    if (this._count) return { data, error: null, count: total };
    return { data, error: null };
  }

  then(resolve, reject) { return Promise.resolve(this._execSync()).then(resolve, reject); }

  // INSERT
  insert(rows) {
    if (!store[this.table]) store[this.table] = [];
    const arr = Array.isArray(rows) ? rows : [rows];
    const inserted = arr.map(r => {
      const rec = { ...r, id: r.id || uuidv4(), created_at: r.created_at || new Date().toISOString() };
      store[this.table].push(rec);
      return rec;
    });
    const chainable = {
      select: () => ({ single: () => Promise.resolve({ data: inserted[0], error: null }), then(res) { return Promise.resolve({ data: inserted, error: null }).then(res); } }),
      single: () => Promise.resolve({ data: inserted[0], error: null }),
      then(res) { return Promise.resolve({ data: inserted, error: null }).then(res); },
    };
    return chainable;
  }

  // UPSERT
  upsert(rows, opts = {}) {
    if (!store[this.table]) store[this.table] = [];
    const arr = Array.isArray(rows) ? rows : [rows];
    const result = [];
    arr.forEach(r => {
      const existing = store[this.table].find(e => {
        if (opts.onConflict) return opts.onConflict.split(',').every(k => String(e[k.trim()]) === String(r[k.trim()]));
        return e.id === r.id;
      });
      if (existing) { if (!opts.ignoreDuplicates) { Object.assign(existing, r, { updated_at: new Date().toISOString() }); result.push(existing); } }
      else { const rec = { ...r, id: r.id || uuidv4(), created_at: new Date().toISOString() }; store[this.table].push(rec); result.push(rec); }
    });
    return {
      select: () => ({ single: () => Promise.resolve({ data: result[0] || null, error: null }), then(res) { return Promise.resolve({ data: result, error: null }).then(res); } }),
      single: () => Promise.resolve({ data: result[0] || null, error: null }),
      then(res) { return Promise.resolve({ data: result, error: null }).then(res); },
    };
  }

  // UPDATE — supports chained .eq() calls
  update(updates) {
    const table = this.table;
    const filters = [];
    const proxy = {
      eq(col, val) {
        filters.push(r => String(r[col]) === String(val));
        return proxy;
      },
      select() {
        return {
          single() {
            const results = [];
            (store[table] || []).forEach(r => {
              if (filters.every(f => f(r))) { Object.assign(r, updates, { updated_at: new Date().toISOString() }); results.push(r); }
            });
            return Promise.resolve({ data: results[0] || null, error: null });
          },
          then(res) {
            const results = [];
            (store[table] || []).forEach(r => {
              if (filters.every(f => f(r))) { Object.assign(r, updates, { updated_at: new Date().toISOString() }); results.push(r); }
            });
            return Promise.resolve({ data: results, error: null }).then(res);
          },
        };
      },
      single() {
        const results = [];
        (store[table] || []).forEach(r => {
          if (filters.every(f => f(r))) { Object.assign(r, updates, { updated_at: new Date().toISOString() }); results.push(r); }
        });
        return Promise.resolve({ data: results[0] || null, error: null });
      },
      then(res) {
        const results = [];
        (store[table] || []).forEach(r => {
          if (filters.every(f => f(r))) { Object.assign(r, updates, { updated_at: new Date().toISOString() }); results.push(r); }
        });
        return Promise.resolve({ data: results, error: null }).then(res);
      },
    };
    return proxy;
  }

  // DELETE — supports chained .eq() calls
  delete() {
    const table = this.table;
    const filters = [];
    const proxy = {
      eq(col, val) {
        filters.push(r => String(r[col]) === String(val));
        return proxy;
      },
      then(res) {
        store[table] = (store[table] || []).filter(r => !filters.every(f => f(r)));
        return Promise.resolve({ data: null, error: null }).then(res);
      },
    };
    return proxy;
  }
}

// ─── MOCK CLIENT ──────────────────────────────────────────────────────────────
const mockSupabase = {
  from: (table) => {
    if (!store[table]) { store[table] = []; }
    return new QueryBuilder(table);
  },
  _store: store,
};

// ─── SEED DEMO DATA ───────────────────────────────────────────────────────────
function seedDemoData() {
  // Demo user
  const userId = DEMO_USER_ID;
  const adminEmail = process.env.ADMIN_EMAIL || 'demo@propconnect.in';
  store.users.push({
    id: userId, email: adminEmail, password_hash: DEMO_PASS_HASH,
    name: 'Admin', company: 'Callora', timezone: 'Asia/Kolkata',
    credit_balance: 500, credit_alert_threshold: 100, is_active: true, is_admin: true,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  });

  store.user_credentials.push({ id: uuidv4(), user_id: userId, plivo_auth_id: process.env.PLIVO_AUTH_ID || '', livekit_url: '', sarvam_api_key_encrypted: '', updated_at: new Date().toISOString() });

  // Demo agent
  const agentId = uuidv4();
  store.agents.push({
    id: agentId, user_id: userId, name: 'Priya — Real Estate', is_active: true,
    system_prompt: 'You are Priya, a professional property advisor at PropConnect. Collect: intent, BHK, budget, location, timeline.',
    first_message: 'Namaste! Am I speaking with you? This is Priya from PropConnect.',
    language: 'en-IN', stt_model: 'saarika:v2.5', tts_model: 'bulbul:v3', tts_speaker: 'anushka',
    llm_provider: 'sarvam', llm_model: 'sarvam-30b', llm_temperature: 0.7,
    max_duration_minutes: 5, silence_timeout_seconds: 10,
    end_call_phrases: ['goodbye', 'bye', 'thank you'],
    analysis_schema: { interested: 'boolean', outcome: 'string', intent: 'string', budget_range: 'string' },
    tools: [], voicemail_detection: true, recording_enabled: true,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(), updated_at: new Date().toISOString(),
  });

  // Phone numbers
  const numId = uuidv4();
  store.phone_numbers.push({ id: numId, user_id: userId, number: process.env.PLIVO_FROM_NUMBER || '+918035340776', country: 'IN', monthly_cost: 75, is_active: true, created_at: new Date().toISOString() });

  const campId1 = uuidv4();
  const campId2 = uuidv4();
  store.campaigns.push(
    { id: campId1, user_id: userId, agent_id: agentId, name: 'Mumbai Buyers — June', description: 'High-value buyers in Mumbai metro', status: 'draft', start_time: '10:00', end_time: '19:00', rate_per_min: 5, max_concurrent_calls: 5, total_leads: 0, called_count: 0, hot_leads_count: 0, total_cost: 0, created_at: new Date(Date.now() - 86400000 * 2).toISOString(), updated_at: new Date().toISOString() },
    { id: campId2, user_id: userId, agent_id: agentId, name: 'Pune Rental Leads', description: 'Rental seekers in Pune IT corridor', status: 'paused', start_time: '10:00', end_time: '19:00', rate_per_min: 3, max_concurrent_calls: 3, total_leads: 0, called_count: 0, hot_leads_count: 0, total_cost: 0, created_at: new Date(Date.now() - 86400000).toISOString(), updated_at: new Date().toISOString() },
  );

  const leadData = [
    { name: 'Rahul Sharma', phone: '+919876543210', city: 'Mumbai', property_type: 'buy', budget: '1.5 crore', language: 'en', status: 'hot_lead', campaign_id: campId1 },
    { name: 'Priya Patel', phone: '+919812345678', city: 'Mumbai', property_type: 'buy', budget: '2 crore', language: 'hi', status: 'callback', campaign_id: campId1 },
    { name: 'Amit Joshi', phone: '+918765432109', city: 'Pune', property_type: 'rent', budget: '30000/month', language: 'en', status: 'not_interested', campaign_id: campId2 },
    { name: 'Sneha Desai', phone: '+917654321098', city: 'Mumbai', property_type: 'buy', budget: '90 lakh', language: 'en', status: 'pending', campaign_id: campId1 },
    { name: 'Vikram Singh', phone: '+916543210987', city: 'Pune', property_type: 'rent', budget: '20000/month', language: 'hi', status: 'retry', campaign_id: campId2 },
    { name: 'Ananya Reddy', phone: '+915432109876', city: 'Mumbai', property_type: 'sell', budget: '3 crore', language: 'en', status: 'hot_lead', campaign_id: campId1 },
    { name: 'Karan Mehta', phone: '+914321098765', city: 'Thane', property_type: 'buy', budget: '75 lakh', language: 'en', status: 'pending', campaign_id: campId1 },
    { name: 'Deepa Nair', phone: '+913210987654', city: 'Pune', property_type: 'rent', budget: '25000/month', language: 'hi', status: 'called', campaign_id: campId2 },
    { name: 'Rohan Gupta', phone: '+912109876543', city: 'Mumbai', property_type: 'buy', budget: '1.2 crore', language: 'en', status: 'dnc', campaign_id: campId1 },
    { name: 'Meera Krishnan', phone: '+911098765432', city: 'Pune', property_type: 'buy', budget: '60 lakh', language: 'en', status: 'pending', campaign_id: campId2 },
  ];

  const leadIds = [];
  leadData.forEach(l => {
    const id = uuidv4();
    leadIds.push(id);
    store.leads.push({ id, user_id: userId, ...l, retry_count: 0, score: 0, tags: [], custom_data: {}, notes: null, source: 'demo_seed', created_at: new Date(Date.now() - Math.random() * 86400000 * 5).toISOString(), updated_at: new Date().toISOString() });
  });

  // Call logs
  const outcomes = ['interested', 'not_interested', 'callback', 'no_answer', 'busy', 'interested', 'wrong_number', 'interested'];
  const intents = ['buy', 'rent', 'sell', 'buy', 'rent', 'buy', 'buy', 'sell'];
  for (let i = 0; i < 8; i++) {
    const dur = 60 + Math.floor(Math.random() * 240);
    const daysAgo = Math.floor(Math.random() * 7);
    const lead = store.leads[i];
    store.call_logs.push({
      id: uuidv4(), user_id: userId, lead_id: leadIds[i], campaign_id: lead.campaign_id,
      plivo_call_uuid: `DEMO-${uuidv4().slice(0, 8)}`, from_number: '+918035340776',
      to_number: lead.phone, duration_seconds: dur, call_status: 'completed',
      outcome: outcomes[i], interested: outcomes[i] === 'interested',
      intent: intents[i], bhk_preference: ['2BHK', '3BHK', '1BHK', 'villa', '2BHK', '4BHK', '2BHK', '3BHK'][i],
      budget_range: lead.budget, location_preference: lead.city,
      timeline: ['immediately', '3 months', '6 months', 'immediately', '1 year', '3 months', '6 months', 'immediately'][i],
      loan_required: [false, true, false, true, false, false, true, false][i],
      callback_time: outcomes[i] === 'callback' ? 'Tomorrow 11am' : null,
      hot_lead: outcomes[i] === 'interested', analysis: {},
      cost_plivo: +(dur / 60 * 0.6).toFixed(4), cost_stt: +(dur / 60 * 0.5).toFixed(4),
      cost_tts: +(dur / 60 * 0.15).toFixed(4), cost_llm: +(dur / 60 * 0.05).toFixed(4),
      cost_total: +(dur / 60 * 1.7).toFixed(4),
      started_at: new Date(Date.now() - daysAgo * 86400000 - dur * 1000).toISOString(),
      ended_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    });
  }

  // DNC
  store.dnc_list.push(
    { id: uuidv4(), user_id: userId, phone: '+912109876543', reason: 'Requested on call', added_at: new Date().toISOString() },
    { id: uuidv4(), user_id: userId, phone: '+910000000000', reason: 'TRAI DND', added_at: new Date().toISOString() },
  );

  // Events
  store.events.push(
    { id: uuidv4(), user_id: userId, type: 'account.created', title: 'Welcome to PropConnect!', body: 'You have ₹500 demo credits.', data: {}, read: false, created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: uuidv4(), user_id: userId, type: 'lead.hot', title: 'Hot lead detected 🔥', body: 'Rahul Sharma — buy — 1.5 crore', data: {}, read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  );

  // Update campaign counts
  store.campaigns[0].total_leads = store.leads.filter(l => l.campaign_id === campId1).length;
  store.campaigns[1].total_leads = store.leads.filter(l => l.campaign_id === campId2).length;

  console.log(`[MockDB] Seeded: ${store.campaigns.length} campaigns, ${store.leads.length} leads, ${store.call_logs.length} calls, demo user: demo@propconnect.in / password123`);
}

seedDemoData();
module.exports = mockSupabase;
