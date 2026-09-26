# Poultry Agent — Phase Plan

Every phase below is **independently deployable and testable**: its tests pass without any other phase existing (external services are fakes/contracts inside the phase). Phases are ordered to (a) de-risk the hardest unknown earliest, (b) never block a later phase on an earlier phase's chores.

**Status legend:** ⏳ planned · 🔨 in progress · ✅ shipped

**Narrative record of shipped phases:** see `phases/PHASE-0-foundation.md` and
`phases/PHASE-1-contracts.md` (file structure + what was implemented + tests).

---

## Phase 0 — Monorepo Foundation ✅ (SHIPPED)

**Boxes:** pnpm workspace, TS strict, Vitest, ESLint/Prettier, canary tests in every package, `/health` on the API, AGENTS.md rules, this phase plan.

**Testable alone.** `pnpm typecheck && pnpm lint && pnpm test:unit` → all 10 workspace projects green.

Exit: repo boots green from a clean clone (`pnpm install && pnpm check`). **Done.**

---

## Phase 1 — Contracts (`@poultry/schemas`) ✅ (SHIPPED)

**Boxes (all pure Zod, zero I/O):**
- `PhoneSchema` + `normalizePhone` (E.164, `080…` → `+234…`)
- `FarmerSchema` (sizes 200–2,000, species) + `isMiddleTier`
- `InboundMessageSchema` (text or media, from/to, timestamps)
- `SessionSchema` state machine (open/completed/void) + `canTransition`/`transitionSession`
- `CaseSchema` (symptoms, duration, mortality, species, size, disease hits) + `hasCriticalSymptom`
- `MediaSchema` (kind, mime, r2_key, transcript, confidence) + `isReliable`
- `ReportSchema` (anonymisable) + `anonymise`, `StoreSchema`, `OutboxSchema` (+ backoff caps, `canRetry`)

**Testable alone:** every schema has valid/invalid fixtures; normalizePhone table test; state-machine transitions; reliability threshold; anonymise strips phone. No network, no DB.

Exit: all schemas parse, all rejections have precise Zod errors, phone normalization table passes. **Done.**

---

## Phase 2 — Orchestrator core (`@poultry/core`) ✅ (SHIPPED) 

**Boxes:**
- `diff/missing()` — deterministically compute which case fields are still missing from session state
- LLM output contract `{ delta, reply }` + zod-guarded merge into session state
- `validateCase()` — completeness + safety: AI-class signs → ESCALATE; else RESOLVE/SUPPLY/REPORT
- Four-door decision + referral-slip template (golden text)
- **Interface** for the LLM provider (chat), embed provider, transcript provider

**Testable alone:** pure logic against session fixtures; LLM is an interface with a fake; golden slips; validateCase completeness matrix. No sockets, no DB.

Exit: state transitions + four-door matrix green; `missing()` monotonic — once true never false.

---

## Phase 2.1 — Language routing + conversation context ✅ (SHIPPED)

**Boxes:**
- `classifyLanguage()` — code-only Pidgin/English heuristic (marker filters, weighted), zero extra LLM call; `replyLanguageFor()` maps unknown → English
- `ChatInput` carries verbatim `history` + `replyLanguage`; `runTurn` accepts `history`
- Farmer **name** capture via `ProfileDeltaSchema` (`profile: { name }`), kept separate from clinical case data
- Language-matched built-ins: `ESCALATE_SCRIPT`/`ESCALATE_SCRIPT_EN`, per-language fallbacks and collect prompts

**Testable alone:** classifier fixture matrix (Pidgin/English/short/ambiguous); escalation scripts golden; profile+history passthrough.

Exit: Pidgin turns get Pidgin, English turns get English, name lands in profile, history reaches the LLM. **Done.**

---

## Phase 2.2 — Memory model + budget compaction ✅ (SHIPPED)

**Boxes:**
- `SessionStateSchema.notes` — per-session compacted facts the case schema can't hold ("already gave amprolium", "farmer corrected the breed")
- `compactHistory()` — deterministic token-budget trigger (floor 4 msgs, cap 40); if over budget, drop oldest messages and fold them into notes via one guarded LLM call (`CompactionResultSchema`, strict); invalid output leaves context unchanged
- `TokenCounter` + `CompactProvider` interfaces (fakes in tests)

