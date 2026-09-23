import { z } from 'zod';

export type MediaKind = 'audio' | 'image' | 'video' | 'document';

export const MediaKindSchema = z.enum(['audio', 'image', 'video', 'document']);

export const InboundMessageSchema = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  text: z.string().optional(),
  media: z
    .object({
      url: z.string().url(),
      kind: MediaKindSchema,
      mime: z.string(),
    })
    .optional(),
  receivedAt: z.string().datetime(),
});

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

export function isGreeting(text: string): boolean {
  const t = text.trim().replace(/[!?.,]/g, '').toLowerCase();
  return ['hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'how far', 'hey'].includes(t);
}