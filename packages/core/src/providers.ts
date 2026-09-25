import type { CaseData } from '@poultry/schemas';

export interface ChatInput {
  filled: CaseData;
  missing: string[];
  query: string;
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