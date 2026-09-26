import { z } from 'zod';
import { BirdStageSchema, DiseaseSchema, SpeciesSchema } from '@poultry/schemas';

export const CaseDeltaSchema = z
  .object({
    species: SpeciesSchema.optional(),
    breed: z.string().min(1).max(80).optional(),
    birdStage: BirdStageSchema.optional(),
    farmSize: z.number().int().min(200).max(2000).optional(),
    flockAgeWeeks: z.number().int().min(0).optional(),
    symptoms: z.array(z.string().min(1)).optional(),
    onsetDays: z.number().int().min(1).optional(),
    mortalityCount: z.number().int().min(1).optional(),
    mortalityRatePct: z.number().min(0).max(100).optional(),
    diseaseText: z.string().min(1).max(120).optional(),
    diseaseHits: z.array(DiseaseSchema).optional(),
    needsConfirmation: z.array(z.string()).optional(),
    wantsSupply: z.boolean().optional(),
  })
  .strict();

export type CaseDelta = z.infer<typeof CaseDeltaSchema>;

export const ProfileDeltaSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
  })
  .strict();

export type ProfileDelta = z.infer<typeof ProfileDeltaSchema>;

export const LlmReplySchema = z
  .object({
    delta: CaseDeltaSchema,
    profile: ProfileDeltaSchema.optional(),
    reply: z.string().min(1),
  })
  .strict();

export type LlmReply = z.infer<typeof LlmReplySchema>;

export const MAX_NOTES = 12;

export const CompactionResultSchema = z
  .object({
    notes: z.array(z.string().min(1).max(240)).max(MAX_NOTES),
  })
  .strict();

export type CompactionResult = z.infer<typeof CompactionResultSchema>;