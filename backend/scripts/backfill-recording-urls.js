// One-off: link call_logs to recordings that already exist in MinIO.
//
// stopRoomRecording() used to treat a failed stopEgress() as "no recording", but
// LiveKit auto-finalises egress when the room closes, so the stop almost always
// failed and recording_url stayed NULL while the .ogg sat in storage, playable.
// This reconciles the backlog. Idempotent — safe to re-run.
//
// Usage: node scripts/backfill-recording-urls.js [--apply]
require('dotenv').config();
const db = require('../services/supabase');
const { recordingUrlFor } = require('../services/livekit');
const axios = require('axios');

const APPLY = process.argv.includes('--apply');

(async () => {
  const { data: calls, error } = await db.from('call_logs')
    .select('id, started_at, duration_seconds, livekit_egress_id')
    .is('recording_url', null)
    .order('started_at', { ascending: false });
  if (error) throw error;

  console.log(`${calls.length} calls with no recording_url. Checking storage…`);
  let found = 0, missing = 0, failed = 0;

  for (const c of calls) {
    const url = recordingUrlFor(c.id);
    if (!url) { console.error('No S3 endpoint configured — aborting'); process.exit(1); }
    let ok = false;
    try {
      const r = await axios.head(url, { timeout: 8000, validateStatus: () => true });
      ok = r.status === 200;
    } catch { ok = false; }

    if (!ok) { missing++; continue; }
    found++;
    if (APPLY) {
      const { error: e } = await db.from('call_logs').update({ recording_url: url }).eq('id', c.id);
      if (e) { failed++; console.error(`  FAILED ${c.id}: ${e.message}`); }
      else console.log(`  linked ${c.id} (${c.duration_seconds || 0}s)`);
    } else {
      console.log(`  would link ${c.id} (${c.duration_seconds || 0}s) -> ${url}`);
    }
  }

  console.log(`\n${found} recoverable, ${missing} genuinely absent, ${failed} write failures.`);
  console.log(APPLY ? 'Applied.' : 'Dry run — re-run with --apply to write.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
