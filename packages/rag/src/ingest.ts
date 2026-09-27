import type { Citation } from '@poultry/core';
import type { Analyzer } from './analyze.js';
import { analyzeDocument, normalizeDiseases } from './analyze.js';
import { buildGroups } from './groups.js';
import { DEFAULT_CHUNKING, microChunk } from './micro-chunk.js';
import { DEFAULT_PAGE_CHARS, paginate, stampedText } from './paginate.js';
import { CHAR_HEURISTIC_COUNTER, type TokenCounter } from './tokens.js';
import { ChunkSchema, IngestedDocumentSchema, SourceDocumentSchema } from './schema.js';
import type { Chunk, ChunkGroup, IngestedDocument, SourceDocument } from './schema.js';

export interface IngestOptions {
  analyzer: Analyzer;
  count?: TokenCounter;
  pageChars?: number;
  targetTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

export function locatorFor(group: ChunkGroup): string {
  const pageRef = group.page === group.pageEnd ? String(group.page) : `${group.page}-${group.pageEnd}`;
  return `p.${pageRef} §${group.heading}`;
}

// The stored shape a Phase 5 top-k result hands to the Phase 2.6 gate, with no second lookup.
export function citationFor(chunk: Chunk): Citation {
  return { source: chunk.source, locator: chunk.locator };
}

export async function ingestDocument(
  input: SourceDocument,
  rawText: string,
  options: IngestOptions,
): Promise<IngestedDocument> {
  const document = SourceDocumentSchema.parse(input);
  const count = options.count ?? CHAR_HEURISTIC_COUNTER;
  const targetTokens = options.targetTokens ?? DEFAULT_CHUNKING.targetTokens;
  const maxTokens = options.maxTokens ?? DEFAULT_CHUNKING.maxTokens;
  const overlapTokens = options.overlapTokens ?? Math.round(targetTokens * 0.1);

  if (targetTokens <= 0 || maxTokens < targetTokens) {
    throw new IngestError(`maxTokens (${maxTokens}) must be at least targetTokens (${targetTokens})`);
  }
  if (overlapTokens < 0 || overlapTokens >= maxTokens) {
    throw new IngestError(`overlapTokens (${overlapTokens}) must be within [0, maxTokens)`);
  }

  const pages = paginate(rawText, options.pageChars ?? DEFAULT_PAGE_CHARS);
  if (pages.length === 0) {
    throw new IngestError(`document ${document.id} produced no pages from ${rawText.length} characters`);
  }

  const analysis = await analyzeDocument(
    { document, pages, text: stampedText(pages) },
    options.analyzer,
  );
  const { groups, warnings: groupWarnings } = buildGroups(
    document.id,
    normalizeDiseases(analysis.regions),
  );

  const warnings = [...analysis.warnings, ...groupWarnings];
  const chunks: Chunk[] = [];

  for (const group of groups) {
    const pieces = microChunk(group.text, { targetTokens, maxTokens, overlapTokens, count });
    if (pieces.length === 0) {
      warnings.push(`group ${group.id} (${group.heading}) produced no chunk text`);
      continue;
    }
    pieces.forEach((piece, position) => {
      if (piece.oversized) {
        warnings.push(
          `chunk ${group.id}#c${position} exceeds ${maxTokens} tokens on a single unsplittable sentence`,
        );
      }
      chunks.push(
        ChunkSchema.parse({
          id: `${group.id}#c${position}`,
          groupId: group.id,
          documentId: document.id,
          position,
          text: piece.text,
          heading: group.heading,
          sectionKind: group.sectionKind,
          species: group.species,
          diseases: group.diseases,
          treatment: group.treatment,
          page: group.page,
          pageEnd: group.pageEnd,
          tokenCount: piece.tokenCount,
          oversized: piece.oversized,
          source: document.title,
          publisher: document.publisher,
          locator: locatorFor(group),
        }),
      );
    });
  }

  return IngestedDocumentSchema.parse({
    document,
    pages,
    groups,
    chunks,
    warnings,
  });
}
