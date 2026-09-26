# Phase 3 — Store lookup (`@poultry/stores`)

## What shipped
A pure-function agro-vet directory that the SUPPLY door uses to name a store the farmer can actually visit. No network, no DB, no model call — the whole package is code over a typed seed.

- `src/data/stores.ts` — 7 seed entries across 6 LGAs (Oyo, Lagos ×2, Kaduna, Enugu, Ogun, Plateau). Every entry validates against the shared `StoreSchema` from `@poultry/schemas`: UUID id, E.164 `+234…` phone, state/LGA, `stock[]`, `isOpen`, ISO `updatedAt`.
- `src/lookup.ts` — `hasStock`, `searchByLga(lga, state?)`, `pickReferral({ lga?, state?, item? })`, `coveredLgas()`.
- `src/index.ts` — public surface; re-exports the directory, the lookup functions, and the shared `AgroStore` type.

## The rule that mattered
This phase replaced the package's own `AgroStoreSchema` (`hasStock`, local phone strings) with the shared `StoreSchema` from `@poultry/schemas`. The referral slip in `core/slip.ts` already imports `AgroStore` from schemas, so the duplicate type was a fork waiting to drift — a slip that accepted a store the directory could not produce. One contract, one package.

## Picking rules
Applied in order, first match wins:
1. **Location** — match `lga` (case- and whitespace-insensitive); narrow by `state` when given. Both optional, so a caller can search nationwide.
2. **Stock** — when an `item` is named, narrow to stores that carry it, but only if any do. An item nobody stocks must not empty the result set and silently return "no store" for a town we *do* cover.
3. **Open** — prefer open stores, again only if any exist. A closed shop beats telling a farmer to drive to a different state.
4. **Tie-break** — sort by name. Deterministic output keeps the golden path stable and makes tests meaningful.

An unlisted LGA returns `undefined`. That is the fallback contract: `core/slip.ts` already golden-tests the no-store slip, which degrades to "buy medicine only inside a known agro-vet store" plus the ask-for list. We never invent a shop we cannot vouch for — a wrong referral costs a wasted trip and erodes the one thing the farmer came here for.

## Tests — 17, all green
`src/index.test.ts` covers the seed contract (schema validation per entry, unique ids, E.164 shape, `getStores()` copy safety), `hasStock` (case-insensitivity, miss, blank), `searchByLga` (case, state narrowing, unknown, blank), `pickReferral` (stocked-preference, open-preference, item-miss fallback, deterministic tie-break, unlisted LGA, no-location search), and `coveredLgas` (uniqueness, stable order). Typecheck and lint clean.

## Two bugs the tests caught
- `getStores()` returned the live `STORES` array, so the defensive-copy test's `.pop()` deleted a real seed entry and cascaded two unrelated failures. It now clones each entry and its `stock` array.
- The first "prefers open" test asserted a guarantee the seed could not satisfy (single closed store in Kaduna North). Rather than weaken the assertion, the seed gained a second Lagos store that is deliberately closed — so the open-preference rule is now genuinely exercised.

## Next
Phase 4 — RAG ingestion. The store directory is pure logic and needs no wiring; Phase 8 (API) hands `pickReferral`'s result to `buildReferralSlip` so the slip carries a real store block.
