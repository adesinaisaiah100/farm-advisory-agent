import { EMBED_DIMS, l2Normalize, type EmbedOptions, type Embedder } from '../embed/embedder.js';
import {
  ChunkGroupSchema,
  ChunkSchema,
  type Chunk,
  type ChunkGroup,
  type SectionKind,
  type SourceSpecies,
  type Treatment,
} from '../schema.js';
import type { CaseData, Disease } from '@poultry/schemas';

// Fixtures live beside the code they test rather than in tests/fixtures because the
// retrieval unit matrix has to build several hundred synthetic chunks, and these
// are constructed vectors, not captured real content.

/** A one-hot vector, so cosine distance is exactly 0 for a match and 1 otherwise. */
export function oneHot(index: number, dims: number = EMBED_DIMS): number[] {
  const vector = new Array<number>(dims).fill(0);
  vector[index % dims] = 1;
  return vector;
}

function hashedVector(text: string, dims: number): number[] {
  const vector = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    vector[i % dims] = (vector[i % dims] ?? 0) + text.charCodeAt(i);
  }
  return l2Normalize(vector);
}

export interface FakeEmbedder extends Embedder {
  readonly calls: readonly { readonly texts: readonly string[]; readonly options?: EmbedOptions }[];
}

/**
 * Deterministic, network-free embedder. Mapped texts use the vector the test
 * chose; anything unmapped falls back to a hash so an unexpected query still
 * returns a stable vector instead of throwing.
 */
export function fakeEmbedder(
  table: Record<string, readonly number[]>,
  dims: number = EMBED_DIMS,
): FakeEmbedder {
  const calls: { texts: readonly string[]; options?: EmbedOptions }[] = [];
  return {
    dims,
    calls,
    async embed(texts, options) {
      calls.push({ texts, options });
      return texts.map((text) => {
        const mapped = table[text];
        return mapped === undefined ? hashedVector(text, dims) : [...mapped];
      });
    },
  };
}

export function embedderThatFails(message: string): Embedder {
  return {
    dims: EMBED_DIMS,
    async embed() {
      throw new Error(message);
    },
  };
}

/**
 * A case that triages as `confirmable`: no red-flag concept, one disease hit and
 * no confirmation debt, so the Phase 2.6 gate actually has to judge the evidence
 * rather than refusing on the band alone.
 */
export function makeCase(overrides: Partial<CaseData> = {}): CaseData {
  return {
    status: 'in_progress',
    species: 'broiler',
    symptoms: ['birds dey eat less', 'droppings get water'],
    diseaseHits: ['coccidiosis'],
    ...overrides,
  };
}

export function treatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    productClass: 'anticoccidial',
    why: 'stops the protozoan cycle in the gut',
    askTheSeller: ['anticoccidial for coccidiosis'],
    needsVet: false,
    ...overrides,
  };
}

export function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
  const groupId = overrides.groupId ?? 'doc-a#g0';
  return ChunkSchema.parse({
    id: `${groupId}#c0`,
    groupId,
    documentId: 'doc-a',
    position: 0,
    text: 'Coccidiosis causes bloody droppings and ruffled feathers in young birds.',
    heading: 'Coccidiosis treatment',
    sectionKind: 'disease_treatment' satisfies SectionKind,
    species: ['broiler'] satisfies SourceSpecies[],
    diseases: ['coccidiosis'] satisfies Disease[],
    treatment: treatment(),
    page: 1,
    pageEnd: 1,
    tokenCount: 20,
    oversized: false,
    source: 'Source A',
    publisher: 'Publisher A',
    locator: 'p.1 §Coccidiosis treatment',
    ...overrides,
  });
}

export function makeGroup(overrides: Partial<ChunkGroup> = {}): ChunkGroup {
  return ChunkGroupSchema.parse({
    id: 'doc-a#g0',
    documentId: 'doc-a',
    heading: 'Coccidiosis treatment',
    sectionKind: 'disease_treatment' satisfies SectionKind,
    species: ['broiler'] satisfies SourceSpecies[],
    diseases: ['coccidiosis'] satisfies Disease[],
    treatment: treatment(),
    page: 1,
    pageEnd: 1,
    text: 'Coccidiosis causes bloody droppings and ruffled feathers in young birds.',
    ...overrides,
  });
}
