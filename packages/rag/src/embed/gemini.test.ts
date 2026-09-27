import { describe, expect, it } from 'vitest';
import { EmbedError } from './embedder.js';
import { GeminiEmbedder } from './gemini.js';

interface Recorded {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(
  responder: (recorded: Recorded) => { status?: number; body: unknown },
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const recorded = { url: String(url), init };
    calls.push(recorded);
    const { status = 200, body } = responder(recorded);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function okBody(vectors: number[][]): unknown {
  return { embeddings: vectors.map((values) => ({ values })) };
}

describe('GeminiEmbedder', () => {
  it('returns an empty array for no text without calling the API', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: okBody([]) }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', fetchImpl });

    await expect(embedder.embed([])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('sends the model, output width and task type', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: okBody([[1, 0, 0]]) }));
    const embedder = new GeminiEmbedder({ apiKey: 'secret-key', dims: 3, fetchImpl });

    await embedder.embed(['hello'], { taskType: 'RETRIEVAL_QUERY' });

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('secret-key');
    expect(calls[0]?.url).toContain('models/gemini-embedding-001:batchEmbedContents');
    const sent = JSON.parse(String(calls[0]?.init.body)) as {
      requests: { model: string; outputDimensionality: number; taskType?: string }[];
    };
    expect(sent.requests[0]?.model).toBe('models/gemini-embedding-001');
    expect(sent.requests[0]?.outputDimensionality).toBe(3);
    expect(sent.requests[0]?.taskType).toBe('RETRIEVAL_QUERY');
  });

  it('omits the task type when the caller did not choose one', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: okBody([[1, 0, 0]]) }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', dims: 3, fetchImpl });

    await embedder.embed(['hello']);

    const sent = JSON.parse(String(calls[0]?.init.body)) as { requests: object[] };
    expect(sent.requests[0]).not.toHaveProperty('taskType');
  });

  it('normalizes returned vectors by default', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: okBody([[3, 4]]) }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', dims: 2, fetchImpl });

    const [vector] = await embedder.embed(['x']);

    expect(vector).toEqual([0.6, 0.8]);
  });

  it('returns the raw vector when normalization is switched off', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: okBody([[3, 4]]) }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', dims: 2, normalize: false, fetchImpl });

    const [vector] = await embedder.embed(['x']);

    expect(vector).toEqual([3, 4]);
  });

  it('splits a large batch and keeps the results in order', async () => {
    const { fetchImpl, calls } = fakeFetch((recorded) => {
      const sent = JSON.parse(String(recorded.init.body)) as { requests: { content: { parts: { text: string }[] } }[] };
      return { body: okBody(sent.requests.map((r) => [Number(r.content.parts[0]?.text), 0])) };
    });
    const embedder = new GeminiEmbedder({
      apiKey: 'k',
      dims: 2,
      batchSize: 2,
      normalize: false,
      fetchImpl,
    });

    const vectors = await embedder.embed(['1', '2', '3']);

    expect(calls).toHaveLength(2);
    expect(vectors.map((v) => v[0])).toEqual([1, 2, 3]);
  });

  it('fails loudly when the API rejects the key', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 403, body: { error: 'quota' } }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', dims: 2, fetchImpl });

    await expect(embedder.embed(['x'])).rejects.toThrow(/403/);
  });

  it('fails when the payload does not match the contract', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: { embeddings: [{ values: 'nope' }] } }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', dims: 2, fetchImpl });

    await expect(embedder.embed(['x'])).rejects.toThrow(EmbedError);
  });

  it('fails when a returned vector has the wrong width', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: okBody([[1, 2, 3]]) }));
    const embedder = new GeminiEmbedder({ apiKey: 'k', dims: 2, fetchImpl });

    await expect(embedder.embed(['x'])).rejects.toThrow(/has 3 dims, expected 2/);
  });

  it('rejects construction without an api key', () => {
    expect(() => new GeminiEmbedder({ apiKey: '' })).toThrow(EmbedError);
  });
});
