import type {
  CaseSnapshot,
  DiseaseHistorySlice,
  Farmer,
  MedicationSlice,
  RecentCaseSlice,
} from '@poultry/schemas';

export interface MasterStore {
  profile(phone: string): Promise<Farmer | undefined>;
  openCase(phone: string): Promise<CaseSnapshot | undefined>;
  diseaseHistory(phone: string): Promise<readonly DiseaseHistorySlice[]>;
  recentCases(phone: string): Promise<readonly RecentCaseSlice[]>;
  caseById(id: string): Promise<CaseSnapshot | undefined>;
  medicationHistory(phone: string): Promise<readonly MedicationSlice[]>;
}

export interface MasterRecordSeed {
  farmers?: Record<string, Farmer>;
  openCases?: Record<string, CaseSnapshot>;
  cases?: Record<string, CaseSnapshot>;
  diseaseHistory?: Record<string, readonly DiseaseHistorySlice[]>;
  recentCases?: Record<string, readonly RecentCaseSlice[]>;
  medications?: Record<string, readonly MedicationSlice[]>;
}

export function inMemoryMasterStore(seed: MasterRecordSeed = {}): MasterStore {
  const farmers = new Map(Object.entries(seed.farmers ?? {}));
  const openCases = new Map(Object.entries(seed.openCases ?? {}));
  const cases = new Map(Object.entries(seed.cases ?? {}));
  const diseaseHistory = new Map(Object.entries(seed.diseaseHistory ?? {}));
  const recentCases = new Map(Object.entries(seed.recentCases ?? {}));
  const medications = new Map(Object.entries(seed.medications ?? {}));

  return {
    async profile(phone) {
      return farmers.get(phone) ?? undefined;
    },
    async openCase(phone) {
      return openCases.get(phone) ?? undefined;
    },
    async diseaseHistory(phone) {
      return diseaseHistory.get(phone) ?? [];
    },
    async recentCases(phone) {
      return recentCases.get(phone) ?? [];
    },
    async caseById(id) {
      return cases.get(id) ?? undefined;
    },
    async medicationHistory(phone) {
      return medications.get(phone) ?? [];
    },
  };
}