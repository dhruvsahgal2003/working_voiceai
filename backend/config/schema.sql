-- PropConnect Full Schema v2 — run in Supabase SQL editor
-- Adds multi-tenant auth, agents, billing, events, transcripts

-- Users (tenants)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  timezone TEXT DEFAULT 'Asia/Kolkata',
  credit_balance DECIMAL(10,2) DEFAULT 500,
  credit_alert_threshold DECIMAL(10,2) DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  plivo_auth_id TEXT, plivo_auth_token_encrypted TEXT,
  livekit_api_key TEXT, livekit_api_secret_encrypted TEXT, livekit_url TEXT,
  sarvam_api_key_encrypted TEXT, openai_api_key_encrypted TEXT,
  sales_webhook_url TEXT, sales_whatsapp TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  number TEXT NOT NULL, country TEXT DEFAULT 'IN',
  monthly_cost DECIMAL(8,2) DEFAULT 0, is_active BOOLEAN DEFAULT true,
  plivo_number_id TEXT, created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(number, user_id)
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, system_prompt TEXT NOT NULL, first_message TEXT,
  language TEXT DEFAULT 'en-IN', stt_model TEXT DEFAULT 'saarika:v2.5',
  tts_model TEXT DEFAULT 'bulbul:v3', tts_speaker TEXT DEFAULT 'anushka',
  llm_provider TEXT DEFAULT 'sarvam', llm_model TEXT DEFAULT 'sarvam-30b',
  llm_temperature DECIMAL(3,2) DEFAULT 0.7, max_duration_minutes INTEGER DEFAULT 5,
  silence_timeout_seconds INTEGER DEFAULT 10,
  end_call_phrases TEXT[] DEFAULT ARRAY['goodbye','bye','thank you'],
  analysis_schema JSONB DEFAULT '{}', tools JSONB DEFAULT '[]',
  voicemail_detection BOOLEAN DEFAULT true, voicemail_message TEXT,
  recording_enabled BOOLEAN DEFAULT true, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  phone_number_id UUID REFERENCES phone_numbers(id),
  name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'draft',
  start_time TIME DEFAULT '10:00', end_time TIME DEFAULT '19:00',
  timezone TEXT DEFAULT 'Asia/Kolkata', days_of_week INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  max_concurrent_calls INTEGER DEFAULT 5, max_attempts_per_lead INTEGER DEFAULT 3,
  rate_per_min INTEGER DEFAULT 5, retry_delay_minutes INTEGER[] DEFAULT ARRAY[30,120,1440],
  total_leads INTEGER DEFAULT 0, called_count INTEGER DEFAULT 0,
  hot_leads_count INTEGER DEFAULT 0, total_cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT DEFAULT '', phone TEXT NOT NULL, email TEXT,
  city TEXT, property_type TEXT, budget TEXT, language TEXT DEFAULT 'en',
  status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0,
  callback_time TIMESTAMPTZ, last_called TIMESTAMPTZ, notes TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[], score INTEGER DEFAULT 0,
  source TEXT DEFAULT 'csv_upload', custom_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(phone, user_id)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  plivo_call_uuid TEXT UNIQUE, from_number TEXT, to_number TEXT,
  livekit_room_name TEXT, livekit_egress_id TEXT,
  duration_seconds INTEGER DEFAULT 0, call_status TEXT, outcome TEXT,
  recording_url TEXT, interested BOOLEAN DEFAULT false, hot_lead BOOLEAN DEFAULT false,
  intent TEXT, bhk_preference TEXT, budget_range TEXT,
  location_preference TEXT, timeline TEXT, loan_required BOOLEAN,
  callback_time TEXT, analysis JSONB DEFAULT '{}',
  cost_plivo DECIMAL(8,4) DEFAULT 0, cost_stt DECIMAL(8,4) DEFAULT 0,
  cost_tts DECIMAL(8,4) DEFAULT 0, cost_llm DECIMAL(8,4) DEFAULT 0,
  cost_total DECIMAL(8,4) DEFAULT 0,
  started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_logs(id) ON DELETE CASCADE UNIQUE,
  turns JSONB NOT NULL DEFAULT '[]', full_text TEXT, word_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES call_logs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL, duration_seconds INTEGER, file_size_bytes BIGINT,
  storage_provider TEXT DEFAULT 'r2', expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL, description TEXT,
  call_id UUID REFERENCES call_logs(id),
  paygic_order_id TEXT, paygic_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dnc_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL, reason TEXT, added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(phone, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
  data JSONB DEFAULT '{}', read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── NEW TABLES ─────────────────────────────────────────────────────────────

-- Google OAuth + admin flag on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- User-configured outbound webhooks
CREATE TABLE IF NOT EXISTS user_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT ARRAY['call.completed','call.hot_lead','call.failed'],
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge base documents
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp Cloud API inbox
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, wa_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES whatsapp_contacts(id) ON DELETE CASCADE UNIQUE,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- direction: 'inbound' | 'outbound'
-- status: 'sent' | 'delivered' | 'read' | 'failed' | 'received'
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  wamid TEXT,
  body TEXT,
  message_type TEXT DEFAULT 'text',
  status TEXT DEFAULT 'sent',
  raw_payload JSONB DEFAULT '{}',
  wa_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON user_webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_user ON whatsapp_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_user ON whatsapp_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id, wa_timestamp);
-- Meta may redeliver webhooks; this keeps ingestion idempotent for messages that have a wamid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid_unique ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_user ON call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_uuid ON call_logs(plivo_call_uuid);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, read);
