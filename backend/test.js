/**
 * PropConnect — Full Integration Test
 * Runs all routes in-process without needing a running server
 */
require('dotenv').config();
process.env.WEBHOOK_BASE_URL = 'http://localhost:5000'; // prevent real HTTP

const express   = require('express');
const request   = require('supertest');
const path      = require('path');

// Build a test app identical to server.js but without listen()
const app = express();
app.use(require('cors')());
app.use('/api/webhook', express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

app.use('/api/leads',     require('./routes/leads'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/calls',     require('./routes/calls'));
app.use('/api/webhook',   require('./routes/webhook'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/dnc',       require('./routes/dnc'));
app.get('/health',        (req, res) => res.json({ status: 'ok' }));

// ─── TEST RUNNER ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
    results.push({ name, status: 'pass' });
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
    results.push({ name, status: 'fail', error: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertStatus(res, code) {
  if (res.status !== code) throw new Error(`Expected HTTP ${code}, got ${res.status}. Body: ${JSON.stringify(res.body)}`);
}

// ─── RUN ALL TESTS ────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🧪 PropConnect Integration Tests\n' + '─'.repeat(50));

  // ── HEALTH ──────────────────────────────────────────────────
  console.log('\n📌 Health');
  await test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    assertStatus(res, 200);
    assert(res.body.status === 'ok', 'status should be ok');
  });

  // ── CAMPAIGNS ───────────────────────────────────────────────
  console.log('\n📌 Campaigns');
  let campaignId;

  await test('GET /api/campaigns returns seeded campaigns', async () => {
    const res = await request(app).get('/api/campaigns');
    assertStatus(res, 200);
    assert(Array.isArray(res.body), 'should be array');
    assert(res.body.length >= 2, `expected ≥2 campaigns, got ${res.body.length}`);
    campaignId = res.body[0].id;
  });

  await test('POST /api/campaigns creates a new campaign', async () => {
    const res = await request(app).post('/api/campaigns').send({
      name: 'Test Campaign Hyderabad',
      description: 'Integration test campaign',
      start_time: '09:00', end_time: '21:00', rate_per_min: 3,
    });
    assertStatus(res, 201);
    assert(res.body.name === 'Test Campaign Hyderabad');
    assert(res.body.id, 'should have id');
    campaignId = res.body.id; // use the new one for further tests
  });

  await test('POST /api/campaigns requires name', async () => {
    const res = await request(app).post('/api/campaigns').send({ description: 'no name' });
    assertStatus(res, 400);
    assert(res.body.error, 'should have error message');
  });

  await test('PATCH /api/campaigns/:id updates campaign', async () => {
    const res = await request(app).patch(`/api/campaigns/${campaignId}`).send({ name: 'Updated Name' });
    assertStatus(res, 200);
    assert(res.body.name === 'Updated Name');
  });

  await test('GET /api/campaigns/:id returns single campaign', async () => {
    const res = await request(app).get(`/api/campaigns/${campaignId}`);
    assertStatus(res, 200);
    assert(res.body.id === campaignId);
  });

  // ── LEADS ───────────────────────────────────────────────────
  console.log('\n📌 Leads');
  let leadId;

  await test('GET /api/leads returns seeded leads', async () => {
    const res = await request(app).get('/api/leads');
    assertStatus(res, 200);
    assert(Array.isArray(res.body.leads), 'leads should be array');
    assert(res.body.total >= 10, `expected ≥10 leads, got ${res.body.total}`);
    leadId = res.body.leads[0].id;
  });

  await test('POST /api/leads creates a lead', async () => {
    const res = await request(app).post('/api/leads').send({
      name: 'Test Lead Ravi Kumar',
      phone: '+919999000001',
      city: 'Hyderabad',
      property_type: 'buy',
      budget: '80 lakh',
      campaign_id: campaignId,
    });
    assertStatus(res, 201);
    assert(res.body.phone === '+919999000001');
    leadId = res.body.id;
  });

  await test('POST /api/leads requires phone', async () => {
    const res = await request(app).post('/api/leads').send({ name: 'No Phone' });
    assertStatus(res, 400);
  });

  await test('GET /api/leads?status=hot_lead filters correctly', async () => {
    const res = await request(app).get('/api/leads?status=hot_lead');
    assertStatus(res, 200);
    assert(res.body.leads.every(l => l.status === 'hot_lead'), 'all should be hot_lead');
  });

  await test('GET /api/leads?search=Mumbai filters by city', async () => {
    const res = await request(app).get('/api/leads?search=Mumbai');
    assertStatus(res, 200);
    assert(res.body.leads.length > 0, 'should find Mumbai leads');
  });

  await test('GET /api/leads/:id returns single lead', async () => {
    const res = await request(app).get(`/api/leads/${leadId}`);
    assertStatus(res, 200);
    assert(res.body.id === leadId);
  });

  await test('PATCH /api/leads/:id updates lead status', async () => {
    const res = await request(app).patch(`/api/leads/${leadId}`).send({ status: 'callback', notes: 'Test note' });
    assertStatus(res, 200);
    assert(res.body.status === 'callback');
  });

  // ── CSV UPLOAD ───────────────────────────────────────────────
  console.log('\n📌 CSV Upload');
  await test('POST /api/leads/upload/csv processes CSV buffer', async () => {
    const csvContent = `phone,name,city,property_type,budget,language
+919111111111,Aisha Sharma,Delhi,buy,1 crore,en
+919222222222,Bharat Patel,Mumbai,rent,40000/month,hi
+919333333333,Chitra Reddy,Bangalore,buy,70 lakh,en`;

    const res = await request(app)
      .post('/api/leads/upload/csv')
      .field('campaign_id', campaignId)
      .attach('file', Buffer.from(csvContent), 'test_leads.csv');

    assertStatus(res, 200);
    assert(typeof res.body.inserted === 'number', 'should have inserted count');
    assert(res.body.inserted >= 3, `expected 3 inserted, got ${res.body.inserted}`);
    console.log(`     → Inserted: ${res.body.inserted}, Skipped: ${res.body.skipped}`);
  });

  await test('CSV upload normalises 10-digit numbers to +91 format', async () => {
    const csvContent = `phone,name,city\n9444444444,Dinesh Kumar,Chennai`;
    const res = await request(app)
      .post('/api/leads/upload/csv')
      .attach('file', Buffer.from(csvContent), 'test.csv');
    assertStatus(res, 200);
    // verify it was stored as +919444444444
    const leads = await request(app).get('/api/leads?search=Dinesh');
    assert(leads.body.leads.some(l => l.phone === '+919444444444'), 'phone should be normalised');
  });

  await test('CSV upload skips DNC numbers', async () => {
    // +912109876543 is in the seeded DNC list
    const csvContent = `phone,name\n+912109876543,DNC Person\n+919555555555,Valid Person`;
    const res = await request(app)
      .post('/api/leads/upload/csv')
      .attach('file', Buffer.from(csvContent), 'test.csv');
    assertStatus(res, 200);
    assert(res.body.skipped >= 1, 'DNC number should be skipped');
  });

  // ── CALLS ───────────────────────────────────────────────────
  console.log('\n📌 Calls');

  await test('GET /api/calls/history returns seeded calls', async () => {
    const res = await request(app).get('/api/calls/history');
    assertStatus(res, 200);
    assert(Array.isArray(res.body.calls), 'should be array');
    assert(res.body.total >= 8, `expected ≥8 calls, got ${res.body.total}`);
  });

  await test('GET /api/calls/history?outcome=interested filters correctly', async () => {
    const res = await request(app).get('/api/calls/history?outcome=interested');
    assertStatus(res, 200);
    assert(res.body.calls.every(c => c.outcome === 'interested'), 'all should be interested');
  });

  await test('GET /api/calls/history?hot_lead=true filters hot leads', async () => {
    const res = await request(app).get('/api/calls/history?hot_lead=true');
    assertStatus(res, 200);
    assert(res.body.calls.every(c => c.hot_lead === true), 'all should be hot_lead');
  });

  await test('POST /api/calls/trigger initiates a simulated call', async () => {
    const res = await request(app).post('/api/calls/trigger').send({ lead_id: leadId });
    assertStatus(res, 200);
    assert(res.body.success === true);
    assert(res.body.call_uuid.startsWith('LOCAL-'), 'should have LOCAL- uuid in mock mode');
    console.log(`     → Call UUID: ${res.body.call_uuid}`);
  });

  await test('POST /api/calls/trigger rejects DNC lead', async () => {
    // +910000000000 is pre-seeded in DNC list
    const dncLead = await request(app).post('/api/leads').send({ name: 'DNC Test', phone: '+910000000001' });
    // Manually add to DNC
    await request(app).post('/api/dnc').send({ phone: '+910000000001', reason: 'test' });
    const res = await request(app).post('/api/calls/trigger').send({ lead_id: dncLead.body.id });
    assertStatus(res, 400);
    assert(res.body.error, 'should have an error message');
    console.log('     → Blocked with:', res.body.error);
  });

  await test('POST /api/calls/retry resets retry leads to pending', async () => {
    const res = await request(app).post('/api/calls/retry').send({});
    assertStatus(res, 200);
    assert(typeof res.body.reset === 'number');
    console.log(`     → Reset: ${res.body.reset} leads to pending`);
  });

  // ── WEBHOOK ─────────────────────────────────────────────────
  console.log('\n📌 Webhook');

  await test('POST /api/webhook/plivo processes call completion', async () => {
    const res = await request(app)
      .post('/api/webhook/plivo')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        CallUUID:    'TEST-WEBHOOK-001',
        To:          '+919876543210',
        From:        '+911234567890',
        Duration:    '180',
        CallStatus:  'completed',
        RecordingUrl: '',
        lead_id:     leadId,
        outcome:     'interested',
        interested:  'true',
        hot_lead:    'true',
        intent:      'buy',
        bhk_preference: '3BHK',
        budget_range: '1.5 crore',
        location_preference: 'Mumbai',
        timeline:    'immediately',
        loan_required: 'false',
        callback_time: '',
        TranscriptText: 'Agent: Namaste!\nLead: Yes.\nAgent: Are you interested?\nLead: Yes very much.',
      });
    assertStatus(res, 200);
  });

  await test('POST /api/webhook/plivo handles no-answer outcome', async () => {
    const res = await request(app)
      .post('/api/webhook/plivo')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        CallUUID:   'TEST-WEBHOOK-002',
        To:         '+919812345678',
        From:       '+911234567890',
        Duration:   '0',
        CallStatus: 'no-answer',
        lead_id:    leadId,
        outcome:    'no_answer',
      });
    assertStatus(res, 200);
  });

  // ── ANALYTICS ───────────────────────────────────────────────
  console.log('\n📌 Analytics');

  await test('GET /api/analytics/summary returns correct structure', async () => {
    const res = await request(app).get('/api/analytics/summary');
    assertStatus(res, 200);
    const b = res.body;
    assert(typeof b.total_leads     === 'number', 'total_leads should be number');
    assert(typeof b.total_calls     === 'number', 'total_calls should be number');
    assert(typeof b.hot_leads       === 'number', 'hot_leads should be number');
    assert(typeof b.answer_rate     === 'number', 'answer_rate should be number');
    assert(typeof b.conversion_rate === 'number', 'conversion_rate should be number');
    assert(typeof b.total_cost_usd  === 'string', 'total_cost_usd should be string');
    console.log(`     → Leads:${b.total_leads} Calls:${b.total_calls} Hot:${b.hot_leads} Rate:${b.conversion_rate}%`);
  });

  await test('GET /api/analytics/daily returns array of daily data', async () => {
    const res = await request(app).get('/api/analytics/daily');
    assertStatus(res, 200);
    assert(Array.isArray(res.body), 'should be array');
    if (res.body.length > 0) {
      assert(res.body[0].date,   'should have date');
      assert(res.body[0].calls !== undefined, 'should have calls');
    }
  });

  await test('GET /api/analytics/outcomes returns outcome breakdown', async () => {
    const res = await request(app).get('/api/analytics/outcomes');
    assertStatus(res, 200);
    assert(Array.isArray(res.body));
    assert(res.body.every(o => o.outcome && typeof o.count === 'number'), 'should have outcome + count');
    console.log(`     → Outcomes: ${res.body.map(o => `${o.outcome}:${o.count}`).join(', ')}`);
  });

  await test('GET /api/analytics/cities returns city breakdown', async () => {
    const res = await request(app).get('/api/analytics/cities');
    assertStatus(res, 200);
    assert(Array.isArray(res.body));
    assert(res.body.length > 0, 'should have cities');
    console.log(`     → Top cities: ${res.body.slice(0,3).map(c => `${c.city}(${c.total})`).join(', ')}`);
  });

  // ── DNC ─────────────────────────────────────────────────────
  console.log('\n📌 DNC List');
  let dncId;

  await test('GET /api/dnc returns seeded DNC entries', async () => {
    const res = await request(app).get('/api/dnc');
    assertStatus(res, 200);
    assert(Array.isArray(res.body));
    assert(res.body.length >= 2, `expected ≥2 DNC entries, got ${res.body.length}`);
    dncId = res.body[0].id;
  });

  await test('POST /api/dnc adds a number to DNC list', async () => {
    const res = await request(app).post('/api/dnc').send({
      phone: '+916666666666',
      reason: 'Test DNC entry',
    });
    assertStatus(res, 201);
    assert(res.body.phone === '+916666666666');
  });

  await test('POST /api/dnc requires phone', async () => {
    const res = await request(app).post('/api/dnc').send({ reason: 'no phone' });
    assertStatus(res, 400);
  });

  await test('DELETE /api/dnc/:id removes entry', async () => {
    const res = await request(app).delete(`/api/dnc/${dncId}`);
    assertStatus(res, 200);
    assert(res.body.success === true);
  });

  await test('POST /api/leads/:id/dnc adds lead to DNC', async () => {
    const res = await request(app).post(`/api/leads/${leadId}/dnc`).send({ reason: 'Requested on call' });
    assertStatus(res, 200);
    assert(res.body.success === true);
  });

  // ── CAMPAIGN LAUNCH ──────────────────────────────────────────
  console.log('\n📌 Campaign Launch');

  await test('POST /api/campaigns/:id/launch starts campaign (local mode)', async () => {
    const res = await request(app).post(`/api/campaigns/${campaignId}/launch`);
    assertStatus(res, 200);
    assert(res.body.success === true, 'should launch successfully');
    console.log(`     → ${res.body.message}`);
  });

  await test('POST /api/campaigns/:id/pause stops campaign', async () => {
    const res = await request(app).post(`/api/campaigns/${campaignId}/pause`);
    assertStatus(res, 200);
    assert(res.body.success === true);
  });

  // ── WAIT FOR AUTO WEBHOOK (from triggerCall simulation) ──────
  console.log('\n📌 Simulated Call Auto-Webhook (waiting 5s...)');
  await new Promise(r => setTimeout(r, 5000));

  await test('Webhook correctly marks lead as hot_lead after interested outcome', async () => {
    // Find a pending lead
    const leadsRes = await request(app).get('/api/leads?status=pending&limit=1');
    const pendingLead = leadsRes.body.leads[0];
    if (!pendingLead) { console.log('     → No pending lead, skipping'); return; }

    // Fire webhook simulating interested outcome
    await request(app)
      .post('/api/webhook/plivo')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        CallUUID: 'AUTO-TEST-999',
        To: pendingLead.phone,
        Duration: '150',
        CallStatus: 'completed',
        lead_id: pendingLead.id,
        outcome: 'interested',
        interested: 'true',
        hot_lead: 'true',
        intent: 'buy',
        budget_range: '1 crore',
      });

    // Verify lead is now hot_lead
    const updated = await request(app).get('/api/leads/' + pendingLead.id);
    assert(updated.body.status === 'hot_lead', 'lead should be hot_lead after interested webhook');
    console.log('     → Lead correctly upgraded to hot_lead');
  });

  // ── DELETE LEAD ───────────────────────────────────────────────
  console.log('\n📌 Cleanup');

  await test('DELETE /api/leads/:id removes lead', async () => {
    // create a throwaway lead first
    const created = await request(app).post('/api/leads').send({ name: 'Delete Me', phone: '+919777777777' });
    const res = await request(app).delete(`/api/leads/${created.body.id}`);
    assertStatus(res, 200);
    assert(res.body.success === true);
  });

  await test('DELETE /api/campaigns/:id removes campaign', async () => {
    const created = await request(app).post('/api/campaigns').send({ name: 'Temp Campaign' });
    const res = await request(app).delete(`/api/campaigns/${created.body.id}`);
    assertStatus(res, 200);
    assert(res.body.success === true);
  });

  // ── SUMMARY ─────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed  |  ${failed} failed  |  ${passed + failed} total\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED — Project is fully functional locally!\n');
  } else {
    console.log('⚠️  Some tests failed — check errors above.\n');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`   ❌ ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
})();
