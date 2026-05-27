// API client — all backend endpoints, auto-injects auth token
const BASE = '/api';

function getToken() { return localStorage.getItem('pc_token'); }

async function req(method, path, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: opts.noJson ? { Authorization: headers.Authorization } : headers,
    body: body ? (opts.noJson ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  auth: {
    login: d => req('POST', '/auth/login', d),
    register: d => req('POST', '/auth/register', d),
    me: () => req('GET', '/auth/me'),
    updateProfile: d => req('PATCH', '/auth/profile', d),
  },
  campaigns: {
    list: () => req('GET', '/campaigns'),
    get: id => req('GET', `/campaigns/${id}`),
    create: d => req('POST', '/campaigns', d),
    update: (id, d) => req('PATCH', `/campaigns/${id}`, d),
    delete: id => req('DELETE', `/campaigns/${id}`),
    launch: id => req('POST', `/campaigns/${id}/launch`),
    pause: id => req('POST', `/campaigns/${id}/pause`),
    addLeads: (id, leadIds) => req('POST', `/campaigns/${id}/add-leads`, leadIds ? { lead_ids: leadIds } : {}),
  },
  leads: {
    list: (p = {}) => req('GET', `/leads?${new URLSearchParams(p)}`),
    get: id => req('GET', `/leads/${id}`),
    create: d => req('POST', '/leads', d),
    add: d => req('POST', '/leads', d),  // alias
    update: (id, d) => req('PATCH', `/leads/${id}`, d),
    delete: id => req('DELETE', `/leads/${id}`),
    addDnc: (id, reason) => req('POST', `/leads/${id}/dnc`, { reason }),
    upload: (file, campaignId) => {
      const fd = new FormData();
      fd.append('file', file);
      if (campaignId) fd.append('campaign_id', campaignId);
      return req('POST', '/leads/upload/csv', fd, { noJson: true });
    },
    uploadCsv: (file, campaignId) => {
      const fd = new FormData();
      fd.append('file', file);
      if (campaignId) fd.append('campaign_id', campaignId);
      return req('POST', '/leads/upload/csv', fd, { noJson: true });
    },
    timeline: id => req('GET', `/leads/${id}/timeline`),
  },
  calls: {
    trigger: leadId => req('POST', '/calls/trigger', { lead_id: leadId }),
    list: (p = {}) => req('GET', `/calls/history?${new URLSearchParams(p)}`),
    history: (p = {}) => req('GET', `/calls/history?${new URLSearchParams(p)}`),
    get: id => req('GET', `/calls/${id}`),
    retry: campaignId => req('POST', '/calls/retry', { campaign_id: campaignId }),
    end: id => req('POST', `/calls/${id}/end`),
  },
  analytics: {
    get: async (p = {}) => {
      const qs = new URLSearchParams(p);
      const [rawSummary, rawDaily, outcomes, campaigns] = await Promise.all([
        req('GET', `/analytics/summary?${qs}`),
        req('GET', `/analytics/daily?${qs}`).catch(() => []),
        req('GET', `/analytics/outcomes?${qs}`).catch(() => []),
        req('GET', `/analytics/campaigns?${qs}`).catch(() => []),
      ]);
      // Normalize field names for the UI
      const summary = rawSummary ? {
        ...rawSummary,
        avg_duration: rawSummary.avg_duration_sec,
        credits_spent: rawSummary.total_cost_inr,
        answered: Math.round((rawSummary.answer_rate / 100) * rawSummary.total_calls),
      } : {};
      const daily_volume = (rawDaily || []).map(d => ({ ...d, total: d.calls, answered: d.hot_leads }));
      return { summary, daily_volume, outcomes, campaigns };
    },
    export: async (p = {}) => {
      const token = getToken();
      const res = await fetch(`${BASE}/analytics/export?${new URLSearchParams(p)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    },
    summary: (p = {}) => req('GET', `/analytics/summary?${new URLSearchParams(p)}`),
    daily: (p = {}) => req('GET', `/analytics/daily?${new URLSearchParams(p)}`),
    outcomes: (p = {}) => req('GET', `/analytics/outcomes?${new URLSearchParams(p)}`),
    cities: () => req('GET', '/analytics/cities'),
  },
  agents: {
    list: () => req('GET', '/agents'),
    get: id => req('GET', `/agents/${id}`),
    create: d => req('POST', '/agents', d),
    update: (id, d) => req('PATCH', `/agents/${id}`, d),
    delete: id => req('DELETE', `/agents/${id}`),
    generatePrompt: d => req('POST', '/agents/generate-prompt', d),
  },
  dnc: {
    list: () => req('GET', '/dnc'),
    add: (phone, reason) => req('POST', '/dnc', { phone, reason }),
    remove: id => req('DELETE', `/dnc/${id}`),
    import: file => { const fd = new FormData(); fd.append('file', file); return req('POST', '/dnc/import', fd, { noJson: true }); },
  },
  billing: {
    balance: () => req('GET', '/billing/balance'),
    history: () => req('GET', '/billing/history'),
    usage: () => req('GET', '/billing/usage'),
    createOrder: amount => req('POST', '/billing/create-order', { amount }),
    verify: d => req('POST', '/billing/verify', d),
  },
  numbers: {
    list: () => req('GET', '/numbers'),
    add: d => req('POST', '/numbers', d),
    delete: id => req('DELETE', `/numbers/${id}`),
    sync: () => req('POST', '/numbers/sync'),
  },
  events: {
    list: (limit = 50) => req('GET', `/events?limit=${limit}`),
    readAll: () => req('POST', '/events/read-all'),
  },
  settings: {
    getCredentials: () => req('GET', '/settings/credentials'),
    saveCredentials: d => req('PUT', '/settings/credentials', d),
    connectPlivo: d => req('POST', '/settings/connect-plivo', d),
    disconnectPlivo: () => req('POST', '/settings/disconnect-plivo', {}),
    testPlivo: d => req('POST', '/settings/test-plivo', d),
  },
  transcripts: { get: callId => req('GET', `/transcripts/${callId}`) },
  recordings: { get: callId => req('GET', `/recordings/${callId}`) },
  webhooks: {
    list: () => req('GET', '/webhooks'),
    create: d => req('POST', '/webhooks', d),
    update: (id, d) => req('PATCH', `/webhooks/${id}`, d),
    delete: id => req('DELETE', `/webhooks/${id}`),
    test: id => req('POST', `/webhooks/${id}/test`),
  },
  knowledge: {
    list: (p = {}) => req('GET', `/knowledge?${new URLSearchParams(p)}`),
    create: d => req('POST', '/knowledge', d),
    update: (id, d) => req('PATCH', `/knowledge/${id}`, d),
    delete: id => req('DELETE', `/knowledge/${id}`),
    upload: (file, title, agentId) => {
      const fd = new FormData();
      fd.append('file', file);
      if (title) fd.append('title', title);
      if (agentId) fd.append('agent_id', agentId);
      return req('POST', '/knowledge/upload', fd, { noJson: true });
    },
  },
  admin: {
    stats: () => req('GET', '/admin/stats'),
    users: (p = {}) => req('GET', `/admin/users?${new URLSearchParams(p)}`),
    updateUser: (id, d) => req('PATCH', `/admin/users/${id}`, d),
    addCredits: (id, amount) => req('POST', `/admin/users/${id}/credits`, { amount }),
  },
};
