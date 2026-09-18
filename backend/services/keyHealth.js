// keyHealth.js — health monitoring for the three API keys that carry prepaid
// credit: Sarvam (STT+TTS), Groq (LLM), Plivo (telephony minutes).
//
// WHAT THIS CAN AND CANNOT TELL YOU
// ---------------------------------
// Only Plivo exposes an actual credit balance. Sarvam and Groq have no balance
// endpoint at all, so for those two "when do I recharge?" can only be answered
// from the error the provider returns once credit runs out. That is why this
// module tracks two independent signals:
//
//   1. A periodic probe — a cheap authenticated request per provider.
//   2. Live failures — provider errors seen during real calls, reported by the
//      backend and by agent.py.
//
// The second matters because a probe can pass while real traffic fails: Groq's
// /models endpoint answers 200 even when the chat completions quota is spent,
// and a rate limit only appears under concurrency. Treat a `live` failure as
// more authoritative than an `ok` probe — that is why recordLiveFailure() is
// allowed to overwrite a healthy probe result but not the reverse.
const axios = require('axios');
const db = require('./supabase');

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_INTERVAL_MS = 5 * 60 * 1000;

// Words providers use when the account is out of money rather than merely
// going too fast. A 429 is ambiguous on its own — this is what disambiguates it.
const CREDIT_EXHAUSTED_PATTERNS = [
  'insufficient_quota', 'insufficient quota', 'exceeded your current quota',
  'out of credit', 'out of credits', 'no credit', 'insufficient credit',
  'insufficient balance', 'billing', 'payment required', 'account_deactivated',
  'quota exceeded', 'credit limit',
];

function looksLikeCreditExhaustion(text) {
  const t = String(text || '').toLowerCase();
  return CREDIT_EXHAUSTED_PATTERNS.some(p => t.includes(p));
}

// Map an HTTP failure onto our status vocabulary. Kept in one place so all three
// providers classify consistently.
function classifyHttp(httpStatus, bodyText) {
  if (httpStatus === 401 || httpStatus === 403) {
    return { status: 'invalid', detail: `HTTP ${httpStatus} — key rejected (wrong, revoked, or missing)` };
  }
  if (httpStatus === 402) {
    return { status: 'out_of_credit', detail: `HTTP 402 — payment required` };
  }
  if (httpStatus === 429) {
    return looksLikeCreditExhaustion(bodyText)
      ? { status: 'out_of_credit', detail: 'HTTP 429 — quota/credit exhausted' }
      : { status: 'rate_limited', detail: 'HTTP 429 — rate limited (not necessarily out of credit)' };
  }
  if (looksLikeCreditExhaustion(bodyText)) {
    return { status: 'out_of_credit', detail: `HTTP ${httpStatus} — ${String(bodyText).slice(0, 160)}` };
  }
  // A 404/400 means our probe request is wrong, not that the key is bad. Saying
  // "invalid key" here would send you chasing a recharge you don't need.
  if (httpStatus === 404 || httpStatus === 400) {
    return { status: 'unknown', detail: `HTTP ${httpStatus} — probe endpoint issue, key state undetermined` };
  }
  return { status: 'unreachable', detail: `HTTP ${httpStatus} — ${String(bodyText).slice(0, 160)}` };
}

function errToResult(err) {
  if (err.response) return classifyHttp(err.response.status, JSON.stringify(err.response.data || ''));
  // Timeout / DNS / connection refused says nothing about the key itself.
  return { status: 'unreachable', detail: err.code ? `${err.code} — ${err.message}` : err.message };
}

// ─── PROVIDER PROBES ─────────────────────────────────────────────────────────
// Each returns { status, detail, balance?, balance_currency? } and must never throw.

const PROVIDERS = {
  // Sarvam has no balance or usage endpoint. text-lid is the cheapest authenticated
  // call available (language identification on a 5-character input).
  sarvam: {
    label: 'Sarvam (STT + TTS)',
    envVar: 'SARVAM_API_KEY',
    key: () => process.env.SARVAM_API_KEY,
    async probe(key) {
      try {
        const r = await axios.post('https://api.sarvam.ai/text-lid', { input: 'hello' }, {
          headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
          timeout: PROBE_TIMEOUT_MS,
        });
        return r.status === 200
          ? { status: 'ok', detail: 'text-lid responded 200' }
          : classifyHttp(r.status, JSON.stringify(r.data));
      } catch (err) { return errToResult(err); }
    },
  },

  // Groq's /models is free and unmetered, so it verifies the key but will keep
  // answering 200 after chat completions start getting refused. Live-failure
  // reporting is what actually catches Groq running dry.
  groq: {
    label: 'Groq (LLM)',
    envVar: 'GROQ_API_KEY',
    key: () => process.env.GROQ_API_KEY,
    async probe(key) {
      try {
        const r = await axios.get('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          timeout: PROBE_TIMEOUT_MS,
        });
        const n = (r.data?.data || []).length;
        return { status: 'ok', detail: `${n} models available (auth OK — note: does not prove chat quota)` };
      } catch (err) { return errToResult(err); }
    },
  },

  // The only provider with a real balance. cash_credits comes back as a string.
  plivo: {
    label: 'Plivo (telephony minutes)',
    envVar: 'PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN',
    key: () => (process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN)
      ? `${process.env.PLIVO_AUTH_ID}:${process.env.PLIVO_AUTH_TOKEN}` : '',
    async probe() {
      const id = process.env.PLIVO_AUTH_ID, token = process.env.PLIVO_AUTH_TOKEN;
      try {
        const r = await axios.get(`https://api.plivo.com/v1/Account/${id}/`, {
          auth: { username: id, password: token },
          timeout: PROBE_TIMEOUT_MS,
        });
        const credits = parseFloat(r.data?.cash_credits);
        const balance = Number.isFinite(credits) ? credits : null;
        return {
          status: balance !== null && balance <= 0 ? 'out_of_credit' : 'ok',
          detail: balance !== null ? `cash_credits = ${balance}` : 'account reachable, no cash_credits field',
          balance,
          balance_currency: 'USD',
        };
      } catch (err) { return errToResult(err); }
    },
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS);

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

