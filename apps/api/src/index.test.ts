import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { ChatResponseSchema } from '@poultry/schemas';
import { inMemorySessionStore, LlmError } from '@poultry/core';
import { createApp } from './index.js';
import type { TurnServiceDeps } from './turn.js';
import { inMemoryDashboardStore } from './db/dashboard-store.js';

const NOW = new Date('2026-09-28T09:00:00.000Z');
const SESSION_ID = '00000000-0000-4000-8000-000000000001';

describe('createApp', () => {
  it('serves /health', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'poultry-api' });
  });

  it('404s unknown routes', async () => {
    const res = await createApp().request('/nope');
    expect(res.status).toBe(404);
  });

  describe('/ready', () => {
    it('503s when no dependencies were configured', async () => {
      const res = await createApp().request('/ready');
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: 'not_configured' });
    });

    it('200s when every check passes', async () => {
      const app = createApp({
        ready: async () => ({ ok: true, checks: { db: { ok: true } } }),
      });
      const res = await app.request('/ready');
      expect(res.status).toBe(200);
    });

    it('503s and names the failing dependency', async () => {
      const app = createApp({
        ready: async () => ({
          ok: false,
          checks: {
            db: { ok: true },
            r2: { ok: false, detail: 'bucket unreachable' },
            embed: { ok: true },
          },
        }),
      });
      const res = await app.request('/ready');
      expect(res.status).toBe(503);
      const body = (await res.json()) as { checks: Record<string, { ok: boolean; detail?: string }> };
      expect(body.checks.r2?.ok).toBe(false);
      expect(body.checks.r2?.detail).toBe('bucket unreachable');
    });
  });

  describe('/chat', () => {
    it('503s when no turn service was wired', async () => {
      const res = await createApp().request('/chat', { method: 'POST', body: '{}' });
      expect(res.status).toBe(503);
      expect((await res.json()) as unknown).toEqual({
        error: { code: 'not_configured', message: 'no turn service configured' },
      });
    });

    it('400s on a body that is not valid JSON', async () => {
      const app = createApp({ chat: fakeChatDeps({ delta: {}, reply: 'hi' }) });
      const res = await app.request('/chat', { method: 'POST', body: 'not json' });
      expect(res.status).toBe(400);
      expect((await res.json()) as { error: { code: string } }).toMatchObject({
        error: { code: 'invalid_json' },
      });
    });

    it('returns a four-door answer for a fake-driven turn', async () => {
      const app = createApp({ chat: fakeChatDeps(resolveDelta()) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'my birds are drooping' });

      expect(res.status).toBe(200);
      const body = ChatResponseSchema.parse(await res.json());
      expect(body.door).toBe('resolve');
      expect(body.reply).toBe('Isolate the sick birds and keep the rest separate.');
      expect(body.caseStatus).toBe('complete');
      expect(body.fellBack).toBe(false);
      expect(body.replyLanguage).toBe('english');
    });

    it('escalates on a red flag and still returns a usable answer', async () => {
      const app = createApp({ chat: fakeChatDeps(redFlagDelta()) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'blood everywhere' });

      const body = ChatResponseSchema.parse(await res.json());
      expect(body.door).toBe('escalate');
      expect(body.reply.length).toBeGreaterThan(0);
    });

    it('answers in Pidgin when the farmer wrote in Pidgin', async () => {
      const app = createApp({ chat: fakeChatDeps(resolveDelta()) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'my chicken dey sick' });

      expect(ChatResponseSchema.parse(await res.json()).replyLanguage).toBe('pidgin');
    });

    it('flags a coded fallback in a header, so a broken model is visible', async () => {
      const app = createApp({ chat: fakeChatDeps({ delta: { species: 'a dinosaur' }, reply: 'ok' }) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'hello' });

      expect(res.headers.get('x-poultry-fallback')).toBe('1');
      expect(ChatResponseSchema.parse(await res.json()).fellBack).toBe(true);
    });

    it('omits the fallback header on a normal turn', async () => {
      const app = createApp({ chat: fakeChatDeps(resolveDelta()) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'sick bird' });

      expect(res.headers.get('x-poultry-fallback')).toBeNull();
    });

    it('rejects an unknown field rather than ignoring it', async () => {
      const app = createApp({ chat: fakeChatDeps(resolveDelta()) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'hi', bypassSafety: true });

      expect(res.status).toBe(400);
      expect((await res.json()) as { error: { code: string } }).toMatchObject({
        error: { code: 'invalid_request' },
      });
    });

    it('502s a model outage so the bridge can retry the message', async () => {
      const app = createApp({
        chat: fakeChatDeps(undefined, () => {
          throw new LlmError('transport', 'gemini unreachable');
        }),
      });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'hi' });

      expect(res.status).toBe(502);
      expect((await res.json()) as { error: { code: string } }).toMatchObject({
        error: { code: 'model_unavailable' },
      });
    });

    it('does not emit a door the orchestrator never decided', async () => {
      const app = createApp({ chat: fakeChatDeps({ delta: { species: 'broiler' }, reply: 'Noted.' }) });
      const res = await post(app, { farmerPhone: '+2348012345678', text: 'broiler' });

      expect(ChatResponseSchema.parse(await res.json()).door).toBe('collect');
    });
  });
});

