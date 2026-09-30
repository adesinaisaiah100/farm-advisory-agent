import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import type { ChatResponse } from '@poultry/schemas';
import { ChatResponseSchema } from '@poultry/schemas';
import { getStores, searchByLga } from '@poultry/stores';
import { handleChat, RequestError } from './turn.js';
import type { RequestStatus, TurnServiceDeps } from './turn.js';
import type { DashboardStore } from './db/dashboard-store.js';

export interface ApiDeps {
  readonly chat?: TurnServiceDeps;
  readonly ready?: () => Promise<ReadyReport>;
  readonly dashboard?: DashboardStore;
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

  return app;
}

function error(code: string, message: string) {
  return { error: { code, message } };
}

function jsonError(c: Context, status: RequestStatus, code: string, message: string) {
  return c.json(error(code, message), status);
}

export const app = createApp();

