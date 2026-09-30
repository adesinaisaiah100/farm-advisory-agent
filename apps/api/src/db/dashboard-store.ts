import { desc, eq, or } from 'drizzle-orm';
import type { CaseData, FarmerProfile, SurveillanceReport, TurnMessage } from '@poultry/schemas';
import type { ApiDatabase } from './client.js';
import { farmers, sessions } from './schema.js';

export interface CaseSummary {
  readonly sessionId: string;
  readonly caseId?: string;
  readonly phone: string;
  readonly farmerName?: string;
  readonly state?: string;
  readonly lga?: string;
  readonly species?: string;
  readonly breed?: string;
  readonly birdStage?: string;
  readonly farmSize?: number;
  readonly flockAgeWeeks?: number;
  readonly symptoms: readonly string[];
  readonly onsetDays?: number;
  readonly mortalityCount?: number;
  readonly mortalityRatePct?: number;
  readonly diseaseHits: readonly string[];
  readonly diseaseText?: string;
  readonly needsConfirmation: readonly string[];
  readonly status: string;
  readonly door?: string;
  readonly triageTurns?: number;
  readonly startedAt: string;
  readonly lastActive: string;
}

export interface CaseDetail {
  readonly sessionId: string;
  readonly caseId?: string;
  readonly phone: string;
  readonly case: CaseData;
  readonly farmer?: FarmerProfile;
  readonly history: readonly TurnMessage[];
  readonly notes: readonly string[];
  readonly startedAt: string;
  readonly lastActive: string;
}

