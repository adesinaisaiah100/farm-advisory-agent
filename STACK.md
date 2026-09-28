# Poultry Advisory Agent — Stack & Deployment (Locked)

> Status: fully locked. Last decisions closed: Cloudflare Workers core · single-provider Google free tier (`gemini-3.1-flash-lite` / `gemini-2.5-flash` / `gemini-3.5-transcribe` / `gemini-embedding-001` @ 768 dims) · Neon + pgvector · single Node bridge for Baileys.

---

## 1. Language & tooling

| | Choice |
|---|---|
| Language | **TypeScript (strict)** |
| Package manager / workspace | **pnpm monorepo** |
| Node | 22 LTS (bridge) · wrangler for Workers |
| Formatter/linter | Prettier + ESLint (typescript-eslint) |
| Tests | **Vitest** (+ msw for API tests) |

## 2. Repo layout

```
poultry-agent/
├─ apps/
│  ├─ api/          → Hono (deploys to Cloudflare Workers) · Drizzle · Zod
│  │                  · pino · Langfuse · Sentry · Cron Triggers
│  └─ web/          → React + Vite (deploys to Cloudflare Pages) · useChat · Tailwind
├─ packages/
│  ├─ core/         → orchestrator · session_state · validateCase() · missing()
│  ├─ schemas/      → Zod contracts (InboundMessage · case · media · outbox)
│  ├─ rag/          → ingestion · retrieval (pgvector) · analyze_document
│  └─ bridge/       → WhatsApp: Baileys + normalize() (Node process)
├─ diagrams.mmd · SYSTEM_DESIGN.md · STACK.md
```

## 3. Runtime matrix (who runs what)

| Piece | Runs on | Notes |
|---|---|---|
| Hono API · orchestrator · tools · RAG · media ingest · cases · analytics · auth | **Cloudflare Workers** | stateless; handlers + Cron Triggers |
| Dashboard + web chat UI | **Cloudflare Pages** (static React) | `useChat` streams directly from the API route |
| WhatsApp bridge (Baileys) | **ONE Node process** (fly-io/Railway/Render free) | long-lived socket, QR pairing, reconnect, polls outbox |
| Postgres + pgvector | **Neon** (free tier) | 12 tables, HTTP (fetch) from Worker |
| Media evidence + uploaded docs | **Cloudflare R2** | `media/{phone}/{date}/{uuid}.{ext}` keys, phone stored digits-only (`+234...` → `234...`), date is UTC |
| Embeddings | **Google AI Studio** `gemini-embedding-001` @ **768 dims** via MRL (free tier) | hosted API from Worker; L2-normalized in code |
| Transcription | **Google AI Studio** `gemini-3.5-transcribe` + dynamic Pidgin prompt | single-provider MVP, see §4 |
| Scheduled jobs | **Workers Cron Triggers** | surveillance digest · outbox liveness |

**How the Worker reaches Neon:** over HTTP with `fetch`, via `@neondatabase/serverless` +
`drizzle-orm/neon-http`. A Worker cannot open a raw TCP socket, so the WebSocket
driver (`neonConfig` + `Pool`) is a Node-only path; the two dialects are
interchangeable behind Drizzle, so the same queries and schema serve both. The
Node-side ingest scripts still use `drizzle-orm/node-postgres` for DDL and bulk
loads, which is why both drivers are in the tree. This line previously said
"TCP from Worker", which was never possible.

**Why a Node bridge at all:** Cloudflare Workers are stateless/short-lived. Baileys needs a *persistent* WebSocket + session/QR state, which cannot live on a Worker. The bridge is a ~150-line dumb pipe (has no orchestrator/DB/LLM logic) and is behind the `normalize()` + outbox interface so the official WhatsApp API can replace it later with zero changes to the API core.

## 4. LLM & AI services

| Need | Provider / model | Notes |
|---|---|---|
| Chat + tools + vision | Google `gemini-3.1-flash-lite` | structured output; used for chat, tool calls, `analyze_image`; most of the traffic, so the cheapest capable model |
| Embeddings | Google `gemini-embedding-001` → **768 dims** (MRL) | column frozen to 768; model identical at ingest & query |
| Pidgin transcription | Google `gemini-3.5-transcribe` + dynamic Pidgin prompt | keeps Pidgin verbatim ("wetin you dey talk" stays as spoken); conf < 0.6 → farmer confirms |
| Pipeline: `analyze_document` (ingestion map-call) | Google `gemini-2.5-flash` | 1 LLM call per doc; the one genuinely reasoning-heavy call, so it does not run on the chat model; runs per document, not per turn |
| Optional 429 fallback | OpenRouter free multimodal | **not wired.** If added, the model must accept audio and must not be a reasoning model — reasoning paraphrases, and farmer speech is evidence that must survive verbatim |

