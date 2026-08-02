// One-off: copy all rows from hosted Supabase → local PostgreSQL.
// Reads via the Supabase REST client (SUPABASE_URL/SERVICE_KEY from .env),
// writes via node-postgres to LOCAL_PG_URL. Idempotent: ON CONFLICT (id) DO NOTHING.
//
//   node scripts/migrate-supabase-to-pg.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const LOCAL_PG_URL = process.env.LOCAL_PG_URL || process.env.DATABASE_URL ||
  'postgres://velryx:velryx_local_2026@localhost:5432/velryx';

const WebSocket = require('ws');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } });
const pg = new Pool({ connectionString: LOCAL_PG_URL });

// FK-safe insertion order
const TABLES = [
  'users', 'user_credentials', 'phone_numbers', 'agents', 'campaigns',
  'leads', 'call_logs', 'transcripts', 'recordings', 'billing_transactions',
  'dnc_list', 'events', 'user_webhooks', 'knowledge_base',
  'whatsapp_contacts', 'whatsapp_conversations', 'whatsapp_messages',
];

const JSONB = {
  agents: new Set(['analysis_schema', 'tools']),
  leads: new Set(['custom_data']),
  call_logs: new Set(['analysis']),
  transcripts: new Set(['turns']),
  events: new Set(['data']),
  whatsapp_messages: new Set(['raw_payload']),
};

async function localColumns(table) {
  const { rows } = await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table]);
  return new Set(rows.map(r => r.column_name));
}

async function fetchAll(table) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function migrateTable(table) {
  const allowed = await localColumns(table);
  if (!allowed.size) { console.log(`  ⏭  ${table} — not in local schema, skipped`); return; }
  let rows;
  try { rows = await fetchAll(table); }
  catch (e) { console.log(`  ⚠  ${table} — read failed: ${e.message}`); return; }
  if (!rows.length) { console.log(`  •  ${table} — 0 rows`); return; }

  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row).filter(c => allowed.has(c) && row[c] !== undefined);
    if (!cols.includes('id')) cols.push('id');
    const params = [];
    const ph = cols.map(c => {
      let v = row[c];
      if (JSONB[table] && JSONB[table].has(c) && v != null && typeof v === 'object') {
        params.push(JSON.stringify(v)); return `$${params.length}::jsonb`;
      }
      params.push(v === undefined ? null : v); return `$${params.length}`;
    });
    const sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) ` +
                `VALUES (${ph.join(',')}) ON CONFLICT (id) DO NOTHING`;
    try { const r = await pg.query(sql, params); inserted += r.rowCount; }
    catch (e) { console.log(`  ✗  ${table} row ${row.id}: ${e.message}`); }
  }
  console.log(`  ✓  ${table} — ${inserted}/${rows.length} inserted`);
}

(async () => {
  console.log('Migrating Supabase → local PostgreSQL:', LOCAL_PG_URL.replace(/:[^:@/]*@/, ':****@'));
  for (const t of TABLES) await migrateTable(t);
  await pg.end();
  console.log('Done.');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
