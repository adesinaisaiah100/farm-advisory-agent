import type { CaseData, ChatRequest, SessionState, Species } from '@poultry/schemas';
import { ChatRequestSchema } from '@poultry/schemas';
import { newSession, runTurn } from '@poultry/core';
import type { SessionStore, TurnDeps, TurnResult } from '@poultry/core';
import { LlmError } from '@poultry/core';
import type { FarmerStore } from './db/farmer-store.js';

/**
 * The turn, as a function with no HTTP in it. The route is a thin adapter over
 * this, so the whole request-to-reply path is testable by calling one function
 * and the fake-driven four-door test in `PHASES.md` has something real to point
 * at.
 */
export interface TurnServiceDeps {
  readonly store: SessionStore;
  readonly farmerStore?: FarmerStore;
  readonly turn: TurnDeps;
  readonly newId: () => string;
  readonly now: () => Date;
}

export interface TurnOutcome {
  readonly sessionId: string;
  readonly result: TurnResult;
  /**
   * True when the model did not answer and the orchestrator used a coded reply.
   * The route turns this into an HTTP header, because a silent fallback is how
   * a broken deployment looks like a working one.
   */
  readonly fellBack: boolean;
}

export const CONTINUITY_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function handleChat(
  body: unknown,
  deps: TurnServiceDeps,
): Promise<TurnOutcome> {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new RequestError(400, 'invalid_request', zodMessage(parsed.error));
  }
  const request: ChatRequest = parsed.data;

  const farmer = await deps.farmerStore?.getFarmer(request.farmerPhone);

  let existing = await deps.store.openSession(request.farmerPhone);
  let inheritedCase: Partial<CaseData> = {};

  if (farmer) {
    inheritedCase = {
      farmerName: farmer.name ?? undefined,
      lga: farmer.lga ?? undefined,
      state: farmer.state ?? undefined,
      farmSize: farmer.farmSize ?? undefined,
      species: (farmer.species as Species) ?? undefined,
    };
  }

  if (!existing && deps.store.latestSession) {
    const latest = await deps.store.latestSession(request.farmerPhone);
    if (latest) {
      const lastActiveMs = new Date(latest.lastActive).getTime();
      const nowMs = deps.now().getTime();
      const elapsedMs = nowMs - lastActiveMs;

      if (elapsedMs <= CONTINUITY_WINDOW_MS && latest.status !== 'void') {
        // Within 4-hour window: Reopen this exact consultation!
        existing = {
          ...latest,
          status: 'open',
          lastActive: deps.now().toISOString(),
        };
      } else if (!farmer) {
        // Outside 4-hour window and no permanent profile: inherit from previous case
        const prevCase = latest.state.case;
        inheritedCase = {
          farmerName: prevCase.farmerName,
          lga: prevCase.lga,
          state: prevCase.state,
          farmSize: prevCase.farmSize,
          species: prevCase.species,
        };
      }
    }
  }

  // Format farmerContext for LLM if farmer is known
  let farmerContext = request.farmerContext;
  if (!farmerContext && (farmer?.name || inheritedCase.farmerName)) {
    const name = farmer?.name ?? inheritedCase.farmerName;
    const loc = [farmer?.lga ?? inheritedCase.lga, farmer?.state ?? inheritedCase.state].filter(Boolean).join(', ');
    const flock = [farmer?.farmSize ?? inheritedCase.farmSize, farmer?.species ?? inheritedCase.species ?? 'birds'].filter(Boolean).join(' ');
    farmerContext = `${name}${loc ? ` · ${loc}` : ''}${flock ? ` · ${flock}` : ''} · returning farmer`;
  }

  // A stored case always wins over a client-sent one. The bridge holds a
  // snapshot it may have read before another turn landed, and silently letting a
  // stale client overwrite a farmer's recorded case is data loss, not a merge.
  const stored = existing?.state;
  const caseData = stored?.case ?? {
    ...inheritedCase,
    ...(request.case ?? {}),
    status: 'in_progress',
  };
  const notes = stored?.notes ?? request.notes;
  const stallCount = stored?.stallCount ?? request.stallCount;
  const history = stored?.history && stored.history.length > 0 ? stored.history : (request.history ?? []);

  let result: TurnResult;
  try {
    result = await runTurn(
      {
        case: caseData,
        notes,
        stallCount,
        farmerContext,
        query: request.text,
        history,
      },
      deps.turn,
    );
  } catch (cause) {
    if (cause instanceof LlmError) {
      // A model fault is a 502, not a 500: the request was valid and the caller
      // should retry it. A coded fallback reply is the right answer to a model
      // that *answered badly*, which `runTurn` already handles internally, so
      // reaching here means the model never answered at all.
      throw new RequestError(502, 'model_unavailable', cause.message);
    }
    throw cause;
  }

  // Nothing in `core` mints a case id, because `runTurn` is pure and has no id
  // generator to reach for. But `ReportSchema.caseId` and the dashboard both hang
  // off it, so the turn is where identity is assigned rather than in a store the
  // case is never written to.
  const caseId = result.state.case.id ?? deps.newId();

  // Accumulate rolling history (preserve last 12 messages = 6 turns)
  const updatedHistory = [
    ...history,
    { role: 'farmer' as const, text: request.text },
    { role: 'agent' as const, text: result.reply },
  ].slice(-12);

  const state: SessionState = {
    ...result.state,
    history: updatedHistory,
    case: { ...result.state.case, id: caseId },
  };

  const session = existing ?? newSession(request.farmerPhone, state, {
    now: deps.now,
    newId: deps.newId,
  });

  await deps.store.save({ ...session, state, lastActive: deps.now().toISOString(), caseId });

  // Upsert extracted farmer facts into permanent farmer store
  const updatedCase = result.state.case;
  if (
    deps.farmerStore &&
    (updatedCase.farmerName || updatedCase.lga || updatedCase.state || updatedCase.farmSize || updatedCase.species)
  ) {
    await deps.farmerStore.upsertFarmer({
      phone: request.farmerPhone,
      name: updatedCase.farmerName,
      lga: updatedCase.lga,
      state: updatedCase.state,
      farmSize: updatedCase.farmSize,
      species: updatedCase.species,
    });
  }

  // Do not abruptly close on status === 'complete'! The farmer may have follow-ups,
  // additional symptoms, or questions. Close only when the farmer explicitly expresses
  // relief/closure or when the case is escalated/void.
  const isRelieved = result.state.case.farmerRelieved === true;
  const status = result.state.case.status;
  if (isRelieved) {
    await deps.store.close(request.farmerPhone, 'completed');
  } else if (status === 'escalated' || status === 'void') {
    await deps.store.close(request.farmerPhone, 'void');
  }

  return { sessionId: session.id, result: { ...result, state }, fellBack: result.fellBack };
}

export type RequestStatus = 400 | 404 | 409 | 429 | 500 | 502 | 503;

export class RequestError extends Error {
  readonly status: RequestStatus;
  readonly code: string;

  constructor(status: RequestStatus, code: string, message: string) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
  }
}

function zodMessage(error: { issues: readonly { path: readonly (string | number)[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : 'body'}: ${issue.message}`)
    .join('; ');
}
