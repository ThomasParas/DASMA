import type { HeardWord } from '@dasma/align';
import type { Recognizer } from '@dasma/asr';

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
