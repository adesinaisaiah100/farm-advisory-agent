import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ChatResponse } from '@poultry/schemas';
import { ChatResponseSchema } from '@poultry/schemas';
import { handleChat, RequestError } from './turn.js';
import type { RequestStatus, TurnServiceDeps } from './turn.js';

export interface ApiDeps {
  readonly chat?: TurnServiceDeps;
  readonly ready?: () => Promise<ReadyReport>;
}

export interface ReadyReport {
  readonly ok: boolean;
  readonly checks: Readonly<Record<string, { ok: boolean; detail?: string }>>;
}

export function createApp(deps: ApiDeps = {}) {
  const app = new Hono();

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

  return app;
}

function error(code: string, message: string) {
  return { error: { code, message } };
}

function jsonError(c: Context, status: RequestStatus, code: string, message: string) {
  return c.json(error(code, message), status);
}

export const app = createApp();
