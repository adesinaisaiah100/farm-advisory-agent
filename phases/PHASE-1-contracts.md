# Phase 1 — Contracts (`@poultry/schemas`)

**Status:** ✅ shipped · commit `b71e494` · rename from "Contracts" to same

## What this phase did

Defined the **contract layer** — the Zod schemas every other package will import, so
nothing above this phase needs to invent its own types. Pure Zod, zero I/O, no network,
no DB. These are the shapes the orchestrator reads/writes, the bridge produces, and the
API accepts.

Design stance: **loosen where the world is messy, tighten where the system must decide.**
Phone numbers accept local and E.164 forms (a normalize step unifies them). Free-text
inside a case (symptoms) is open. But **classification values** (disease, species, door,
status) are closed enums so decisions and DB queries are deterministic. See the
"Enum questions" section in the conversation review before changing anything here.

## File structure

```
packages/schemas/
├─ package.json        name @poultry/schemas; main/types -> src/index.ts
├─ tsconfig.json
└─ src/
   ├─ index.ts                  barrel: re-exports every module (public API)
   ├─ common.ts                 UuidSchema, DateTimeSchema + types
   ├─ phone/index.ts            PhoneSchema, normalizePhone, isValidPhone
   ├─ farmer/index.ts           FarmerSchema, SpeciesSchema, isMiddleTier
   ├─ message/index.ts          InboundMessageSchema, MediaAttachmentSchema, MessageSchema
   ├─ session/index.ts          SessionSchema, SessionStateSchema, status machine
   ├─ case/index.ts             CaseSchema, DiseaseSchema, DoorSchema, hasCriticalSymptom
   ├─ media/index.ts            MediaSchema, CONFIDENCE_THRESHOLD, isReliable
   ├─ report/index.ts           ReportSchema, anonymise()
   ├─ store/index.ts            StoreSchema (agro-vet)
   ├─ outbox/index.ts           OutboxSchema, OUTBOX_BACKOFF caps, canRetry
   └─ <module>/index.test.ts    one test file beside each module (57 test blocks)
```

## The schemas, module by module

### `common.ts`
Tiny shared primitives: `UuidSchema` (v4 string) and `DateTimeSchema` (ISO datetime).
Everything with a primary key or a timestamp reuses these — one place to tighten later.

### `phone` — the highest-traffic contract
- `PhoneSchema`: accepts either E.164-like (`+234…`, or bare `234…` of the right
  length) or Nigerian local format (`080…`, 11 digits). Rejects junk (`'12'`, letters,
  `+234…extra`).
- `normalizePhone()`: the single unifier. `080…` → `+23480…`; strips a stray `0` after
  the country code (`+2340…` → `+234…`); handles bare `234…`, spaces, dashes, parens.
  Rule in AGENTS.md: **never treat `080…` and `+23480…` as different people** — all
  persistence goes through this.
- `isValidPhone()`: accepts if the raw *or* normalized form validates.
- Tests: valid/invalid tables, 5-case normalization table.

### `farmer`
- `SpeciesSchema`: `broiler | layer | cockerel | mixed | unknown` (see enum discussion).
- `LocationSchema`: mandatory `lga` + `state`.
- `FarmSizeSchema`: integer, enforced **200–2,000** (the middle tier this product
  targets; values outside are rejected).
- `isMiddleTier()`: boundary-check helper (200 and 2000 inclusive).
- Tests: full/minimal farmer, rejected out-of-range sizes, species accept/reject.

### `message`
- `MediaKindSchema`: `audio | image | video | document`.
- `MediaAttachmentSchema`: `{ url, kind, mime }`.
- `InboundMessageSchema`: `{ id, from, to, text?, media?, receivedAt }` with a
  **refine**: must carry text *or* media (an empty message is rejected, not just
  tolerated).
- `normalizeMessage()`: applies `normalizePhone` to both endpoints.
- `MessageSchema` (persisted row): `{ id, sessionId, waMsgId?, sender, payload, sentAt }`
  where sender is `farmer | agent`.

### `session` — a real state machine
- `SessionStatusSchema`: `open | completed | void`.
- `CaseStatusSchema`: `in_progress | complete | escalated | void`.
- `SessionStateSchema`: `{ caseId?, caseStatus, missing[], updatedAt }` — `missing[]`
  is what Phase 2's `missing()` fills each turn.
- `SessionSchema`: `{ id, phone, status, state, startedAt, lastActive, caseId? }`.
- **Transitions** (explicit, not implicit): `open→completed`, `open→void`,
  `completed→void`; nothing out of `void`; no `completed→open`. `canTransition()` and
  `transitionSession()` (throws on illegal moves, e.g. `void→open`).
