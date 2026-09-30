import { eq, sql } from 'drizzle-orm';
import {
  chunks,
  documents,
  GeminiEmbedder,
  ingestDocument as ragIngestDocument,
  PgChunkRepository,
  type DocType,
  type RagDatabase,
  type SourceDocument,
} from '@poultry/rag';
import type { ApiDatabase } from './client.js';
import { libraryDocuments } from './schema.js';
import { ClinicalDocumentAnalyzer } from './clinical-analyzer.js';
import type { R2StorageService } from '../r2.js';

/** Gemini's embedContent caps a single request well below a full book. */
const EMBED_BATCH_SIZE = 32;

export class LibraryIngestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 422 | 500 = 422,
  ) {
    super(message);
    this.name = 'LibraryIngestError';
  }
}

export interface LibraryDocumentSummary {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly size: string;
  /** ISO-8601 upload timestamp. Formatting is the caller's job. */
  readonly date: string;
  readonly url?: string;
  readonly status: 'active' | 'processing';
  readonly chunkCount: number;
  readonly publisher?: string;
  readonly year?: number;
}

export interface IngestDocumentParams {
  readonly title: string;
  readonly category: string;
  readonly buffer: Uint8Array;
  readonly filename: string;
  readonly mimeType?: string;
  readonly publisher?: string;
  readonly year?: number;
}

export interface LibraryStore {
  listDocuments(): Promise<readonly LibraryDocumentSummary[]>;
  getDocument(id: string): Promise<LibraryDocumentSummary | undefined>;
  getDocumentPreview(id: string, limit?: number): Promise<readonly string[] | undefined>;
  getDocumentFile(
    id: string,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string; mimeType: string } | undefined>;
  ingestDocument(params: IngestDocumentParams): Promise<LibraryDocumentSummary>;
  deleteDocument(id: string): Promise<boolean>;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mapCategoryToDocType(category: string): DocType {
  const c = category.toLowerCase();
  if (c.includes('drug') || c.includes('medic') || c.includes('vaccine') || c.includes('dosage')) {
    return 'drug_monograph';
  }
  if (c.includes('diagnos') || c.includes('patholog') || c.includes('lab')) return 'journal_article';
  if (c.includes('regulat') || c.includes('legislat') || c.includes('standard')) return 'regulation';
  if (c.includes('protocol') || c.includes('biosecur') || c.includes('sanitation') || c.includes('guideline')) {
    return 'guideline';
  }
  return 'other';
}

const PDF_MIME = 'application/pdf';

/**
 * Turns an uploaded file into plain text, or throws. Nothing here may invent
 * content: a PDF we cannot parse is an error the uploader must see, not a
 * buffer to be embedded as if it were prose.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  filename: string,
  mimeType?: string,
): Promise<string> {
  const lower = filename.toLowerCase();

  if (mimeType === PDF_MIME || lower.endsWith('.pdf')) {
    let raw: string;
    try {
      const { PDFParse } = await import('pdf-parse');
      // v2: the constructor loads the document. `load()` is private and `getText()`
      // resolves to a TextResult, whose text lives on `.text`.
      const parser = new PDFParse({ data: bytes });
      try {
        raw = (await parser.getText()).text;
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (err) {
      throw new LibraryIngestError(
        `Could not read text from "${filename}". The PDF may be scanned images rather than text. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      );
    }

    if (!raw.trim()) {
      throw new LibraryIngestError(
        `"${filename}" contains no extractable text. Scanned PDFs need OCR before upload.`,
      );
    }
    return raw;
  }

  if (lower.endsWith('.txt') || mimeType === 'text/plain') {
    const raw = new TextDecoder('utf-8').decode(bytes);
    if (!raw.trim()) {
      throw new LibraryIngestError(`"${filename}" is empty.`);
    }
    return raw;
  }

  throw new LibraryIngestError(
    `Unsupported file type for "${filename}". Upload a PDF or a plain-text file.`,
  );
}

export function postgresLibraryStore(
  ragDb: RagDatabase,
  db: ApiDatabase,
  r2: R2StorageService,
  embedder: GeminiEmbedder,
): LibraryStore {
  const repo = new PgChunkRepository(ragDb);
  const analyzer = new ClinicalDocumentAnalyzer();

  async function buildSummary(row: {
    documentId: string;
    title: string;
    publisher: string;
    year: number | null;
    category: string | null;
    sizeBytes: number | null;
    uploadedAt: Date | null;
    r2Key: string | null;
    chunkCount: number;
  }): Promise<LibraryDocumentSummary> {
    // The bucket endpoint needs credentials, so it is never a browser link.
    // Only expose a URL when the bucket is genuinely published.
    const url = row.r2Key ? r2.publicUrlFor(row.r2Key) : undefined;
    return {
      id: row.documentId,
      name: row.title,
      category: row.category ?? 'Uncategorised',
      size: formatBytes(row.sizeBytes ?? 0),
      date: (row.uploadedAt ?? new Date(0)).toISOString(),
      ...(url ? { url } : {}),
      status: 'active',
      chunkCount: row.chunkCount,
      publisher: row.publisher,
      ...(row.year != null ? { year: row.year } : {}),
    };
  }

  /** Only documents that actually completed ingestion appear in the library. */
  const selectRows = db
    .select({
      documentId: documents.id,
      title: documents.title,
      publisher: documents.publisher,
      year: documents.year,
      category: libraryDocuments.category,
      sizeBytes: libraryDocuments.sizeBytes,
      uploadedAt: libraryDocuments.uploadedAt,
      r2Key: libraryDocuments.r2Key,
      chunkCount: sql<number>`(
        select count(*)::int from ${chunks} where ${chunks.documentId} = ${documents.id}
      )`,
    })
    .from(documents)
    .leftJoin(libraryDocuments, eq(libraryDocuments.documentId, documents.id));

