import { describe, expect, it } from 'vitest';
import {
  extractDocumentText,
  formatBytes,
  LibraryIngestError,
  mapCategoryToDocType,
  type IngestDocumentParams,
  type LibraryDocumentSummary,
  type LibraryStore,
} from './library-store.js';
import { createApp } from '../index.js';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('extractDocumentText', () => {
  it('reads plain-text uploads', async () => {
    const text = await extractDocumentText(encode('Coccidiosis: treat with amprolium.'), 'notes.txt');
    expect(text).toContain('amprolium');
  });

  it('rejects an empty text file rather than indexing nothing', async () => {
    await expect(extractDocumentText(encode('   \n  '), 'blank.txt')).rejects.toThrow(
      LibraryIngestError,
    );
  });

  it('rejects file types it cannot read instead of guessing', async () => {
    await expect(extractDocumentText(new Uint8Array([1, 2, 3]), 'deck.pptx', 'application/vnd.ms-powerpoint')).rejects.toThrow(
      /Unsupported file type/,
    );
  });

  it('reports an unreadable PDF instead of indexing its raw bytes', async () => {
    // "%PDF-" prefix with no valid body: parse must fail, and the bytes must
    // never reach the embedder as if they were prose.
    const brokenPdf = encode('%PDF-1.4\nnot actually a pdf');
    await expect(extractDocumentText(brokenPdf, 'broken.pdf', 'application/pdf')).rejects.toThrow(
      /Could not read text/,
    );
  });
});

describe('mapCategoryToDocType', () => {
  it('maps medication categories to a drug monograph', () => {
    expect(mapCategoryToDocType('Medications, Vaccines & Dosage')).toBe('drug_monograph');
  });

  it('maps diagnostics categories to a journal article', () => {
    expect(mapCategoryToDocType('Clinical Pathology & Diagnostics')).toBe('journal_article');
  });

  it('falls back to other for an unrecognised category', () => {
    expect(mapCategoryToDocType('Miscellaneous')).toBe('other');
  });
});

describe('formatBytes', () => {
  it('reports real byte sizes in human units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

/**
 * A stub that serves only what the test hands it. It generates no documents of
 * its own, so it can never make a fake catalogue look like real ingestion.
 */
function stubLibraryStore(initial: readonly LibraryDocumentSummary[] = []): LibraryStore {
  const rows = new Map(initial.map((d) => [d.id, d]));
  return {
    listDocuments: async () => Array.from(rows.values()),
    getDocument: async (id) => rows.get(id),
    getDocumentPreview: async (id) => (rows.has(id) ? ['first indexed chunk'] : undefined),
    getDocumentFile: async () => undefined,
    ingestDocument: async (params: IngestDocumentParams) => {
      const doc: LibraryDocumentSummary = {
        id: 'doc_stub',
        name: params.title,
        category: params.category,
        size: formatBytes(params.buffer.length),
        date: '2026-01-01T00:00:00.000Z',
        status: 'active',
        chunkCount: 1,
      };
      rows.set(doc.id, doc);
      return doc;
    },
    deleteDocument: async (id) => rows.delete(id),
  };
}

describe('library routes', () => {
  it('lists the ingested corpus', async () => {
    const app = createApp({ library: stubLibraryStore() });

    const res = await app.request('/library');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });

  it('returns real metadata and chunk counts for an ingested document', async () => {
    const app = createApp({
      library: stubLibraryStore([
        {
          id: 'doc_1',
          name: 'Newcastle Vaccination Protocol',
          category: 'Medications, Vaccines & Dosage',
          size: '412.0 KB',
          date: '2026-02-01T09:00:00.000Z',
          status: 'active',
          chunkCount: 23,
          publisher: 'Unattributed upload',
          year: 2024,
        },
      ]),
    });

    const res = await app.request('/library/doc_1');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as LibraryDocumentSummary;
    expect(doc.chunkCount).toBe(23);
    expect(doc.publisher).toBe('Unattributed upload');
    expect(doc.date).toBe('2026-02-01T09:00:00.000Z');
  });

  it('serves extracted chunk text for the preview', async () => {
    const app = createApp({
      library: stubLibraryStore([
        {
          id: 'doc_1',
          name: 'Guide',
          category: 'Biosecurity',
          size: '1 KB',
          date: '2026-02-01T09:00:00.000Z',
          status: 'active',
          chunkCount: 1,
        },
      ]),
    });

    const res = await app.request('/library/doc_1/preview');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { chunks: string[] };
    expect(body.chunks).toEqual(['first indexed chunk']);
  });

  it('404s for a document that was never ingested', async () => {
    const app = createApp({ library: stubLibraryStore() });

    const res = await app.request('/library/doc_missing');
    expect(res.status).toBe(404);
  });

  it('refuses an upload with no title instead of inventing one', async () => {
    const app = createApp({ library: stubLibraryStore() });

    const form = new FormData();
    form.append('category', 'Biosecurity');
    form.append('text', 'Footbath protocol');

    const res = await app.request('/library/upload', { method: 'POST', body: form });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/title is required/i);
  });

  it('refuses an upload with no file or text', async () => {
    const app = createApp({ library: stubLibraryStore() });

    const form = new FormData();
    form.append('title', 'Empty upload');
    form.append('category', 'Biosecurity');

    const res = await app.request('/library/upload', { method: 'POST', body: form });
    expect(res.status).toBe(400);
  });

  it('surfaces the ingest failure reason and status to the caller', async () => {
    const failing: LibraryStore = {
      ...stubLibraryStore(),
      ingestDocument: async () => {
        throw new LibraryIngestError('"scan.pdf" contains no extractable text.', 422);
      },
    };
    const app = createApp({ library: failing });

    const form = new FormData();
    form.append('title', 'Scanned protocol');
    form.append('category', 'Biosecurity');
    form.append('text', 'some text');

    const res = await app.request('/library/upload', { method: 'POST', body: form });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/no extractable text/);
  });

  it('accepts an upload and deletes it again', async () => {
    const app = createApp({ library: stubLibraryStore() });

    const form = new FormData();
    form.append('title', 'Coccidiosis Treatment Guide');
    form.append('category', 'Clinical Pathology & Diagnostics');
    form.append('text', 'Caecal coccidiosis in broilers caused by Eimeria tenella.');

    const resUpload = await app.request('/library/upload', { method: 'POST', body: form });
    expect(resUpload.status).toBe(201);
    const uploaded = (await resUpload.json()) as { ok: boolean; document: LibraryDocumentSummary };
    expect(uploaded.ok).toBe(true);
    expect(uploaded.document.name).toBe('Coccidiosis Treatment Guide');

    const listed = (await (await app.request('/library')).json()) as { total: number };
    expect(listed.total).toBe(1);

    const resDelete = await app.request(`/library/${uploaded.document.id}`, { method: 'DELETE' });
    expect(resDelete.status).toBe(200);

    const emptied = (await (await app.request('/library')).json()) as { total: number };
    expect(emptied.total).toBe(0);
  });

  it('503s when no library store is wired', async () => {
    const app = createApp({});
    const res = await app.request('/library');
    expect(res.status).toBe(503);
  });
});
