# Poultry Agent — Engineering Rules & Workflow

This file is the contract for how we write code in this repo. Everything here is binding for hand-written code and AI-generated code alike.

---

## 1. The Product In One Line

A conversational AI poultry advisory agent on WhatsApp for Nigerian semi-commercial farmers (200–2,000 birds):
**four doors** — RESOLVE (guidance) · SUPPLY (referral slip) · ESCALATE (safety rule; real vet is post-MVP) · REPORT (anonymised surveillance signal).

**What it actually is:** a data-collection loop and a veterinary handoff. The unit of value is the *case* — a farmer describes a sick bird in Pidgin, we fill the structured record, we refuse the drug that will not work, we point at the nearest vet, and the record accumulates into the poultry disease surveillance layer the ministry does not have. The farmer's willingness to open the chat tomorrow is the growth metric; a farmer only stays if we answer in their language and visibly move them toward a professional. The **prescriber brief is the growth surface**, because the vet is who sends us the next farmer.

Judge every change against that loop first. A feature that improves retrieval quality but makes the farmer less willing to talk is a regression.

Design authority: `SYSTEM_DESIGN.md` (system) and `STACK.md` (stack/deploy). When code and docs disagree, **fix the docs too.**

## 2. The Locked Stack (no debating, no drift)

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Workspace | pnpm monorepo |
| HTTP API | Hono → Cloudflare Workers |
| UI | React + Vite → Cloudflare Pages |
| Agent SDK | Vercel AI SDK (`useChat`, `streamText`, `generateText`, `tool`) |
| Validation | Zod (shared schemas in `@poultry/schemas`) |
| DB/vector | Postgres + pgvector on Neon, Drizzle ORM |
| Object storage | Cloudflare R2 |
| WhatsApp | Baileys bridge on ONE small Node host |
| Embeddings | Google `text-embedding-004` @ 768 dims (free) |
| Pidgin transcription | Google `gemini-3.5-transcribe` (free tier) + dynamic Pidgin prompt |
| LLM | Google `gemini-2.5-flash` (free tier; chat/tools/vision/audio, function calling) |
| Obs | Langfuse · Sentry · pino · `/health` `/ready` |

**Amendment, Sep 2026 — the MVP is single-provider.** The table above originally specified OpenAI
GPT-4o-mini for the turn and OpenRouter free multimodal for transcription. Both were dropped: the MVP has no
API budget, and Google AI Studio's free tier covers the entire surface with no card, which collapses two
providers and two keys into one. `gemini-2.5-flash` does chat, tool calling, vision *and* audio input at 1M
context. OpenRouter survives only as an optional 429 fallback, and any model used there must accept audio
and must not be a reasoning model — reasoning models paraphrase, and farmer speech is evidence that has to
survive verbatim.

**The privacy cost of free, stated plainly:** Google's free-tier terms allow prompts to be used for product
improvement; only paid carries a no-training guarantee. Acceptable for a demo, not for real farmers' voice
notes, which carry identifiable speech and a household's livelihood. Revisit before real user data.


## 3. Repository Rules

