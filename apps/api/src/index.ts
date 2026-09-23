import { Hono } from 'hono';

export function createApp() {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok', service: 'poultry-api' }));

  return app;
}

export const app = createApp();