- Tests: 10 — schema validity, every transition edge, the throw on illegal moves.

### `case` — what the conversation is building toward
- `SymptomSchema`: **free text**, min 1 char — Pidgin sign descriptions live here
  verbatim (`'neck dey twist'`).
- `DiseaseSchema`: closed enum (see enum discussion).
- `DoorSchema`: `resolve | supply | escalate | report` — the four doors.
- `CaseSchema`: species, farmSize (200–2,000), flockAgeWeeks, symptoms[], onsetDays,
  mortalityCount, mortalityRatePct (0–100), diseaseHits[], status, door.
- `CRITICAL_SYMPTOMS` + `hasCriticalSymptom()`: hard-coded safety list (sudden death,
  blood in droppings, swollen head, twisted neck, trembling, paralysis) matched
  **case-insensitively**. This is the ESCALATE gate and it deliberately does not depend
  on the disease enum being complete.
- Tests: valid/in-progress/complete cases, bad mortality rate rejected, critical-symptom
  matrix incl. case-insensitivity and the no-symptoms case.

### `media`
- `MediaSchema`: `{ id, farmerPhone, caseId?, mime, r2Key, kind, transcript?,
  transcriptConfidence?, observations?, uploadedAt }`, confidence bounded 0–1.
- `CONFIDENCE_THRESHOLD = 0.6` + `isReliable()`: below the threshold the system must
  **ask, not guess** — the Pidgin audio fallback contract. Missing confidence = not
  reliable.
- Tests: valid/transcribed rows, confidence > 1 rejected, threshold matrix (undefined,
  0.59, 0.6, 0.82).

### `report` — surveillance with a privacy guarantee
- `ReportSchema`: id, sessionId?, caseId?, farmerPhone, state?, lga?, species, farmSize,
  symptoms[], diseaseHits[], mortalityCount, createdAt.
- `anonymise()`: strips `farmerPhone` so the signal can leave the app without
  identifying a farmer. The test asserts the phone key is **gone**, not merely empty.
- Tests: valid report, missing-phone rejection, anonymise removes the key.

### `store`
- `StoreSchema`: `{ id, name, phone, state, lga, location?{lat,lng}, stock[], isOpen
  (default true), updatedAt }`. Phone rides the same PhoneSchema (stores are found by
  LGA and referred by phone).
- Tests: valid store, isOpen default, empty-stock okay, empty stock *item* rejected.

### `outbox` — reliable delivery, no transport assumptions
- `OutboxPayloadSchema`: discriminated union — text / referral_slip / report / resolve.
- `OutboxStatusSchema`: `pending | sent | failed | dropped`.
- `OutboxSchema`: id, farmerPhone, door?, sessionId?, payload, status, attempt (default
  0), maxAttempts (default 5), nextAttemptAt?, createdAt. **Cross-field refine**:
  `attempt <= maxAttempts`.
- `OUTBOX_BASE_BACKOFF_MS = 5000`, `OUTBOX_MAX_BACKOFF_MS = 5*60_000`, `canRetry()`:
  only `failed` and under the cap.
- Tests: all payload variants, defaults (attempt 0 / maxAttempts 5), unrecognized
  variant rejected, attempt-over-cap rejected, canRetry matrix.

## Gate

`pnpm check` green across the workspace (exit 0). Schemas: 57 unit-test blocks across
10 files (table-driven cases expand at runtime); pure core well above the 80% target.

## Bugs the tests caught

1. **First-pass type errors** (compiler, not logic): `verbatimModuleSyntax` forced
   `import type` for the exported types; schema-typed fixtures had to pass through
   `Schema.parse` so string literals narrow to their enum types.
2. **`OutboxSchema` allowed `attempt > maxAttempts`** — a row with attempt 6 / max 5
   parsed successfully. Added the cross-field refine; the test now proves rejection.
3. **Test-side helper trap:** an outbox `record()` helper that parsed via
   `OutboxSchema.parse` *threw* before `safeParse` could observe the failure — the
   rejection tests had to build the bad row explicitly. Lesson recorded: helpers must
   not pre-validate when the test's job is to catch invalidity.

## Notes for the next phases

- Phase 2 consumes `CaseSchema`, `SessionSchema` (+ `missing[]`), `DiseaseSchema`,
  `DoorSchema`, `normalizePhone`.
- Everything the LLM or bridge produces must be guarded by these schemas before it
  touches a state object.
- If a new door, status, or enum value is needed, **extend the schema first, then the
  consumers** — never liberally widen at the call site.