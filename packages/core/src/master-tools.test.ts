import { describe, expect, it } from 'vitest';
import {
  checkSlice,
  findMasterTool,
  getCaseToolDef,
  getDiseaseHistoryToolDef,
  getMedicationHistoryToolDef,
  getRecentCasesToolDef,
  MASTER_TOOLS,
  withinSliceBudget,
} from './master-tools.js';

const UUID = '3f2a0a40-b6e0-4a90-9a63-85a8e8b4f4f1';

describe('MASTER_TOOLS', () => {
  it('exposes exactly the four agreed read tools', () => {
    expect(MASTER_TOOLS.map((t) => t.name)).toEqual([
      'get_disease_history',
      'get_recent_cases',
      'get_case',
      'get_medication_history',
    ]);
  });

  it('resolves tools by name and unknown names to undefined', () => {
    expect(findMasterTool('get_case')).toBe(getCaseToolDef);
    expect(findMasterTool('update_farm')).toBeUndefined();
  });

  it('describes every tool with a description and a positive token cap', () => {
    for (const def of MASTER_TOOLS) {
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.tokenCap).toBeGreaterThan(0);
    }
  });
});

describe('checkSlice', () => {
  it('accepts a valid disease history slice', () => {
    const check = checkSlice(getDiseaseHistoryToolDef, [
      { disease: 'newcastle', cases: 2, lastOnsetAt: '2026-01-05T10:00:00Z' },
    ]);
    expect(check.ok).toBe(true);
    expect(check.tokens).toBeGreaterThan(0);
  });

  it('rejects a slice that does not match its schema', () => {
    const check = checkSlice(getDiseaseHistoryToolDef, [{ disease: 'covid', cases: 1 }]);
    expect(check.ok).toBe(false);
  });

  it('accepts a valid case snapshot for the case tool', () => {
    expect(checkSlice(getCaseToolDef, { id: UUID, status: 'in_progress', species: 'broiler' }).ok).toBe(true);
  });

  it('rejects a disease history beyond the schema cap', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ disease: 'newcastle', cases: i + 1 }));
    expect(checkSlice(getDiseaseHistoryToolDef, rows).ok).toBe(false);
  });

  it('flags a schema-valid but oversized slice as over budget', () => {
    const huge = {
      id: UUID,
      status: 'in_progress',
      symptoms: Array.from({ length: 2000 }, () => 'coughing'),
    };
    expect(checkSlice(getCaseToolDef, huge).ok).toBe(true);
    expect(withinSliceBudget(getCaseToolDef, huge)).toBe(false);
  });
});

describe('withinSliceBudget', () => {
  it('accepts a small recent-cases list', () => {
    expect(withinSliceBudget(getRecentCasesToolDef, [{ id: UUID, status: 'complete' }])).toBe(true);
  });

  it('returns a valid empty result for a new farmer', () => {
    expect(withinSliceBudget(getDiseaseHistoryToolDef, [])).toBe(true);
    expect(withinSliceBudget(getMedicationHistoryToolDef, [])).toBe(true);
  });
});