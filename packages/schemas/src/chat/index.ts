import { z } from 'zod';
import { PhoneSchema } from '../phone/index.js';
import { CaseSchema } from '../case/index.js';

/**
 * The turn, as it crosses HTTP. The WhatsApp bridge is the first caller, and the
 * dashboard is the second, so the contract lives in schemas rather than in
 * `apps/api`: a bridge that guessed at the shape would be a bridge whose tests
 * prove nothing about the route.
 *
 * The case is a *snapshot*, not a promise. A caller sends what it believes the
 * session holds and the server resolves the truth from its own store, because a
 * client is not authoritative about a farmer's medical record. The stored
 * session always wins on any field it already carries.
 */
export const ChatRequestSchema = z
  .object({
    /** E.164. Local formats are rejected at the edge rather than normalized, so a bad caller fails visibly. */
    farmerPhone: PhoneSchema,
    sessionId: z.string().uuid().optional(),
    text: z.string().min(1).max(4000),
    history: z
      .array(
        z.object({
          role: z.enum(['farmer', 'agent']),
          text: z.string().min(1).max(4000),
        }),
      )
      .max(40)
      .default([]),
    notes: z.array(z.string().min(1).max(240)).max(12).default([]),
    stallCount: z.number().int().min(0).default(0),
    farmerContext: z.string().max(2000).optional(),
    /** Ignored when the server has a stored session; see the note above. */
    case: CaseSchema.optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  sessionId: z.string().uuid(),
  reply: z.string().min(1),
  /**
   * `collect` and `triage` are real outcomes a farmer experiences even though a
   * case never settles there, so the wire type includes them. Persisted cases
   * only ever record one of the four terminal doors.
   */
  door: z.enum(['collect', 'triage', 'resolve', 'supply', 'escalate', 'report']),
  caseStatus: CaseSchema.shape.status,
  replyLanguage: z.enum(['pidgin', 'english']),
  changed: z.array(z.string()),
  missing: z.array(z.string()),
  /** True when the model failed to answer and a coded reply was used instead. */
  fellBack: z.boolean(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ChatErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type ChatError = z.infer<typeof ChatErrorSchema>;
