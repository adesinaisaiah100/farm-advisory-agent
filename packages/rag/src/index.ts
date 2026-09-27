export * from './schema.js';
export * from './tokens.js';
export * from './sentences.js';
export * from './micro-chunk.js';
export * from './paginate.js';
export * from './analyze.js';
export * from './groups.js';
export * from './ingest.js';
export * from './embed/embedder.js';
export * from './embed/gemini.js';
export * from './search/store.js';
export * from './search/plan.js';
export * from './search/select.js';
export * from './search/retrieve.js';
export * from './db/schema.js';
export * from './db/client.js';
export * from './db/pg-store.js';
export * from './readiness.js';

import type { Chunk } from './schema.js';

export function overlapsChunk(chunk: Chunk, query: string): boolean {
  return chunk.text.toLowerCase().includes(query.toLowerCase());
}
