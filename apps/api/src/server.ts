import { serve } from '@hono/node-server';
import { createApiApp, readRuntimeEnv } from './bootstrap.js';

const app = createApiApp(readRuntimeEnv(process.env));
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const server = serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`[${new Date().toISOString()}] API listening on :${info.port}`);
});
server.requestTimeout = 0;
server.timeout = 0;