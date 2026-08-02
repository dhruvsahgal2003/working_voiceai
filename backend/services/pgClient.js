// ─────────────────────────────────────────────────────────────────────────────
// pgClient.js — a drop-in, Supabase-JS-compatible query builder over local
// PostgreSQL (node-postgres). Lets the entire codebase keep using the
// `db.from('table').select(...).eq(...).single()` API with NO route changes,
// while data lives in a local Postgres you can browse in DBeaver.
//
// Supported surface (matches actual usage in this repo):
//   .from(t)
//   .select(cols, { count })            — incl. PostgREST embeds: leads(*), agents(*), call_logs(*), leads(col,col)
//   .eq .neq .gte .lte .in .is .not(col,'is',null) .contains
//   .order(col,{ascending}) .limit(n) .range(from,to)
//   .single() .maybeSingle()
//   .insert(rows)[.select()][.single()]
//   .update(obj).eq(...)[.select()][.single()]
//   .upsert(rows,{ onConflict, ignoreDuplicates })[.select()]
//   .delete().eq(...)
// Every terminal is awaitable and resolves to { data, error[, count] }.
// ─────────────────────────────────────────────────────────────────────────────
const { Pool, types } = require('pg');

// Return numeric/decimal + bigint as JS numbers (Supabase/PostgREST do the same),
// so credit/cost comparisons keep working. Timestamps stay as JS Date objects,
// which serialize to ISO strings in res.json() exactly like Supabase.
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20,   v => (v === null ? null : parseInt(v, 10))); // int8/bigint

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
});
pool.on('error', err => console.error('[pgClient] idle client error:', err.message));

// Columns that are JSONB in the schema — values must be JSON-stringified and cast
// to ::jsonb on write (otherwise pg turns JS arrays into Postgres arrays).
const JSONB_COLS = {
  agents:      new Set(['analysis_schema', 'tools']),
  leads:       new Set(['custom_data']),
  call_logs:   new Set(['analysis']),
  transcripts: new Set(['turns']),
  events:      new Set(['data']),
};
const isJsonb = (table, col) => !!(JSONB_COLS[table] && JSONB_COLS[table].has(col));

// Foreign-key relationships for PostgREST-style embeds.
// TO_ONE[parent][embedName]  = local FK column on parent  (parent.col -> embed.id)
// TO_MANY[parent][embedName] = FK column on the child     (child.col  -> parent.id)
const TO_ONE = {
  call_logs:   { leads: 'lead_id', agents: 'agent_id', campaigns: 'campaign_id' },
  leads:       { campaigns: 'campaign_id', agents: 'agent_id' },
  campaigns:   { agents: 'agent_id' },
  transcripts: { call_logs: 'call_id' },
  recordings:  { call_logs: 'call_id' },
  whatsapp_conversations: { whatsapp_contacts: 'contact_id' },
  whatsapp_messages:      { whatsapp_conversations: 'conversation_id' },
};
const TO_MANY = {
  leads:     { call_logs: 'lead_id' },
  campaigns: { leads: 'campaign_id' },
  agents:    { call_logs: 'agent_id', campaigns: 'agent_id' },
  call_logs: { transcripts: 'call_id', recordings: 'call_id' },
  whatsapp_contacts:      { whatsapp_conversations: 'contact_id' },
  whatsapp_conversations: { whatsapp_messages: 'conversation_id' },
};

// Parse a select string into { base: '*'|['col',...], embeds: [{name, cols}] }
function parseSelect(sel) {
  if (!sel || sel === '*') return { base: '*', embeds: [] };
  const tokens = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { tokens.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) tokens.push(cur.trim());

  const base = [];
  const embeds = [];
  for (const tok of tokens) {
    const m = tok.match(/^([a-z_]+)\s*\((.*)\)$/is);
    if (m) {
      const name = m[1];
      const inner = m[2].trim();
      const cols = inner === '*' ? '*' : inner.split(',').map(s => s.trim()).filter(Boolean);
      embeds.push({ name, cols });
    } else {
      base.push(tok);
    }
  }
  return { base: base.includes('*') || base.length === 0 ? '*' : base, embeds };
}

