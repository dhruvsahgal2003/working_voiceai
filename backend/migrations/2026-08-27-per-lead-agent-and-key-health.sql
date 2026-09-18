-- Per-lead agent selection + admin API-key health monitoring.
--
-- Deliberately additive and online-safe:
--   * ADD COLUMN with no DEFAULT is a catalog-only change in PG11+ (no table rewrite).
--   * The FK validation scans leads, but every new row is NULL so it is trivial.
--   * lock_timeout means that if a long transaction is holding leads, this ABORTS
--     instead of queueing behind it and blocking every subsequent query on the table.
--     Re-run it if that happens; it is idempotent.
SET lock_timeout = '3s';

-- ── Per-lead agent ──────────────────────────────────────────────────────────
-- Which AI agent should call this lead. NULL = fall back to the campaign's agent.
-- Note services/pgClient.js TO_ONE.leads already declared the `agents: 'agent_id'`
-- embed; this column is what makes that embed resolvable.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(agent_id);

-- ── API key health ──────────────────────────────────────────────────────────
-- One row per provider, updated by the periodic probe in services/keyHealth.js
-- and by real failures observed during live calls.
--
-- status:
--   ok             — key authenticated and has capacity
--   out_of_credit  — provider says the account is out of credit / quota (RECHARGE)
--   rate_limited   — 429 that is a rate limit, not a credit exhaustion
--   invalid        — 401/403: key is wrong, revoked, or missing
--   unreachable    — network/timeout; says nothing about the key itself
--   unknown        — never probed
CREATE TABLE IF NOT EXISTS api_key_health (
  provider             TEXT PRIMARY KEY,
  status               TEXT NOT NULL DEFAULT 'unknown',
  detail               TEXT,
  -- Only Plivo exposes a real balance; NULL for providers that have no balance API.
  balance              NUMERIC(12,2),
  balance_currency     TEXT,
  latency_ms           INTEGER,
  -- 'probe' = periodic health check, 'live' = a failure seen during a real call
  source               TEXT DEFAULT 'probe',
  checked_at           TIMESTAMPTZ DEFAULT now(),
  last_ok_at           TIMESTAMPTZ,
  last_failure_at      TIMESTAMPTZ,
  last_failure_detail  TEXT,
  last_failure_source  TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

INSERT INTO api_key_health (provider) VALUES ('sarvam'), ('groq'), ('plivo')
ON CONFLICT (provider) DO NOTHING;
