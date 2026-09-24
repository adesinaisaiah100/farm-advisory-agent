import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';
import { PhoneSchema } from '../phone/index.js';
import { MediaKindSchema } from '../message/index.js';

export const MediaSchema = z.object({
  id: UuidSchema,
  farmerPhone: PhoneSchema,
  caseId: UuidSchema.optional(),
  mime: z.string().min(1),
  r2Key: z.string().min(1),
  kind: MediaKindSchema,
  transcript: z.string().optional(),
  transcriptConfidence: z.number().min(0).max(1).optional(),
  observations: z.array(z.string()).optional(),
  uploadedAt: DateTimeSchema,
});

export type Media = z.infer<typeof MediaSchema>;

export const CONFIDENCE_THRESHOLD = 0.6;

export function isReliable(confidence: number | undefined): boolean {
  return confidence === undefined ? false : confidence >= CONFIDENCE_THRESHOLD;
}