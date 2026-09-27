# Phase 2.6 — Retrieval-grounded ask-for + inventory honesty

**Status:** shipped
**Branch:** `phase/2.6-askfor-retrieval`
**Predecessor:** Phase 2.5 (triage confidence ladder)

## Why this phase exists

Phase 2.5 shipped the right *shape* — a confidence ladder, a refusal list, an ask-for block instead of "the right medicine" — but two things about it were not shippable:

1. **The treatment content was a hardcoded table.** `askfor.ts` carried six diseases with fixed product classes, fixed seller questions, and zero citations. That is unreviewable clinical copy sitting inside a safety path: nobody can check it against a veterinarian, and it goes stale silently. It also made the confidence claim unfalsifiable — there was no evidence attached to anything, so "confident" meant "someone typed it in".
2. **The store seed carried fabricated inventory.** The schema had been tightened to require `stockVerifiedAt` for any non-empty stock, and the seed duly supplied a placeholder timestamp on all seven stores. That is a fabricated fact wearing a verification date — the exact failure the constraint was built to prevent.

The user also asked the underlying question directly: *shouldn't the ask-for content be decided after triage, from retrieved medical knowledge for Nigerian conditions, with a confidence score?* This phase is the answer, plus the honest pushback that answer requires.

## The decision

**Split content by kind, because they have different failure modes.**

- **Policy stays in code, permanently, and is never retrieved.** `POLICY_REFUSALS` — refuse a general antibiotic "just in case", an antibiotic sold as a cure for a virus, an undosed feed mix, a vaccine out of the cold chain, anything without a NAFDAC number, loose unlabelled medicine, any sale with no receipt. If the index is down, corrupt, or never built, the farmer *still* gets these. Refusing is never harmful, so these rules have no reason to depend on a service being available.
- **Clinical content is retrieved and gated.** Which product class, why, what to ask the seller, and `needsVet` now arrive from a `ClinicalLadderSource`, always with `evidence.agreement` and `evidence.citations[].source`.

**The gate is the safety core, and it lives in code, not in a prompt.**

`gateLadder(c, ladder)` refuses to let a product be named unless all of:

| Rule | Value | Why |
|---|---|---|
| Triage band must be `confirmable` | — | A `red_flag` or `ambiguous` case names nothing *even with a strong ladder*. Coccidiosis vs necrotic enteritis need different drugs, so "the treatment" is not a thing that exists yet. |
| `evidence.agreement` | ≥ `AGREEMENT_FLOOR` (0.6) | Below the floor the sources disagree, and a coin flip on a drug is how resistance gets made. |
| `evidence.agreement` range | 0–1, else refused | `NaN` passes a naive `< 0.6` check, so an unverifiable score is treated as *unverifiable* rather than trusted. |
| Distinct citation sources | ≥ `MIN_CITATIONS` (2) | Two pages from one manual is one source. Counted as distinct `source` names, not citation count. |
| Ladder present | — | No index wired, or nothing matched → the slip still renders, naming no product. |

**The score means "sources agree", not "this is the disease."** Surfacing a model's own confidence over retrieved prose would be a category error: clinical RAG evaluations found retrieval can *reduce* accuracy when it returns irrelevant material, and structured/topic-aligned chunking beat naive splitting 87% to 50% precisely because the retrieved unit stopped being incoherent. So the number the prescriber sees is labelled `sources agree 0.80 (not a diagnosis)`, and below the floor the system says nothing and escalates.

**Two channels, because the counter is not always a vet.** Research settled the audience question: the last mile in Nigeria is the **veterinary paraprofessional / Animal Health and Husbandry Technologist**, not a human pharmacist. FAO's VPP programme exists because trained paraprofessionals — not doctors — are who actually reach farmers, and NADIS itself offers a "Vet / Para Vet" login against a VCN number, so the government already treats the role as real and registerable.

- **Farmer channel** (`buildReferralSlip`) — never a drug name, never a citation, never a score. Plain-language case, what to ask, the refusal list, the confirm action. Sources are deliberately withheld: a citation list reads to a farmer as authority the evidence has not earned, and the farmer cannot act on it.
- **Prescriber channel** (`buildPrescriberBrief` / `renderPrescriberBrief`) — requires a `PrescriberRole`, and carries the differential ranking, the candidate *product class* (never a brand, never a dose), sources with locators, the agreement score, what would confirm it, and a standing "decision support, not a prescription" disclaimer.

**Why the product pitch does not change.** We are not selling "AI tells you the medicine". We are a data-collection loop and a veterinary handoff: a farmer answers in Pidgin, we fill the structured case, we refuse the drug that will not work, we point at the vet, and the record accumulates into the surveillance layer the ministry does not have. The medicine content is there to make that handoff trustworthy, not to be the headline. What the retrieval gate actually buys us is that the brief a vet receives is citable and confidence-scored, so the vet trusts it and sends us the next farmer - the prescriber channel is the growth surface. That is a stronger reason to get the gate right than any competitive one.