/**
 * `drooping wings` reads like a neutral symptom but trips the `wing_droop`
 * red-flag rule, so a fixture built from it silently asserts the escalate door.
 * This one is deliberately unremarkable.
 */
function resolveDelta() {
  return {
    delta: {
      species: 'broiler',
      symptoms: ['blood in droppings'],
      onsetDays: 2,
      mortalityCount: 3,
      farmSize: 400,
      diseaseHits: ['coccidiosis'],
    },
    reply: 'Isolate the sick birds and keep the rest separate.',
  };
}

function redFlagDelta() {
  return {
    delta: {
      species: 'broiler',
      symptoms: ['twisted neck', 'bleeding'],
      onsetDays: 1,
      mortalityCount: 2,
      farmSize: 300,
      diseaseHits: ['newcastle'],
    },
    reply: 'Take a bird to a vet now, do not wait.',
  };
}

function fakeChatDeps(
  reply: unknown = resolveDelta(),
  complete: (() => Promise<unknown>) | undefined = undefined,
): TurnServiceDeps {
  return {
    store: inMemorySessionStore({ now: () => NOW, newId: () => SESSION_ID }),
    turn: {
      chat: { complete: complete ?? (async () => reply) },
      compact: { compact: async () => ({ notes: [] }) },
      count: { count: (s: string) => Math.ceil(s.length / 4) },
      now: () => NOW.toISOString(),
    },
    newId: () => SESSION_ID,
    now: () => NOW,
  };
}

function post(app: Hono, body: unknown) {
  return app.request('/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Phase 9 read endpoints ─────────────────────────────────────────────────

const CASE_SESSION = {
  id: 'sess-aaa1',
  phone: '+2348099999999',
  status: 'open' as const,
  caseId: 'case-aaa1',
  state: {
    case: {
      species: 'broiler' as const,
      symptoms: ['blood in droppings'],
      mortalityCount: 3,
      farmSize: 400 as number,
      state: 'Oyo',
      lga: 'Ibadan North',
      diseaseHits: ['coccidiosis' as const],
      diseaseText: 'coccidiosis',
      needsConfirmation: [] as string[],
      status: 'in_progress' as const,
    },
    history: [{ role: 'farmer' as const, text: 'my birds are sick' }],
    notes: ['500 broilers'],
  },
  startedAt: '2026-09-28T09:00:00.000Z',
  lastActive: '2026-09-28T09:30:00.000Z',
};

describe('/cases', () => {
  it('503s when no dashboard store was configured', async () => {
    const res = await createApp().request('/cases');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'not_configured' } });
  });

  it('returns paginated case list with total count', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const res = await app.request('/cases');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; cases: unknown[] };
    expect(body.total).toBe(1);
    expect(body.cases.length).toBe(1);
  });

  it('filters by state query param', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const res = await app.request('/cases?state=Kano');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });

  it('filters by species query param', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const resMatch = await app.request('/cases?species=broiler');
    const resNoMatch = await app.request('/cases?species=layer');
    expect(((await resMatch.json()) as { total: number }).total).toBe(1);
    expect(((await resNoMatch.json()) as { total: number }).total).toBe(0);
  });
});

describe('/cases/:id', () => {
  it('503s when no dashboard was configured', async () => {
    const res = await createApp().request('/cases/sess-aaa1');
    expect(res.status).toBe(503);
  });

  it('returns full case detail by sessionId', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const res = await app.request('/cases/sess-aaa1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; history: unknown[] };
    expect(body.sessionId).toBe('sess-aaa1');
    expect(body.history.length).toBe(1);
  });

  it('404s for unknown case id', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const res = await app.request('/cases/no-such-case');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});

describe('/reports', () => {
  it('503s when no dashboard was configured', async () => {
    const res = await createApp().request('/reports');
    expect(res.status).toBe(503);
  });

  it('returns anonymised surveillance reports without farmerPhone', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const res = await app.request('/reports');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { reports: Record<string, unknown>[] };
    expect(body.reports.length).toBeGreaterThan(0);
    expect('farmerPhone' in (body.reports[0] ?? {})).toBe(false);
  });

  it('filters by disease query param', async () => {
    const app = createApp({ dashboard: inMemoryDashboardStore({ sessions: [CASE_SESSION] }) });
    const resMatch = await app.request('/reports?disease=coccidiosis');
    const resNoMatch = await app.request('/reports?disease=newcastle');
    expect(((await resMatch.json()) as { total: number }).total).toBe(1);
    expect(((await resNoMatch.json()) as { total: number }).total).toBe(0);
  });
});

describe('/stores', () => {
  it('returns all stores when no filter applied', async () => {
    const res = await createApp().request('/stores');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stores: unknown[]; total: number };
    expect(body.stores.length).toBeGreaterThan(0);
    expect(body.total).toBe(body.stores.length);
  });

  it('filters stores by lga', async () => {
    const res = await createApp().request('/stores?lga=Ibadan+North');
    const body = (await res.json()) as { stores: { lga: string }[]; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.stores.every((s) => s.lga.toLowerCase() === 'ibadan north')).toBe(true);
  });

  it('returns empty list for unknown lga', async () => {
    const res = await createApp().request('/stores?lga=NonExistentLGA');
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);
  });
});
