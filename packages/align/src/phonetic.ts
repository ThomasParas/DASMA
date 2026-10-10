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

const letterCount = (norm: string) => norm.replace(/[^a-z]/g, '').length;

export function wordScore(h: Scorable, e: Scorable): number {
  if (h.norm === e.norm) return 1;
  const [hp, hs] = h.phon;
  const [ep, es] = e.phon;
  const soundAlike = hp === ep || hp === es || hs === ep;
  if (soundAlike && Math.min(letterCount(h.norm), letterCount(e.norm)) >= 3) return 0.9;
  const len = Math.max(hp.length, ep.length, 1);
  return Math.max(0, 0.6 * (1 - levenshtein(hp, ep) / len));
}
