# Callora — New User Onboarding Guide

Get from zero to your first live AI call in ~20 minutes.

---

## What You'll Need

| Service | What it does | Free tier? |
|---------|-------------|------------|
| **Callora** | The platform itself | ✅ |
| **Sarvam AI** | Voice (STT + TTS) | ✅ Free credits |
| **Plivo** | Phone number + calls | Paid (~₹2/min) |
| **LiveKit** | Real-time audio infra | ✅ Free tier |

---

## Step 1 — Create Your Callora Account

1. Go to your Callora URL and click **Sign Up**
2. Enter your name, email, and password → **Register**
3. You'll land on the **Dashboard**

> ✅ Three starter AI agents are created automatically (English, Hindi, Payment Reminder)

---

## Step 2 — Get Your Sarvam API Key

Sarvam powers the Hindi/English voice (speech recognition + text-to-speech).

1. Go to → **[https://app.sarvam.ai](https://app.sarvam.ai)**
2. Sign up / log in
3. Go to **API Keys** in the left sidebar
4. Click **Create API Key** → copy it

> 💡 Keep this key safe — you'll paste it into Callora Settings in Step 6

---

## Step 3 — Set Up Plivo

Plivo makes the actual phone calls and gives you an Indian DID number.

### 3a. Create a Plivo Account
1. Go to → **[https://console.plivo.com/accounts/register](https://console.plivo.com/accounts/register)**
2. Sign up with your email
3. Verify your phone number
4. You'll land on the Plivo console

### 3b. Copy Your Auth Credentials
1. On the Plivo console homepage, find the **Auth ID** and **Auth Token**
2. Copy both — you'll need them in Step 6

```
Auth ID:    MAXXXXXXXXXXXXXXXXXX
Auth Token: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 3c. Buy an Indian Phone Number
1. In Plivo console → **Phone Numbers → Buy a Number**
2. Search for India (IN), type: Local
3. Pick a number → click **Buy**
4. Note the number (e.g. `+912269XXXXXX`)

> ✅ This becomes your "Caller ID" — the number your leads will see

---

## Step 4 — Set Up LiveKit

LiveKit handles the real-time audio bridge between Plivo and your AI agent.

### 4a. Create a LiveKit Account
1. Go to → **[https://cloud.livekit.io](https://cloud.livekit.io)**
2. Sign up → create a new **Project** (e.g. "callora-prod")
3. In the project dashboard, go to **Settings → Keys**
4. Copy your:

```
WebSocket URL:  wss://your-project.livekit.cloud
API Key:        APISxxxxxxxxxxxxxxxxx
API Secret:     xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4b. Create an Outbound SIP Trunk (Plivo Zentrunk)

This connects LiveKit to Plivo so calls can go through the phone network.

1. In **Plivo console** → go to **Voice → Zentrunk**
2. Click **Create Outbound Trunk**
3. Set the name: `callora-outbound`
4. Under **Credentials**, set a username and password (e.g. `callora` / `your-password`)
5. Click **Save** → copy the **Trunk ID** (looks like `TK_XXXXXXXXXX`)

Now register this trunk in LiveKit:

1. In **LiveKit console** → go to **SIP**
2. Click **Create Outbound Trunk**
3. Fill in:

| Field | Value |
|-------|-------|
| Name | `Plivo Zentrunk` |
| SIP Server Address | `trunkinbound.plivo.com` |
| Username | *(your Plivo Zentrunk username)* |
| Password | *(your Plivo Zentrunk password)* |
| Numbers (From) | `+912269XXXXXX` *(your Plivo DID from Step 3c)* |

4. Click **Save** → copy the **SIP Trunk ID** (looks like `ST_XXXXXXXXXX`)

> ✅ LiveKit will now route outbound calls through Plivo's network

---

## Step 5 — Configure Environment Variables (Server Setup)

If you're self-hosting Callora, add these to your `backend/.env` and `agent/.env` files.

**`backend/.env`**
```env
PORT=5000
NODE_ENV=production

PLIVO_AUTH_ID=MAXXXXXXXXXXXXXXXXXX
PLIVO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PLIVO_FROM_NUMBER=+912269XXXXXX

LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APISxxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_SIP_TRUNK_ID=ST_XXXXXXXXXX

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJxxxxxxxxxx

FRONTEND_URL=https://your-callora-domain.com
WEBHOOK_BASE_URL=https://your-backend-url.com
```

**`agent/.env`**
```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APISxxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SARVAM_API_KEY=your_sarvam_api_key
BACKEND_URL=https://your-backend-url.com
INTERNAL_SECRET=your-random-secret-string
```

---

## Step 6 — Connect Everything in Callora Settings

This is where you connect all your external accounts inside the dashboard.

1. In Callora → go to **Settings → Credentials**
2. Fill in the form:

| Field | Where to get it |
|-------|----------------|
| Plivo Auth ID | Plivo console homepage |
| Plivo Auth Token | Plivo console homepage |
| LiveKit URL | LiveKit project → Settings → Keys |
| LiveKit API Key | LiveKit project → Settings → Keys |
| LiveKit API Secret | LiveKit project → Settings → Keys |
| Sarvam API Key | app.sarvam.ai → API Keys |

3. Click **Save Credentials**
4. Click **Test Plivo** → should show ✅ Connected
5. Click **Test LiveKit** → should show ✅ Connected

---

## Step 7 — Add Your Phone Number

1. In Callora → go to **Numbers**
2. Click **Sync from Plivo** — it will automatically pull all numbers from your Plivo account
3. Your number should appear in the list ✅

---

## Step 8 — Create Your AI Assistant

1. Go to **Assistants** in the sidebar
2. Click **New Assistant** (or edit one of the 3 starter templates)
3. Configure:

| Setting | Description |
|---------|-------------|
| **Name** | Internal label (e.g. "Grace Resilvia Agent") |
| **Greeting** | First thing the agent says when call connects |
| **System Prompt** | Full script + personality + call objective |
| **Voice** | Pick Meera or Ishita for clearest Hinglish |
| **Language** | Auto-detect (recommended) or pin to Hindi/English |
| **LLM** | `llama-3.1-8b-instant` is fastest for sales calls |

4. Click **Save**

> 💡 Use `{{name}}`, `{{city}}`, `{{budget}}` in your greeting and prompt — these get replaced with the lead's actual data at call time

---

## Step 9 — Upload Leads & Run Your First Campaign

### Upload Leads
1. Go to **Leads → Upload CSV**
2. Your CSV should have these columns:

```csv
name,phone,city,property_type,budget,language
Rahul Sharma,+919876543210,Gurgaon,3BHK,1 crore,hi-IN
Priya Mehta,+918765432109,Mumbai,2BHK,80 lakhs,en-IN
```

> ⚠️ Phone numbers must include country code (+91 for India)

### Create a Campaign
1. Go to **Campaigns → New Campaign**
2. Set a name, pick your Assistant, set calling hours (e.g. 10am–7pm)
3. Click **Add Leads** → select your uploaded leads
4. Click **Launch** ✅

The AI agent will automatically start calling leads in sequence.

---

## Step 10 — Monitor Calls

| Where | What you'll see |
|-------|----------------|
| **Dashboard** | Live stats — calls made, answered, hot leads |
| **Call History** | Every call with transcript, recording, AI analysis |
| **Campaigns** | Progress per campaign |
| **Leads** | Updated status after each call (interested / callback / etc.) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **Test Plivo fails** | Double-check Auth ID and Token — no spaces |
| **Test LiveKit fails** | Make sure URL starts with `wss://` not `https://` |
| **Calls not connecting** | Verify SIP Trunk ID is set in your `.env` |
| **Agent doesn't speak Hindi** | Set language to `hi-IN` or leave on Auto-detect |
| **No transcript saved** | Check agent logs — Sarvam API key may be missing |
| **Call connects but no audio** | Noise cancellation + SIP codec mismatch — check LiveKit SIP settings |

---

## Quick Reference — Where to Find Everything

```
Plivo Auth ID + Token  →  console.plivo.com  (homepage)
Plivo DID Number       →  console.plivo.com  → Phone Numbers
Plivo Zentrunk ID      →  console.plivo.com  → Voice → Zentrunk
LiveKit URL/Key/Secret →  cloud.livekit.io   → Your Project → Settings → Keys
LiveKit SIP Trunk ID   →  cloud.livekit.io   → SIP → Outbound Trunks
Sarvam API Key         →  app.sarvam.ai      → API Keys
```

---

*Questions? Open an issue on the GitHub repo or check the README.*
