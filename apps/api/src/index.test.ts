import { describe, expect, it } from 'vitest';
import { createApp } from './index.js';

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
});