import { z } from 'zod';
import { DiseaseSchema } from '@poultry/schemas';

export const SourceSpeciesSchema = z.enum([
  'broiler',
  'layer',
  'cockerel',
  'parent_stock',
  'poultry',
  'all',
]);

export type SourceSpecies = z.infer<typeof SourceSpeciesSchema>;

export const SectionKindSchema = z.enum([
  'disease_signs',
  'disease_treatment',
  'disease_prevention',
  'diagnosis',
  'drug_monograph',
  'antimicrobial_stewardship',
  'surveillance',
  'regulation',
  'other',
]);

export type SectionKind = z.infer<typeof SectionKindSchema>;

export const DocTypeSchema = z.enum([
  'disease_card',
  'journal_article',
  'drug_monograph',
  'guideline',
  'regulation',
  'other',
]);

export const SourceDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  docType: DocTypeSchema,
  year: z.number().int().min(1900).max(2100).optional(),
  url: z.string().url().optional(),
});

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

// The structured half of a region: what a retrieved chunk must be able to hand to
// ClinicalLadder once a prescriber brief is assembled. Prose alone cannot fill this.
export const TreatmentSchema = z.object({
  productClass: z.string().min(1),
  why: z.string().min(1),
  askTheSeller: z.array(z.string().min(1)).min(1),
  needsVet: z.boolean(),
  drugClass: z.string().min(1).optional(),
  withdrawalDays: z.number().int().min(0).optional(),
});

export type Treatment = z.infer<typeof TreatmentSchema>;

export const RegionSchema = z.object({
  heading: z.string().min(1),
  sectionKind: SectionKindSchema,
  species: z.array(SourceSpeciesSchema).min(1),
  diseases: z.array(DiseaseSchema).default([]),
  text: z.string().min(1),
  treatment: TreatmentSchema.optional(),
  pageHint: z.number().int().min(1).optional(),
});

export type Region = z.infer<typeof RegionSchema>;

export const RegionMapSchema = z.object({
  regions: z.array(RegionSchema),
});

export type RegionMap = z.infer<typeof RegionMapSchema>;

export const PageSchema = z.object({
  number: z.number().int().min(1),
  text: z.string().min(1),
});

export type Page = z.infer<typeof PageSchema>;

export const ChunkGroupSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  heading: z.string().min(1),
  sectionKind: SectionKindSchema,
  species: z.array(SourceSpeciesSchema).min(1),
  diseases: z.array(DiseaseSchema),
  treatment: TreatmentSchema.optional(),
  page: z.number().int().min(1),
  pageEnd: z.number().int().min(1),
  text: z.string().min(1),
});

export type ChunkGroup = z.infer<typeof ChunkGroupSchema>;

export const ChunkSchema = z
  .object({
    id: z.string().min(1),
    groupId: z.string().min(1),
    documentId: z.string().min(1),
    position: z.number().int().nonnegative(),
    text: z.string().min(1),
    heading: z.string().min(1),
    sectionKind: SectionKindSchema,
    species: z.array(SourceSpeciesSchema).min(1),
    diseases: z.array(DiseaseSchema),
    treatment: TreatmentSchema.optional(),
    page: z.number().int().min(1),
    pageEnd: z.number().int().min(1),
    tokenCount: z.number().int().nonnegative(),
    oversized: z.boolean(),
    // Denormalised so a Phase 5 top-k result can produce a citation without a second lookup.
    source: z.string().min(1),
    publisher: z.string().min(1),
    locator: z.string().min(1),
  })
  .refine((chunk) => chunk.pageEnd >= chunk.page, {
    message: 'pageEnd must not precede page',
    path: ['pageEnd'],
  });

export type Chunk = z.infer<typeof ChunkSchema>;

export const IngestedDocumentSchema = z.object({
  document: SourceDocumentSchema,
  pages: z.array(PageSchema),
  groups: z.array(ChunkGroupSchema),
  chunks: z.array(ChunkSchema),
  warnings: z.array(z.string()),
});

export type IngestedDocument = z.infer<typeof IngestedDocumentSchema>;
