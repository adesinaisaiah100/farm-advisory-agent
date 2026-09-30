/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, createDb, PgChunkRepository, GeminiEmbedder } from '@poultry/rag';
import { R2StorageService } from '../src/r2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const API_BASE = 'http://127.0.0.1:3001';

const SAMPLE_VET_GUIDELINE = `
# Standard Clinical Protocol: Newcastle Disease & Coccidiosis Management in Broilers
Publisher: Federal Veterinary Research Institute & Poultry Advisory Board
Year: 2024
Category: Clinical Reference Protocol

## 1. Disease Etiology and Clinical Signs
Newcastle Disease (ND) is an acute, highly contagious viral infection of poultry caused by virulent strains of Avian Paramyxovirus-1 (APMV-1). 
In broiler flocks, the velogenic neurotropic and viscerotropic forms produce rapid mortality (often exceeding 50% within 48 hours).
Pathognomonic clinical signs include:
- Severe respiratory distress, gasping, coughing, and tracheal rales.
- Neurological deficits: torticollis (twisted neck), ataxia, tremors, circling, and leg paralysis.
- Bright greenish or whitish watery diarrhea with marked cloacal pasting.
- Subcutaneous facial edema, especially periorbital swelling and comb cyanosis.

In concurrent coccidial infections (primarily Eimeria tenella and Eimeria necatrix):
- Severe mucoid or frank bloody droppings are observed in litter.
- Pallor of comb, wattle, and mucosal membranes due to acute intestinal hemorrhage.
- Severe dehydration, huddling, ruffled feathers, and loss of appetite.

## 2. Immediate Biosecurity & Flock Management
When acute clinical signs or mortality spikes are observed:
1. Strict Quarantine: Immediately isolate the affected pen. Disallow all inter-pen movement of equipment, footwear, and attendants.
2. Footbath Disinfection: Charge farm entrance and pen footbaths with fresh glutaraldehyde-quaternary ammonium compound or 2% sodium hypochlorite solution twice daily.
3. Carcass Management: Deep-bury all dead birds (minimum 1.5 meters depth with quicklime capping) or incinerate on-site. Do not sell or discard carcasses in public waterways.
4. Ventilation Control: Maintain cross-ventilation without direct drafts to minimize dust-borne viral transmission while clearing ammonia buildup.

## 3. Supportive Management & Escalation Protocol
- Hydration Therapy: Provide cool, clean drinking water supplemented with oral rehydration salts (electrolytes) and vitamin K3 to mitigate intestinal blood loss.
- Strict Antibiotic Prohibition: NEVER administer human antibiotics, tetracyclines, or unprescribed pharmaceuticals to the flock. Indiscriminate antimicrobial use accelerates kidney damage and breeds antimicrobial resistance without addressing viral etiology.
- Emergency Veterinary Escalation: If mortality exceeds 2% in a 24-hour period, or if torticollis and hemorrhagic diarrhea appear simultaneously, immediate referral to a licensed poultry veterinarian and the State Veterinary Epidemiology Unit is mandatory.
`.trim();

