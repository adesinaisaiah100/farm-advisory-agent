import { z } from 'zod';

const EnvSchema = z.object({
  BRIDGE_SESSION_DIR: z.string().min(1).default('./.bridge-session'),
  BRIDGE_ALLOWED_FROM: z.string().default(''),
  BRIDGE_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'silent']).default('info'),
  BRIDGE_OUTBOX_POLL_MS: z.coerce.number().int().min(1_000).default(10_000),
  BRIDGE_TURN_URL: z.string().url().optional(),
  // Media pipeline — optional so the bridge starts cleanly without R2 in CI
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_TRANSCRIBE_MODEL: z.string().default('gemini-3.5-transcribe'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
});

export type BridgeEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BridgeEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid bridge configuration - ${detail}`);
  }
  return parsed.data;
}
