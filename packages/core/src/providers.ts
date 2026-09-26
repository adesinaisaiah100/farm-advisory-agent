import type { CaseData } from '@poultry/schemas';
import type { ReplyLanguage } from './language.js';

export interface TurnMessage {
  role: 'farmer' | 'agent';
  text: string;
}

export interface ChatInput {
  filled: CaseData;
  missing: string[];
  query: string;
  history: readonly TurnMessage[];
  replyLanguage: ReplyLanguage;
}

export interface ChatProvider {
  complete(input: ChatInput): Promise<unknown>;
}

export interface EmbedProvider {
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface TranscriptProvider {
  transcribe(r2Key: string): Promise<{ text: string; confidence: number }>;
}