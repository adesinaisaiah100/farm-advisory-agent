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