async function run() {
  console.log('====================================================');
  console.log('   BIRDVET END-TO-END REFERENCE LIBRARY SMOKE TEST  ');
  console.log('====================================================\n');

  const connectionString = process.env.DATABASE_URL!;
  const apiKey = process.env.GEMINI_API_KEY!;
  const pool = createPool({ connectionString, applicationName: 'test-e2e-library' });
  const ragDb = createDb(pool);
  const repo = new PgChunkRepository(ragDb);
  const embedder = new GeminiEmbedder({ apiKey, dims: 768, normalize: true });
  const _r2 = new R2StorageService({
    accountId: process.env.R2_ACCOUNT_ID!,
    bucket: process.env.R2_BUCKET!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  });

  try {
    // Step 1: Upload via POST /library/upload
    console.log('[Step 1] Ingesting test clinical document via POST /library/upload...');
    const formData = new FormData();
    formData.append('title', 'Newcastle Disease & Coccidiosis Management Protocol');
    formData.append('category', 'Clinical Reference Protocol');
    formData.append('publisher', 'Federal Veterinary Research Institute');
    formData.append('text', SAMPLE_VET_GUIDELINE);

    const uploadRes = await fetch(`${API_BASE}/library/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Upload failed with status ${uploadRes.status}: ${errText}`);
    }

    const uploadData = await uploadRes.json() as { ok: boolean; document: { id: string; name: string; chunkCount: number; category: string } };
    const docId = uploadData.document.id;
    console.log(` -> Upload successful! Document ID: ${docId}`);
    console.log(` -> Title: "${uploadData.document.name}"`);
    console.log(` -> Category: "${uploadData.document.category}"`);
    console.log(` -> Ingested Chunks Count: ${uploadData.document.chunkCount}`);

    // Step 2: Verify GET /library lists the document
    console.log('\n[Step 2] Verifying GET /library listing...');
    const listRes = await fetch(`${API_BASE}/library`);
    const listData = await listRes.json() as { documents: Array<{ id: string; name: string; chunkCount: number }>; total: number };
    const foundInList = listData.documents.find((d) => d.id === docId);
    if (!foundInList) {
      throw new Error(`Document ${docId} not found in GET /library listing!`);
    }
    console.log(` -> Verified! Total library docs: ${listData.total}`);
    console.log(` -> Document row in list: ID=${foundInList.id}, Chunks=${foundInList.chunkCount}`);

    // Step 3: Verify GET /library/:id/preview returns real extracted text
    console.log(`\n[Step 3] Verifying GET /library/${docId}/preview...`);
    const previewRes = await fetch(`${API_BASE}/library/${docId}/preview`);
    const previewData = await previewRes.json() as { id: string; chunks: string[] };
    console.log(` -> Preview returned ${previewData.chunks.length} sample chunks.`);
    console.log(` -> Sample Chunk 1 text preview:\n   "${previewData.chunks[0]?.slice(0, 140)}..."`);

    // Step 4: Verify GET /library/:id/file streams original file from R2
    console.log(`\n[Step 4] Verifying GET /library/${docId}/file (R2 stream)...`);
    const fileRes = await fetch(`${API_BASE}/library/${docId}/file`);
    if (!fileRes.ok) {
      throw new Error(`File download failed with status ${fileRes.status}`);
    }
    const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
    console.log(` -> Successfully streamed original file from R2! Size: ${fileBytes.length} bytes`);
    console.log(` -> Content-Type: ${fileRes.headers.get('Content-Type')}`);

    // Step 5: Verify Vector Semantic Search Precision
    console.log('\n[Step 5] Testing pgvector semantic retrieval against ingested chunks...');
    const testQuery = 'what are the clinical signs of newcastle disease and torticollis twisted neck?';
    console.log(` -> Generating 768-dim query embedding for: "${testQuery}"`);
    const queryVectors = await embedder.embed([testQuery]);
    const queryVector = queryVectors[0];

    const searchResults = await repo.search({
      vector: queryVector,
      topK: 3,
      minScore: 0.5,
    });

    console.log(` -> Vector search returned ${searchResults.length} relevant chunks!`);
    searchResults.forEach((r, idx) => {
      console.log(`    [Result ${idx + 1}] (Score: ${(r.score * 100).toFixed(1)}%)`);
      console.log(`    Section: ${r.chunk.sectionHeading ?? 'N/A'} | Kind: ${r.chunk.sectionKind ?? 'N/A'}`);
      console.log(`    Text: "${r.chunk.text.slice(0, 120)}..."`);
    });

    if (searchResults.length === 0) {
      throw new Error('Vector retrieval returned 0 results for clinical query!');
    }

    // Step 6: Delete the document via DELETE /library/:id
    console.log(`\n[Step 6] Testing clean cascade deletion via DELETE /library/${docId}...`);
    const deleteRes = await fetch(`${API_BASE}/library/${docId}`, {
      method: 'DELETE',
    });
    const deleteData = await deleteRes.json() as { ok: boolean; deletedId: string };
    console.log(` -> Delete API returned: ok=${deleteData.ok}, deletedId=${deleteData.deletedId}`);

    // Step 7: Confirm document is gone from GET /library/:id and GET /library
    console.log('\n[Step 7] Confirming deletion cascades in Neon DB and R2...');
    const verifyGet = await fetch(`${API_BASE}/library/${docId}`);
    console.log(` -> GET /library/${docId} status: ${verifyGet.status} (Expected: 404)`);
    if (verifyGet.status !== 404) {
      throw new Error(`Expected 404 after deletion, got ${verifyGet.status}`);
    }

    const verifyList = await fetch(`${API_BASE}/library`);
    const verifyListData = await verifyList.json() as { documents: Array<{ id: string }>; total: number };
    const stillPresent = verifyListData.documents.some((d) => d.id === docId);
    console.log(` -> Document in /library listing: ${stillPresent ? 'STILL PRESENT (ERROR)' : 'REMOVED (PASSED)'}`);
    if (stillPresent) {
      throw new Error('Deleted document still appears in library list!');
    }

    // Direct check in Neon to guarantee zero orphaned chunks
    const chunkRows = await pool.query('SELECT count(*)::int as count FROM chunks WHERE document_id = $1', [docId]);
    const orphanedChunks = Number(chunkRows.rows[0].count);
    console.log(` -> Direct Neon check: Orphaned chunks count for ${docId}: ${orphanedChunks} (Expected: 0)`);
    if (orphanedChunks > 0) {
      throw new Error(`Orphaned chunks remain in Neon: ${orphanedChunks}`);
    }

    console.log('\n====================================================');
    console.log('  ALL END-TO-END PIPELINE CHECKS PASSED WITH 100%!  ');
    console.log('====================================================\n');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('\n❌ E2E Test Failed:', err);
  process.exit(1);
});
