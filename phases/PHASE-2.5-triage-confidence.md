# Phase 2.5 — Triage confidence + the ask-for ladder

**Branch:** `phase/2.5-triage-confidence`
**Status:** shipped (code) / `store.is_open` folded into 3.1
**Superseded in part by Phase 2.6** — the hardcoded ask-for ladder below was deleted and replaced with a retrieved, gated one, and the placeholder `stockVerifiedAt` values were removed from the seed. This document is kept as the record of what 2.5 shipped; where it describes the ladder or the stock seed, Phase 2.6 is authoritative.

## Why this jumped the queue

The store review produced two findings that outranked the RAG plan:

1. We were about to recommend a store's inventory we cannot know. Only 29% of Nigerian agro-vet stores sell vaccines, no survey found a single store maintaining optimal cold chain all year, and the Chief Veterinary Officer warned in Feb 2026 that a bad vaccine is worse than no vaccine. A hardcoded `stock` array is a lie the product cannot keep.
2. Our door logic had no state for "we are not sure." An LLM triages worse than physicians (GPT-3: 70% vs 91%, with emergent cases deprioritised), so confidence has to be decided in code, and its default has to be escalate.

Uncertainty was the thing that could kill birds. Everything else could wait.

## The two ladders

**Confidence ladder** (`core/src/triage.ts`, decided in `validate.ts`):

| Band | Meaning | Door |
|---|---|---|
| `red_flag` | peracute mass mortality, neck sign, dark/blue comb, cannot stand, gasping, suspected HPAI | ESCALATE + REPORT |
| `ambiguous` | two or more look-alikes, or the model flagged a field unconfirmed | TRIAGE (new door) |
| `confirmable` | one diagnosis, no red flag | RESOLVE / SUPPLY |

Order of checks in `validateCase`: mass mortality → red flag → completeness → ambiguity → supply → resolve. Safety outranks data collection, and an incomplete case never reaches the counter.

**Ask-for ladder** (`core/src/askfor.ts`): `{ product, why, askTheSeller[], refuse[], needsVet }`, derived from the differential, never from stock. It replaces the circular "ask for the right medicine for the symptoms above", which told the farmer to do the job the agent exists to do.

The refusal list is the part that earns its keep: 100% ciprofloxacin and pefloxacin resistance in Nigerian poultry *E. coli*, plus documented resistance across the approved anticoccidials, means the drug the counter volunteers is often the drug that fails. Every ladder carries the counterfeit guard (no NAFDAC number, no loose unlabelled medicine, no receipt).

Viral diseases get `needsVet` and an explicit "no antibiotic cures a virus" refusal, because that is the single most common way a poultry conversation turns into a dead flock.

## The four safety gaps this closed

1. `diseaseHits: ['newcastle', 'infectious_bronchitis']` fell through to RESOLVE because the array was ignored. It is now the canonical AMBIGUOUS case, and a fifth door (`triage`) asks the discriminating question.
2. `infectious_bronchitis` and `necrotic_enteritis` were missing from `DiseaseSchema`, so the two most important look-alike pairs were unrepresentable.
3. Red flags matched exact lowercase literals, so a farmer writing "neck dey bend" silently got RESOLVE. `RED_FLAG_RULES` now match on stemmed token concepts per symptom phrase, with Pidgin covered ("bird no fit walk", "comb turn dark blue", "dey gasp").
4. `'blood in droppings'` was classified critical, escalating textbook coccidiosis (68.7% prevalence in Nigerian broilers) and burning the escalation queue. It is now a *coccidiosis signature* — a differential input, not a red flag.

## Two decisions worth defending

**The model's own text is discarded on the triage door.** It is the turn where the model is least sure, and a confident-sounding reply is exactly what must not reach a farmer. `replyFor('triage')` returns code-owned text only.

**Ambiguity is bounded.** `MAX_TRIAGE_TURNS = 2`: a case that survives every discriminating question escalates to a vet instead of asking the same question forever. `triageTurns` is written by the orchestrator in code, never by the model.

## Inventory demoted, not deleted

`stock` now requires `stockVerifiedAt` — the schema *rejects* an unconfirmed stock list, so an unverified claim cannot be persisted, let alone printed. `isOpen` is gone (a farm shop's hours at 2am is not a fact we can hold), and the slip states plainly either "They confirmed on <date> that they stock: …" or "We do not know what they stock today, so ask them."

`searchByLga` / `pickReferral` / `coveredLgas` survive as "where can I physically go". An uncovered LGA still returns the ladder without a map, because the ladder is the part that survives a wrong guess.

## Exit

292 workspace tests green (schemas 115, core 148, stores 19), `pnpm typecheck` clean, `pnpm lint` clean apart from the pre-existing `apps/api` console warning.

## What this phase does NOT do

*(As written at 2.5. Both of the first two were closed by Phase 2.6 — see `PHASE-2.6-askfor-retrieval.md`.)*

- No drug, dose, or withdrawal period is sourced from RAG yet. The ladder's clinical content is hardcoded and **must be reviewed by a licensed veterinarian before any real farmer sees it.** → *Closed: the hardcoded ladder was deleted. Clinical content now arrives from a `ClinicalLadderSource` and `gateLadder` names nothing unless triage confirmed the case, sources agree ≥ 0.6, and ≥ 2 independent sources back it. The corpus itself still needs vet sign-off.*
- No partner-confirmed inventory exists yet; every seed entry carries a placeholder `stockVerifiedAt`, which is exactly the thing a real deployment must replace with a partner opt-in flow. → *Closed: every placeholder was removed. No seed store carries stock at all; the fields survive only as a machine-enforced partner seam.*
- No formal Doorcas Africa or NVRI integration. They are named as the counterpart and the confirmatory lab, nothing more.
