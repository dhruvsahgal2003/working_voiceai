# Velryx — AI Voice Calling Agent
### Real Estate Lead Qualification · India · Plivo + Supabase + React

---

## Stack
- **Frontend**: React + Vite + Recharts
- **Backend**: Node.js + Express
- **Calling**: Plivo AI Agent API
- **Database**: Supabase (PostgreSQL)
- **Auth/Storage**: Supabase

---

## Quick Start

### 1. Clone & Install

```bash
# Backend
cd backend
npm install
cp .env.example .env      # Fill in your credentials

# Frontend
cd ../frontend
npm install
```

### 2. Set Up Supabase

1. Create project at https://supabase.com
2. Go to SQL Editor → paste contents of `backend/config/schema.sql` → Run
3. Copy your Project URL and service_role key into `.env`

### 3. Set Up Plivo

1. Sign up at https://plivo.com
2. Complete India KYC for +91 DID number (takes 3–5 days)
3. Create an AI Agent at https://console.plivo.com/ai-agents
4. Copy Auth ID, Auth Token, phone number, and Agent ID into `.env`

### 4. Configure .env

```env
PORT=5000
PLIVO_AUTH_ID=your_auth_id
PLIVO_AUTH_TOKEN=your_auth_token
PLIVO_FROM_NUMBER=+91XXXXXXXXXX
PLIVO_AI_AGENT_ID=your_agent_id
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
FRONTEND_URL=http://localhost:5173
WEBHOOK_BASE_URL=https://your-ngrok-or-deployment-url
```

### 5. Expose Backend for Webhooks (Local Dev)

Plivo needs a public URL to fire webhooks. Use ngrok:

```bash
npm install -g ngrok
ngrok http 5000
# Copy the https URL → set as WEBHOOK_BASE_URL in .env
```

### 6. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open http://localhost:5173

---

## Usage Flow

1. **Create Campaign** → Campaigns → New Campaign
2. **Upload Leads** → Leads → Upload CSV
   - Required column: `phone` (10 digits or +91 format)
   - Optional: `name`, `city`, `property_type`, `budget`, `language`, `notes`
3. **Assign leads to campaign** (done during upload)
4. **Launch Campaign** → Campaigns → Launch button
5. **Monitor** → Dashboard auto-updates with live stats
6. **Review Hot Leads** → Call History → filter `hot_lead=true`

---

## CSV Format

```csv
phone,name,city,property_type,budget,language,notes
9876543210,Rahul Sharma,Mumbai,buy,1.5 crore,en,From 99acres
+919812345678,Priya Patel,Pune,rent,25000/month,hi,
```

---

## Plivo AI Agent Setup

In Plivo console, create an AI agent with this system prompt:

```
You are Priya, a professional property advisor at PropConnect.

GOAL: Qualify the lead by collecting:
1. Intent (buy/sell/rent)
2. Property type & BHK preference
3. Budget range
4. Preferred location
5. Timeline
6. Loan dependency

RULES:
- Always start: "This call may be recorded for quality"
- Max 4 minutes per call
- If asked "are you a bot" → say "I'm a voice assistant from PropConnect"
- If DND requested → apologize and end call
- Tone: warm, professional, not pushy

EXTRACT these variables at call end (JSON):
{
  "interested": boolean,
  "outcome": "interested|not_interested|callback|no_answer|wrong_number|busy",
  "intent": "buy|sell|rent",
  "bhk_preference": string,
  "budget_range": string,
  "location_preference": string,
  "timeline": string,
  "loan_required": boolean,
  "callback_time": string
}
```

Set the webhook URL to: `https://your-backend-url/api/webhook/plivo`

---

## Deployment

### Railway (Backend)
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
cd backend && railway up
```

### Vercel (Frontend)
```bash
npm install -g vercel
cd frontend && vercel
# Set VITE_API_URL to your Railway backend URL
```

---

## Cost Estimate (India)

| Calls/Month | Avg Duration | AI Agent Cost | Voice Cost | Total |
|-------------|--------------|---------------|------------|-------|
| 500         | 3 min        | $75           | ₹900       | ~₹7,000 |
| 1,000       | 3 min        | $150          | ₹1,800     | ~₹14,000 |
| 5,000       | 3 min        | $750          | ₹9,000     | ~₹72,000 |

---

## Legal (India)

- [ ] Register on TRAI DLT as Telemarketer
- [ ] Scrub all numbers against NDNC before uploading
- [ ] Only call opted-in leads (99acres, MagicBricks, your website forms)
- [ ] Calling hours: 10am–7pm IST only (enforced by backend)
- [ ] Include recording disclosure in every call (in agent script)
- [ ] Maintain DNC list and honor opt-outs immediately

---

## Project Structure

```
realestate-voice-agent/
├── backend/
│   ├── routes/
│   │   ├── leads.js        ← Lead CRUD, CSV upload
│   │   ├── campaigns.js    ← Campaign management + runner
│   │   ├── calls.js        ← Call trigger + history
│   │   ├── webhook.js      ← Plivo post-call webhook
│   │   ├── analytics.js    ← Stats & charts data
│   │   └── dnc.js          ← DNC list management
│   ├── services/
│   │   ├── plivo.js        ← Plivo API wrapper
│   │   └── supabase.js     ← DB client
│   ├── config/
│   │   └── schema.sql      ← Run this in Supabase
│   ├── server.js
│   ├── .env.example
│   └── package.json
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Campaigns.jsx
        │   ├── Leads.jsx
        │   ├── CallHistory.jsx
        │   ├── Analytics.jsx
        │   └── Misc.jsx (DNC + Settings)
        ├── components/
        │   ├── Sidebar.jsx
        │   └── StatusBadge.jsx
        ├── context/ToastContext.jsx
        ├── services/api.js
        └── App.jsx
```
