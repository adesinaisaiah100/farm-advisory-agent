# Phase 2 — Orchestrator core (`@poultry/core`)

**Status:** ✅ shipped · Pure logic, zero I/O. Every external service (LLM, embeddings,
transcripts) is an interface, so every test runs offline with a fake.

## What this phase did

Built the **brain** of the agent: the pure logic that owns a conversation turn. The
orchestrator reads the session's structured case, asks the LLM for `{ delta, reply }`,
zod-guards whatever the LLM returns, merges the delta into the case, and decides which
of the **four doors** to open. Nothing here touches a socket, a DB, or a real LLM — the
turn logic is the part we can fully unit-test before any wiring exists.

## File structure

```
packages/core/
├─ package.json        name @poultry/core; deps: @poultry/schemas (workspace:*), zod
└─ src/
   ├─ index.ts          barrel: re-exports every module + greeting()
   ├─ llm.ts            LLM output contract: CaseDeltaSchema, LlmReplySchema (strict)
   ├─ merge.ts          mergeDelta(): apply a validated delta into the case, monotonic
   ├─ missing.ts        missing()/isComplete(): deterministic "what's still unasked"
   ├─ validate.ts       validateCase(): completeness + safety, four-door decision
   ├─ slip.ts           buildReferralSlip() golden text + ESCALATE_SCRIPT (Pidgin)
   ├─ providers.ts      ChatProvider/EmbedProvider/TranscriptProvider interfaces
   ├─ orchestrator.ts   runTurn(): fill → complete → guard → merge → decide → reply
   └─ *.test.ts         one test file per module (51 tests)
```

## The pieces

### 1. Missing-field tracking (`missing.ts`)
`missing(case)` returns a fixed-order list of the fields still needed before a case can
be acted on: `species`, `symptoms`, `onsetDays`, `mortalityCount`. `'unknown'` species
and empty symptom arrays still count as missing, so the farmer is asked before we
advise. **Monotonic by construction:** `mergeDelta` never clears a filled field (empty
arrays are ignored), so once a required field is present it can never return to missing.
This is the phase's exit criterion, tested explicitly.

### 2. The LLM contract (`llm.ts`)
Two strict Zod schemas define the only shape an LLM reply is allowed to take:
- `CaseDeltaSchema` — a partial case (species, symptoms, onset, mortality, disease hits,
  stage, breed, farm size, wantsSupply, …). `.strict()` so an LLM that invents keys
  fails validation instead of being silently absorbed.
- `LlmReplySchema` — `{ delta: CaseDeltaSchema, reply: non-empty string }`.

The orchestrator treats any LLM output as untrusted `unknown`, parses it, and on failure
sends `FALLBACK_REPLY` and leaves the case untouched.

### 3. The four-door decision (`validate.ts`)
`safety first, then completeness, then supply intent`:
1. **ESCALATE** — critical symptom, suspected avian influenza (notifiable), or mass
   mortality (≥ 30%; derived from count/size when not given directly). Never advise the
   farmer to self-treat these.
2. **COLLECT** — not fully captured yet: keep the conversation going, ask exactly what
   `missing()` says is still unknown.
3. **SUPPLY** — complete + safe + the farmer asked to buy (delta `wantsSupply`): emit a
   referral slip.
4. **RESOLVE** — complete + safe + no supply intent: return the LLM's guidance.

The report door is a separate signal (`hasReportableSignal`) — any case with a known
species and symptoms can feed the anonymised surveillance stream, even when incomplete.
(Persisting reports is a later phase; the pure rule lives here.)

### 4. Referral slip + escalation script (`slip.ts`)
`buildReferralSlip(case, store?)` renders a WhatsApp-forwardable golden-text slip: what
to tell the agro-vet, the numbers they need (onset, deaths, mortality rate), and what to
ask for. `ESCALATE_SCRIPT` is the fixed Pidgin safety message sent verbatim on an
escalation — the agent never improvises a safety warning.

### 5. Provider interfaces (`providers.ts`)
`ChatProvider`, `EmbedProvider`, `TranscriptProvider` — three `read` interfaces behind
which the real LLM/embedding/transcription implementations land in later phases. The
orchestrator depends only on `ChatProvider`, so Phase 8 can wire the Vercel AI SDK
without touching this code.

### 6. The turn function (`orchestrator.ts`)
`runTurn({ case, query }, { chat, now })`:
1. computes `missing()` from the current case
2. calls `chat.complete({ filled, missing, query })` → `unknown`
3. zod-guards: invalid → fallback reply, no state change
4. merges the delta into the case (monotonic)
5. `validateCase()` picks the door; the case's `status` follows the door
6. reply = LLM text (resolve/collect), referral slip (supply), or `ESCALATE_SCRIPT`
7. returns the next `SessionState`, the door, and the list of changed fields

Every turn produces a complete `SessionState` ready for the API phase to upsert.

## Tests

51 unit tests across 7 files (offline, fake `ChatProvider`, deterministic clock):

- **missing**: required-field matrix, `unknown`/empty handling, deterministic order,
  **monotonicity** — once filled, never missing again (the phase exit criterion).
- **merge**: fills, overwrites scalars, ignores empty arrays, never clears, keeps ids.
- **llm**: strict-schema rejections (unknown keys, bad ranges, missing/empty reply).
- **validate**: door matrix — critical symptom, avian influenza, mass-mortality
  threshold, safe-complete, supply, collect, **safety beats completeness**.
- **slip**: golden slip text vs the store-less template, store-contact embedding,
  escalate-script sanity.
