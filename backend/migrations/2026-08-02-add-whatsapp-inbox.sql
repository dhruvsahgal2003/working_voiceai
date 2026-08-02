-- Adds WhatsApp Cloud API inbox tables: contacts, conversations, messages.
-- Run via: psql "$DATABASE_URL" -f migrations/2026-08-02-add-whatsapp-inbox.sql
-- (or node scripts/migrate.js, which applies the same blocks from config/schema.sql)

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

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_user ON whatsapp_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_user ON whatsapp_conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id, wa_timestamp);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wamid_unique ON whatsapp_messages(wamid) WHERE wamid IS NOT NULL;