- **Never commit secrets.** Env comes from `.env` / `.dev.vars` (gitignored); validated at boot by a Zod env-schema. `.env.example` is the only committed env file.
- **No comments unless they explain WHY.** Name things so the code explains itself. Do not echo the code in a comment.
- **Strict mode stays on.** `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `exactOptionalPropertyTypes` off only with a written reason.
- **No `any`.** Write the type. `unknown` + zod parse for untrusted input.
- **Interfaces before implementations.** Every external service (LLM, embed, transcript, R2, WhatsApp, DB) is behind an interface so tests supply a fake. Code in one package never imports another package's implementation details — only its public `src/index.ts`.
- **Dependency direction is one-way:** `schemas ← core ← {rag, stores, media, bridge} ← api ← web`. `core` depends only on `schemas`. Nothing may import `apps/*`. No package may import a sibling's internals.
- **Pidgin is data, not noise.** Farmer text is preserved verbatim; never "correct" it to formal English. Reply in the farmer's language: a heuristic `classifyLanguage` (code, no extra LLM call) picks Pidgin vs English per message; replies match the detected language, so an English-speaking farmer gets English.
- **Phone numbers:** store E.164 (`+234...`); use `normalizePhone` from `@poultry/schemas`. Never treat `080...` and `+23480...` as different people.
- **Formatting is enforced, not discussed:** Prettier + ESLint run locally. `pnpm check` must pass before a phase is called done.

## 4. The /health Rule

Every deployable exposes `/health` (liveness) and `/ready` (DB, R2, embed ping). If a new phase adds an external dependency, `/ready` must check it. A service that can't serve `/health` 200 is not done.

## 5. Commit Workflow

- One branch per phase (e.g. `phase/4-rag-ingestion`). Never commit unrelated files.
- Conventional commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`.
- Each commit must leave `pnpm check` green (or the subset: typecheck + its own unit tests).
- No phase is marked done until its tests + the full repo `pnpm check` pass locally.

## 6. Definition of Done (per phase)

1. Phase's unit tests pass (Vitest).
2. `pnpm typecheck` green across the workspace.
3. `pnpm lint` clean (exceptions only where the ask includes logging).
4. The phase is **independently testable** — its tests don't require another phase to be built.
5. `/health` + `/ready` reflect any new dependency.
6. Docs stay truthful: `STACK.md`, `SYSTEM_DESIGN.md`, `PHASES.md` updated if the phase changed reality.
7. Report: what was built, tests run, exit criteria matched, what's next.

---

## 7. How We Write Tests (binding)

### The rule that makes this repo work
**Every phase is independently testable.** That means every external dependency is an *interface with a fake* — a test never needs `main` built, a live WhatsApp socket, a real LLM, or a real database to run a unit test. Integration tests are separate scripts tagged to run only when the real thing is available.

### Test file conventions
- A test file `foo.test.ts` sits beside `foo.ts` in `src/`.
- Use `describe`/`it`/`expect` from `vitest` (globals are off).
- One `describe` per unit, one `it` per behaviour. Name behaviours, not code: `it('accepts a local-format number')`, not `it('checks regex')`.
- Real data stays out of tests. Sample Pidgin transcripts live in `tests/fixtures/pidgin/`.

### Coverage targets
Pure logic (schemas, core, rag split, store lookup) **≥ 80% lines**. Thin adapters/glue ≥ 60%. Never ship a phase with 0 tests on its pure core.

### Unit test rules
1. **No network, no sockets, no real services.** Any HTTP/DB/LLM/socket use means you need a fake interface.
2. Assert **behaviour**, not implementation internals (object shapes, status codes, states — not "function was called" unless the call itself is the contract).
3. Deterministic: no `Math.random`, no wall-clock except via an injected clock. Fixed seeds.
4. Golden tests for anything that formats text (referral slips, transcripts, citations): fixture in, exact string out.
5. **Error paths are tests too.** Zod rejection, missing field, low-confidence transcript, empty search result — test the failure, not just the happy path.

### Integration tests (separate from unit)
- Placed under `src/*.integ.ts` or `tests/integ/`, tagged with `describe.sequential` and gated by an env var (e.g. `RUN_INTEG=1`).
- They do NOT run in `pnpm check` by default. They run in `pnpm test:integ`.
- Purpose: prove a real wiring (Neon + pgvector, R2, whisper) works end-to-end once, before a phase is marked done.

### Test-quality bar
- No test asserts `true`. No test is a copy of the implementation.
- If your test survived because a fake is too permissive (a fake that always returns results), tighten the fake — a too-clean fake catches nothing.

---

## 8. Working With An Agent

When an AI agent works in this repo, it must:
1. Read `AGENTS.md` first, then `PHASES.md` to know which phase is active.
2. Only build the current phase's contracted scope; unrelated changes are rejected.
3. Run `pnpm check` (or the phase-local subset) before claiming done.
4. Write the phase's tests as part of the phase — tests are not optional extras.
5. Update `PHASES.md` status (✅ / 🔒 / ⏳) when a phase ships.

## 9. Current Status

```
PHASE 0  Foundation / monorepo harness      ✅ shipped (this repo bootstraps green)
PHASE 1  Contracts (@poultry/schemas)        ✅ shipped (full contract set + tests)
PHASE 2  Orchestrator core (@poultry/core)   ✅ shipped (four-door core + tests)
PHASE 2.1 Language routing + history + name ✅ shipped (classifyLanguage, ChatInput.history, profile)
PHASE 2.2 Memory model + compaction          ✅ shipped (notes, budget-triggered compaction)
PHASE 2.3 Memory hardening                    ✅ shipped (fail-closed budget, note caps, stall fallback, recall eval)
PHASE 2.4 Master record contracts + context   ✅ shipped (profile digest + open-case pointer injected, 4 read-only tool contracts, MasterStore)
PHASE 3  Store lookup (@poultry/stores)       ✅ shipped (typed seed, no fabricated stock, searchByLga/pickReferral on location/coveredLgas, 19 tests)
PHASE 2.5 Triage confidence + ask-for ladder   ✅ shipped (3 confidence bands, 5th 'triage' door, 4 safety gaps closed, REFUSAL LIST)
PHASE 2.6 Retrieval-grounded ask-for + honesty ✅ shipped (hardcoded ladder deleted, ClinicalLadderSource seam, gateLadder fail-closed, farmer vs prescriber channels, all seed stock removed)
PHASE 4  RAG ingestion (@poultry/rag)         ✅ shipped (paginate + [PAGE n], one Analyzer map-call per doc, page/heading groups, micro-chunk 800-1000 tok 10% overlap, typed regions, citationFor -> core Citation, 67 tests)
PHASE 5-10  see PHASES.md                   ⏳ not started
```