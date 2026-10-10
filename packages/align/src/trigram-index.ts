import { wordScore } from './phonetic';
import type { ExpectedWord, HeardToken } from './types';

const keyOf = (phons: string[]) => phons.join('|');

export class TrigramIndex {
  private readonly map = new Map<string, number[]>();

  constructor(private readonly expected: ExpectedWord[]) {
    for (let i = 0; i + 2 < expected.length; i++) {
      const key = keyOf(expected.slice(i, i + 3).map((w) => w.phon[0]));
      const list = this.map.get(key);
      if (list) list.push(i);
      else this.map.set(key, [i]);
    }
  }

  find(tokens: HeardToken[], cursor: number, matchThreshold: number): number[] {
    if (tokens.length < 3) return [];
    const last = tokens.slice(-3);
    const rank = (c: number) => (c >= cursor ? c - cursor : (cursor - c) * 1.5);
    return (this.map.get(keyOf(last.map((t) => t.phon[0]))) ?? [])
      .filter((c) => last.every((t, k) => wordScore(t, this.expected[c + k]!) >= matchThreshold))
      .sort((a, b) => rank(a) - rank(b));
  }
}
