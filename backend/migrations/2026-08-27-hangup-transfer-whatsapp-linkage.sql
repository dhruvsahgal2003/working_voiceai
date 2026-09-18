-- Auto-hangup on disinterest, warm transfer to a human, and WhatsApp↔call linkage.
-- Additive only. See the 2026-08-27-per-lead-agent migration for why lock_timeout
-- is set: this aborts rather than queueing behind a long transaction.
SET lock_timeout = '3s';

-- ── AGENTS: per-agent behaviour config ──────────────────────────────────────
-- Auto-hangup when the caller is clearly not interested. On by default because
-- the current behaviour — staying on a dead call until the 5-minute cap — burns
-- Plivo minutes and Sarvam credit on someone who already said no.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS hangup_on_not_interested BOOLEAN DEFAULT true;
-- The line the agent says before hanging up. NULL falls back to a language-aware
-- default in agent.py; never hang up mid-air without acknowledging the person.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS not_interested_message TEXT;
-- Extra phrases on top of agent.py's built-in Hindi/English disinterest patterns.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS not_interested_phrases TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Warm transfer to a human.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_enabled BOOLEAN DEFAULT false;
-- E.164. NULL falls back to TRANSFER_DEFAULT_NUMBER in the backend env; if both
-- are unset, transfer stays off no matter what transfer_enabled says.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_phone_number TEXT;
-- What the agent asks before transferring ("Should I connect you to a colleague?").
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_prompt TEXT;
-- What it says once the caller accepts, while the transfer is dialling.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_message TEXT;
-- Extra trigger phrases on top of the built-in ones.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_trigger_phrases TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ── CALL_LOGS: what actually happened, for the History tab ──────────────────
-- Why the call ended: not_interested | goodbye | whatsapp_close | max_duration
-- | transferred | participant_disconnect | crashed | completed
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS end_reason TEXT;

-- Transfer lifecycle. transfer_status:
--   offered   — agent asked "shall I transfer you?"
--   declined  — caller said no
--   accepted  — caller said yes, transfer about to be attempted
--   completed — LiveKit accepted the REFER and the leg moved
--   failed    — transfer attempted and rejected (see transfer_detail)
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transfer_status TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transfer_to TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transfer_at TIMESTAMPTZ;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transfer_detail TEXT;

-- ── WHATSAPP: link every message back to what caused it ─────────────────────
-- The gap this closes: the outbound n8n flow already posts call_id back to
-- /api/webhook/whatsapp/outbound-log, but the handler dropped it on the floor,
-- so there was no way to answer "who did the agent message, and about which call?"
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES call_logs(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS template_name TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_call ON whatsapp_messages(call_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead ON whatsapp_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_transfer ON call_logs(transfer_status) WHERE transfer_status IS NOT NULL;
