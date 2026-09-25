import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';
import { BirdStageSchema, SpeciesSchema } from '../farmer/index.js';

export const CaseStatusSchema = z.enum(['in_progress', 'complete', 'escalated', 'void']);

export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const SymptomSchema = z.string().min(1);

export const DiseaseSchema = z.enum([
  'newcastle',
  'gumboro',
  'fowlpox',
  'coccidiosis',
  'avian_influenza',
  'unknown',
]);

export type Disease = z.infer<typeof DiseaseSchema>;

export const DoorSchema = z.enum(['resolve', 'supply', 'escalate', 'report']);

export type Door = z.infer<typeof DoorSchema>;

export const CaseSchema = z.object({
  id: UuidSchema.optional(),
  farmId: UuidSchema.optional(),
  sessionId: UuidSchema.optional(),
  species: SpeciesSchema.optional(),
  breed: z.string().min(1).max(80).optional(),
  birdStage: BirdStageSchema.optional(),
  farmSize: z.number().int().min(200).max(2000).optional(),
  flockAgeWeeks: z.number().int().min(0).optional(),
  symptoms: z.array(SymptomSchema).optional(),
  onsetDays: z.number().int().min(1).optional(),
  mortalityCount: z.number().int().min(1).optional(),
  mortalityRatePct: z.number().min(0).max(100).optional(),
  diseaseText: z.string().min(1).max(120).optional(),
  diseaseHits: z.array(DiseaseSchema).optional(),
  needsConfirmation: z.array(z.string()).optional(),
  status: CaseStatusSchema,
  door: DoorSchema.optional(),
  editedAt: DateTimeSchema.optional(),
});

export type CaseData = z.infer<typeof CaseSchema>;

export const CRITICAL_SYMPTOMS: readonly string[] = [
  'sudden death',
  'blood in droppings',
  'swollen head',
  'twisted neck',
  'trembling',
  'paralysis',
];

export function hasCriticalSymptom(c: CaseData): boolean {
  return (c.symptoms ?? []).some((s) => CRITICAL_SYMPTOMS.includes(s.toLowerCase()));
}