import { describe, expect, it } from 'vitest';
import type { CaseData } from '@poultry/schemas';
import { inMemoryDashboardStore } from './dashboard-store.js';

function fakeCase(overrides: Partial<CaseData> = {}): CaseData {
  return {
    species: 'broiler',
    breed: 'marshal',
    birdStage: 'finisher',
    onsetDays: 2,
    symptoms: ['diarrhoea', 'ruffled feathers'],
    mortalityCount: 5,
    farmSize: 500,
    state: 'Oyo',
    lga: 'Ibadan North',
    diseaseText: 'coccidiosis',
    diseaseHits: ['coccidiosis'],
    status: 'in_progress',
    ...overrides,
  };
}

describe('DashboardStore', () => {
  const SESSIONS = [
    {
      id: 'sess-1',
      phone: '+2348011111111',
      status: 'open',
      caseId: 'case-1',
      state: {
        case: fakeCase({ farmerName: 'Adebayo', symptoms: ['bloody stool'] }),
        history: [{ role: 'farmer' as const, text: 'my birds are sick' }],
        notes: ['flock of 500 broilers'],
      },
      startedAt: '2026-09-28T09:00:00.000Z',
      lastActive: '2026-09-28T09:30:00.000Z',
    },
    {
      id: 'sess-2',
      phone: '+2348022222222',
      status: 'completed',
      caseId: 'case-2',
      state: {
        case: fakeCase({
          status: 'complete',
          farmerName: 'Chioma',
          state: 'Ogun',
          lga: 'Abeokuta South',
          species: 'layer',
          diseaseHits: ['newcastle'],
          mortalityCount: 15,
        }),
      },
      startedAt: '2026-09-27T08:00:00.000Z',
      lastActive: '2026-09-27T08:45:00.000Z',
    },
  ];

  const FARMERS = [
    {
      phone: '+2348011111111',
      name: 'Adebayo',
      state: 'Oyo',
      lga: 'Ibadan North',
      farmSize: 500,
      species: 'broiler' as const,
      preferredLang: 'pidgin' as const,
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-28T09:00:00.000Z',
    },
  ];

  it('lists cases with total count and pagination', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS, farmers: FARMERS });
    const result = await store.listCases();

    expect(result.total).toBe(2);
    expect(result.cases.length).toBe(2);
    expect(result.cases[0]?.sessionId).toBe('sess-1');
    expect(result.cases[0]?.farmerName).toBe('Adebayo');
  });

  it('filters cases by state', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS });
    const result = await store.listCases({ state: 'Ogun' });

    expect(result.total).toBe(1);
    expect(result.cases[0]?.farmerName).toBe('Chioma');
  });

  it('filters cases by species', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS });
    const result = await store.listCases({ species: 'layer' });

    expect(result.total).toBe(1);
    expect(result.cases[0]?.sessionId).toBe('sess-2');
  });

  it('filters cases by status', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS });
    const result = await store.listCases({ status: 'completed' });

    expect(result.total).toBe(1);
    expect(result.cases[0]?.sessionId).toBe('sess-2');
  });

  it('retrieves full case detail by sessionId or caseId with farmer profile', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS, farmers: FARMERS });
    const detail = await store.getCase('sess-1');

    expect(detail).toBeDefined();
    expect(detail?.farmer?.name).toBe('Adebayo');
    expect(detail?.history.length).toBe(1);
    expect(detail?.notes).toContain('flock of 500 broilers');
  });

  it('returns undefined for non-existent case', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS });
    const detail = await store.getCase('non-existent');

    expect(detail).toBeUndefined();
  });

  it('generates anonymised surveillance reports without leaking phone numbers', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS });
    const reports = await store.listReports();

    expect(reports.total).toBe(2);
    expect(reports.reports[0]?.state).toBe('Oyo');
    // Ensure farmerPhone is excluded from the returned type and object
    expect('farmerPhone' in (reports.reports[0] ?? {})).toBe(false);
  });

  it('filters surveillance reports by disease', async () => {
    const store = inMemoryDashboardStore({ sessions: SESSIONS });
    const result = await store.listReports({ disease: 'newcastle' });

    expect(result.total).toBe(1);
    expect(result.reports[0]?.state).toBe('Ogun');
  });
});
