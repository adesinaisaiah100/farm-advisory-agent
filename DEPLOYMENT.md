# BirdVet Production Deployment Runbook (Render + Cloudflare Pages)

This guide documents how the entire BirdVet trinity (Hono API, Baileys WhatsApp Bridge, and React Clinician Web Dashboard) is deployed and operated 24/7 autonomously in the cloud for $0/month.

---

## Live Production Environments

| Service | Component | Platform | Live URL | Health Check / Probe |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Dashboard** | React + Vite SPA | Cloudflare Pages | [https://birdvet-dashboard.pages.dev](https://birdvet-dashboard.pages.dev) | Edge CDN (200 OK) |
| **Triage & Clinical API** | Hono Node 22 Server | Render (Free Web Service) | [https://birdvet-api.onrender.com](https://birdvet-api.onrender.com) | `GET /health`, `GET /ready` |
| **WhatsApp Daemon** | Baileys Node Host | Render (Free Web Service) | [https://birdvet-bridge.onrender.com](https://birdvet-bridge.onrender.com) | `GET /health` |

---

## Architecture Overview

```
                      [Farmer WhatsApp Voice / Text]
                                    │ (Direct 24/7 WebSocket)
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │                    RENDER PLATFORM                     │
       │                                                        │
       │  ┌──────────────────────────────────────────────────┐  │
       │  │ Service: birdvet-bridge (Dockerfile.bridge)       │  │
       │  │  - Baileys Node WebSocket daemon                 │  │
       │  │  - HTTP Keep-alive & Health Probe on PORT 3002   │  │
       │  │  - Connected Phone: +234 707 179 4632            │  │
       │  └──────────────────────────┬───────────────────────┘  │
       │                             │ HTTPS POST /chat         │
       │                             │ (https://birdvet-api     │
       │                             │   .onrender.com/chat)    │
       │  ┌──────────────────────────▼───────────────────────┐  │
       │  │ Service: birdvet-api (Dockerfile.api)            │  │
       │  │  - Hono API on Node 22                           │  │
       │  │  - Neon Postgres via Drizzle ORM                │  │
       │  │  - Cloudflare R2 via S3 SigV4                    │  │
       │  │  - Gemini 3.1 Flash Lite Triage Core             │  │
       │  └──────────────────────────▲───────────────────────┘  │
       └─────────────────────────────┼──────────────────────────┘
                                     │ HTTPS REST (CORS enabled)
                                     │
       ┌─────────────────────────────┴──────────────────────────┐
       │                   CLOUDFLARE PAGES                     │
       │                                                        │
       │  Service: birdvet-dashboard (React + Vite SPA)         │
       │   - Global Edge CDN (Free unlimited bandwidth)         │
       │   - VITE_API_URL -> https://birdvet-api.onrender.com   │
       └────────────────────────────────────────────────────────┘
```

---

## Zero-Cost 24/7 Keep-Alive Strategy (UptimeRobot)

Render free web services enter sleep mode after 15 minutes of zero inbound HTTP traffic. To keep both `birdvet-api` and `birdvet-bridge` awake 24/7 at $0 cost:

1. Create a free account at [uptimerobot.com](https://uptimerobot.com) (or cron-job.org).
2. Add Monitor 1:
   - **Type**: HTTP(s)
   - **Friendly Name**: `BirdVet API Keepalive`
   - **URL**: `https://birdvet-api.onrender.com/health`
   - **Interval**: Every 5 minutes
3. Add Monitor 2:
   - **Type**: HTTP(s)
   - **Friendly Name**: `BirdVet WhatsApp Bridge Keepalive`
   - **URL**: `https://birdvet-bridge.onrender.com/health`
   - **Interval**: Every 5 minutes

This guarantees the WhatsApp WebSocket connection and Hono API never sleep.

---

## Deployment Instructions

1. A **Railway** account ([railway.com](https://railway.com)).
2. A **Cloudflare** account ([cloudflare.com](https://cloudflare.com)).
3. Access to your GitHub repository: `https://github.com/adesinaisaiah100/farm-advisory-agent`.
4. Your `.env` credentials (Neon Postgres connection string, Gemini API key, Cloudflare R2 credentials).

---

## Step 1: Deploy the Backend API (`apps/api`) on Railway

1. Log into **Railway** and click **New Project** -> **Deploy from GitHub repo**.
2. Select `adesinaisaiah100/farm-advisory-agent`.
3. In the project canvas, click on the newly created service, go to **Settings**:
   - **Service Name**: Rename to `birdvet-api`.
   - Under **Build**:
     - **Builder**: Select `Dockerfile`.
     - **Dockerfile Path**: Enter `Dockerfile.api`.
4. Go to the **Variables** tab and add the required environment variables:
   - `DATABASE_URL`: Your Neon Postgres pooled connection string (`postgresql://neondb_owner:...@ep-...-pooler....neon.tech/neondb?sslmode=require`).
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
   - `GEMINI_MODEL`: `gemini-3.1-flash-lite`.
   - `GEMINI_TRANSCRIBE_MODEL`: `gemini-3.5-transcribe`.
   - `OPENROUTER_API_KEY`: *(Optional fallback provider)*.
   - `OPENROUTER_FALLBACK_MODEL`: `openrouter/free`.
   - `R2_ACCOUNT_ID`: Your Cloudflare R2 Account ID.
   - `R2_BUCKET`: `birdvet`.
   - `R2_ACCESS_KEY_ID`: Your R2 S3 Access Key ID.
   - `R2_SECRET_ACCESS_KEY`: Your R2 S3 Secret Access Key.
   - `R2_PUBLIC_URL`: `https://r2.birdvet.cloud` *(or your custom/public R2 domain)*.
   - `PORT`: `3000`.
5. Go to **Networking** (or **Settings** -> **Public Networking**) and click **Generate Domain**:
   - Railway will provide a public URL like: `https://birdvet-api-production.up.railway.app`.
   - Verify by navigating to `https://birdvet-api-production.up.railway.app/health` -> should return `{"status":"ok","service":"poultry-api"}`.

---

## Step 2: Deploy the WhatsApp Bridge (`apps/bridge`) on Railway

1. In the **same Railway project**, click the **+ New** button (top right) -> **GitHub Repo**.
2. Select the same repository: `adesinaisaiah100/farm-advisory-agent`.
3. Click on the new service and go to **Settings**:
   - **Service Name**: Rename to `birdvet-bridge`.
   - Under **Build**:
     - **Builder**: Select `Dockerfile`.
     - **Dockerfile Path**: Enter `Dockerfile.bridge`.
4. **CRITICAL STEP: Attach a Persistent Volume**:
   - Under the service **Settings**, scroll down to **Volumes** (or go to the **Volumes** tab).
   - Click **Add Volume**.
   - **Mount Path**: Enter `/data`.
   - Click **Add**.
   > *Why this is essential*: Baileys stores the cryptographic Signal keys and `creds.json` under `/data/session`. The volume guarantees that whenever code updates are deployed, the bot reconnects automatically without asking for a new QR scan!
5. Go to the **Variables** tab for `birdvet-bridge` and add:
   - `BRIDGE_SESSION_DIR`: `/data/session`.
   - `BRIDGE_LOG_LEVEL`: `info`.
   - `BRIDGE_TURN_URL`: `https://birdvet-api-production.up.railway.app/chat` *(or internal private networking: `http://birdvet-api.railway.internal:3000/chat`)*.
   - `GEMINI_API_KEY`: Your Gemini API Key.
   - `GEMINI_TRANSCRIBE_MODEL`: `gemini-3.5-transcribe`.
   - `R2_ACCOUNT_ID`: Your R2 Account ID.
   - `R2_BUCKET`: `birdvet`.
   - `R2_ACCESS_KEY_ID`: Your R2 S3 Access Key ID.
   - `R2_SECRET_ACCESS_KEY`: Your R2 S3 Secret Access Key.
6. **Initial QR Code Scan (One-Time Pairing)**:
   - Click the **Deployments** or **View Logs** tab on `birdvet-bridge`.
   - As the container boots, Baileys will print a QR code in the Railway terminal logs.
   - Open WhatsApp on the bot phone (`07071794632`) -> **Settings** -> **Linked Devices** -> **Link a Device**.
   - Point your phone camera at the QR code in the Railway log window.
   - You will see:
     ```json
     {"level":"info","message":"bridge connected","self":"2347071794632:2@s.whatsapp.net"}
     ```
   - From this point forward, the session is saved on the persistent `/data` volume. You never have to scan again.

---

## Step 3: Deploy the Clinician Web Dashboard (`apps/web`) on Cloudflare Pages

1. Log into the **Cloudflare Dashboard** ([dash.cloudflare.com](https://dash.cloudflare.com)).
2. Go to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Select your GitHub repository: `adesinaisaiah100/farm-advisory-agent`.
4. Configure the Build & Deployment Settings:
   - **Project Name**: `birdvet` (or `birdvet-dashboard`).
   - **Production Branch**: `main` (or your active release branch).
   - **Framework Preset**: `None` (or `Vite`).
   - **Build Command**: `pnpm run build:web`
   - **Build Output Directory**: `apps/web/dist`
   - **Root Directory**: Leave blank (monorepo root).
5. Expand **Environment variables** (Advanced) and add:
   - `VITE_API_URL`: `https://birdvet-api-production.up.railway.app` *(Your Railway API domain from Step 1)*.
   - `NODE_VERSION`: `22`.
6. Click **Save and Deploy**.
   - Cloudflare will clone, run `pnpm run build:web`, and publish your dashboard globally to `https://birdvet.pages.dev` in ~45 seconds.

---

## Verification Checklist

| Test Item | Verification Method | Expected Result |
| :--- | :--- | :--- |
| **API Health Probe** | `curl https://<api-url>/health` | `{"status":"ok","service":"poultry-api"}` |
| **Database Readiness** | `curl https://<api-url>/ready` | `{"ok":true,"checks":{"database":{"ok":true}}}` |
| **WhatsApp Direct Turn** | Send "my birds are coughing" to `+234 707 179 4632` | Immediate Nigerian Pidgin clinical triage reply |
| **Web Dashboard** | Open `https://birdvet.pages.dev` | Cases, Outbreaks, Agro-Vet Stores, and Library load live from Neon |
| **Redeploy Persistence** | Trigger a git push on Railway for `birdvet-bridge` | Container restarts and reconnects without asking for a QR scan |
