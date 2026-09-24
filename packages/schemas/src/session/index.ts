import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';

export const SessionStatusSchema = z.enum(['open', 'completed', 'void']);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const CaseStatusSchema = z.enum(['in_progress', 'complete', 'escalated', 'void']);

export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const SessionStateSchema = z.object({
  caseId: UuidSchema.optional(),
  caseStatus: CaseStatusSchema,
  missing: z.array(z.string()),
  updatedAt: DateTimeSchema,
});

export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionSchema = z.object({
  id: UuidSchema,
  phone: z.string(),
  status: SessionStatusSchema,
  state: SessionStateSchema,
  startedAt: DateTimeSchema,
  lastActive: DateTimeSchema,
  caseId: UuidSchema.optional(),
});

export type Session = z.infer<typeof SessionSchema>;

const TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  open: ['completed', 'void'],
  completed: ['void'],
  void: [],
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionSession(status: SessionStatus, next: SessionStatus): SessionStatus {
  if (!canTransition(status, next)) {
    throw new Error(`invalid session transition: ${status} -> ${next}`);
  }
  return next;
}