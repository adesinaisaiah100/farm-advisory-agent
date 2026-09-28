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
- Static seed of realistic agro-vet entries (`src/data/stores.ts`, unique UUIDs, E.164 `+234…`, no phone numbers written anywhere else)
- `searchByLga(lga, state?)` / `hasStock(store, item)` / `pickReferral({ lga?, state? })` referral picking
- `coveredLgas()` so the UI can show which LGAs are covered
- Fallback when no store matches: `pickReferral` returns `undefined` and the slip degrades to the generic "buy inside a known agro-vet store" guidance already golden-tested in `core/slip.ts`

**Testable alone:** pure function over the typed seed; golden referral output.

Picking rules, in order: filter by location → break ties by name. Unlisted LGA returns `undefined` rather than a far-away store. `isOpen` was dropped, and so was item preference: a shop's opening hours at 2am is not a fact we can hold, and with no confirmed inventory there was nothing for an item preference to select on.

Shipped as 7 seed entries across 6 LGAs (Oyo, Lagos ×2, Kaduna, Enugu, Ogun, Plateau). `getStores()` hands back a copy with fresh objects so callers cannot mutate the directory. **Phase 2.6 removed every fabricated `stock` / `stockVerifiedAt` from the seed**, so no store in `STORES` claims any inventory at all, and `verifiedStock` / `hasStock` are now exercised only against a synthetic partner fixture. They remain as the partner opt-in seam: `StoreSchema` rejects a non-empty `stock` without `stockVerifiedAt`.

Exit: 19 stores tests green, typecheck + lint clean. **Done.**

---

## Phase 2.5 — Triage confidence + the ask-for ladder (`@poultry/core`, `@poultry/schemas`)

**Why this jumped the queue:** the store review showed we were promising a store's inventory we cannot know, and that our door logic had no state for "we're not sure." Uncertainty has to escalate, not resolve. This needs no RAG, so it ships before Phase 4.

**Boxes:**
- **Confidence ladder** decided in code in `validate.ts`, default escalate:
  - `RED_FLAG` → escalate + report, no treatment advice. Peracute mass mortality, dark/cyanotic comb, sudden death cluster, suspected HPAI, bird-human illness.
  - `AMBIGUOUS` (2+ look-alikes) → never name one drug. Ask the discriminating question, request the confirmatory action, re-triage.
  - `CONFIRMABLE` → resolve with a specific ask-for line.
