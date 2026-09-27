import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';
import { BirdStageSchema, SpeciesSchema } from '../farmer/index.js';

export const CaseStatusSchema = z.enum(['in_progress', 'complete', 'escalated', 'void']);

export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const SymptomSchema = z.string().min(1);

export const DiseaseSchema = z.enum([
  'newcastle',
  'infectious_bronchitis',
  'gumboro',
  'fowlpox',
  'coccidiosis',
  'necrotic_enteritis',
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
  triageTurns: z.number().int().min(0).optional(),
  editedAt: DateTimeSchema.optional(),
});

export type CaseData = z.infer<typeof CaseSchema>;

export interface RedFlagRule {
  id: string;
  label: string;
  concepts: readonly (readonly string[])[];
}

export const RED_FLAG_RULES: readonly RedFlagRule[] = [
  {
    id: 'sudden_death',
    label: 'sudden death',
    concepts: [
      ['sudden', 'quick', 'fast'],
      ['die', 'deat', 'kill'],
    ],
  },
  { id: 'neck_sign', label: 'twisted or bent neck', concepts: [['neck']] },
  {
    id: 'head_swelling',
    label: 'swollen head or face',
    concepts: [
      ['swell', 'swoll'],
      ['head', 'face'],
    ],
  },
  {
    id: 'comb_discolouration',
    label: 'dark, blue or purple comb',
    concepts: [
      ['comb', 'wattl'],
      ['blue', 'dark', 'purpl', 'black', 'cyanot'],
    ],
  },
  {
    id: 'inability_to_stand',
    label: 'cannot stand or walk',
    concepts: [['paralys', 'stand', 'walk', 'craw']],
  },
  {
    id: 'wing_droop',
    label: 'drooping or hanging wing',
    concepts: [['wing'], ['hang', 'droop', 'limp', 'drop']],
  },
  { id: 'trembling', label: 'trembling or shaking', concepts: [['trembl', 'shak', 'shiver']] },
  {
    id: 'gasping',
    label: 'gasping or laboured breathing',
    concepts: [['gasp', 'pant', 'breath', 'respir']],
  },
];

const STOPWORDS = new Set([
  'a',
  'am',
  'an',
  'and',
  'are',
  'be',
  'but',
  'da',
  'de',
  'dem',
  'dey',
  'do',
  'don',
  'get',
  'i',
  'in',
  'is',
  'it',
  'na',
  'no',
  'of',
  'on',
  'or',
  'some',
  'the',
  'to',
  'we',
  'with',
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

function conceptMet(concept: readonly string[], tokens: readonly string[]): boolean {
  return concept.some((stem) =>
    tokens.some(
      (token) => token === stem || (token.startsWith(stem) && token.length - stem.length <= 3),
    ),
  );
}

export function matchesConcepts(
  symptoms: readonly string[] | undefined,
  concepts: readonly (readonly string[])[],
): boolean {
  if (symptoms === undefined || symptoms.length === 0) return false;
  return symptoms.some((symptom) => {
    const tokens = words(symptom);
    return concepts.every((concept) => conceptMet(concept, tokens));
  });
}

function ruleMatches(rule: RedFlagRule, symptoms: readonly string[]): boolean {
  return matchesConcepts(symptoms, rule.concepts);
}

export function redFlagsFor(c: CaseData): string[] {
  const symptoms = c.symptoms ?? [];
  if (symptoms.length === 0) return [];
  return RED_FLAG_RULES.filter((rule) => ruleMatches(rule, symptoms)).map((rule) => rule.id);
}

export function hasRedFlag(c: CaseData): boolean {
  return redFlagsFor(c).length > 0;
}
