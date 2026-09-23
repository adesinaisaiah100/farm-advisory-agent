# Poultry Agent — Phase Plan

Every phase below is **independently deployable and testable**: its tests pass without any other phase existing (external services are fakes/contracts inside the phase). Phases are ordered to (a) de-risk the hardest unknown earliest, (b) never block a later phase on an earlier phase's chores.

**Status legend:** ⏳ planned · 🔨 in progress · ✅ shipped

---

## Phase 0 — Monorepo Foundation ✅ (SHIPPED)

**Boxes:** pnpm workspace, TS strict, Vitest, ESLint/Prettier, canary tests in every package, `/health` on the API, AGENTS.md rules, this phase plan.

**Testable alone.** `pnpm typecheck && pnpm lint && pnpm test:unit` → all 10 workspace projects green.

Exit: repo boots green from a clean clone (`pnpm install && pnpm check`). **Done.**

---

## Phase 1 — Contracts (`@poultry/schemas`) 🔨 next

**Boxes (all pure Zod, zero I/O):**
- `PhoneSchema` + `normalizePhone` (E.164, `080…` → `+234…`) — seeded
- `FarmerSchema` (sizes 200–2,000, species)
- `InboundMessageSchema` (text or media, from/to, timestamps)
- `SessionSchema` state machine (open/completed/void), `session_state`
- `CaseSchema` (the extracted structured case: symptoms, duration, mortality, species, size…)
- `MediaSchema` (kind, mime, r2_key, transcript, confidence)
- `ReportSchema` (anonymised surveillance payload), `StoreSchema`, `OutboxSchema`

**Testable alone:** every schema has valid/invalid fixtures; `normalizePhone` table test; state-machine transition tests. No network, no DB.

Exit: all schemas parse, all rejections have precise Zod errors, phone normalization table passes.

---

## Phase 2 — Orchestrator core (`@poultry/core`) 

**Boxes:**
- `diff/missing()` — deterministically compute which case fields are still missing from session state
- LLM output contract `{ delta, reply }` + zod-guarded merge into session state
- `validateCase()` — completeness + safety: AI-class signs → ESCALATE; else RESOLVE/SUPPLY/REPORT
- Four-door decision + referral-slip template (golden text)
- **Interface** for the LLM provider (chat), embed provider, transcript provider

**Testable alone:** pure logic against session fixtures; LLM is an interface with a fake; golden slips; validateCase completeness matrix. No sockets, no DB.

Exit: state transitions + four-door matrix green; `missing()` monotonic — once true never false.

---

## Phase 3 — Store lookup (`packages/stores`)

**Boxes:**
- Static `stores.json` seed (LGA-ish; a handful of realistic agro-vet entries, no fake phone numbers in code)
- `searchByLga` / `hasItem` / nearest-by-LGA referral picking
- Fallback when no store matches (still helpful: tell the farmer what to ask for)

**Testable alone:** pure function over the JSON seed; golden referral output.

Exit: referral logic + fallback matrix green.

---

## Phase 4 — RAG ingestion (`@poultry/rag`, ingest half)

**Boxes:**
- Pagination + `[PAGE n]` deterministic page-stamp
- `analyze_document` — ONE LLM map-call per doc via an `Analyzer` interface (fake in tests) → region map w/ arrays
- Deterministic split at page/heading → chunk-groups
- Micro-chunking (800–1000 tok, 10% overlap) → chunks
- Chunk schema + citations (`chunk_text`, `page`, `doc`)

**Testable alone:** chunking is deterministic pure code — golden docs in, exact chunk boundaries out; the `Analyzer` is a fake returning fixture region maps.

Exit: chunk golden tests green; boundaries never split a sentence; overlap math exact.

---

## Phase 5 — RAG retrieval + Neon (`@poultry/rag` search half + data)

**Boxes:**
- `documents` / `chunk_groups` / `chunks` schema in Drizzle (vector(768))
- Embed provider interface (Google AI Studio impl behind it)
- Stage A: pure vector (top-k, diversity cap 2/group)
- Stage B warm: array filters (species ∩, disease @>, section @>) + vector
- Starvation fallback (<2 chunks → drop filters → pure vector)
- Region ripple + citations into the chat context

**Testable alone:** unit tests for Stage A/B/fallback with fake embeddings + an in-memory pgvector double for pure logic; **plus** one `*.integ*` test against real Neon (gated by `RUN_INTEG=1`) that seeds 3 docs and asserts top-k + starvation.

Exit: retrieval unit matrix + the Neon integ test green; `/ready` reports postgres + embed.

---

## Phase 6 — Media pipeline (`@poultry/media`)

