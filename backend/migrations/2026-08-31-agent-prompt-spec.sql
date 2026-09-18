-- Structured prompt authoring.
--
-- Free-text system prompts were the source of two live-call failures: the model
-- got one canonical sentence handed to it and repeated it every turn, and it
-- asked the caller for a WhatsApp number we already had on file. Neither is
-- fixable by editing prose, because the next operator writes the prose
-- differently. So the operator now fills in a spec and the backend compiles it
-- into one canonical prompt shape.
--
-- Additive only. See the 2026-08-27-per-lead-agent migration for why
-- lock_timeout is set: this aborts rather than queueing behind a long transaction.
SET lock_timeout = '3s';

-- The structured source of truth. NULL means "legacy free-text agent" — those
-- keep working untouched, and agent.py still appends SPEED_RULES to them.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS prompt_spec JSONB;

-- system_prompt is deliberately NOT dropped or renamed. When prompt_spec is set
-- it holds the COMPILED output, so every existing reader — /api/internal/agent-config,
-- agent.py, the analysis path — keeps working with no change at all. The compiled
-- text is marked with "# CALLORA PROMPT v1" on the first line, which is how
-- agent.py knows not to append its legacy rule block on top.
COMMENT ON COLUMN agents.prompt_spec IS
  'Structured prompt spec (see backend/services/promptCompiler.js). When set, agents.system_prompt holds the compiled output and must not be edited directly.';
