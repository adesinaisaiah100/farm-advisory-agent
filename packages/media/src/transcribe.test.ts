import { describe, expect, it } from 'vitest';
import { MediaError } from './key.js';
import { GeminiTranscriber, transcribePrompt } from './transcribe.js';

const audio = new Uint8Array([1, 2, 3]);

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function fakeFetch(response: unknown, status = 200): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as unknown as Response;
  };
  return { fetchImpl, calls };
}

function transcriberFor(response: unknown, status = 200) {
  const { fetchImpl, calls } = fakeFetch(response, status);
  return {
    calls,
    transcriber: new GeminiTranscriber({ apiKey: 'test-key', fetchImpl }),
  };
}

describe('transcribePrompt', () => {
  it('forbids translation and tidying, which is the whole point of the prompt', () => {
    const prompt = transcribePrompt();
    expect(prompt).toContain('Never translate into formal English');
    expect(prompt).toContain('exactly what was said');
  });

  it('names Pidgin as the expected language by default', () => {
    expect(transcribePrompt()).toContain('Nigerian Pidgin or English');
  });

  it('honours an explicit language hint', () => {
    expect(transcribePrompt('English')).toContain('writing in English');
  });

  it('asks for an [inaudible] marker rather than a guess', () => {
    expect(transcribePrompt()).toContain('[inaudible]');
  });
});

describe('GeminiTranscriber', () => {
  it('returns the transcript with no invented confidence', async () => {
    const { transcriber } = transcriberFor({
      candidates: [{ content: { parts: [{ text: '  my birds dey die  ' }] } }],
    });

    const result = await transcriber.transcribe({ audio, mime: 'audio/mpeg' });

    expect(result.text).toBe('my birds dey die');
    expect(result.confidence).toBeUndefined();
  });

  it('posts to the transcribe model with the audio inline', async () => {
    const { transcriber, calls } = transcriberFor({
      candidates: [{ content: { parts: [{ text: 'hello' }] } }],
    });

    await transcriber.transcribe({ audio, mime: 'audio/mpeg' });

    expect(calls[0]?.url).toContain('gemini-3.5-transcribe:generateContent');
    const parts = (calls[0]?.body.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0]
      ?.parts;
    expect(parts?.[1]?.inlineData).toMatchObject({ mimeType: 'audio/mpeg' });
  });

  it('sends the base64 of the exact audio bytes', async () => {
    const { transcriber, calls } = transcriberFor({
      candidates: [{ content: { parts: [{ text: 'hello' }] } }],
    });

    await transcriber.transcribe({ audio, mime: 'audio/mpeg' });

    const parts = (calls[0]?.body.contents as Array<{ parts: Array<Record<string, unknown>> }>)[0]
      ?.parts;
    const inline = parts?.[1]?.inlineData as { data: string };
    expect(Array.from(Buffer.from(inline.data, 'base64'))).toEqual(Array.from(audio));
  });

  it('refuses to transcribe an empty body', async () => {
    const { transcriber, calls } = transcriberFor({ candidates: [] });

    await expect(
      transcriber.transcribe({ audio: new Uint8Array(), mime: 'audio/mpeg' }),
    ).rejects.toThrow(MediaError);
    expect(calls).toHaveLength(0);
  });

  it('fails rather than returning empty text when the model hears nothing', async () => {
    const { transcriber } = transcriberFor({
      candidates: [{ content: { parts: [{ text: '   ' }] } }],
    });

    await expect(transcriber.transcribe({ audio, mime: 'audio/mpeg' })).rejects.toThrow(
      /no transcript text/,
    );
  });

  it('surfaces a non-2xx response as a media error', async () => {
    const { transcriber } = transcriberFor({ error: 'quota' }, 429);

    await expect(transcriber.transcribe({ audio, mime: 'audio/mpeg' })).rejects.toThrow(
      /429/,
    );
  });

  it('rejects a response that does not match the contract', async () => {
    const { transcriber } = transcriberFor({ candidates: [] });

    await expect(transcriber.transcribe({ audio, mime: 'audio/mpeg' })).rejects.toThrow(
      /did not match the contract/,
    );
  });

  it('joins multiple parts into one transcript', async () => {
    const { transcriber } = transcriberFor({
      candidates: [{ content: { parts: [{ text: 'my birds ' }, { text: 'dey die' }] } }],
    });

    const result = await transcriber.transcribe({ audio, mime: 'audio/mpeg' });

    expect(result.text).toBe('my birds dey die');
  });

  it('requires an api key at construction', () => {
    expect(() => new GeminiTranscriber({ apiKey: '' })).toThrow(MediaError);
  });
});
