import {
  FallbackChatProvider,
  GeminiChatProvider,
  GeminiCompactProvider,
  LlmError,
  OpenRouterChatProvider,
  resolveGeminiApiKey,
} from '@poultry/core';
import { createApp, type ApiDeps, type ReadyReport } from './index.js';
import { createApiDb } from './db/client.js';
import { postgresSessionStore } from './db/session-store.js';

export interface RuntimeEnv {
  readonly nodeEnv: string;
  readonly databaseUrl?: string;
  readonly geminiApiKey?: string;
  readonly geminiApiKeyProd?: string;
  readonly openRouterApiKey?: string;
  readonly openRouterFallbackModel?: string;
}

/**
 * A Zod-style env read would be the house pattern, but this module is imported by
 * `wrangler`'s Node-side dev entry and by the Worker's own module scope, which
 * do not share a Zod env module. Reads stay explicit and typed so a missing
 * variable surfaces as a named boot failure rather than `undefined` at the first
 * farmer's message.
 */
export function readRuntimeEnv(source: Record<string, string | undefined>): RuntimeEnv {
  return {
    nodeEnv: source['NODE_ENV'] ?? 'development',
    databaseUrl: source['DATABASE_URL'],
    geminiApiKey: source['GEMINI_API_KEY'],
    geminiApiKeyProd: source['GEMINI_API_KEY_PROD'],
    openRouterApiKey: source['OPENROUTER_API_KEY'],
    openRouterFallbackModel: source['OPENROUTER_FALLBACK_MODEL'],
  };
}

export interface BootstrapResult {
  readonly deps: ApiDeps;
  /** Names the failure instead of throwing an opaque `undefined is not a function`. */
  readonly problem?: string;
}

/**
 * Build the real dependency graph, or explain precisely what is missing.
 *
 * Boot is all-or-nothing on purpose. A half-wired API that answers `/health`
 * while `/chat` 503s is the failure mode `/ready` was added to catch, and it is
 * better to refuse to start than to take a farmer's message and drop it.
 */
export function buildApiDeps(env: RuntimeEnv): BootstrapResult {
  const problems: string[] = [];

  if (env.databaseUrl === undefined) problems.push('DATABASE_URL');

  let apiKey: string | undefined;
  try {
    apiKey = resolveGeminiApiKey({
      nodeEnv: env.nodeEnv,
      devKey: env.geminiApiKey,
      prodKey: env.geminiApiKeyProd,
    });
  } catch (error) {
    if (error instanceof LlmError) {
      problems.push(error.code === 'missing_api_key' ? 'GEMINI_API_KEY (or GEMINI_API_KEY_PROD)' : error.message);
    } else {
      throw error;
    }
  }

  if (problems.length > 0 || env.databaseUrl === undefined || apiKey === undefined) {
    return { deps: {}, problem: `missing required env: ${problems.join(', ')}` };
  }

  const db = createApiDb(env.databaseUrl);
  const geminiChat = new GeminiChatProvider({ apiKey });
  const chatProvider = env.openRouterApiKey
    ? new FallbackChatProvider({
        primary: geminiChat,
        secondary: new OpenRouterChatProvider({
          apiKey: env.openRouterApiKey,
          model: env.openRouterFallbackModel ?? 'openrouter/free',
        }),
        log: (msg, fields) => {
          // eslint-disable-next-line no-console
          console.warn(`[fallback-chat] ${msg} ${JSON.stringify(fields ?? {})}`);
        },
      })
    : geminiChat;

  return {
    deps: {
      chat: {
        store: postgresSessionStore(db),
        turn: {
          chat: chatProvider,
          compact: new GeminiCompactProvider({ apiKey }),
          count: { count: (text) => Math.ceil(text.length / 4) },
          now: () => new Date().toISOString(),
        },
        newId: () => crypto.randomUUID(),
        now: () => new Date(),
      },
      ready: async (): Promise<ReadyReport> => pingReadiness(db),
    },
  };
}

/**
 * `/ready` must prove the database answers, not merely that a URL was
 * configured. A Neon project can be suspended and still hand out a connection
 * string, so the check has to run a real query to be worth anything.
 */
export async function pingReadiness(db: ReturnType<typeof createApiDb>): Promise<ReadyReport> {
  const startedAt = Date.now();
  try {
    await db.execute('select 1');
    return {
      ok: true,
      checks: { database: { ok: true, detail: `select 1 in ${Date.now() - startedAt}ms` } },
    };
  } catch (error) {
    return {
      ok: false,
      checks: {
        database: { ok: false, detail: error instanceof Error ? error.message : 'unknown error' },
      },
    };
  }
}

export function createApiApp(env: RuntimeEnv) {
  const { deps, problem } = buildApiDeps(env);
  if (problem !== undefined) {
    // Loud and fatal: a Worker that starts without `/chat` is worse than one that
    // never starts, because the failure then looks like a farmer-side problem.
    throw new Error(`[poultry-api] cannot boot: ${problem}`);
  }
  return createApp(deps);
}
