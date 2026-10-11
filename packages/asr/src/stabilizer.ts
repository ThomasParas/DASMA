import type { HeardWord } from '@dasma/align';
import type { RawWord } from './types';

/** Absorbs floating-point error in audio-time differences (1.0 - 0.8 < 0.2 in binary). */
const EPS = 1e-9;

/**
 * Turns a recognizer's ever-changing partial hypothesis into words emitted once, when they stop changing (pass spec §7.1).
 * Stability is measured in seconds of audio fed to the recognizer, so it behaves the same whatever the chunk size
 * (0.1 s in the harness, 8 ms from a browser AudioWorklet). The newest word is also held until the recognizer has
 * processed stableSec of audio past its end, since it may still grow ("nor" → "norhan" → "nor hand").
 */
export class Stabilizer {
  private emitted = 0;
  private seen: Array<{ text: string; since: number }> = [];
  private readonly stableSec: number;

  constructor(opts: { stableSec?: number } = {}) {
    this.stableSec = opts.stableSec ?? 0.3;
  }

  update(words: RawWord[], endpoint: boolean, audioSec: number): HeardWord[] {
    // Forget positions the hypothesis no longer has, so a word that reappears starts a fresh clock.
    this.seen.length = Math.max(this.emitted, Math.min(this.seen.length, words.length));
    for (let i = this.emitted; i < words.length; i++) {
      const prev = this.seen[i];
      const text = words[i]!.text;
      if (!prev || prev.text !== text) this.seen[i] = { text, since: audioSec };
    }
    const out: HeardWord[] = [];
    while (this.emitted < words.length) {
      const i = this.emitted;
      const word = words[i]!;
      const steady = audioSec - this.seen[i]!.since >= this.stableSec - EPS;
      const settled = endpoint || (steady && (i < words.length - 1 || audioSec - word.end >= this.stableSec - EPS));
      if (!settled) break;
      out.push({ ...word, final: true });
      this.emitted++;
    }
    if (endpoint) {
      this.emitted = 0;
      this.seen = [];
    }
    return out;
  }
}
