import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';
import { DiseaseSchema, SymptomSchema } from '../case/index.js';
import { SpeciesSchema } from '../farmer/index.js';

export const ReportSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema.optional(),
  caseId: UuidSchema.optional(),
  farmerPhone: z.string(),
  state: z.string().min(1).optional(),
  lga: z.string().min(1).optional(),
  species: SpeciesSchema.optional(),
  farmSize: z.number().int().min(200).max(2000).optional(),
  symptoms: z.array(SymptomSchema).optional(),
  diseaseHits: z.array(DiseaseSchema).optional(),
  mortalityCount: z.number().int().min(0).optional(),
  createdAt: DateTimeSchema,
});

export type SurveillanceReport = z.infer<typeof ReportSchema>;

export function anonymise(report: SurveillanceReport): Omit<SurveillanceReport, 'farmerPhone'> {
  const { farmerPhone: _farmerPhone, ...rest } = report;
  return rest;
}