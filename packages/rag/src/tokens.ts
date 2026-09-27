export interface TokenCounter {
  count(text: string): number;
}

export const CHAR_HEURISTIC_COUNTER: TokenCounter = {
  count: (text) => Math.ceil(text.length / 4),
};