async function writeResult(provider, result, { source = 'probe', latencyMs = null } = {}) {
  const now = new Date().toISOString();
  const healthy = result.status === 'ok';

  // Read-modify-write rather than a SQL expression: the pgClient shim exposes a
  // Supabase-style builder, not raw SQL, and this table sees one write per
  // provider per 5 minutes so the race window is irrelevant.
  const { data: prev } = await db.from('api_key_health')
    .select('*').eq('provider', provider).maybeSingle();

  const updates = {
    status: result.status,
    detail: result.detail || null,
    balance: result.balance !== undefined ? result.balance : (prev?.balance ?? null),
    balance_currency: result.balance_currency || prev?.balance_currency || null,
    latency_ms: latencyMs,
    source,
    checked_at: now,
    consecutive_failures: healthy ? 0 : ((prev?.consecutive_failures || 0) + 1),
  };
  if (healthy) {
    updates.last_ok_at = now;
  } else {
    updates.last_failure_at = now;
    updates.last_failure_detail = result.detail || null;
    updates.last_failure_source = source;
  }

  if (prev) {
    await db.from('api_key_health').update(updates).eq('provider', provider);
  } else {
    await db.from('api_key_health').insert({ provider, ...updates });
  }
  return { provider, ...updates };
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

async function probeProvider(id) {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);

  const key = p.key();
  if (!key) {
    return writeResult(id, {
      status: 'invalid',
      detail: `${p.envVar} is not set in backend/.env — nothing to check`,
    });
  }

  const t0 = Date.now();
  const result = await p.probe(key);
  return writeResult(id, result, { source: 'probe', latencyMs: Date.now() - t0 });
}

async function probeAll() {
  // Sequential on purpose: three cheap requests every five minutes, and running
  // them serially keeps the probe off the critical path of any in-flight call.
  const out = [];
  for (const id of PROVIDER_IDS) {
    try { out.push(await probeProvider(id)); }
    catch (err) { console.error(`[keyHealth] probe ${id} failed:`, err.message); }
  }
  return out;
}

// Called when a REAL request to a provider fails during a call. This is the
// signal that actually tells you to recharge, so it is allowed to overwrite a
// green probe result.
async function recordLiveFailure(provider, detail, httpStatus = null) {
  if (!PROVIDERS[provider]) return null;
  try {
    const cls = httpStatus
      ? classifyHttp(httpStatus, detail)
      : (looksLikeCreditExhaustion(detail)
          ? { status: 'out_of_credit', detail: String(detail).slice(0, 300) }
          : { status: 'unreachable', detail: String(detail).slice(0, 300) });
    console.warn(`[keyHealth] live failure ${provider}: ${cls.status} — ${cls.detail}`);
    return await writeResult(provider, cls, { source: 'live' });
  } catch (err) {
    console.error('[keyHealth] recordLiveFailure error:', err.message);
    return null;
  }
}

async function getAll() {
  const { data } = await db.from('api_key_health').select('*').order('provider', { ascending: true });
  const byId = Object.fromEntries((data || []).map(r => [r.provider, r]));
  // Always return all three, even before the first probe has run, so the admin
  // UI shows a complete table rather than growing rows over time.
  return PROVIDER_IDS.map(id => {
    const row = byId[id] || { provider: id, status: 'unknown' };
    const key = PROVIDERS[id].key();
    return {
      ...row,
      label: PROVIDERS[id].label,
      env_var: PROVIDERS[id].envVar,
      configured: !!key,
      // Never send the key itself to the browser — a 4-char tail is enough to
      // tell two keys apart when rotating.
      key_hint: key ? `…${key.slice(-4)}` : null,
      has_balance_api: id === 'plivo',
    };
  });
}

let timer = null;
function startScheduler() {
  if (timer) return;
  // First run deferred so a probe never delays server startup or competes with
  // the campaign queue booting.
  setTimeout(() => { probeAll().catch(e => console.error('[keyHealth]', e.message)); }, 15_000);
  timer = setInterval(() => { probeAll().catch(e => console.error('[keyHealth]', e.message)); }, PROBE_INTERVAL_MS);
  timer.unref?.();
  console.log(`[keyHealth] scheduler started — probing ${PROVIDER_IDS.join(', ')} every ${PROBE_INTERVAL_MS / 60000} min`);
}

module.exports = { probeAll, probeProvider, recordLiveFailure, getAll, startScheduler, PROVIDER_IDS };
