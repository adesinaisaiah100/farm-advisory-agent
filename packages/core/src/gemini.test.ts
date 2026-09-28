import { describe, expect, it } from 'vitest';
import { CaseDeltaSchema, LlmReplySchema } from './llm.js';
import {
  GeminiChatProvider,
  GeminiCompactProvider,
  LLM_REPLY_RESPONSE_SCHEMA,
  LlmError,
  chatSystemPrompt,
  compactSystemPrompt,
  resolveGeminiApiKey,
} from './gemini.js';
import type { ChatInput, CompactInput, TurnMessage } from './providers.js';

interface Recorded {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(
  responder: (recorded: Recorded) => { status?: number; body: unknown } | Promise<never>,
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const recorded = { url: String(url), init };
    calls.push(recorded);
    const { status = 200, body } = await responder(recorded);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function textBody(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function sentBody(call: Recorded | undefined): {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: Record<string, unknown>;
} {
  return JSON.parse(String(call?.init.body)) as never;
}

const chatInput: ChatInput = {
  filled: { status: 'in_progress', species: 'broiler', symptoms: ['sneezing'] },
  missing: ['onsetDays', 'mortalityCount'],
  notes: [],
  query: 'sneeze dey worry me',
  history: [],
  replyLanguage: 'pidgin',
};

describe('resolveGeminiApiKey', () => {
  it('uses the dev project key outside production', () => {
    expect(
      resolveGeminiApiKey({ nodeEnv: 'development', devKey: 'dev', prodKey: 'prod' }),
    ).toBe('dev');
  });

  it('uses the product project key in production', () => {
    expect(resolveGeminiApiKey({ nodeEnv: 'production', devKey: 'dev', prodKey: 'prod' })).toBe(
      'prod',
    );
  });

  it('refuses to fall back to the dev key in production', () => {
    expect(() => resolveGeminiApiKey({ nodeEnv: 'production', devKey: 'dev' })).toThrow(
      /GEMINI_API_KEY_PROD/,
    );
  });

  it('refuses to borrow the product key for the dev loop', () => {
    expect(() => resolveGeminiApiKey({ nodeEnv: 'development', prodKey: 'prod' })).toThrow(
      /GEMINI_API_KEY/,
    );
  });
});

describe('chatSystemPrompt', () => {
  it('tells the model never to name a drug, vaccine, brand or dose', () => {
    expect(chatSystemPrompt('pidgin')).toMatch(/never name a specific drug/i);
  });

  it('tells the model to stop and escalate on a safety sign', () => {
    expect(chatSystemPrompt('english')).toMatch(/contact a veterinarian immediately/i);
  });

  it('forbids inventing a number the farmer did not give', () => {
    expect(chatSystemPrompt('pidgin')).toMatch(/never guess a number/i);
  });

  it('asks for a pidgin reply when the farmer wrote pidgin', () => {
    expect(chatSystemPrompt('pidgin')).toMatch(/Reply in Nigerian Pidgin/);
  });

  it('asks for an english reply when the farmer wrote english', () => {
    expect(chatSystemPrompt('english')).toMatch(/Reply in plain English/);
  });
});

describe('compactSystemPrompt', () => {
  it('caps notes at the length the schema enforces', () => {
    expect(compactSystemPrompt()).toMatch(/240 characters/);
  });

  it('keeps quoted farmer wording verbatim', () => {
    expect(compactSystemPrompt()).toMatch(/verbatim/i);
  });
});

describe('LLM_REPLY_RESPONSE_SCHEMA', () => {
  const deltaProps = (
    (LLM_REPLY_RESPONSE_SCHEMA.properties as Record<string, unknown>).delta as {
      properties: Record<string, unknown>;
    }
  ).properties;

  it('describes every field of the case delta', () => {
    expect(Object.keys(deltaProps).sort()).toEqual(Object.keys(CaseDeltaSchema.shape).sort());
  });

  it('constrains the disease list to the schema enum', () => {
    const items = (deltaProps.diseaseHits as { items: { enum: string[] } }).items;
    expect(items.enum).toContain('gumboro');
    expect(items.enum).not.toContain('avian_flu');
  });

  it('constrains the species to the schema enum', () => {
    expect((deltaProps.species as { enum: string[] }).enum).toContain('broiler');
  });

  it('requires the two fields a reply cannot be built without', () => {
    expect(LLM_REPLY_RESPONSE_SCHEMA.required).toEqual(['delta', 'reply']);
  });
});

describe('GeminiChatProvider', () => {
  it('sends the flash-lite model with a JSON response contract', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: textBody('{"delta":{},"reply":"ok"}') }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await provider.complete(chatInput);

    expect(calls[0]?.url).toContain('models/gemini-3.1-flash-lite:generateContent');
    const sent = sentBody(calls[0]);
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.generationConfig.responseSchema).toEqual(LLM_REPLY_RESPONSE_SCHEMA);
  });

  it('sends the key in a header rather than the url', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: textBody('{"delta":{},"reply":"ok"}') }));
    const provider = new GeminiChatProvider({ apiKey: 'secret-key', fetchImpl });

    await provider.complete(chatInput);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('secret-key');
    expect(calls[0]?.url).not.toContain('secret-key');
  });

  it('returns the parsed delta and reply', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      body: textBody('{"delta":{"mortalityCount":6},"reply":"six birds"}'),
    }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    const reply = await provider.complete(chatInput);

    expect(LlmReplySchema.safeParse(reply).success).toBe(true);
  });

  it('tells the model which case fields are still missing', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: textBody('{"delta":{},"reply":"ok"}') }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await provider.complete(chatInput);

    const system = sentBody(calls[0]).systemInstruction.parts[0]?.text ?? '';
    expect(system).toMatch(/Still needed from the farmer: onsetDays, mortalityCount/);
  });

  it('maps the farmer and agent roles onto the model API roles', async () => {
    const history: TurnMessage[] = [
      { role: 'farmer', text: 'first' },
      { role: 'agent', text: 'answer' },
    ];
    const { fetchImpl, calls } = fakeFetch(() => ({ body: textBody('{"delta":{},"reply":"ok"}') }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await provider.complete({ ...chatInput, history });

    expect(sentBody(calls[0]).contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
  });

  it('drops a null field so the strict delta parse is not failed by absence', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      body: textBody('{"delta":{"breed":null,"onsetDays":2},"reply":"two days"}'),
    }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    const reply = await provider.complete(chatInput);

    expect(reply).toEqual({ delta: { onsetDays: 2 }, reply: 'two days' });
  });

  it('keeps a null inside an array so a bad list fails the parse', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      body: textBody('{"delta":{"symptoms":["sneezing",null]},"reply":"x"}'),
    }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    const reply = (await provider.complete(chatInput)) as { delta: { symptoms: unknown[] } };

    expect(reply.delta.symptoms).toEqual(['sneezing', null]);
  });

  it('reports a rate limit instead of returning a fallback reply', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 429, body: 'quota exhausted' }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.complete(chatInput)).rejects.toThrow(LlmError);
  });

  it('reports a safety block rather than answering', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: { promptFeedback: { blockReason: 'SAFETY' } } }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.complete(chatInput)).rejects.toThrow(/blocked/i);
  });

  it('reports text that is not JSON instead of failing the parse silently', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: textBody('I think your birds have Newcastle') }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.complete(chatInput)).rejects.toThrow(/not valid JSON/i);
  });

  it('reports an empty answer as a failure to answer', async () => {
    const { fetchImpl } = fakeFetch(() => ({
      body: { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] },
    }));
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.complete(chatInput)).rejects.toThrow(/MAX_TOKENS/);
  });

  it('reports a transport failure as the model being unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const provider = new GeminiChatProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.complete(chatInput)).rejects.toThrow(/unreachable/i);
  });

  it('refuses to be built without a key', () => {
    expect(() => new GeminiChatProvider({ apiKey: '' })).toThrow(/apiKey/);
  });
});

describe('GeminiCompactProvider', () => {
  const compactInput: CompactInput = {
    notes: ['earlier note'],
    dropped: [{ role: 'farmer', text: 'my birds dey sneeze' }],
    maxNotes: 12,
  };

  it('returns notes the caller can trust', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: textBody('{"notes":["farmer reported sneezing"]}') }));
    const provider = new GeminiCompactProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.compact(compactInput)).resolves.toEqual({
      notes: ['farmer reported sneezing'],
    });
  });

  it('sends the dropped messages and the existing notes', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: textBody('{"notes":[]}') }));
    const provider = new GeminiCompactProvider({ apiKey: 'k', fetchImpl });

    await provider.compact(compactInput);

    const prompt = sentBody(calls[0]).contents[0]?.parts[0]?.text ?? '';
    expect(prompt).toMatch(/my birds dey sneeze/);
    expect(prompt).toMatch(/earlier note/);
  });

  it('rejects a fold that breaks the notes cap instead of passing it on', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: textBody('{"notes":{}}') }));
    const provider = new GeminiCompactProvider({ apiKey: 'k', fetchImpl });

    await expect(provider.compact(compactInput)).rejects.toThrow();
  });
});
