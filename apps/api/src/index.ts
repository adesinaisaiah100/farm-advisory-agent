import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import type { ChatResponse } from '@poultry/schemas';
import { ChatResponseSchema } from '@poultry/schemas';
import { getStores, searchByLga } from '@poultry/stores';
import { handleChat, RequestError } from './turn.js';
import type { RequestStatus, TurnServiceDeps } from './turn.js';
import type { DashboardStore } from './db/dashboard-store.js';
import { LibraryIngestError, type LibraryStore } from './db/library-store.js';

export interface ApiDeps {
  readonly chat?: TurnServiceDeps;
  readonly ready?: () => Promise<ReadyReport>;
  readonly dashboard?: DashboardStore;
  readonly library?: LibraryStore;
}

export interface ReadyReport {
  readonly ok: boolean;
  readonly checks: Readonly<Record<string, { ok: boolean; detail?: string }>>;
}

export function createApp(deps: ApiDeps = {}) {
  const app = new Hono();

  app.use('*', cors());

  app.get('/health', (c) => c.json({ status: 'ok', service: 'poultry-api' }));

  /**
   * `/ready` answers 503 when a dependency is down. A liveness probe that only
   * proves the process started would let a Worker with no database take traffic,
   * which is the failure AGENTS.md §4 exists to prevent.
   */
  app.get('/ready', async (c) => {
    if (deps.ready === undefined) {
      return c.json({ status: 'not_configured' }, 503);
    }
    const report = await deps.ready();
    return c.json(report, report.ok ? 200 : 503);
  });

  /**
   * The turn. Not streaming yet: Phase 8 wants `streamText` for the dashboard and
   * `generateText` for WhatsApp, and streaming a farmer's turn before the
   * transport shapes exist would mean two ways to say the same thing. This route
   * is the one the bridge calls, and it is a complete request-to-reply path
   * today, so the wiring is testable before the streaming decision is made.
   */
  app.post('/chat', async (c) => {
    if (deps.chat === undefined) {
      return c.json(error('not_configured', 'no turn service configured'), 503);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(error('invalid_json', 'request body is not valid JSON'), 400);
    }

    try {
      const outcome = await handleChat(body, deps.chat);
      const response: ChatResponse = {
        sessionId: outcome.sessionId,
        reply: outcome.result.reply,
        door: outcome.result.door,
        caseStatus: outcome.result.state.case.status,
        replyLanguage: outcome.result.replyLanguage,
        changed: [...outcome.result.changed],
        missing: [...outcome.result.state.missing],
        fellBack: outcome.fellBack,
      };
      return c.json(
        ChatResponseSchema.parse(response),
        200,
        outcome.fellBack ? { 'x-poultry-fallback': '1' } : undefined,
      );
    } catch (cause) {
      if (cause instanceof RequestError) {
        return jsonError(c, cause.status, cause.code, cause.message);
      }
      throw cause;
    }
  });

  // ─── Phase 9 – Read endpoints ──────────────────────────────────────────────

  /**
   * GET /cases
   *
   * Returns a paginated list of clinical consultation sessions.
   * All filtering is done server-side; the dashboard never receives raw session
   * state with embedded phone numbers in a list context.
   *
   * Query params:
   *   status   – e.g. "in_progress", "complete", "escalated"
   *   state    – Nigerian state name, e.g. "Oyo"
   *   lga      – LGA name, e.g. "Ibadan North"
   *   species  – e.g. "broiler", "layer"
   *   limit    – max rows per page (1–100, default 50)
   *   offset   – zero-based row offset (default 0)
   */
  app.get('/cases', async (c) => {
    if (deps.dashboard === undefined) {
      return c.json(error('not_configured', 'no dashboard store configured'), 503);
    }
    const q = c.req.query();
    const result = await deps.dashboard.listCases({
      status: q['status'],
      state: q['state'],
      lga: q['lga'],
      species: q['species'],
      limit: q['limit'] !== undefined ? parseInt(q['limit'], 10) : undefined,
      offset: q['offset'] !== undefined ? parseInt(q['offset'], 10) : undefined,
    });
    return c.json(result, 200);
  });

  /**
   * GET /cases/:id
   *
   * Returns a full case detail record by session ID or case ID.
   * Includes the conversation history, clinical case data, and the associated
   * farmer profile (from the `farmers` table) for the dashboard drawer view.
   */
  app.get('/cases/:id', async (c) => {
    if (deps.dashboard === undefined) {
      return c.json(error('not_configured', 'no dashboard store configured'), 503);
    }
    const id = c.req.param('id');
    const detail = await deps.dashboard.getCase(id);
    if (detail === undefined) {
      return c.json(error('not_found', `case ${id} not found`), 404);
    }
    return c.json(detail, 200);
  });

  /**
   * GET /reports
   *
   * Returns anonymised surveillance signals — case data with farmer phone
   * stripped. Used by the epidemiology feed and the heatmap.
   *
   * Query params:
   *   state    – Nigerian state
   *   lga      – LGA
   *   disease  – disease code e.g. "coccidiosis", "newcastle"
   *   limit    – default 50, max 100
   *   offset   – default 0
   */
  app.get('/reports', async (c) => {
    if (deps.dashboard === undefined) {
      return c.json(error('not_configured', 'no dashboard store configured'), 503);
    }
    const q = c.req.query();
    const result = await deps.dashboard.listReports({
      state: q['state'],
      lga: q['lga'],
      disease: q['disease'],
      limit: q['limit'] !== undefined ? parseInt(q['limit'], 10) : undefined,
      offset: q['offset'] !== undefined ? parseInt(q['offset'], 10) : undefined,
    });
    return c.json(result, 200);
  });

  /**
   * GET /stores
   *
   * Returns the agro-vet partner directory from the static @poultry/stores
   * seed. Optionally filters by LGA and/or state for the referral map.
   *
   * Query params:
   *   lga    – LGA name (exact match, case-insensitive)
   *   state  – Nigerian state (exact match, case-insensitive)
   */
  app.get('/stores', (c) => {
    const q = c.req.query();
    const lga = q['lga'];
    const state = q['state'];

    const stores = lga !== undefined && lga.trim().length > 0
      ? searchByLga(lga, state)
      : getStores();

    return c.json({ stores, total: stores.length }, 200);
  });

  // ─── Veterinary Library Endpoints (RAG Corpus & Documents) ───────────────

  /**
   * GET /library
   * Returns all persisted reference guidelines, chunk counts, and categories.
   */
  app.get('/library', async (c) => {
    if (deps.library === undefined) {
      return c.json(error('not_configured', 'no library store configured'), 503);
    }
    const documents = await deps.library.listDocuments();
    return c.json({ documents, total: documents.length }, 200);
  });

  /**
   * GET /library/:id
   * Returns specific document metadata and chunk stats.
   */
  app.get('/library/:id', async (c) => {
    if (deps.library === undefined) {
      return c.json(error('not_configured', 'no library store configured'), 503);
    }
    const id = c.req.param('id');
    const doc = await deps.library.getDocument(id);
    if (!doc) {
      return c.json(error('not_found', `document ${id} not found`), 404);
    }
    return c.json(doc, 200);
  });

  /**
   * GET /library/:id/preview
   * Real extracted text from the first indexed chunks. This is the honest
   * answer to "did the pipeline actually read my document?".
   */
  app.get('/library/:id/preview', async (c) => {
    if (deps.library === undefined) {
      return c.json(error('not_configured', 'no library store configured'), 503);
    }
    const id = c.req.param('id');
    const preview = await deps.library.getDocumentPreview(id);
    if (!preview) {
      return c.json(error('not_found', `document ${id} not found`), 404);
    }
    return c.json({ id, chunks: preview }, 200);
  });

  /**
   * GET /library/:id/file
   * Streams the original upload from R2 through the API, so the browser never
   * needs a public bucket URL.
   */
  app.get('/library/:id/file', async (c) => {
    if (deps.library === undefined) {
      return c.json(error('not_configured', 'no library store configured'), 503);
    }
    const id = c.req.param('id');
    const file = await deps.library.getDocumentFile(id);
    if (!file) {
      return c.json(error('not_found', `document ${id} not found`), 404);
    }
    return c.body(file.bytes, 200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename.replace(/"/g, '')}"`,
      'Content-Length': String(file.bytes.length),
    });
  });

  /**
   * POST /library/upload
   * Accepts a PDF or plain-text file, stores it in Cloudflare R2, paginates and
   * micro-chunks the text, generates Gemini embeddings, and persists to Neon
   * pgvector. A file that cannot be read or indexed is rejected with a reason;
   * nothing is persisted on failure.
   */
  app.post('/library/upload', async (c) => {
    if (deps.library === undefined) {
      return c.json(error('not_configured', 'no library store configured'), 503);
    }
    try {
      const body = await c.req.parseBody();
      const title = String(body['title'] ?? '').trim();
      const category = String(body['category'] ?? '').trim();
      const publisher = String(body['publisher'] ?? '').trim() || undefined;
      const file = body['file'];

      if (!title) {
        return c.json(error('invalid_request', 'A document title is required.'), 400);
      }
      if (!category) {
        return c.json(error('invalid_request', 'A category is required.'), 400);
      }

      let bytes: Uint8Array;
      let filename: string;
      let mimeType: string;

      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const uploaded = file as File;
        bytes = new Uint8Array(await uploaded.arrayBuffer());
        filename = uploaded.name;
        mimeType = uploaded.type || (filename.toLowerCase().endsWith('.txt') ? 'text/plain' : 'application/pdf');
      } else if (typeof body['text'] === 'string' && body['text'].trim().length > 0) {
        bytes = new TextEncoder().encode(body['text']);
        filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80)}.txt`;
        mimeType = 'text/plain';
      } else {
        return c.json(error('invalid_request', 'A PDF or text file is required.'), 400);
      }

      const doc = await deps.library.ingestDocument({
        title,
        category,
        buffer: bytes,
        filename,
        mimeType,
        ...(publisher ? { publisher } : {}),
      });

      return c.json({ ok: true, document: doc }, 201);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[library-upload-error]', err);
      if (err instanceof LibraryIngestError) {
        return c.json(error('upload_failed', err.message), err.status);
      }
      return c.json(
        error('upload_failed', err instanceof Error ? err.message : 'failed to ingest document'),
        500,
      );
    }
  });

  /**
   * DELETE /library/:id
   * Cascades delete from Neon Postgres pgvector (documents, chunk_groups, chunks) and R2.
   */
  app.delete('/library/:id', async (c) => {
    if (deps.library === undefined) {
      return c.json(error('not_configured', 'no library store configured'), 503);
    }
    const id = c.req.param('id');
    const deleted = await deps.library.deleteDocument(id);
    return c.json({ ok: deleted, deletedId: id }, 200);
  });

  return app;
}

function error(code: string, message: string) {
  return { error: { code, message } };
}

function jsonError(c: Context, status: RequestStatus, code: string, message: string) {
  return c.json(error(code, message), status);
}

export const app = createApp();

