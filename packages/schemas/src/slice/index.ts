import { z } from 'zod';
import { CaseSchema, CaseStatusSchema, DiseaseSchema } from '../case/index.js';
import { SpeciesSchema } from '../farmer/index.js';
import { DateTimeSchema, UuidSchema } from '../common.js';

export const DiseaseHistorySliceSchema = z.object({
  disease: DiseaseSchema,
  cases: z.number().int().min(1),
  lastOnsetAt: DateTimeSchema.optional(),
});

export type DiseaseHistorySlice = z.infer<typeof DiseaseHistorySliceSchema>;

export const RecentCaseSliceSchema = z.object({
  id: UuidSchema,
  diseaseText: z.string().min(1).max(120).optional(),
  species: SpeciesSchema.optional(),
  status: CaseStatusSchema,
  closedAt: DateTimeSchema.optional(),
});

export type RecentCaseSlice = z.infer<typeof RecentCaseSliceSchema>;

export const CaseSnapshotSchema = CaseSchema.extend({ id: UuidSchema });

export type CaseSnapshot = z.infer<typeof CaseSnapshotSchema>;

export const MedicationSliceSchema = z.object({
  caseId: UuidSchema,
  medication: z.string().min(1).max(120),
  givenAt: DateTimeSchema.optional(),
  note: z.string().min(1).max(240).optional(),
});

export type MedicationSlice = z.infer<typeof MedicationSliceSchema>;

export const DiseaseHistoryListSchema = z.array(DiseaseHistorySliceSchema).max(20);
export const RecentCasesListSchema = z.array(RecentCaseSliceSchema).max(10);
export const MedicationListSchema = z.array(MedicationSliceSchema).max(30);