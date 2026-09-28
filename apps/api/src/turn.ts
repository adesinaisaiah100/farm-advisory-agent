import type { ChatRequest, SessionState } from '@poultry/schemas';
import { ChatRequestSchema } from '@poultry/schemas';
import { newSession, runTurn } from '@poultry/core';
import type { SessionStore, TurnDeps, TurnResult } from '@poultry/core';
import { LlmError } from '@poultry/core';

/**
 * The turn, as a function with no HTTP in it. The route is a thin adapter over
 * this, so the whole request-to-reply path is testable by calling one function
 * and the fake-driven four-door test in `PHASES.md` has something real to point
 * at.
 */
export interface TurnServiceDeps {
  readonly store: SessionStore;
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

export async function handleChat(
  body: unknown,
  deps: TurnServiceDeps,
): Promise<TurnOutcome> {
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new RequestError(400, 'invalid_request', zodMessage(parsed.error));
  }
  const request: ChatRequest = parsed.data;

  const existing = await deps.store.openSession(request.farmerPhone);

  // A stored case always wins over a client-sent one. The bridge holds a
  // snapshot it may have read before another turn landed, and silently letting a
  // stale client overwrite a farmer's recorded case is data loss, not a merge.
  const stored = existing?.state;
  const caseData = stored?.case ?? request.case ?? { status: 'in_progress' };
  const notes = stored?.notes ?? request.notes;
  const stallCount = stored?.stallCount ?? request.stallCount;

  let result: TurnResult;
  try {
    result = await runTurn(
      {
        case: caseData,
        notes,
        stallCount,
        farmerContext: request.farmerContext,
        query: request.text,
        history: request.history,
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
  const state: SessionState = { ...result.state, case: { ...result.state.case, id: caseId } };

  const session = existing ?? newSession(request.farmerPhone, state, {
    now: deps.now,
    newId: deps.newId,
  });

  await deps.store.save({ ...session, state, lastActive: deps.now().toISOString(), caseId });

  const status = result.state.case.status;
  if (status === 'complete') {
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
