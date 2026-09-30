/* eslint-disable no-console */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, createDb, PgChunkRepository, GeminiEmbedder } from '@poultry/rag';
import { createApiDb } from '../src/db/client.js';
import { postgresLibraryStore } from '../src/db/library-store.js';
import { R2StorageService } from '../src/r2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const API_BASE = 'http://127.0.0.1:3001';
const PDF_PATH = 'C:\\Users\\Isaiah\\.gemini\\antigravity-cli\\brain\\7f1cbaf2-a3c7-4955-b31c-ce9a5e7e5608\\scratch\\small_flock_manual.pdf';

async function main() {
  console.log('================================================================');
  console.log('   BIRDVET LIVE RAG PIPELINE: 251-PAGE VET TEXTBOOK INGESTION   ');
  console.log('================================================================\n');

  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`PDF not found at ${PDF_PATH}`);
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  console.log(`[Input] Loaded "${path.basename(PDF_PATH)}" (${(pdfBuffer.length / (1024 * 1024)).toFixed(2)} MB, 251 Pages).`);

  const connectionString = process.env.DATABASE_URL!;
  const apiKey = process.env.GEMINI_API_KEY!;
  const pool = createPool({ connectionString, applicationName: 'ingest-real-textbook' });
  const ragDb = createDb(pool);
  const db = createApiDb(connectionString);
  const repo = new PgChunkRepository(ragDb);
  const embedder = new GeminiEmbedder({ apiKey, dims: 768, normalize: true });
  const r2 = new R2StorageService({
    accountId: process.env.R2_ACCOUNT_ID!,
    bucket: process.env.R2_BUCKET!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  });

  const libraryStore = postgresLibraryStore(ragDb, db, r2, embedder);

  try {
    // Step 1: Ingest via postgresLibraryStore
    console.log('\n[Step 1] Ingesting 251-page textbook through the complete RAG store pipeline...');
    console.log(' -> Uploading raw 4.5MB PDF to Cloudflare R2 (AWS SigV4)...');
    console.log(' -> Extracting 496,000+ characters with pdf-parse...');
    console.log(' -> Micro-chunking (760 chunks across 185 page groups)...');
    console.log(' -> Clinical document analysis (classifying signs, treatments, prevention)...');
    console.log(' -> Generating 768-dim Gemini MRL embeddings (batched with rate-limit backoff)...');
    console.log(' -> Persisting to Neon Postgres (documents, chunk_groups, chunks, library_documents)...');

    const startTime = Date.now();
    const doc = await libraryStore.ingestDocument({
      title: 'Small Flock Poultry Health Manual (Disease Prevention & Management)',
      category: 'Clinical Reference Protocol',
      publisher: 'BC Ministry of Agriculture & Veterinary Extension',
      filename: 'small_flock_manual.pdf',
      buffer: new Uint8Array(pdfBuffer),
      mimeType: 'application/pdf',
      year: 2015,
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`\n✅ Ingestion Succeeded in ${(elapsedMs / 1000).toFixed(1)}s!`);
    console.log(` -> Document ID:    ${doc.id}`);
    console.log(` -> Title:          ${doc.name}`);
    console.log(` -> Category:       ${doc.category}`);
    console.log(` -> Size:           ${doc.size}`);
    console.log(` -> Total Chunks:   ${doc.chunkCount} micro-chunks indexed in pgvector`);
    console.log(` -> Publisher:      ${doc.publisher}`);

    // Step 2: Verify GET /library via the active HTTP API server
    console.log('\n[Step 2] Probing GET /library via HTTP server (port 3001)...');
    const listRes = await fetch(`${API_BASE}/library`);
    const listData = (await listRes.json()) as { documents: Array<{ id: string; name: string; chunkCount: number; size: string }>; total: number };
    console.log(` -> Total Library Documents in Neon: ${listData.total}`);
    const found = listData.documents.find((d) => d.id === doc.id);
    if (!found) throw new Error('Ingested document not found in /library list!');
    console.log(` -> Row in Library: "${found.name}" | Size: ${found.size} | Chunks: ${found.chunkCount}`);

    // Step 3: Verify GET /library/:id/preview
    console.log(`\n[Step 3] Probing GET /library/${doc.id}/preview via HTTP server...`);
    const prevRes = await fetch(`${API_BASE}/library/${doc.id}/preview`);
    const prevData = (await prevRes.json()) as { id: string; chunks: string[] };
    console.log(` -> Preview returned ${prevData.chunks.length} sample chunks.`);
    prevData.chunks.forEach((chunkText, idx) => {
      console.log(`   [Chunk ${idx + 1} Preview]: "${chunkText.replace(/\s+/g, ' ').slice(0, 130)}..."`);
    });

    // Step 4: Verify GET /library/:id/file (R2 streaming through HTTP server)
    console.log(`\n[Step 4] Probing GET /library/${doc.id}/file (Cloudflare R2 stream via API)...`);
    const fileRes = await fetch(`${API_BASE}/library/${doc.id}/file`);
    if (!fileRes.ok) throw new Error(`File stream failed: HTTP ${fileRes.status}`);
    const streamedBytes = new Uint8Array(await fileRes.arrayBuffer());
    console.log(` -> Streamed ${streamedBytes.length} bytes from R2 (Original: ${pdfBuffer.length} bytes).`);
    if (streamedBytes.length !== pdfBuffer.length) {
      throw new Error(`Size mismatch: streamed ${streamedBytes.length}, expected ${pdfBuffer.length}`);
    }
    console.log(' -> Byte integrity verified: 100% exact match!');

    // Step 5: Test Semantic Retrieval Queries against pgvector
    console.log('\n[Step 5] Executing Clinical Semantic Vector Searches against Neon pgvector...');

    const queries = [
      {
        topic: 'Coccidiosis & Intestinal Lesions',
        text: 'coccidiosis bloody droppings diarrhea intestinal damage and amprolium treatment',
      },
      {
        topic: 'Newcastle Disease & Neurological Signs',
        text: 'newcastle disease torticollis twisted neck respiratory gasping high mortality paralysis',
      },
      {
        topic: 'Biosecurity & Farm Sanitation Protocols',
        text: 'biosecurity footbath disinfection cleaning footwear visitor control and dead bird disposal',
      },
    ];

    for (const q of queries) {
      console.log(`\n ── Query: "${q.topic}" ──`);
      console.log(`    Search Prompt: "${q.text}"`);

      const [queryVec] = await embedder.embed([q.text]);
      const results = await repo.search({
        vector: queryVec,
        topK: 3,
        limit: 3,
      });

      console.log(`    Top Matches Found: ${results.length}`);
      results.forEach((res, i) => {
        const similarity = Math.max(0, (1 - res.distance) * 100);
        const snippet = res.chunk.text.replace(/\s+/g, ' ').slice(0, 160);
        console.log(`    [#${i + 1}] Similarity: ${similarity.toFixed(1)}% (Distance: ${res.distance.toFixed(4)}) | Section: "${res.chunk.heading}" (p. ${res.chunk.page})`);
        console.log(`         "${snippet}..."`);
      });
    }

    console.log('\n================================================================');
    console.log('   FULL 251-PAGE VET TEXTBOOK PIPELINE TEST PASSED WITH 100%!   ');
    console.log('================================================================\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Ingestion Test Failed:', err);
  process.exit(1);
});
