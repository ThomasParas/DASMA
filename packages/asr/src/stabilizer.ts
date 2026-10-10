import type { HeardWord } from '@dasma/align';
import type { RawWord } from './types';

/** Turns a recognizer's ever-changing partial hypothesis into words emitted once, when they stop changing. */
export class Stabilizer {
  private emitted = 0;
  private seen: Array<{ text: string; count: number }> = [];

  constructor(private readonly stableUpdates = 2) {}

  update(words: RawWord[], endpoint: boolean): HeardWord[] {
    const out: HeardWord[] = [];
    const limit = endpoint ? words.length : words.length - 1;
    for (let i = this.emitted; i < limit; i++) {
      const prev = this.seen[i];
      const text = words[i]!.text;
      this.seen[i] = prev && prev.text === text ? { text, count: prev.count + 1 } : { text, count: 1 };
    }
    while (this.emitted < limit && (endpoint || this.seen[this.emitted]!.count >= this.stableUpdates)) {
      out.push({ ...words[this.emitted]!, final: true });
      this.emitted++;
    }
    if (endpoint) {
      this.emitted = 0;
      this.seen = [];
    }
    return out;
  }
}