**On the vet shortage.** The user's concern was that a confidence-scored medication hint should *help* given low farmer-to-vet and farmer-to-pharmacist ratios. Agreed, with one hard limit: the answer is task-shifting to *trained* paraprofessionals with decision support, not to a lay shop attendant with a chatbot. A confident wrong antibiotic dispensed to someone with no training makes the shortage worse — Nigeria carries roughly 64,000 AMR-attributable deaths (2019), a National Action Plan whose predecessor hit 44% of targets, OTC and informal antibiotic sales, routinely ignored withdrawal periods, and antimicrobials as the most frequently detected residue in Nigerian food animals. So the prescriber channel is role-gated in the type system, and the farmer channel cannot be made to leak into it.

## What changed in code

- `packages/core/src/askfor.ts` — hardcoded `ASK_FOR` table **deleted**. Now: `Citation`, `LadderEvidence`, `ClinicalLadder`, `ClinicalLadderSource`, `PrescriberRole`, `AGREEMENT_FLOOR`, `MIN_CITATIONS`, `POLICY_REFUSALS`, and `gateLadder`. The old `askFor(c)` function no longer exists, because a function that invents clinical content from a disease name is the bug.
- `packages/core/src/slip.ts` — `buildReferralSlip(c, store?, ladder?)` and `askForBlock(c, ladder?)` render the *gate outcome*, not a hardcoded answer. Adds `buildPrescriberBrief` / `renderPrescriberBrief`, `PrescriberBrief`, `RankedDifferential`, `PRESCRIBER_DISCLAIMER`.
- `packages/core/src/orchestrator.ts` — `TurnDeps.ladder?: ClinicalLadderSource` is the retrieval seam. `retrieveLadder` consults it **only** on the supply door, and only after triage cleared the case. No source wired → the slip still renders and names nothing.
- `packages/core/src/validate.ts` — `EffectiveDoor` is now typed `Door | 'collect' | 'triage'`, making explicit that the two extra doors are transitional routing states and that only the four terminal doors are persisted.
- `packages/stores/src/data/stores.ts` — **all fabricated stock removed.** No seed store has `stock` or `stockVerifiedAt`.
- `packages/stores/src/lookup.ts` — `ReferralQuery.item` and the stock-preference branch **removed** as dead code against an empty inventory set. `pickReferral` now filters on location, then sorts by name for deterministic ties. `verifiedStock` / `hasStock` remain as the partner opt-in seam, exercised in tests by a synthetic partner fixture rather than by seed data.

`StoreSchema.stock` / `stockVerifiedAt` are **kept on purpose**: the schema's `.refine` rejects a non-empty `stock` without `stockVerifiedAt`, so the seam stays machine-enforced for a real partner sync while nothing in the product fabricates an inventory. Stripping the field entirely would delete the constraint that prevents the original bug from returning.

## Tests

`askfor.test.ts` (13) — gate behaviour: permits on confirmable + strong evidence; refuses on `red_flag` **and** on `ambiguous` even with a perfect ladder; refuses when nothing retrieved; refuses below the floor; permits exactly at the floor; refuses `NaN` and out-of-range scores; refuses two citations from one source; never permits a notifiable disease. Plus `POLICY_REFUSALS` carrying the counterfeit guard, antibiotic and cold-chain rules unconditionally.

`slip.test.ts` (16) — golden farmer slip with no ladder; golden `askForBlock` when the gate permits; sources and scores proven absent from the farmer channel; refusals still delivered for an unknown diagnosis; golden prescriber brief; withheld-with-reason brief; per-differential scores shown only where retrieval covered that disease; the score never presented as a diagnosis.

`orchestrator.test.ts` (+5) — supply door with no index names no product; includes the retrieved product class when permitted; still refuses an unsupported ladder; **the index is never consulted off the supply door**; a transitional door is not persisted as the case outcome.

`stores/index.test.ts` (19) — every seed store has no stock and no verification timestamp; `hasStock` exercised against a synthetic partner fixture; `pickReferral` proven to choose on location alone, never on an inventory claim.

## Exit criteria

- Hardcoded clinical ladder removed from the codebase — verified, no `ASK_FOR` table remains.
- No fabricated inventory anywhere in the seed — verified, pinned by a test per store.
- Retrieval is an interface with a fake, so Phase 4 can wire a real index without touching core.
- A product cannot be named without triage confirmation, an agreement floor, and two independent sources — verified by tests that try to defeat each rule.
- The farmer channel cannot leak a drug name, a citation, or a score — verified by test.
- `pnpm typecheck` green; `pnpm lint` clean apart from the pre-existing `apps/api/src/server.ts` `no-console` warning; 308 tests pass.

## Known limits

- **The corpus does not exist yet.** `ClinicalLadderSource` is an interface with no production implementation. Until Phase 4 builds the index, the SUPPLY door names no product — which is the correct, safe behaviour, not a regression.
- **Thresholds are reasoned, not calibrated.** 0.6 and 2 sources are defensible starting points drawn from the literature, not values fitted against labelled Nigerian poultry cases. That calibration needs a vet and a labelled set.
- **The corpus still needs veterinary sign-off.** Source *selection* — which documents are authoritative for Nigerian poultry — has not been reviewed by a licensed veterinarian. It must be before any index ships.
- **No prescriber identity exists.** `PrescriberRole` is a type-level gate only. Nothing authenticates that the person reading a brief is actually a registered VPP, and Phase 2.6 deliberately did not invent an auth model. NADIS's VCN login is the obvious reference to copy.