**Single-provider amendment (Sep 2026).** This section originally specified OpenAI `GPT-4o-mini` for the
turn, OpenRouter free multimodal for transcription, and `text-embedding-004` for embeddings. All three
changed: the MVP has no API budget, and Google's free tier covers the entire surface with no card, which
collapses two providers and two keys into one. `text-embedding-004` is separately deprecated;
`gemini-embedding-001` is the documented text replacement, and 768 dims is retained by requesting MRL
truncation rather than by model choice.

## 5. Data layer (Postgres + pgvector on Neon) — full schema

```mermaid
erDiagram
    FARMER ||--o{ SESSION : runs
    SESSION ||--o{ MESSAGE : contains
    SESSION ||--o{ CASE : produces
    CASE ||--o{ MEDIA : evidences
    CASE ||--o{ FLAG : raises
    FARMER ||--o{ OUTBOX : receives
    DOCUMENT ||--o{ CHUNK_GROUP : contains
    CHUNK_GROUP ||--o{ CHUNK : contains
    CASE }o--o{ STORE : "referral slip to"

    FARMER { text phone PK
        text name
        jsonb location
        int farm_size
        text species }
    SESSION { uuid id PK
        text farmer_phone FK
        timestamp started_at
        timestamp last_active
        jsonb state
        text status }
    MESSAGE { uuid id PK
        uuid session_id FK
        text wa_msg_id
        text sender
        text type
        text payload
        timestamp sent_at }
    CASE { uuid id PK
        uuid session_id FK
        jsonb case_data
        text status
        text disease_hits
        boolean critical
        text referral_slip }
    MEDIA { uuid id PK
        text farmer_phone FK
        uuid case_id FK
        text mime
        text r2_key
        text kind
        text transcript
        float transcript_conf
        jsonb observations }
    FLAG { uuid id PK
        uuid case_id FK
        text type
        text reason
        timestamp created_at
        boolean reviewed }
    OUTBOX { uuid id PK
        text farmer_phone FK
        text payload_type
        text status
        int attempt
        timestamp next_attempt_at }
    DOCUMENT { uuid id PK
        text title
        text source
        text file_key }
    CHUNK_GROUP { uuid id PK
        uuid document_id FK
        text title
        int range_start
        int range_end
        text diseases
        text section_types
        text species }
    CHUNK { uuid id PK
        uuid chunk_group_id FK
        int position
        text text
        vector embedded }
    REPORTS { uuid id PK
        uuid session_id FK
        jsonb report
        timestamp created_at }
    STORE { uuid id PK
        text name
        text lga
        text phone
        jsonb location
        jsonb stock }
```

## 6. Observability (locked)

| Tool | Role | Wiring |
|---|---|---|
| Langfuse | LLM traces · tokens · cost · replay | `@langfuse/vercel-ai-sdk` wraps LLM+tools |
| Sentry | exceptions across API/bridge/dashboard | `@sentry/node` on Hono + bridge, `@sentry/react` on web |
| pino | structured logs w/ `session_id`+`phone` | every handler; request logger middleware |
| `/health` `/ready` | liveness + deps (db·r2·embed) | continuous uptime monitor |
| Workers Cron | outbox liveness + surveillance digest | scheduled report flush |

## 7. Environment & secrets (never in repo)

`CLOUDFLARE_R2_*`, `DATABASE_URL` (Neon, pooled) + `DATABASE_URL_UNPOOLED` (DDL/migrations), `GEMINI_API_KEY`, `SENTRY_DSN`, `LANGFUSE_*`, admin `AUTH_SECRET`. `OPENAI_API_KEY` and `OPENROUTER_API_KEY` are **no longer required** — the MVP is single-provider. Validated at boot with a Zod env-schema.

## 8. Free-tier budget check (why this survives a hackathon + demo)

- Neon: ~512 MB storage, thousands of vectors @ 768 dims fits easily. This project's `suspend_timeout_seconds` is `0`, so it does not scale to zero — that choice trades the pause credit for a demo that never cold-starts.
- Gemini embeddings + chat + transcription: free tier, no card. Exact headroom is **not yet measured**; only the plumbing has been proven against the live API.
- R2 free: 10 GB objects, 1M class-A ops.
- Workers free: 100k req/day, 3 Cron Triggers.
- Bridge: one small free instance on fly-io/Railway.

**Total running cost: ~$0 for the entire demo.**