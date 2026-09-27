# Phase 4 — RAG ingestion (`@poultry/rag`, ingest half)

**Status:** shipped. `phase/4-rag-ingestion`.

**Why this exists:** Phase 2.6 deleted the hardcoded `ASK_FOR` table and left a `ClinicalLadderSource` seam with
no implementation behind it. The supply door therefore names no product, which is the correct fail-closed
behaviour but a dead product. This phase builds the ingest half that produces the material retrieval will
hand that seam. The search half and the database are Phase 5.

**Research that shaped it:** structured chunking beat naive fixed-size splitting 87% to 50% on the RAG
evaluation literature, because a fixed-size slab straddles two sections and answers with half of each. The
same reasoning applies to our own gate: a chunk of 900 tokens of prose cannot tell the gate which disease,
which species and which product class it is speaking about, so it cannot produce two independent sources for
a claim. A chunk here is therefore a *region* — one heading-bounded clinical claim, carrying its own
structured fields — not a slab.

## Boxes

| Box | Where |
|---|---|
| Pagination + `[PAGE n]` deterministic page-stamp | `paginate.ts` — `paginate`, `stampedText`, `pageStamp`, `locatePage` |
| `analyze_document` — one LLM map-call per doc via an `Analyzer` interface | `analyze.ts` — `Analyzer`, `AnalyzeRequest`, `analyzeDocument` |
| Deterministic split at page/heading → chunk-groups | `groups.ts` — `buildGroups` |
| Micro-chunking (800–1000 tok, 10% overlap) → chunks | `micro-chunk.ts` — `microChunk`, `DEFAULT_CHUNKING` |
| Chunk schema + citations | `schema.ts` — `ChunkSchema`, `citationFor` |
| End-to-end ingest | `ingest.ts` — `ingestDocument`, `locatorFor` |

## Three decisions worth defending

**1. The model tells us what the regions are; we compute where they are.**
`Analyzer.analyze` returns headings, section kinds, species, diseases, treatment fields and region text. It does
*not* get to decide page numbers. `locatePage` searches the paginated text for the region's own opening
words, so a hallucinated `pageHint` cannot place a citation on the wrong page. When the model claims a page
that contradicts the search we warn and use our own number; when its text cannot be found at all we warn
loudly and fall back. A citation that is quietly wrong is worse than no citation, because the Phase 2.6 gate
counts sources.

**2. Regions are typed, so a chunk can feed the gate.**
`RegionSchema` carries `sectionKind`, `species[]`, `diseases[]` and an optional `TreatmentSchema`
(`productClass`, `why`, `askTheSeller[]`, `needsVet`, `drugClass`, `withdrawalDays`). That is deliberately the
shape `ClinicalLadder` needs in `packages/core/src/askfor.ts`. Phase 5 retrieves, and the ladder can be
assembled from real fields instead of a summariser re-reading prose and guessing.

**3. Citations are denormalised onto the chunk.**
`ChunkSchema` stores `source`, `publisher` and `locator` (`p.2 §Treatment`, or `p.2-4 §Treatment` when a group
crosses pages). A Phase 5 top-k result can therefore hand `citationFor(chunk)` straight to the gate as a
`Citation` with no second lookup — and `citationFor` is typed against `Citation` from `@poultry/core`, so the
two halves cannot drift apart silently.

## The honesty boundaries

- **A sentence longer than the ceiling is never cut.** It becomes its own chunk, `oversized: true`, and
  `ingestDocument` pushes a warning. A boundary inside a clause reads to a downstream model as a second,
  weaker claim.
- **`analyzeDocument` throws `RegionMapError` on an unparseable map.** An unusable region map is not a partial
  document; failing here is better than quietly indexing half a source.
- **Merged regions that disagree on product class keep the first and warn.** Silent last-write-wins here would
  be a clinical error with no trace.
- **Page numbers come from text search, never from the model** (decision 1).
- **No production corpus, no licensed-vet review.** The pipeline is proven on synthetic fixtures. Nothing here
  has been reviewed by a veterinarian and no source document has been ingested. Real content needs Phase 5
  plus a named clinical reviewer.

## Test evidence

`packages/rag`: 7 files, 67 tests. Repo: 39 files, 373 tests. `pnpm check` exit 0 (only the pre-existing
`apps/api/src/server.ts` `no-console` warning).

Exit criteria:
- **Chunk golden tests green** — `ingest.test.ts` asserts six exact chunk ids, positions, token counts and
  bodies from one fixture, plus exact group headings, page numbers, and the exact citation objects.
- **Boundaries never split a sentence** — `micro-chunk.test.ts` asserts exact piece bodies, and
  `sentences.test.ts` pins the splitter against decimals (`1.5%`), `e.g.`, `vs.`, trailing quotes and
  whitespace collapse.
- **Overlap math exact** — consecutive chunks are checked to share a whole-sentence suffix whose token count is
  `> 0` and `<= overlapTokens`; `overlapTokens: 0` is asserted to share nothing; an overlap larger than the
  chunk is asserted to clamp to the previous chunk's tail and still advance.
- **One map call per document** — the fake analyzer counts its invocations.
- **Determinism** — the same document, text and analyzer output produce a deeply equal result.
- **Error paths tested** — unparseable region map, no pages, ceiling below target, overlap at the ceiling,
  empty text.

## What a test caught

`microChunk(text, { overlapTokens: 0 })` still repeated a sentence. `overlapStart` walked one step back before
comparing the accumulated total against the target, so a zero overlap degenerated into a one-sentence overlap.
Fixed with an early return for `overlapTokens <= 0`, and pinned by a test asserting a shared-suffix length of
exactly 0 between adjacent chunks.

## What is next

- **Phase 5** — `documents` / `chunk_groups` / `chunks` in Drizzle on Neon with `vector(768)`, the embed
  provider interface, hybrid search, the starvation fallback, and the `ClinicalLadderSource` implementation
  that finally makes the supply door name a product.
- **Then, and only then, content** — a curated, Nigerian-grounded, source-stamped corpus reviewed by a named
  licensed veterinarian. The corpus is a clinical-governance task, not an engineering one, and it is the real
  blocker on the supply door shipping to farmers.
