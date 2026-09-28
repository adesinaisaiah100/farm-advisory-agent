import { describe, expect, it } from 'vitest';
import { MediaError } from './key.js';
import { GeminiVisionProvider, MAX_OBSERVATIONS, observePrompt } from './vision.js';

const image = new Uint8Array([4, 5, 6]);

function visionFor(payload: string, status = 200) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => ({
        candidates: [{ content: { parts: [{ text: payload }] } }],
      }),
      text: async () => payload,
    } as unknown as Response;
  };
  return { bodies, provider: new GeminiVisionProvider({ apiKey: 'k', fetchImpl }) };
}

function rawVisionFor(payload: unknown, status = 200) {
  const fetchImpl: typeof fetch = async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }) as unknown as Response;
  return { provider: new GeminiVisionProvider({ apiKey: 'k', fetchImpl }) };
}

describe('observePrompt', () => {
  it('forbids naming a disease, so a photo cannot invent a diagnosis', () => {
    expect(observePrompt()).toMatch(/do not name or suggest a disease/i);
  });

  it('forbids treatment advice', () => {
    expect(observePrompt()).toMatch(/do not recommend a treatment/i);
  });

  it('asks for at most the allowed number of observations', () => {
    expect(observePrompt()).toContain(String(MAX_OBSERVATIONS));
  });
});

describe('GeminiVisionProvider', () => {
  it('returns the observations the model produced', async () => {
    const { provider } = visionFor(JSON.stringify({ observations: ['wet litter', 'drooping wings'] }));

    const result = await provider.observe({ image, mime: 'image/jpeg' });

    expect(result.observations).toEqual(['wet litter', 'drooping wings']);
  });

  it('requests JSON back so the payload can be validated', async () => {
    const { provider, bodies } = visionFor(JSON.stringify({ observations: ['a'] }));

    await provider.observe({ image, mime: 'image/jpeg' });

    expect(bodies[0]?.generationConfig).toEqual({ responseMimeType: 'application/json' });
  });

  it('sends the image inline with its mime type', async () => {
    const { provider, bodies } = visionFor(JSON.stringify({ observations: ['a'] }));

    await provider.observe({ image, mime: 'image/jpeg' });

    const parts = (bodies[0]?.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0]
      ?.parts;
    expect(parts?.[1]?.inlineData).toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('fails when the model replies with prose instead of JSON', async () => {
    const { provider } = visionFor('the birds look a bit off to me');

    await expect(provider.observe({ image, mime: 'image/jpeg' })).rejects.toThrow(
      /did not return JSON/,
    );
  });

  it('rejects a payload with more observations than allowed', async () => {
    const tooMany = Array.from({ length: MAX_OBSERVATIONS + 1 }, (_, i) => `obs ${i}`);
    const { provider } = visionFor(JSON.stringify({ observations: tooMany }));

    await expect(provider.observe({ image, mime: 'image/jpeg' })).rejects.toThrow(
      /did not match the contract/,
    );
  });

  it('rejects an empty observation string', async () => {
    const { provider } = visionFor(JSON.stringify({ observations: [''] }));

    await expect(provider.observe({ image, mime: 'image/jpeg' })).rejects.toThrow(MediaError);
  });

  it('rejects a payload that is not an observations object', async () => {
    const { provider } = visionFor(JSON.stringify({ findings: ['x'] }));

    await expect(provider.observe({ image, mime: 'image/jpeg' })).rejects.toThrow(MediaError);
  });

  it('refuses an empty image body', async () => {
    const { provider, bodies } = visionFor(JSON.stringify({ observations: [] }));

    await expect(
      provider.observe({ image: new Uint8Array(), mime: 'image/jpeg' }),
    ).rejects.toThrow(MediaError);
    expect(bodies).toHaveLength(0);
  });

  it('rejects a response that does not match the contract', async () => {
    const { provider } = rawVisionFor({ candidates: [] });

    await expect(provider.observe({ image, mime: 'image/jpeg' })).rejects.toThrow(
      /did not match the contract/,
    );
  });

  it('surfaces a non-2xx response as a media error', async () => {
    const { provider } = visionFor('{}', 500);

    await expect(provider.observe({ image, mime: 'image/jpeg' })).rejects.toThrow(/500/);
  });
});