function ident(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }

class PgBuilder {
  constructor(table) {
    this.table = table;
    this._mode = 'select';
    this._selectStr = '*';
    this._filters = [];        // { col, op, val }
    this._order = null;
    this._limit = null;
    this._offset = null;
    this._single = false;
    this._maybe = false;
    this._count = false;
    this._wantReturn = false;  // for write modes: did the caller chain .select()?
    this._payload = null;
    this._upsertOpts = null;
    this._promise = null;
  }

  // ── builder (read) ──────────────────────────────────────────────────────
  select(cols, opts = {}) {
    if (this._mode === 'select') {
      this._selectStr = cols || '*';
      if (opts && opts.count) this._count = true;
    } else {
      this._wantReturn = true;           // .insert(...).select() etc.
      if (cols) this._selectStr = cols;
    }
    return this;
  }
  eq(col, val)  { this._filters.push({ col, op: 'eq',  val }); return this; }
  neq(col, val) { this._filters.push({ col, op: 'neq', val }); return this; }
  gt(col, val)  { this._filters.push({ col, op: 'gt',  val }); return this; }
  gte(col, val) { this._filters.push({ col, op: 'gte', val }); return this; }
  lt(col, val)  { this._filters.push({ col, op: 'lt',  val }); return this; }
  lte(col, val) { this._filters.push({ col, op: 'lte', val }); return this; }
  in(col, vals) { this._filters.push({ col, op: 'in',  val: vals }); return this; }
  is(col, val)  { this._filters.push({ col, op: 'is',  val }); return this; }
  contains(col, val) { this._filters.push({ col, op: 'contains', val }); return this; }
  not(col, op, val) { this._filters.push({ col, op: 'not_' + op, val }); return this; }
  or() { /* not used in repo; no-op keeps chains alive */ return this; }
  ilike(col, val) { this._filters.push({ col, op: 'ilike', val }); return this; }
  like(col, val)  { this._filters.push({ col, op: 'like',  val }); return this; }

