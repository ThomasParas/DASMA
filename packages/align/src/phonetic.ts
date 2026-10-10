import { doubleMetaphone } from 'double-metaphone';

export const MATCH_THRESHOLD = 0.85;

export interface Scorable {
  norm: string;
  phon: [string, string];
}

export function phoneticKey(norm: string): [string, string] {
  const letters = norm.replace(/[^a-z]/g, '');
  if (!letters) return [norm, norm];
  const [primary, secondary] = doubleMetaphone(letters);
  const a = primary || letters;
  return [a, secondary || a];
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** A sound-alike counts as a match only if the spellings are also close: normalized letter edit distance ≤ this. */
export const SOUND_ALIKE_MAX_LETTER_DISTANCE = 0.4;

const letters = (norm: string) => norm.replace(/[^a-z]/g, '');

export function wordScore(h: Scorable, e: Scorable): number {
  if (h.norm === e.norm) return 1;
  const [hp, hs] = h.phon;
  const [ep, es] = e.phon;
  const soundAlike = hp === ep || hp === es || hs === ep;
  const hl = letters(h.norm);
  const el = letters(e.norm);
  if (soundAlike && Math.min(hl.length, el.length) >= 3 && levenshtein(hl, el) / Math.max(hl.length, el.length) <= SOUND_ALIKE_MAX_LETTER_DISTANCE) {
    return 0.9;
  }
  const len = Math.max(hp.length, ep.length, 1);
  return Math.max(0, 0.6 * (1 - levenshtein(hp, ep) / len));
}
