import { wordScore } from './phonetic';
import type { ExpectedWord, HeardToken } from './types';

const keyOf = (phons: string[]) => phons.join('|');

/** Distinct phonetic keys (primary and secondary) of one word. */
const keysOf = (w: { phon: [string, string] }): string[] => [...new Set(w.phon)];

/** Every key sequence formed by choosing one key per word (at most 2^3 = 8 for a trigram). */
function keyCombos(sets: string[][]): string[] {
  return sets.reduce<string[][]>((acc, set) => acc.flatMap((prefix) => set.map((k) => [...prefix, k])), [[]]).map(keyOf);
}

export class TrigramIndex {
  private readonly map = new Map<string, number[]>();

  constructor(private readonly expected: ExpectedWord[]) {
    for (let i = 0; i + 2 < expected.length; i++) {
      for (const key of keyCombos(expected.slice(i, i + 3).map(keysOf))) {
        const list = this.map.get(key);
        if (list) list.push(i);
        else this.map.set(key, [i]);
      }
    }
  }

  /**
   * Candidate start indices whose trigram matches the last three tokens, nearest first.
   * matchThreshold must exceed the 0.6 fuzzy ceiling, because candidates come from exact key
   * lookup and a key collision scoring 0.6 would otherwise pass the filter.
   */
  find(tokens: HeardToken[], cursor: number, matchThreshold: number): number[] {
    if (tokens.length < 3) return [];
    const last = tokens.slice(-3);
    const rank = (c: number) => (c >= cursor ? c - cursor : (cursor - c) * 1.5);
    const found = new Set<number>();
    for (const key of keyCombos(last.map(keysOf))) {
      for (const c of this.map.get(key) ?? []) found.add(c);
    }
    return [...found]
      .filter((c) => last.every((t, k) => wordScore(t, this.expected[c + k]!) >= matchThreshold))
      .sort((a, b) => rank(a) - rank(b));
  }
}