  async function embedBatched(texts: readonly string[]): Promise<(readonly number[])[]> {
    const out: (readonly number[])[] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      out.push(...(await embedder.embed(batch)));
    }
    return out;
  }

  return {
    async listDocuments(): Promise<readonly LibraryDocumentSummary[]> {
      const rows = await selectRows.orderBy(sql`${libraryDocuments.uploadedAt} desc nulls last`);
      return Promise.all(rows.map(buildSummary));
    },

    async getDocument(id: string): Promise<LibraryDocumentSummary | undefined> {
      const rows = await selectRows.where(eq(documents.id, id));
      const row = rows[0];
      return row ? buildSummary(row) : undefined;
    },

    /** Real extracted text, so a clinician (or a test) can prove what was indexed. */
    async getDocumentPreview(id: string, limit = 3): Promise<readonly string[] | undefined> {
      const exists = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);
      if (exists.length === 0) return undefined;

      const rows = await ragDb
        .select({ text: chunks.text })
        .from(chunks)
        .where(eq(chunks.documentId, id))
        .limit(limit);
      return rows.map((r) => r.text);
    },

    /** Streams the original upload back, so the UI needs no public bucket. */
    async getDocumentFile(
      id: string,
    ): Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string; mimeType: string } | undefined> {
      const rows = await db
        .select({
          r2Key: libraryDocuments.r2Key,
          filename: libraryDocuments.filename,
          mimeType: libraryDocuments.mimeType,
        })
        .from(libraryDocuments)
        .where(eq(libraryDocuments.documentId, id))
        .limit(1);
      const row = rows[0];
      if (!row?.r2Key) return undefined;

      return {
        bytes: await r2.getFile(row.r2Key),
        filename: row.filename,
        mimeType: row.mimeType,
      };
    },

    async ingestDocument(params: IngestDocumentParams): Promise<LibraryDocumentSummary> {
      const title = params.title?.trim();
      const category = params.category?.trim();
      if (!title) throw new LibraryIngestError('A document title is required.', 400);
      if (!category) throw new LibraryIngestError('A category is required.', 400);
      if (params.buffer.length === 0) {
        throw new LibraryIngestError(`"${params.filename}" is empty.`, 400);
      }

      // 1. Extract. Throws rather than fabricating text.
      const rawText = await extractDocumentText(params.buffer, params.filename, params.mimeType);

      const docId = `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const filename = params.filename.trim() || 'document.pdf';
      const r2Key = `library/${docId}/${filename}`;

      // 2. Store the original first. If this fails we abort before touching
      //    Neon, so a failed upload never leaves a half-ingested document.
      await r2.uploadFile(r2Key, params.buffer, params.mimeType || PDF_MIME);

      // 3. Chunk and embed. An unattributed upload says so; it does not borrow
      //    the name of a real authority, and an unknown year stays unknown.
      const sourceDoc: SourceDocument = {
        id: docId,
        title,
        publisher: params.publisher?.trim() || 'Unattributed upload',
        docType: mapCategoryToDocType(category),
        ...(params.year ? { year: params.year } : {}),
      };

      try {
        const ingested = await ragIngestDocument(sourceDoc, rawText, {
          analyzer,
          pageChars: 1500,
          targetTokens: 120,
          maxTokens: 250,
        });

        const embeddings = await embedBatched(ingested.chunks.map((c) => c.text));

        await repo.replaceDocument({
          document: sourceDoc,
          groups: ingested.groups,
          chunks: ingested.chunks.map((chunk, idx) => {
            const embedding = embeddings[idx];
            if (!embedding) {
              throw new LibraryIngestError(
                `Embedding provider returned ${embeddings.length} vectors for ${ingested.chunks.length} chunks.`,
              );
            }
            return { chunk, embedding };
          }),
        });

        // 4. Record upload metadata for the dashboard.
        await db.insert(libraryDocuments).values({
          documentId: docId,
          category,
          filename,
          mimeType: params.mimeType || PDF_MIME,
          sizeBytes: params.buffer.length,
          r2Key,
        });
      } catch (err) {
        // Don't orphan the file we just uploaded.
        await r2.deleteFile(r2Key).catch(() => {});
        throw err instanceof LibraryIngestError
          ? err
          : new LibraryIngestError(
              `Ingestion failed for "${title}": ${err instanceof Error ? err.message : String(err)}`,
            );
      }

      const summary = await this.getDocument(docId);
      if (!summary) throw new LibraryIngestError('Document was not persisted.');
      return summary;
    },

    async deleteDocument(id: string): Promise<boolean> {
      const rows = await db
        .select({ r2Key: libraryDocuments.r2Key })
        .from(libraryDocuments)
        .where(eq(libraryDocuments.documentId, id))
        .limit(1);
      const key = rows[0]?.r2Key;

      // library_documents cascades from documents, so this clears metadata,
      // chunk groups and chunks together.
      await repo.deleteDocuments([id]);
      // Only delete the exact key we stored, not a guessed prefix.
      if (key) await r2.deleteFile(key);
      return true;
    },
  };
}
