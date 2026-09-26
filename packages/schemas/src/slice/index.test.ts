import { describe, expect, it } from 'vitest';
import {
  CaseSnapshotSchema,
  DiseaseHistoryListSchema,
  DiseaseHistorySliceSchema,
  MedicationListSchema,
  MedicationSliceSchema,
  RecentCaseSliceSchema,
  RecentCasesListSchema,
} from './index.js';

const UUID = '3f2a0a40-b6e0-4a90-9a63-85a8e8b4f4f1';

describe('DiseaseHistorySliceSchema', () => {
  it('accepts a counted disease row', () => {
    expect(
      DiseaseHistorySliceSchema.safeParse({ disease: 'newcastle', cases: 3, lastOnsetAt: '2026-01-05T10:00:00Z' })
        .success,
    ).toBe(true);
  });

  it('rejects a row without a known disease', () => {
    expect(DiseaseHistorySliceSchema.safeParse({ disease: 'covid', cases: 1 }).success).toBe(false);
  });

  it('rejects a zero count', () => {
    expect(DiseaseHistorySliceSchema.safeParse({ disease: 'coccidiosis', cases: 0 }).success).toBe(false);
  });
});

describe('RecentCaseSliceSchema', () => {
  it('accepts a closed case row', () => {
    expect(
      RecentCaseSliceSchema.safeParse({
        id: UUID,
        diseaseText: 'coccidiosis',
        status: 'complete',
        closedAt: '2026-01-05T10:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('rejects a row without an id', () => {
    expect(RecentCaseSliceSchema.safeParse({ status: 'complete' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(RecentCaseSliceSchema.safeParse({ id: UUID, status: 'open' }).success).toBe(false);
  });
});

describe('CaseSnapshotSchema', () => {
  it('requires the case id', () => {
    expect(CaseSnapshotSchema.safeParse({ status: 'complete' }).success).toBe(false);
  });

  it('accepts a full structured case with id', () => {
    expect(
      CaseSnapshotSchema.safeParse({
        id: UUID,
        species: 'broiler',
        symptoms: ['blood in droppings'],
        diseaseText: 'coccidiosis',
        status: 'in_progress',
      }).success,
    ).toBe(true);
  });
});

describe('MedicationSliceSchema', () => {
  it('accepts a medication record', () => {
    expect(
      MedicationSliceSchema.safeParse({
        caseId: UUID,
        medication: 'amprolium',
        note: 'gavo for 5 days',
      }).success,
    ).toBe(true);
  });

  it('rejects a record without a medication name', () => {
    expect(MedicationSliceSchema.safeParse({ caseId: UUID }).success).toBe(false);
  });
});

describe('master-record slice lists', () => {
  it('caps disease history rows at 20', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ disease: 'newcastle', cases: i + 1 }));
    expect(DiseaseHistoryListSchema.safeParse(rows).success).toBe(false);
    expect(DiseaseHistoryListSchema.safeParse(rows.slice(0, 20)).success).toBe(true);
  });

  it('caps recent cases at 10', () => {
    const rows = Array.from({ length: 11 }, () => ({ id: UUID, status: 'complete' }));
    expect(RecentCasesListSchema.safeParse(rows).success).toBe(false);
  });

  it('caps medication history at 30', () => {
    const rows = Array.from({ length: 31 }, () => ({ caseId: UUID, medication: 'amprolium' }));
    expect(MedicationListSchema.safeParse(rows).success).toBe(false);
  });

  it('accepts an empty list (a new farmer has no history)', () => {
    expect(DiseaseHistoryListSchema.safeParse([]).success).toBe(true);
    expect(RecentCasesListSchema.safeParse([]).success).toBe(true);
    expect(MedicationListSchema.safeParse([]).success).toBe(true);
  });
});