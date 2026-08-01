const forceMock = process.env.USE_MOCK_DB === 'true';
const hasLocalPg = !!process.env.DATABASE_URL;

let supabase;
if (forceMock) {
  console.log('[DB] ⚡ Using in-memory MockDB (USE_MOCK_DB=true)');
  supabase = require('./mockDb');
} else if (hasLocalPg) {
  // Local PostgreSQL via the Supabase-compatible shim — no Supabase project,
  // no project freezing. Browse it in DBeaver (see .env DBeaver block).
  console.log('[DB] 🐘 Connecting to local PostgreSQL:', (process.env.DATABASE_URL || '').replace(/:[^:@/]*@/, ':****@'));
  supabase = require('./pgClient');
} else {
  console.log('[DB] ⚡ Using in-memory MockDB (no DB configured)');
  supabase = require('./mockDb');
}

module.exports = supabase;
