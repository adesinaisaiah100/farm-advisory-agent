import type { CaseData } from '@poultry/schemas';
import type { ReplyLanguage } from './language.js';

export interface TurnMessage {
  role: 'farmer' | 'agent';
  text: string;
}

export interface ChatInput {
  filled: CaseData;
  missing: string[];
  notes: string[];
  farmerContext?: string;
  query: string;
  history: readonly TurnMessage[];
  replyLanguage: ReplyLanguage;
}

export interface CompactInput {
  notes: string[];
  dropped: readonly TurnMessage[];
  maxNotes: number;
}

export interface CompactProvider {
  compact(input: CompactInput): Promise<unknown>;
}

export interface TokenCounter {
  count(text: string): number;
}

export interface ChatProvider {
  complete(input: ChatInput): Promise<unknown>;
}

export interface EmbedProvider {
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * @deprecated Superseded by `Transcriber` in `@poultry/media`, which is the
 * seam the Gemini implementation actually satisfies. Kept so an existing import
 * does not break; do not build against this.
 *
 * `confidence` is optional because `gemini-3.5-transcribe` does not return a
 * per-utterance confidence. The canonical gate lives in `@poultry/schemas` as
 * `isReliable`, which treats an absent score as unreliable so the farmer is
 * asked to confirm rather than the agent guessing.
 */
export interface TranscriptProvider {
  transcribe(r2Key: string): Promise<{ text: string; confidence?: number }>;
}