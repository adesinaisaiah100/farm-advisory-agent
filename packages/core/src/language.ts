export type ReplyLanguage = 'pidgin' | 'english';
export type DetectedLanguage = ReplyLanguage | 'unknown';

const PIDGIN_MARKERS: readonly string[] = [
  'dey',
  'abeg',
  'na ',
  'na be',
  'shey',
  'abi',
  'wetin',
  'wey',
  'dem',
  'una',
  'wuna',
  'sef',
  'nawa',
  'oga',
  'chop',
  'plenty',
  'how far',
  'which one',
  'make i',
  'make we',
  'na so',
  'no be',
  'i don',
  'e don',
  'e dey',
  'i dey',
  'wan buy',
  'don die',
  'don dey',
  'boro',
  'folan',
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