  order(col, opts = {}) { this._order = { col, ascending: opts.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  range(from, to) { this._offset = from; this._limit = to - from + 1; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }

  // ── builder (write) ─────────────────────────────────────────────────────
  insert(rows) { this._mode = 'insert'; this._payload = rows; return this; }
  update(obj)  { this._mode = 'update'; this._payload = obj;  return this; }
  upsert(rows, opts = {}) { this._mode = 'upsert'; this._payload = rows; this._upsertOpts = opts; return this; }
  delete()     { this._mode = 'delete'; return this; }

  // ── WHERE construction ──────────────────────────────────────────────────
  _buildWhere(params) {
    if (!this._filters.length) return '';
    const clauses = this._filters.map(f => {
      const col = ident(f.col);
      switch (f.op) {
        case 'eq':  params.push(f.val); return `${col} = $${params.length}`;
        case 'neq': params.push(f.val); return `${col} <> $${params.length}`;
        case 'gt':  params.push(f.val); return `${col} > $${params.length}`;
        case 'gte': params.push(f.val); return `${col} >= $${params.length}`;
        case 'lt':  params.push(f.val); return `${col} < $${params.length}`;
        case 'lte': params.push(f.val); return `${col} <= $${params.length}`;
        case 'in':  params.push(f.val); return `${col} = ANY($${params.length})`;
        case 'is':  return f.val === null ? `${col} IS NULL` : (params.push(f.val), `${col} = $${params.length}`);
        case 'not_is': return f.val === null ? `${col} IS NOT NULL` : `${col} IS DISTINCT FROM ${(params.push(f.val), '$' + params.length)}`;
        case 'contains': params.push(f.val); return `${col} @> $${params.length}`;
        case 'ilike': params.push(f.val); return `${col} ILIKE $${params.length}`;
        case 'like':  params.push(f.val); return `${col} LIKE $${params.length}`;
        default: params.push(f.val); return `${col} = $${params.length}`;
      }
    });
    return ' WHERE ' + clauses.join(' AND ');
  }

  // ── embed resolution (second pass) ──────────────────────────────────────
  async _resolveEmbeds(rows, embeds) {
    if (!rows.length || !embeds.length) return rows;
    for (const emb of embeds) {
      const colsSql = emb.cols === '*' ? '*' : [...new Set([...emb.cols, 'id'])].map(ident).join(', ');
      const toOneCol  = TO_ONE[this.table] && TO_ONE[this.table][emb.name];
      const toManyCol = TO_MANY[this.table] && TO_MANY[this.table][emb.name];

      if (toOneCol) {
        const ids = [...new Set(rows.map(r => r[toOneCol]).filter(v => v != null))];
        const map = new Map();
        if (ids.length) {
          const { rows: kids } = await pool.query(
            `SELECT ${colsSql} FROM ${ident(emb.name)} WHERE "id" = ANY($1)`, [ids]);
          kids.forEach(k => map.set(k.id, k));
        }
        rows.forEach(r => { r[emb.name] = map.get(r[toOneCol]) || null; });
      } else if (toManyCol) {
        const ids = [...new Set(rows.map(r => r.id).filter(v => v != null))];
        const grouped = new Map();
        if (ids.length) {
          const childCols = emb.cols === '*' ? '*' : [...new Set([...emb.cols, toManyCol])].map(ident).join(', ');
          const { rows: kids } = await pool.query(
            `SELECT ${childCols} FROM ${ident(emb.name)} WHERE ${ident(toManyCol)} = ANY($1)`, [ids]);
          kids.forEach(k => {
            const key = k[toManyCol];
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(k);
          });
        }
        rows.forEach(r => { r[emb.name] = grouped.get(r.id) || []; });
      } else {
        // Unknown relationship — attach null so callers don't crash.
        rows.forEach(r => { r[emb.name] = r[emb.name] ?? null; });
      }
    }
    return rows;
  }

  // ── value prep for writes (JSONB stringify) ─────────────────────────────
  _prepWrite(table, obj, params) {
    const cols = Object.keys(obj);
    const placeholders = cols.map(c => {
      let v = obj[c];
      if (isJsonb(table, c) && v != null && typeof v === 'object') {
        params.push(JSON.stringify(v));
        return `$${params.length}::jsonb`;
      }
      params.push(v === undefined ? null : v);
      return `$${params.length}`;
    });
    return { cols, placeholders };
  }

  // ── execution ───────────────────────────────────────────────────────────
  async _exec() {
    try {
      if (this._mode === 'select')  return await this._execSelect();
      if (this._mode === 'insert')  return await this._execInsert();
      if (this._mode === 'update')  return await this._execUpdate();
      if (this._mode === 'upsert')  return await this._execUpsert();
      if (this._mode === 'delete')  return await this._execDelete();
      return { data: null, error: { message: 'unknown mode' } };
    } catch (err) {
      return { data: null, error: { message: err.message, code: err.code || '500', details: err.detail } };
    }
  }

  async _execSelect() {
    const { base, embeds } = parseSelect(this._selectStr);
    const selCols = (base === '*' || embeds.length) ? '*' : base.map(ident).join(', ');
    const params = [];
    let sql = `SELECT ${selCols} FROM ${ident(this.table)}` + this._buildWhere(params);
    if (this._order) sql += ` ORDER BY ${ident(this._order.col)} ${this._order.ascending ? 'ASC' : 'DESC'}`;
    if (this._limit != null) sql += ` LIMIT ${parseInt(this._limit, 10)}`;
    if (this._offset != null) sql += ` OFFSET ${parseInt(this._offset, 10)}`;

    const { rows } = await pool.query(sql, params);
    await this._resolveEmbeds(rows, embeds);

    let count = null;
    if (this._count) {
      const cp = [];
      const csql = `SELECT count(*)::int AS c FROM ${ident(this.table)}` + this._buildWhere(cp);
      const cr = await pool.query(csql, cp);
      count = cr.rows[0].c;
    }
    return this._shape(rows, count);
  }

  async _execInsert() {
    const arr = Array.isArray(this._payload) ? this._payload : [this._payload];
    if (!arr.length) return { data: [], error: null };
    // Union of all keys across rows (rows may be uniform here).
    const cols = [...new Set(arr.flatMap(r => Object.keys(r)))];
    const params = [];
    const valuesSql = arr.map(row => {
      const ph = cols.map(c => {
        let v = row[c];
        if (isJsonb(this.table, c) && v != null && typeof v === 'object') {
          params.push(JSON.stringify(v)); return `$${params.length}::jsonb`;
        }
        params.push(v === undefined ? null : v); return `$${params.length}`;
      });
      return `(${ph.join(', ')})`;
    }).join(', ');
    const sql = `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(', ')}) VALUES ${valuesSql} RETURNING *`;
    const { rows } = await pool.query(sql, params);
    return this._shape(rows, null);
  }

  async _execUpdate() {
    const params = [];
    const { cols, placeholders } = this._prepWrite(this.table, this._payload, params);
    const setSql = cols.map((c, i) => `${ident(c)} = ${placeholders[i]}`).join(', ');
    const sql = `UPDATE ${ident(this.table)} SET ${setSql}` + this._buildWhere(params) + ' RETURNING *';
    const { rows } = await pool.query(sql, params);
    return this._shape(rows, null);
  }

  async _execUpsert() {
    const arr = Array.isArray(this._payload) ? this._payload : [this._payload];
    if (!arr.length) return { data: [], error: null };
    const opts = this._upsertOpts || {};
    const conflictCols = (opts.onConflict ? opts.onConflict.split(',') : ['id']).map(s => s.trim());
    const cols = [...new Set(arr.flatMap(r => Object.keys(r)))];
    const params = [];
    const valuesSql = arr.map(row => {
      const ph = cols.map(c => {
        let v = row[c];
        if (isJsonb(this.table, c) && v != null && typeof v === 'object') {
          params.push(JSON.stringify(v)); return `$${params.length}::jsonb`;
        }
        params.push(v === undefined ? null : v); return `$${params.length}`;
      });
      return `(${ph.join(', ')})`;
    }).join(', ');

    let conflictAction;
    if (opts.ignoreDuplicates) {
      conflictAction = 'DO NOTHING';
    } else {
      // Update everything except the conflict target + id (never churn the PK).
      const updatable = cols.filter(c => !conflictCols.includes(c) && c !== 'id');
      conflictAction = updatable.length
        ? 'DO UPDATE SET ' + updatable.map(c => `${ident(c)} = EXCLUDED.${ident(c)}`).join(', ')
        : 'DO NOTHING';
    }
    const sql = `INSERT INTO ${ident(this.table)} (${cols.map(ident).join(', ')}) VALUES ${valuesSql} ` +
                `ON CONFLICT (${conflictCols.map(ident).join(', ')}) ${conflictAction} RETURNING *`;
    const { rows } = await pool.query(sql, params);
    return this._shape(rows, null);
  }

  async _execDelete() {
    const params = [];
    const sql = `DELETE FROM ${ident(this.table)}` + this._buildWhere(params) +
                (this._wantReturn ? ' RETURNING *' : '');
    const { rows } = await pool.query(sql, params);
    return this._wantReturn ? this._shape(rows, null) : { data: null, error: null };
  }

  // Shape the resolved rows according to single()/maybeSingle()/count.
  _shape(rows, count) {
    if (this._single) {
      if (!rows.length) return { data: null, error: { code: 'PGRST116', message: 'Results contain 0 rows' } };
      return { data: rows[0], error: null };
    }
    if (this._maybe) return { data: rows[0] ?? null, error: null };
    if (count != null) return { data: rows, error: null, count };
    return { data: rows, error: null };
  }

  // ── thenable (memoized so .then/.catch/.finally trigger exactly one run) ──
  _run() { if (!this._promise) this._promise = this._exec(); return this._promise; }
  then(onF, onR)   { return this._run().then(onF, onR); }
  catch(onR)       { return this._run().catch(onR); }
  finally(cb)      { return this._run().finally(cb); }
}

const client = {
  from(table) { return new PgBuilder(table); },
  // Escape hatch for raw SQL if ever needed.
  query: (text, params) => pool.query(text, params),
  _pool: pool,
};

module.exports = client;
