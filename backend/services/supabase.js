const { createClient } = require('@supabase/supabase-js');

const isLocal = process.env.USE_MOCK_DB === 'true' ||
  !process.env.SUPABASE_URL ||
  process.env.SUPABASE_URL.includes('placeholder') ||
  process.env.SUPABASE_URL.includes('localhost');

let supabase;
if (isLocal) {
  console.log('[DB] ⚡ Using in-memory MockDB (local dev mode)');
  supabase = require('./mockDb');
} else {
  console.log('[DB] 🔌 Connecting to Supabase:', process.env.SUPABASE_URL);
  // Node 20 needs ws package for Supabase Realtime
  const WebSocket = require('ws');
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { realtime: { transport: WebSocket } }
  );
}

module.exports = supabase;
