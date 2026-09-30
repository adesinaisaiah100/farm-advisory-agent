import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCases } from './api.js';

describe('Web API Longitudinal Farmer Grouping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups multiple consultation sessions from the same phone number into one farmer profile', async () => {
    const rawSessionsFromApi = {
      cases: [
        {
          sessionId: 'sess_001',
          caseId: 'case_001',
          phone: '+2348011111111',
          farmerName: 'Adebayo Alabi',
          state: 'Oyo',
          lga: 'Ibadan North',
          species: 'Broilers',
          farmSize: 500,
          symptoms: ['mild cough'],
          mortalityCount: 0,
          status: 'completed',
          startedAt: '2026-09-20T08:00:00.000Z',
          lastActive: '2026-09-20T09:00:00.000Z'
        },
        {
          sessionId: 'sess_002',
          caseId: 'case_002',
          phone: '+2348011111111',
          farmerName: 'Adebayo Alabi',
          state: 'Oyo',
          lga: 'Ibadan North',
          species: 'Broilers',
          farmSize: 500,
          symptoms: ['bloody diarrhoea', 'sudden death'],
          mortalityCount: 6,
          status: 'in_progress',
          startedAt: '2026-09-30T10:00:00.000Z',
          lastActive: '2026-09-30T10:30:00.000Z'
        },
        {
          sessionId: 'sess_003',
          caseId: 'case_003',
          phone: '+2348099999999',
          farmerName: 'Chioma Okon',
          state: 'Ogun',
          lga: 'Abeokuta South',
          species: 'Layers',
          farmSize: 1200,
          symptoms: ['soft egg shells'],
          mortalityCount: 0,
          status: 'in_progress',
          startedAt: '2026-09-29T11:00:00.000Z',
          lastActive: '2026-09-29T11:45:00.000Z'
        }
      ]
    };

    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => rawSessionsFromApi
    }));

    const result = await fetchCases();

    // 3 raw sessions, but only 2 unique farmers!
    expect(result.length).toBe(2);

    const adebayo = result.find(c => c.farmer === 'Adebayo Alabi');
    expect(adebayo).toBeDefined();
    expect(adebayo?.sessionCount).toBe(2);
    expect(adebayo?.sessions?.length).toBe(2);

    // Latest session should be the primary display
    expect(adebayo?.id).toBe('case_002');
    expect(adebayo?.mortality).toBe(6);
    expect(adebayo?.criticality).toBe('critical');

    // Chioma should have 1 session
    const chioma = result.find(c => c.farmer === 'Chioma Okon');
    expect(chioma).toBeDefined();
    expect(chioma?.sessionCount).toBe(1);
    expect(chioma?.sessions?.length).toBe(1);
  });
});
