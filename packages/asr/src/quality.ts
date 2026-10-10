import type { HeardWord } from '@dasma/align';

/**
 * Pass spec §5.2: an audio-quality factor for Aligner.setAudioQuality, from the recognizer's own word confidence over
 * the last `windowSec` seconds. clamp((mean − 0.3) / 0.5, 0.6, 1); 1 before any words.
 */
export class AudioQualityMeter {
  private readonly windowSec: number;
  private words: HeardWord[] = [];

  constructor(opts: { windowSec?: number } = {}) {
    this.windowSec = opts.windowSec ?? 10;
  }

  push(words: HeardWord[]): void {
    this.words.push(...words);
    const latest = this.words.at(-1)?.end ?? 0;
    this.words = this.words.filter((w) => w.end >= latest - this.windowSec);
  }

  value(): number {
    if (!this.words.length) return 1;
    const mean = this.words.reduce((s, w) => s + w.confidence, 0) / this.words.length;
    return Math.min(1, Math.max(0.6, (mean - 0.3) / 0.5));
  }
}
