export type ReplyLanguage = 'pidgin' | 'english';
export type DetectedLanguage = ReplyLanguage | 'unknown';

const PIDGIN_MARKERS: readonly string[] = [
  // Core lexical markers
  'dey',
  'abeg',
  'wetin',
  'wey',
  'shey',
  'abi',
  'oga',
  'nawa',
  'sef',
  // Pronouns / determiners
  'dem',
  'una',
  'wuna',
  // Verb phrases
  'na ',
  'na be',
  'no be',
  'na so',
  'make i',
  'make we',
  'i don',
  'e don',
  'e dey',
  'i dey',
  'don die',
  'don dey',
  'wan buy',
  // Common nouns / informal
  'chop',
  'plenty',
  'how far',
  'which one',
  'boro',
  'folan',
  // Extra Nigerian informal markers
  'ehn',
  'ehen',
  'nah',
  'sabi',
  'comot',
  'wahala',
  'naija',
  'gist',
  'kukuma',
  'oya',
  'jare',
  'kuku',
  'ehen',
  'tey',
  'naso',
  'person',
  'for here',
  'no well',
  'doh',
  // Colloquial Nigerian poultry & health markers
  'shit blood',
  'no dey chop',
  'dem dey',
  'dey die',
  'don reach',
  'be like',
  'fit',
  'no fit',
  'which kind',
  'wetin dey',
  'wetin be',
  'fowls',
];

const ENGLISH_MARKERS: readonly string[] = [
  ' is ',
  ' are ',
  ' was ',
  ' were ',
  ' because ',
  ' would ',
  ' could ',
  ' should ',
  ' please ',
  ' thank ',
  ' i am ',
  ' im ',
  ' you are ',
  ' they are ',
  ' do you ',
  ' not ',
];

const PIDGIN_WEIGHT = 2;
const ENGLISH_WEIGHT = 1;

function count(text: string, markers: readonly string[]): number {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `;
  let hits = 0;
  for (const m of markers) {
    if (lower.includes(` ${m.trim()} `)) hits += 1;
  }
  return hits;
}

export function classifyLanguage(text: string): DetectedLanguage {
  const clean = text.trim().toLowerCase();
  if (/^(please\s+)?(switch\s+to\s+|speak\s+|talk\s+(in\s+)?|use\s+)?(pidgin|broken(\s+english)?)(\s+abeg)?$/i.test(clean)) {
    return 'pidgin';
  }
  if (/^(please\s+)?(switch\s+to\s+|speak\s+|talk\s+(in\s+)?|use\s+)?english(\s+please)?$/i.test(clean)) {
    return 'english';
  }

  const pidginHits = count(text, PIDGIN_MARKERS);
  const englishHits = count(text, ENGLISH_MARKERS);
  const pidgin = pidginHits * PIDGIN_WEIGHT;
  const english = englishHits * ENGLISH_WEIGHT;

  if (pidgin > english && pidgin >= 2) return 'pidgin';
  if (english > pidgin && english >= 2) return 'english';
  if (pidgin === english && pidgin > 0) return 'unknown';
  return 'unknown';
}

export function replyLanguageFor(detected: DetectedLanguage): ReplyLanguage {
  return detected === 'pidgin' ? 'pidgin' : 'english';
}

/**
 * Session-level language carry-over.
 *
 * A single short WhatsApp message is often too ambiguous to classify reliably —
 * "Uhm" and "okay" score unknown. Once a session has a settled language,
 * ambiguous turns should stay in that language rather than flip back to English.
 *
 * Rules:
 * - If the current turn detects a definitive language, use it and update `prior`.
 * - If the current turn is `unknown` and we have a `prior`, keep `prior`.
 * - If both are `unknown`, default to English (safe fallback).
 */
export function stickyLanguage(
  currentText: string,
  prior: ReplyLanguage | undefined,
): ReplyLanguage {
  const detected = classifyLanguage(currentText);
  if (detected !== 'unknown') return replyLanguageFor(detected);
  return prior ?? 'english';
}