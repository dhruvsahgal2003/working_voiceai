require('dotenv').config();
const db = require('../services/pgClient');

function ok(label, cond, extra='') { console.log(`${cond ? '✓' : '✗ FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); if (!cond) process.exitCode = 1; }

(async () => {
  // 1. login lookup (select single by email)
  const { data: u, error: e1 } = await db.from('users').select('*').eq('email', 'dhruvsahgal2003@gmail.com').single();
  ok('login: users.select().eq().single()', !e1 && u && u.is_admin === true, u ? `${u.email} admin=${u.is_admin}` : String(e1 && e1.message));
  const uid = u && u.id;

  // 2. call history: embeds + count + range + order
  const { data: hist, error: e2, count } = await db.from('call_logs')
    .select('*, leads(id, name, phone, city), agents(*)', { count: 'exact' })
    .eq('user_id', uid).order('created_at', { ascending: false }).range(0, 4);
  const sample = hist && hist[0];
  ok('history: embeds + count + range', !e2 && Array.isArray(hist) && typeof count === 'number',
     `rows=${hist && hist.length} count=${count} leadEmbed=${sample ? (sample.leads ? 'obj/null' : 'missing') : 'n/a'}`);

  // 3. reverse to-many embed
  const { data: leadsWithCalls, error: e3 } = await db.from('leads').select('*, call_logs(*)').eq('user_id', uid).limit(3);
  const withArr = leadsWithCalls && leadsWithCalls.every(l => Array.isArray(l.call_logs));
  ok('reverse embed: leads.call_logs(*) is array', !e3 && withArr, `leads=${leadsWithCalls && leadsWithCalls.length}`);

  // 4. insert → read → delete (events)
  const { data: ins, error: e4 } = await db.from('events')
    .insert({ user_id: uid, type: 'test.smoke', title: 'smoke', body: 'x', data: { a: 1 }, read: false })
    .select().single();
  ok('insert events + jsonb data', !e4 && ins && ins.id && ins.data && ins.data.a === 1, ins ? `id=${ins.id}` : String(e4 && e4.message));
  if (ins) {
    const { error: e4b } = await db.from('events').delete().eq('id', ins.id);
    ok('delete events by id', !e4b);
  }

  // 5. update returning
  const { data: upd, error: e5 } = await db.from('users').update({ name: u.name }).eq('id', uid).select().single();
  ok('update users + RETURNING', !e5 && upd && upd.id === uid);

  // 6. upsert with onConflict (dnc) then clean up
  const { data: up, error: e6 } = await db.from('dnc_list')
    .upsert({ phone: '+910000000001', user_id: uid, reason: 'smoke' }, { onConflict: 'phone,user_id' });
  ok('upsert dnc onConflict', !e6, e6 ? e6.message : `rows=${up && up.length}`);
  await db.from('dnc_list').delete().eq('phone', '+910000000001');

  // 7. contains on text[] (webhookFire path)
  const { data: wh, error: e7 } = await db.from('user_webhooks').select('*').contains('events', ['call.completed']);
  ok('contains text[] array', !e7 && Array.isArray(wh), e7 ? e7.message : `matched=${wh && wh.length}`);

  // 8. in()
  const agentIds = (await db.from('agents').select('id').eq('user_id', uid).limit(2)).data.map(a => a.id);
  const { data: inRes, error: e8 } = await db.from('agents').select('id, name').in('id', agentIds);
  ok('in() on agents', !e8 && inRes && inRes.length === agentIds.length, `n=${inRes && inRes.length}`);

  // 9. not(col,'is',null)
  const { data: cities, error: e9 } = await db.from('leads').select('city').eq('user_id', uid).not('city', 'is', null);
  ok('not(city,is,null)', !e9 && cities && cities.every(c => c.city !== null));

  // 10. maybeSingle on no-match
  const { data: none, error: e10 } = await db.from('users').select('*').eq('email', 'nobody@nowhere.test').maybeSingle();
  ok('maybeSingle no-match → null,no-error', none === null && !e10);

  await db._pool.end();
  console.log(process.exitCode ? '\nSMOKE FAILED' : '\nALL SMOKE PASSED');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
