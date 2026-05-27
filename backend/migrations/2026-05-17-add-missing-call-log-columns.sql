-- Adds columns missing from production call_logs table.
-- Run in Supabase SQL editor (https://supabase.com/dashboard/project/_/sql).

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS livekit_egress_id TEXT,
  ADD COLUMN IF NOT EXISTS bhk_preference TEXT,
  ADD COLUMN IF NOT EXISTS timeline TEXT,
  ADD COLUMN IF NOT EXISTS loan_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS callback_time TEXT,
  ADD COLUMN IF NOT EXISTS cost_plivo  DECIMAL(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_stt    DECIMAL(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_tts    DECIMAL(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_llm    DECIMAL(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at  TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_call_logs_started_at ON call_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_livekit_room_name ON call_logs(livekit_room_name);
