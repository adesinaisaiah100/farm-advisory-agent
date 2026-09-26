import { describe, expect, it } from 'vitest';
import type { CaseSnapshot, Farmer } from '@poultry/schemas';
import { inMemoryMasterStore, type MasterRecordSeed } from './master-store.js';

const UUID = '3f2a0a40-b6e0-4a90-9a63-85a8e8b4f4f1';
const PHONE = '+2348012345678';

const farmer: Farmer = {
  phone: PHONE,
  name: 'Adaeze',
  location: { lga: 'Jos North', state: 'Plateau' },
};

const openCase: CaseSnapshot = {
  id: UUID,
  species: 'broiler',
  status: 'in_progress',
};

describe('inMemoryMasterStore', () => {
  function store(seed: MasterRecordSeed = {}) {
    return inMemoryMasterStore({
      farmers: { [PHONE]: farmer },
      openCases: { [PHONE]: openCase },
      cases: { [UUID]: openCase },
      ...seed,
    });
  }

  it('returns a known farmer profile and none for an unknown phone', async () => {
    const db = store();
    expect((await db.profile(PHONE))?.name).toBe('Adaeze');
    expect(await db.profile('+2347011112222')).toBeUndefined();
  });

  it('returns the open episode for the phone key', async () => {
    const db = store();
    expect((await db.openCase(PHONE))?.id).toBe(UUID);
  });

  it('resolves cases by id', async () => {
    const db = store();
    expect((await db.caseById(UUID))?.status).toBe('in_progress');
    expect(await db.caseById('00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });

  it('returns empty slices for farmers without history', async () => {
    const db = store();
    expect(await db.diseaseHistory(PHONE)).toEqual([]);
    expect(await db.recentCases(PHONE)).toEqual([]);
    expect(await db.medicationHistory(PHONE)).toEqual([]);
  });
});