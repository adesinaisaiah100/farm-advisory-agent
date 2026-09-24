import { z } from 'zod';
import { DateTimeSchema, UuidSchema } from '../common.js';
import { PhoneSchema } from '../phone/index.js';
import { normalizePhone } from '../phone/index.js';

export const MediaKindSchema = z.enum(['audio', 'image', 'video', 'document']);

export type MediaKind = z.infer<typeof MediaKindSchema>;

export const MediaAttachmentSchema = z.object({
  url: z.string().url(),
  kind: MediaKindSchema,
  mime: z.string().min(1),
});

export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

export const InboundMessageSchema = z
  .object({
    id: UuidSchema,
    from: PhoneSchema,
    to: PhoneSchema,
    text: z.string().min(1).optional(),
    media: MediaAttachmentSchema.optional(),
    receivedAt: DateTimeSchema,
  })
  .refine((m) => m.text !== undefined || m.media !== undefined, {
    message: 'message must carry text or media',
  });

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

export const MessageSenderSchema = z.enum(['farmer', 'agent']);

export type MessageSender = z.infer<typeof MessageSenderSchema>;

export const MessageSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  waMsgId: z.string().optional(),
  sender: MessageSenderSchema,
  payload: z.string(),
  sentAt: DateTimeSchema,
});

export type Message = z.infer<typeof MessageSchema>;

export function normalizeMessage(msg: InboundMessage): InboundMessage {
  return {
    ...msg,
    from: normalizePhone(msg.from),
    to: normalizePhone(msg.to),
  };
}