**Boxes:**
- R2 upload (interface; key `media/{phone}/{date}/{uuid}.{ext}`)
- Transcript provider (OpenRouter free multimodal + dynamic Pidgin prompt; **fallback** whisper `en` hint) with `confidence`
- Vision provider (image → structured observations via LLM)
- `confidence < 0.6` → ask farmer to confirm/retype (never guess silently)

**Testable alone:** unit tests with fake R2/transcript/vision; confidence threshold matrix; Pidgin fixture audio parse golden. Real R2/transcript only in gated integ.

Exit: media lifecycle (upload → transcribe/observe → low-conf fallback) green.

---

## Phase 7 — WhatsApp bridge (`apps/bridge` on the Node host)

**Boxes:**
- Baileys socket + QR pairing (node-only, never bundled to Workers)
- `normalize()` rabbit → `InboundMessage` (shared contract)
- Dedup by `wa_msg_id` (TTL 24h)
- Outbox poller: due rows → send → mark sent, backoff 5s→5min, max 5 attempts
- Farmer identity via `normalizePhone`

**Testable alone:** `normalize()` unit tests with recorded WhatsApp event shapes as fixtures; dedup logic; outbox state machine with a fake `OutboxStore`. The live socket boot is smoke-tested manually once.

Exit: normalize/dedup/outbox unit matrix green; README documents `pnpm bridge` QR flow.

---

## Phase 8 — API (`apps/api`) + wiring

**Boxes:**
- Hono routes wired to phases 1–6 via interfaces
- POST `/chat` with `streamText` (web) + `generateText` (full message) for WA
- Tool registry (store lookup, KB search) wired into the AI SDK `tool()`
- `/health` `/ready` (pg, r2, embed)
- Cases/reports/stores read endpoints for the dashboard; retry/feedback endpoints
- Auth scaffold (better-auth, admin-only)

**Testable alone:** Hono `app.request(...)` integration-style tests with ALL services faked at the handler boundary; Zod body validation; route map (every route has a test).

Exit: every route tested; a fake-driven chat turn produces a valid four-door answer.

---

## Phase 9 — Dashboard + web chat (`apps/web`)

**Boxes:**
- Login gate (admin)
- Live chat panel (`useChat` against `/chat`)
- Cases list/detail + media thumbnails + referral-slip preview
- Reports view (signal feed) + store manager
- Export view

**Testable alone:** React Testing Library for each view with mocked API; Vite build must pass. Real API optional via env override.

Exit: dashboard renders and operates fully against mocked API; `vite build` green.

---

## Phase 10 — Solution coat + deploy

**Boxes:**
- Full wiring of Langfuse, Sentry, pino (structured logs w/ session+phone)
- Cron triggers: surveillance digest, outbox liveness
- Wrangler deploy (api), Pages deploy (web), bridge host deploy
- Staging smoke: scripted WhatsApp-like turn against deployed stack

**Testable alone:** a `scripts/smoke.mjs` that curls `/health`, posts a scripted chat turn, asserts four-door response + a Report row in Neon. Runs against *staging* only.

Exit: deployed preview passes smoke; `/health` reaches 200 from the public URL; surveillance digest emits a report.

---

## Dependency graph (why this order)

```
0 Foundation
 └─ 1 schemas ─┬─ 2 core (orchestrator)
               ├─ 3 stores
               ├─ 4 rag ingest ── 5 rag retrieval+Neon
               └─ 6 media
   2+3 ─── 8 API (wires 1–6)
   5,6 ─── 8
   7 bridge (independent; lands whenever)
   8 ─── 9 web
   8+9 ─── 10 coat+deploy
```

Rule of thumb that produced this order:
- **Cheapest testable slice first** (schemas, then pure orchestrator) → the skeleton is proven before anything external.
- **Longest-pole risk earliest survived** (NELL retrieval + Neon integ in phase 5, before the API is built on it).
- **Every phase keeps its fakes** so phase N+1 doesn't depend on phase N's *implementation*, only its *contracts*.

---

## Test-writing contract (summary)

All binding details in `AGENTS.md` §7. In short: unit tests never touch network/DB/sockets; everything external is an interface + fake; integration is gated by `RUN_INTEG=1`; every ratio state testable; every phase must at least 80% cover its pure core.

## Progress tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo foundation + all canaries | ✅ |
| 1 | Contract schemas (pure) | 🔨 next |
| 2 | Orchestrator core (pure) | ⏳ |
| 3 | Store lookup | ⏳ |
| 4 | RAG ingestion | ⏳ |
| 5 | RAG retrieval + Neon | ⏳ |
| 6 | Media pipeline | ⏳ |
| 7 | WhatsApp bridge | ⏳ |
| 8 | API + wiring | ⏳ |
| 9 | Dashboard + web chat | ⏳ |
| 10 | Coat + deploy | ⏳ |