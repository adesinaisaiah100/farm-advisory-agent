import { serve } from '@hono/node-server';
import { createApiApp, readRuntimeEnv } from './bootstrap.js';

const app = createApiApp(readRuntimeEnv(process.env));
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[${new Date().toISOString()}] API listening on :${info.port}`);
});