export interface CaseFilter {
  readonly status?: string;
  readonly state?: string;
  readonly lga?: string;
  readonly species?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ReportFilter {
  readonly state?: string;
  readonly lga?: string;
  readonly disease?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export type AnonymisedReport = Omit<SurveillanceReport, 'farmerPhone'>;

export interface DashboardStore {
  listCases(filter?: CaseFilter): Promise<{
    cases: readonly CaseSummary[];
    total: number;
    limit: number;
    offset: number;
  }>;
  getCase(id: string): Promise<CaseDetail | undefined>;
  listReports(filter?: ReportFilter): Promise<{
    reports: readonly AnonymisedReport[];
    total: number;
    limit: number;
    offset: number;
  }>;
}

function rowToSummary(row: {
  id: string;
  phone: string;
  status: string;
  caseId: string | null;
  state: { case?: Partial<CaseData> };
  startedAt: Date;
  lastActive: Date;
}): CaseSummary {
  const c = row.state?.case ?? {};
  return {
    sessionId: row.id,
    caseId: row.caseId ?? c.id,
    phone: row.phone,
    farmerName: c.farmerName,
    state: c.state,
    lga: c.lga,
    species: c.species,
    breed: c.breed,
    birdStage: c.birdStage,
    farmSize: c.farmSize,
    flockAgeWeeks: c.flockAgeWeeks,
    symptoms: c.symptoms ?? [],
    onsetDays: c.onsetDays,
    mortalityCount: c.mortalityCount,
    mortalityRatePct: c.mortalityRatePct,
    diseaseHits: c.diseaseHits ?? [],
    diseaseText: c.diseaseText,
    needsConfirmation: c.needsConfirmation ?? [],
    status: c.status ?? row.status,
    door: c.door,
    triageTurns: c.triageTurns,
    startedAt: row.startedAt.toISOString(),
    lastActive: row.lastActive.toISOString(),
  };
}

export function postgresDashboardStore(db: ApiDatabase): DashboardStore {
  return {
    async listCases(filter) {
      const rows = await db
        .select()
        .from(sessions)
        .orderBy(desc(sessions.lastActive));

      let matched = rows.map((r) => rowToSummary(r as never));

      if (filter?.status !== undefined && filter.status.trim().length > 0) {
        const s = filter.status.trim().toLowerCase();
        matched = matched.filter((c) => {
          const st = c.status.toLowerCase();
          return st === s || (s === 'completed' && st === 'complete') || (s === 'complete' && st === 'completed');
        });
      }
      if (filter?.state !== undefined && filter.state.trim().length > 0) {
        const st = filter.state.trim().toLowerCase();
        matched = matched.filter((c) => c.state?.toLowerCase() === st);
      }
      if (filter?.lga !== undefined && filter.lga.trim().length > 0) {
        const l = filter.lga.trim().toLowerCase();
        matched = matched.filter((c) => c.lga?.toLowerCase() === l);
      }
      if (filter?.species !== undefined && filter.species.trim().length > 0) {
        const sp = filter.species.trim().toLowerCase();
        matched = matched.filter((c) => c.species?.toLowerCase() === sp);
      }

      const total = matched.length;
      const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
      const offset = Math.max(filter?.offset ?? 0, 0);
      const cases = matched.slice(offset, offset + limit);

      return { cases, total, limit, offset };
    },

    async getCase(id) {
      const sessionRows = await db
        .select()
        .from(sessions)
        .where(or(eq(sessions.id, id), eq(sessions.caseId, id)))
        .limit(1);

      const session = sessionRows[0];
      if (session === undefined) return undefined;

      const farmerRows = await db
        .select()
        .from(farmers)
        .where(eq(farmers.phone, session.phone))
        .limit(1);

      const farmerRow = farmerRows[0];
      const farmer: FarmerProfile | undefined =
        farmerRow !== undefined
          ? {
              phone: farmerRow.phone,
              name: farmerRow.name ?? undefined,
              state: farmerRow.state ?? undefined,
              lga: farmerRow.lga ?? undefined,
              farmSize: farmerRow.farmSize ?? undefined,
              species: (farmerRow.species as FarmerProfile['species']) ?? undefined,
              preferredLang: (farmerRow.preferredLang as FarmerProfile['preferredLang']) ?? undefined,
              createdAt: farmerRow.createdAt.toISOString(),
              updatedAt: farmerRow.updatedAt.toISOString(),
            }
          : undefined;

      const state = session.state as {
        case: CaseData;
        history?: TurnMessage[];
        notes?: string[];
      };

      return {
        sessionId: session.id,
        caseId: session.caseId ?? state.case?.id,
        phone: session.phone,
        case: state.case,
        farmer,
        history: state.history ?? [],
        notes: state.notes ?? [],
        startedAt: session.startedAt.toISOString(),
        lastActive: session.lastActive.toISOString(),
      };
    },

    async listReports(filter) {
      const rows = await db
        .select()
        .from(sessions)
        .orderBy(desc(sessions.startedAt));

      const reportable = rows.filter((r) => {
        const c = (r.state as { case?: CaseData })?.case;
        if (c === undefined) return false;
        return (
          (c.symptoms !== undefined && c.symptoms.length > 0) ||
          (c.diseaseHits !== undefined && c.diseaseHits.length > 0) ||
          (c.mortalityCount !== undefined && c.mortalityCount > 0)
        );
      });

      let mapped: AnonymisedReport[] = reportable.map((r) => {
        const c = (r.state as { case: CaseData }).case;
        return {
          id: c.id ?? r.id,
          sessionId: r.id,
          caseId: r.caseId ?? c.id,
          state: c.state,
          lga: c.lga,
          species: c.species,
          farmSize: c.farmSize,
          symptoms: c.symptoms,
          diseaseHits: c.diseaseHits,
          mortalityCount: c.mortalityCount,
          createdAt: r.startedAt.toISOString(),
        };
      });

      if (filter?.state !== undefined && filter.state.trim().length > 0) {
        const st = filter.state.trim().toLowerCase();
        mapped = mapped.filter((rep) => rep.state?.toLowerCase() === st);
      }
      if (filter?.lga !== undefined && filter.lga.trim().length > 0) {
        const l = filter.lga.trim().toLowerCase();
        mapped = mapped.filter((rep) => rep.lga?.toLowerCase() === l);
      }
      if (filter?.disease !== undefined && filter.disease.trim().length > 0) {
        const d = filter.disease.trim().toLowerCase();
        mapped = mapped.filter((rep) => rep.diseaseHits?.some((h) => h.toLowerCase() === d));
      }

      const total = mapped.length;
      const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
      const offset = Math.max(filter?.offset ?? 0, 0);
      const reports = mapped.slice(offset, offset + limit);

      return { reports, total, limit, offset };
    },
  };
}

export function inMemoryDashboardStore(initial: {
  sessions?: readonly {
    id: string;
    phone: string;
    status: string;
    caseId?: string;
    state: { case: CaseData; history?: TurnMessage[]; notes?: string[] };
    startedAt: string;
    lastActive: string;
  }[];
  farmers?: readonly FarmerProfile[];
} = {}): DashboardStore {
  const sessionList = [...(initial.sessions ?? [])];
  const farmerList = [...(initial.farmers ?? [])];

  return {
    async listCases(filter) {
      let matched = sessionList.map((s) => {
        const c = s.state.case;
        return {
          sessionId: s.id,
          caseId: s.caseId ?? c.id,
          phone: s.phone,
          farmerName: c.farmerName,
          state: c.state,
          lga: c.lga,
          species: c.species,
          breed: c.breed,
          birdStage: c.birdStage,
          farmSize: c.farmSize,
          flockAgeWeeks: c.flockAgeWeeks,
          symptoms: c.symptoms ?? [],
          onsetDays: c.onsetDays,
          mortalityCount: c.mortalityCount,
          mortalityRatePct: c.mortalityRatePct,
          diseaseHits: c.diseaseHits ?? [],
          diseaseText: c.diseaseText,
          needsConfirmation: c.needsConfirmation ?? [],
          status: c.status ?? s.status,
          door: c.door,
          triageTurns: c.triageTurns,
          startedAt: s.startedAt,
          lastActive: s.lastActive,
        };
      });

      if (filter?.status !== undefined && filter.status.trim().length > 0) {
        const s = filter.status.trim().toLowerCase();
        matched = matched.filter((c) => {
          const st = c.status.toLowerCase();
          return st === s || (s === 'completed' && st === 'complete') || (s === 'complete' && st === 'completed');
        });
      }
      if (filter?.state !== undefined && filter.state.trim().length > 0) {
        const st = filter.state.trim().toLowerCase();
        matched = matched.filter((c) => c.state?.toLowerCase() === st);
      }
      if (filter?.lga !== undefined && filter.lga.trim().length > 0) {
        const l = filter.lga.trim().toLowerCase();
        matched = matched.filter((c) => c.lga?.toLowerCase() === l);
      }
      if (filter?.species !== undefined && filter.species.trim().length > 0) {
        const sp = filter.species.trim().toLowerCase();
        matched = matched.filter((c) => c.species?.toLowerCase() === sp);
      }

      const total = matched.length;
      const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
      const offset = Math.max(filter?.offset ?? 0, 0);
      const cases = matched.slice(offset, offset + limit);

      return { cases, total, limit, offset };
    },

    async getCase(id) {
      const session = sessionList.find((s) => s.id === id || s.caseId === id || s.state.case.id === id);
      if (session === undefined) return undefined;

      const farmer = farmerList.find((f) => f.phone === session.phone);
      return {
        sessionId: session.id,
        caseId: session.caseId ?? session.state.case.id,
        phone: session.phone,
        case: session.state.case,
        farmer,
        history: session.state.history ?? [],
        notes: session.state.notes ?? [],
        startedAt: session.startedAt,
        lastActive: session.lastActive,
      };
    },

    async listReports(filter) {
      const reportable = sessionList.filter((s) => {
        const c = s.state.case;
        return (
          (c.symptoms !== undefined && c.symptoms.length > 0) ||
          (c.diseaseHits !== undefined && c.diseaseHits.length > 0) ||
          (c.mortalityCount !== undefined && c.mortalityCount > 0)
        );
      });

      let mapped: AnonymisedReport[] = reportable.map((s) => {
        const c = s.state.case;
        return {
          id: c.id ?? s.id,
          sessionId: s.id,
          caseId: s.caseId ?? c.id,
          state: c.state,
          lga: c.lga,
          species: c.species,
          farmSize: c.farmSize,
          symptoms: c.symptoms,
          diseaseHits: c.diseaseHits,
          mortalityCount: c.mortalityCount,
          createdAt: s.startedAt,
        };
      });

      if (filter?.state !== undefined && filter.state.trim().length > 0) {
        const st = filter.state.trim().toLowerCase();
        mapped = mapped.filter((rep) => rep.state?.toLowerCase() === st);
      }
      if (filter?.lga !== undefined && filter.lga.trim().length > 0) {
        const l = filter.lga.trim().toLowerCase();
        mapped = mapped.filter((rep) => rep.lga?.toLowerCase() === l);
      }
      if (filter?.disease !== undefined && filter.disease.trim().length > 0) {
        const d = filter.disease.trim().toLowerCase();
        mapped = mapped.filter((rep) => rep.diseaseHits?.some((h) => h.toLowerCase() === d));
      }

      const total = mapped.length;
      const limit = Math.min(Math.max(filter?.limit ?? 50, 1), 100);
      const offset = Math.max(filter?.offset ?? 0, 0);
      const reports = mapped.slice(offset, offset + limit);

      return { reports, total, limit, offset };
    },
  };
}