- **orchestrator**: a full collect → complete conversation, escalation reply override,
  referral-slip door, zod-guard fallback (invalid and unknown-key outputs), and
  missing() never regressing across a second turn.

`pnpm check` (typecheck + lint + all unit tests, workspace-wide) exits 0 including
Phases 0–1.

## Schema amendment landed in Phase 2

`SessionStateSchema` now carries the structured case directly:

```ts
SessionState = { case: CaseSchema, missing: string[], updatedAt: DateTime }
```

`caseStatus` was removed from state — the case's own `status` is the single source of
truth. `CaseStatusSchema` moved home to `case/index.ts` (it belongs to the case, and
this removes a session↔case import cycle). Session keeps a top-level `caseId` and its
own open/completed/void status machine.

---

# Phase 2.1 & 2.2 amendments

## 2.1 — Language routing, conversation context, farmer name

- `language.ts` — **`classifyLanguage()`**: pure code (no extra LLM call) Pidgin/English
  heuristic. Weighted marker filters (`dey`, `abeg`, `na`, `wetin`, … ×2 vs
  `is/are/please/because` ×1); a message must clear a hit-count and beat the other
  language's score. `replyLanguageFor()` maps unknown/short → English.
- `ChatInput` grew `history: TurnMessage[]` + `replyLanguage`; `runTurn` accepts
  `history` and forwards it — the LLM answers from the actual conversation.
- `ProfileDeltaSchema` (`{ name }`) added to `LlmReplySchema`: farmer **name** lands in
  a profile slot during the same turn, kept separate from clinical case data.
- Language-matched built-ins: `ESCALATE_SCRIPT_EN`, `escalationScript(lang)`,
  `FALLBACK_REPLY_EN`, per-language collect prompts.
- `slip.test.ts` gained an `ESCALATE_SCRIPT_EN` sanity test.

## 2.2 — Memory model + budget compaction

The earlier scan is now a three-layer memory model (see `SYSTEM_DESIGN.md`):
session → episode (the case) → master record (farmer chart, Phase 5). This phase
implements the session-layer compaction that keeps context token-frugal:

- `SessionStateSchema.notes: string[]` — compacted facts the case schema can't hold
  ("already gave amprolium", "farmer corrected the breed").
- `compact.ts` — **`compactHistory()`**: deterministic trigger. If history+notes exceed
  the token budget (default 1800; floor 4 msgs, cap 40), the oldest messages are dropped
  and folded into `notes` by one LLM call via `CompactProvider`; the result is guarded by
  strict `CompactionResultSchema` and an invalid fold leaves the context untouched.
  `TokenCounter` is a pure-code interface (deterministic in tests).
- `runTurn` folds compaction in: `{ filled, missing, query, notes, windowed history,
  replyLanguage }` reaches the LLM; `notes` persist on the produced `SessionState` so an
  abandoned-and-resumed chat resumes coherently with zero transcript.
- Tests (compact: 8; llm +4 schema; orchestrator +1 forced-compaction) bring core to
  **79 tests across 9 files**; schemas to 85. `pnpm check` stays green.

## Repo tooling note (this machine)

Vitest's parallel worker forks under `pnpm -r` exhaust this machine's memory
(spawn/`MemoryChunk` OOM — not a code failure; every package passes standalone). The
workspace scripts in `package.json` now run `pnpm -r --workspace-concurrency=1` so
`pnpm check` is reliable locally.

---

## Phase 2.3 — Memory hardening

The engineering review found that the 2.2 budget was **advisory, not enforced**: three
paths (nothing droppable, invalid fold, heavy fold) shipped the full over-budget context
to the LLM, and `notes` could grow without bound, so the compaction loop could feed
itself. Hardened in `compact.ts`:

- **`enforceBudget`** — fail-closed. The window shrinks below its soft floor of 4
  (down to one message) to make room first, because a freshly folded note carries more
  facts per token than the old raw messages it replaced; oldest notes are dropped only
  when the window is already minimal, and single-message text is capped
  (`MAX_MESSAGE_CHARS` 4000). A turn can never ship context over budget, no matter how
  bad the fold is.
- **`capNotes`** — notes are bounded to `MAX_NOTES` (12) entries and `MAX_NOTES_TOKENS`
  (500) from the oldest, both in the fold schema and in code, so the array cannot grow
  forever. `CompactInput` now carries `maxNotes` so a provider can instruct the model to
  **consolidate** rather than append.
- Semantics change worth naming: `compacted` now means "a valid fold replaced the notes".
  When the fold output is invalid, the window is still trimmed (fail-closed) but `notes`
  are left untouched — the old "identity keep-everything" behavior was the bug.
- **Stall fallback** — `SessionStateSchema.stallCount` (default 0), `MAX_STALL` = 2.
  After two consecutive invalid LLM replies, `runTurn` answers with the collect questions
  built in code (`missing()` + per-language `COLLECT_PROMPT`), so a broken model stops
  costing money turn after turn. A valid reply resets the counter.
- **`measureCompactRecall()`** — the first recall-eval harness: reports which facts
  survive repeated compaction. Unit-tested with deterministic folds (preserving = 100%,
  lossy = scored misses); the real LLM fold is held to a recall bar against the same
  harness in Phase 8.
- Tests: compact +3 (fail-closed, notes cap, oversized message), orchestrator +5 (stall
  machine + extended fallback), schemas +2 (stallCount), recall +3 → core is now
  **88 tests across 10 files**, schemas 87. `pnpm check` stays green.