export * from './normalize.js';
export * from './dedup.js';
export * from './outbox.js';
export * from './greeting.js';
export * from './allowlist.js';

/**
 * `InboundMessage` and `MediaKind` are owned by `@poultry/schemas`. This package used to define its own
 * looser copies — `from: z.string()` instead of a validated phone, no rule requiring text or media — which
 * would have let the bridge hand `core` a message the core then rejects. Re-exported unchanged.
 */
export {
  InboundMessageSchema,
  MediaAttachmentSchema,
  MediaKindSchema,
  MessageSchema,
  MessageSenderSchema,
  normalizeMessage,
  type InboundMessage,
  type MediaAttachment,
  type MediaKind,
  type Message,
  type MessageSender,
} from '@poultry/schemas';