- **Fix the four safety gaps found in the review:**
  1. `diseaseHits` with 2+ entries currently falls through to `resolve` — the array is ignored.
  2. `infectious_bronchitis` is missing from `DiseaseSchema` (the #1 ND confusion partner is unrepresentable).
  3. Red flags match exact lowercase literals, so "neck dey bend" misses `twisted neck` — a safety gate cannot depend on the LLM's vocabulary. Needs substring/token matching over farmer text.
  4. `'blood in droppings'` is classified critical, escalating textbook coccidiosis (68.7% prevalence in Nigerian broilers) and burning the door.
- **Ask-for ladder** (`askFor = { product, why, askTheSeller[], refuse[], needsVet }`), derived from the differential, never from store stock. Replaces the circular "the right medicine or vaccine for the symptoms above" in `buildReferralSlip`. Ships the refusal list: no general antibiotic "just in case", nothing without a NAFDAC number, no loose unlabelled medicine, no receipt. **Superseded by Phase 2.6** — the treatment content was hardcoded here and is now retrieved and gated.
- **Strip the fake inventory:** `stock` only for partners that opt in and re-confirm (`stockVerifiedAt`); drop `isOpen`. `searchByLga`/`pickReferral`/`coveredLgas` survive, demoted to "where can I physically go." **Completed by Phase 2.6**, which removed the placeholder timestamps from the seed as well.

**Testable alone:** pure functions over a differential; golden slip text per disease signature; the ambiguity and red-flag matrices are pure unit tests.

Exit: confidence-band matrix + ask-for golden slips + the four fixes all green; 292 workspace tests, typecheck + lint clean. **Done.**

---

## Phase 2.6 — Retrieval-grounded ask-for + inventory honesty (`@poultry/core`, `@poultry/stores`)

**Why this jumped the queue:** Phase 2.5 shipped the right shape but shipped unreviewable clinical copy. `askfor.ts` held six diseases' worth of product classes and seller questions with no citations and no confidence, and the store seed carried a fabricated `stockVerifiedAt` on every entry. The user also asked the real question directly: should the ask-for content be decided *after* triage, from retrieved medical knowledge for Nigerian conditions, with a confidence score? Yes — and the answer needed a code gate, not a prompt.

**The decision, in one line:** policy stays in code forever, clinical content is retrieved, and nothing is named unless triage confirmed the case, sources agree ≥ 0.6, and ≥ 2 independent sources back it.

**Boxes:**
- **Delete the hardcoded clinical table.** `ClinicalLadder` + `ClinicalLadderSource` (an interface, so Phase 4 wires a real index and tests wire a fake), every ladder carrying `evidence.agreement` and `evidence.citations[].source`.
- **`gateLadder(c, ladder)`** in code, not in a prompt: requires a `confirmable` triage band, agreement ≥ `AGREEMENT_FLOOR`, a score that is actually a number in 0–1, and `MIN_CITATIONS` *distinct* sources. A `red_flag` or `ambiguous` case names no product even when a perfect ladder is handed in — coccidiosis and necrotic enteritis need different drugs, so "the treatment" does not exist yet.
- **`POLICY_REFUSALS` never depends on retrieval.** If the index is down, the farmer still gets told to refuse a general antibiotic, an antibiotic sold as a virus cure, an undosed feed mix, a broken cold chain, and anything unlabelled or unreceipted. Refusing is never harmful, so it has no reason to need a service.
- **Two channels.** Farmer slip carries no drug name, no citation, no score. `buildPrescriberBrief` requires a `PrescriberRole` (veterinarian / veterinary paraprofessional / animal health technologist) and carries the differential ranking, the product *class*, sources with locators, `sources agree 0.80 (not a diagnosis)`, and a not-a-prescription disclaimer.
- **Wire the seam:** `TurnDeps.ladder?`, consulted **only** on the supply door and only after triage cleared. No source wired → the slip renders and names nothing.
- **Strip the fake inventory for real:** all seed `stock` / `stockVerifiedAt` removed; `ReferralQuery.item` and the stock-preference branch deleted as dead code. `StoreSchema` keeps the fields as the partner seam and still rejects unconfirmed stock.

**Research that shaped it:** the last mile in Nigeria is the veterinary paraprofessional / Animal Health and Husbandry Technologist, not a human pharmacist — FAO's VPP programme exists for exactly that reason, and NADIS already offers a "Vet / Para Vet" VCN login. We are not selling "AI tells you the medicine" - we are a data-collection loop and a veterinary handoff, and the retrieval gate is what makes the brief a vet receives trustworthy enough to act on. The gate is also what earns the growth loop: a vet who trusts the brief is a vet who sends us the next farmer. RAG can *reduce* accuracy on irrelevant retrieval (structured chunking 87% vs 50% naive), which is why the score is retrieval agreement rather than a diagnosis probability, and why the gate demands two independent sources before naming anything.

**Testable alone:** the gate is a pure function; the two channels are pure renderers; retrieval is an interface with a fake. No index required.

Exit: hardcoded ladder gone, no fabricated inventory in the seed, gate proven undefeatable by tests, farmer channel proven unable to leak a name or a citation; 308 workspace tests, typecheck + lint clean. **Done.** See `phases/PHASE-2.6-askfor-retrieval.md`.

---

## Phase 4 — RAG ingestion (`@poultry/rag`, ingest half) ✅ shipped (`phase/4-rag-ingestion`)

**Boxes:**
- Pagination + `[PAGE n]` deterministic page-stamp
- `analyze_document` — ONE LLM map-call per doc via an `Analyzer` interface (fake in tests) → region map w/ arrays
- Deterministic split at page/heading → chunk-groups
- Micro-chunking (800–1000 tok, 10% overlap) → chunks
- Chunk schema + citations (`chunk_text`, `page`, `doc`)

**Testable alone:** chunking is deterministic pure code - golden docs in, exact chunk boundaries out; the `Analyzer` is a fake returning fixture region maps.

Exit: chunk golden tests green; boundaries never split a sentence; overlap math exact.

**Shipped:** `paginate` / `stampedText` / `locatePage`, `Analyzer` + `analyzeDocument` (validates the map with
Zod, throws `RegionMapError` on an unusable one, makes exactly one call per document), `buildGroups`, `microChunk`,
`ChunkSchema` + `citationFor`, and `ingestDocument` tying them together. Regions are typed (`sectionKind`,
`species[]`, `diseases[]`, `TreatmentSchema`) so a retrieved chunk can fill `ClinicalLadder` without a
summariser re-reading prose. Citations are denormalised onto the chunk (`source`, `publisher`, `locator`) and
`citationFor` is typed against `Citation` from `@poultry/core`, so a Phase 5 top-k result needs no second lookup
and the ingest and gate halves cannot drift apart.

**The decision that matters:** the model is asked what the regions are, never where they are. `locatePage`
computes the page by searching the paginated text for the region's own opening words, so a hallucinated page
number cannot place a citation. `pageHint` is cross-checked, and a mismatch warns.

**Honesty boundaries:** a sentence longer than the ceiling is never cut — it becomes its own `oversized` chunk
plus a warning; an unparseable region map throws rather than indexing half a source; merged regions that
disagree on product class keep the first and warn. No production corpus and no licensed-vet review yet, so
nothing here is clinically cleared.

**Tests:** 7 files, 67 tests (repo: 39 files, 373 tests). `pnpm check` exit 0. A test caught that
`overlapTokens: 0` still repeated a sentence — `overlapStart` stepped back once before comparing the total, so a
zero overlap degenerated into a one-sentence overlap. Fixed with an early return and pinned by a
shared-suffix-of-exactly-0 test.

See `phases/PHASE-4-rag-ingestion.md`.

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

**Status: 🚧 built and verified, not yet wired into a turn.** What is true today:

- Schema (`documents` / `chunk_groups` / `chunks`, `vector(768)`, cascading FKs, GIN on species/diseases, HNSW `vector_cosine_ops`) is applied on real Neon `fragrant-frost-02738524` and captured in `packages/rag/drizzle/0000_phase5_rag_retrieval.sql`.
- `PgChunkRepository` + `InMemoryVectorStore` (a pgvector double), `GeminiEmbedder`, Stage A/B/fallback, the diversity cap, `RagClinicalLadderSource`, `renderRetrievalContext`, and `checkReadiness` all exist. 154 unit tests; 5 gated integration tests pass against real Neon + Gemini.
- **Not done:** the corpus is **empty**. No licensed veterinary source has been ingested, so retrieval has never been scored against real clinical text. `RagClinicalLadderSource` is not wired into the orchestrator, and `checkReadiness` is not yet exposed on `/ready` — both land in the API phase.
- The generated migration is the record of the live DDL, but the live database was created with `drizzle-kit push`, so its `__drizzle_migrations` table is empty. Re-running `drizzle-kit migrate` against **this** database would attempt to re-apply and fail; a fresh database applies it cleanly. Reconcile the two before the first real deploy.

---

## Phase 6 — Media pipeline (`@poultry/media`)

**Boxes:**
- R2 upload (interface; key `media/{phone}/{date}/{uuid}.{ext}`)
- Transcript provider (Google `gemini-3.5-transcribe` + dynamic Pidgin prompt) with `confidence`
- Vision provider (image → structured observations via LLM)
- `confidence < 0.6` → ask farmer to confirm/retype (never guess silently)

**Testable alone:** unit tests with fake R2/transcript/vision; confidence threshold matrix; Pidgin fixture audio parse golden. Real R2/transcript only in gated integ.

Exit: media lifecycle (upload → transcribe/observe → low-conf fallback) green.

**Status: 🚧 built + partially verified (Sep 2026).** 82 unit tests, 100% line
coverage on every source file. Real R2 round-trip proven against the live bucket
(key format, content-type metadata, byte fidelity, zero-byte rejection) via 2
gated integ tests. **The Gemini transcription and vision paths are unverified
against the real API**: `gemini-3.5-transcribe` returns no confidence, which
means *every* voice note lands on the confirmation gate, and the 3 gated Gemini
integ tests need `PIDGIN_FIXTURE_AUDIO` / `PHOTO_FIXTURE_IMAGE` (real recordings
on the operator's disk, never committed — a synthesised clip is not a Pidgin
voice note). Not yet wired into a turn or a route.

Two decisions worth recording, because both were safety fixes rather than
features:
- **The kind is derived from the MIME type and is not a caller input.** WhatsApp
  supplies the MIME, so a caller able to assert a kind could file a voice note
  as a photo, skipping transcription and the confidence gate and recording a
  statement the farmer never made.
- **Base64 uses `btoa`, not `Buffer`.** The API runs this code on Workers, where
  `Buffer` is undefined; every voice note and photo would have crashed there.

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
| 2.5 | Triage confidence + ask-for ladder | ✅ |
| 2.6 | Retrieval-grounded ask-for gate + strip fake inventory for real | ✅ |
| 3 | Store lookup | ✅ |
| 3.1 | Ask-for ladder + strip fake inventory (folded into 2.5, completed in 2.6) | ✅ |
| 4 | RAG ingestion | ⏳ |
| 5 | RAG retrieval + Neon | ⏳ |
| 6 | Media pipeline | ⏳ |
| 7 | WhatsApp bridge | ⏳ |
| 8 | API + wiring | ⏳ |
| 9 | Dashboard + web chat | ⏳ |
| 10 | Coat + deploy | ⏳ |