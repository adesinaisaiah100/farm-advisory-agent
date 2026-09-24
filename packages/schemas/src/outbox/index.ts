import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';
import { PhoneSchema } from '../phone/index.js';
import { DoorSchema } from '../case/index.js';

export const OutboxStatusSchema = z.enum(['pending', 'sent', 'failed', 'dropped']);

export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const OutboxPayloadSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string().min(1) }),
  z.object({ type: z.literal('referral_slip'), slipId: UuidSchema }),
  z.object({ type: z.literal('report'), reportId: UuidSchema }),
  z.object({ type: z.literal('resolve'), reply: z.string().min(1) }),
]);

export type OutboxPayload = z.infer<typeof OutboxPayloadSchema>;

export const OutboxSchema = z
  .object({
    id: UuidSchema,
    farmerPhone: PhoneSchema,
    door: DoorSchema.optional(),
    sessionId: UuidSchema.optional(),
    payload: OutboxPayloadSchema,
    status: OutboxStatusSchema,
    attempt: z.number().int().min(0).default(0),
    maxAttempts: z.number().int().min(1).default(5),
    nextAttemptAt: DateTimeSchema.optional(),
    createdAt: DateTimeSchema,
  })
  .refine((o) => o.attempt <= o.maxAttempts, 'attempt count cannot exceed maxAttempts');

export type OutboxRecord = z.infer<typeof OutboxSchema>;

export const OUTBOX_BASE_BACKOFF_MS = 5000;
export const OUTBOX_MAX_BACKOFF_MS = 5 * 60 * 1000;

export function canRetry(o: OutboxRecord): boolean {
  return o.status === 'failed' && o.attempt < o.maxAttempts;
}