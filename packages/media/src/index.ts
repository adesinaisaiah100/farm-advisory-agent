import { z } from 'zod';

export const TranscribeResultSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string().optional(),
});

export type TranscribeResult = z.infer<typeof TranscribeResultSchema>;

export const CONFIDENCE_THRESHOLD = 0.6;

export function isReliable(result: TranscribeResult): boolean {
  return result.confidence >= CONFIDENCE_THRESHOLD;
}