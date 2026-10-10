import type { HeardWord } from '@dasma/align';
import type { Recognizer } from '@dasma/asr';
import type { RenderedPerformance } from '../../src/tts';

/** A fake recognizer that "hears" a fixed word list with a fixed delay. */
export class ScriptedRecognizer implements Recognizer<null> {
  readonly supportsHotwords = false;
  private fed = 0;
  private next = 0;
  private readonly listeners = new Set<(w: HeardWord[]) => void>();

  constructor(
    private readonly words: HeardWord[],
    private readonly delay = 0.2,
  ) {}

  async load(): Promise<void> {}

  accept(samples: Float32Array, sampleRate: number): void {
    this.fed += samples.length / sampleRate;
    this.emitUntil(this.fed - this.delay);
  }

  flush(): void {
    this.emitUntil(Infinity);
  }

  reset(): void {
    this.fed = 0;
    this.next = 0;
  }

  onWords(cb: (w: HeardWord[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setHotwords(): void {
    // not applicable
  }

  realtimeFactor(): number {
    return 0.01;
  }

  dispose(): void {
    this.listeners.clear();
  }

  private emitUntil(t: number): void {
    const out: HeardWord[] = [];
    while (this.next < this.words.length && this.words[this.next]!.end <= t) out.push(this.words[this.next++]!);
    if (out.length) for (const l of this.listeners) l(out);
  }
}

/** Words exactly as performed, spaced evenly through each rendered segment — a perfect recognizer. */
export function oracleWords(rendered: RenderedPerformance, confidence = 0.95): HeardWord[] {
  return rendered.segments
    .filter(({ seg }) => !seg.silent)
    .flatMap(({ seg, start, end }) => {
      const toks = seg.text.split(/[\s-]+/).filter(Boolean);
      const d = (end - start) / Math.max(1, toks.length);
      return toks.map((t, k) => ({
        text: t.replace(/[^A-Za-z0-9']/g, ''),
        start: start + k * d,
        end: start + (k + 1) * d - 0.02,
        confidence,
        final: true,
      }));
    })
    .filter((w) => w.text);
}
