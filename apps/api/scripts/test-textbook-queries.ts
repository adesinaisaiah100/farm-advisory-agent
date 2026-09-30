/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, createDb, PgChunkRepository, GeminiEmbedder } from '@poultry/rag';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const connectionString = process.env.DATABASE_URL!;
  const apiKey = process.env.GEMINI_API_KEY!;
  const pool = createPool({ connectionString, applicationName: 'test-textbook-queries' });
  const ragDb = createDb(pool);
  const repo = new PgChunkRepository(ragDb);
  const embedder = new GeminiEmbedder({ apiKey, dims: 768, normalize: true });

  console.log('--- Clinical Semantic Retrieval Queries against pgvector ---');

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

  try {
    for (const q of queries) {
      console.log(`\n================================================================`);
      console.log(`🔍 Topic: ${q.topic}`);
      console.log(`   Prompt: "${q.text}"`);

      const [queryVec] = await embedder.embed([q.text]);
      const results = await repo.search({
        vector: queryVec,
        topK: 3,
        limit: 3,
      });

      console.log(`   Found: ${results.length} relevant chunks`);
      results.forEach((res, i) => {
        const similarity = Math.max(0, (1 - res.distance) * 100);
        const snippet = res.chunk.text.replace(/\s+/g, ' ').slice(0, 180);
        console.log(`   [#${i + 1}] Similarity: ${similarity.toFixed(1)}% (Distance: ${res.distance.toFixed(4)}) | Section: "${res.chunk.heading}" (p. ${res.chunk.page})`);
        console.log(`       "${snippet}..."`);
      });
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Retrieval error:', err);
  process.exit(1);
});