**Testable alone:** budget/floor/cap matrix; notes counted in budget; oldest-dropped ordering; zv-rejected compaction output ignored.

Exit: a long chat stays token-frugal, notes persist with state for resume, compaction is provably budget-bounded. **Done.**

---

## Phase 2.3 — Memory hardening (fail-closed compaction + stall fallback) ✅ (SHIPPED)

**Boxes:**
- **Fail-closed compaction:** the token budget is a delivered guarantee, not a suggestion — `enforceBudget` shrinks the window below its soft floor (down to one message) to make room for denser fold notes, then drops oldest notes only when the window is minimal, and caps single-message text (4000 chars); a turn can never ship context over budget even if the fold lands heavy or is invalid
- **Note caps:** `CompactionResultSchema` rejects > 12 notes (`MAX_NOTES`); `capNotes` bounds count + total tokens (500) from the oldest entry, so notes can never grow unbounded
- `CompactInput.maxNotes` tells providers to consolidate into ≤ N notes preserving facts
- **Stall fallback:** `stallCount` on `SessionStateSchema`; after `MAX_STALL` (2) consecutive invalid LLM replies, `runTurn` answers with a code-driven collect question (`missing()` + per-language prompts) instead of burning another model call; resets on the first valid reply
- **Recall-eval harness:** `measureCompactRecall()` scores which facts survive repeated compaction; deterministic folds in unit tests, real LLM fold judged against the same harness in Phase 8

**Testable alone:** budget/floor/cap matrix now includes fail-closed cases, oversized-message truncation, and invalid-fold enforcement; notes-cap golden; stall state machine; recall report shape.

Exit: `pnpm check` green with the hardened compaction (core 88 tests across 10 files). **Done.**

---

## Phase 2.4 — Master record contracts + injected context ✅ (SHIPPED)

**Boxes (pure contracts, zero DB — data layer lands in Phase 5):**
- **Master-record slices** (`@poultry/schemas` `slice/`): `DiseaseHistorySlice`, `RecentCaseSlice`, `CaseSnapshot` (a `Case` that must carry `id`), `MedicationSlice`, plus capped list schemas (history ≤ 20, recent cases ≤ 10, medications ≤ 30)
- **Injected context** (`farmer-context.ts`): `profileDigest` (name · LGA · farm size · species · breed · reply language; ≤ 90 tokens) + `openCasePointer` (one line, ≤ 60 tokens) composed by `injectedContext()` as the `farmerContext` the API injects at session open — stable facts ride in context and never round-trip as a tool call
- **Tool contracts** (`master-tools.ts`): the four agreed **read-only** tools — `get_disease_history`, `get_recent_cases`, `get_case`, `get_medication_history` — each with description, Zod input + output schema, and a hard token cap; `checkSlice`/`withinSliceBudget` guard a slice against its schema and cap before it ever reaches the model
- **`MasterStore` interface** (`master-store.ts`) + `inMemoryMasterStore` fake for later phases: `profile`/`openCase` by E.164 phone, `caseById`, and the three history slices
- `ChatInput` + `TurnInput` grow `farmerContext?: string`; `runTurn` forwards it to the chat provider
- **Design lock:** the LLM never writes the chart — orchestrator owns every append

**Testable alone:** slice accept/reject + caps; digest/pointer golden text + token caps; tool registry shape; slice-budget matrix; in-memory store reads. No DB, no tools wired to an LLM.

Exit: `pnpm check` green (core 113 tests across 13 files, schemas 101). **Done.**

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
| 1 | Contract schemas (pure) | ✅ |
| 2 | Orchestrator core (pure) | ✅ |
| 2.1 | Language routing + conversation context | ✅ |
| 2.2 | Memory model + budget compaction | ✅ |
| 2.3 | Memory hardening (fail-closed + stall fallback) | ✅ |
| 2.4 | Master record contracts + injected context | ✅ |
| 3 | Store lookup | ⏳ |
| 4 | RAG ingestion | ⏳ |
| 5 | RAG retrieval + Neon | ⏳ |
| 6 | Media pipeline | ⏳ |
| 7 | WhatsApp bridge | ⏳ |
| 8 | API + wiring | ⏳ |
| 9 | Dashboard + web chat | ⏳ |
| 10 | Coat + deploy | ⏳ |