import { z } from 'zod';
import {
  CaseSnapshotSchema,
  DiseaseHistoryListSchema,
  MedicationListSchema,
  RecentCasesListSchema,
  UuidSchema,
} from '@poultry/schemas';

export interface MasterToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  tokenCap: number;
}

export const getDiseaseHistoryToolDef: MasterToolDef = {
  name: 'get_disease_history',
  description: 'Past disease diagnoses for this farmer, most recent first; empty for a new farmer.',
  inputSchema: z.object({}),
  outputSchema: DiseaseHistoryListSchema,
  tokenCap: 300,
};

export const getRecentCasesToolDef: MasterToolDef = {
  name: 'get_recent_cases',
  description: "This farmer's most recent case episodes, newest first; empty for a new farmer.",
  inputSchema: z.object({ n: z.number().int().min(1).max(10).optional() }),
  outputSchema: RecentCasesListSchema,
  tokenCap: 300,
};

export const getCaseToolDef: MasterToolDef = {
  name: 'get_case',
  description: 'One case episode by id, full structured view.',
  inputSchema: z.object({ id: UuidSchema }),
  outputSchema: CaseSnapshotSchema,
  tokenCap: 400,
};

export const getMedicationHistoryToolDef: MasterToolDef = {
  name: 'get_medication_history',
  description: 'Medications and treatments this farmer reported, newest first; empty if none.',
  inputSchema: z.object({}),
  outputSchema: MedicationListSchema,
  tokenCap: 400,
};

export const MASTER_TOOLS: readonly MasterToolDef[] = [
  getDiseaseHistoryToolDef,
  getRecentCasesToolDef,
  getCaseToolDef,
  getMedicationHistoryToolDef,
];

export function findMasterTool(name: string): MasterToolDef | undefined {
  return MASTER_TOOLS.find((t) => t.name === name);
}

export function estimateSliceTokens(raw: unknown): number {
  const text = JSON.stringify(raw);
  return text === undefined ? 0 : Math.ceil(text.length / 4);
}

export interface SliceCheck {
  ok: boolean;
  tokens: number;
}

export function checkSlice(def: MasterToolDef, raw: unknown): SliceCheck {
  const parsed = def.outputSchema.safeParse(raw);
  return { ok: parsed.success, tokens: estimateSliceTokens(raw) };
}

export function withinSliceBudget(def: MasterToolDef, raw: unknown): boolean {
  const check = checkSlice(def, raw);
  return check.ok && check.tokens <= def.tokenCap;
}