-- Adds the one column that made every "extended" agent insert fail.
--
-- routes/agents.js builds an extPayload with the newer columns and falls back to
-- a legacy basePayload if Postgres reports an unknown column. `realtime_voice`
-- was referenced in code but never added to the schema, so that fallback fired on
-- EVERY create — silently discarding silence_timeout_seconds, tools,
-- voicemail_message and realtime_voice. The fallback was meant to be a
-- compatibility shim; it had become a permanent data-loss path.
SET lock_timeout = '3s';
-- Voice id for speech-to-speech models (Gemini Live), e.g. 'Aoede'. See
-- build_gemini_realtime() in agent/agent.py.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS realtime_voice TEXT;
