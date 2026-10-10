import type { HeardWord } from '@dasma/align';

export interface RawWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Recognizer<M = unknown> {
  readonly supportsHotwords: boolean;
  load(model: M): Promise<void>;
  /** Feed audio; the recognizer keeps its own run clock from the samples it has seen. */
  accept(samples: Float32Array, sampleRate: number): void;
  /** End of input: settle everything pending. */
  flush(): void;
  /** Start a new run (fresh stream and clock). */
  reset(): void;
  onWords(cb: (words: HeardWord[]) => void): () => void;
  setHotwords(words: string[], boost: number): void;
  /** Processing time ÷ audio time so far. */
  realtimeFactor(): number;
  dispose(): void;
}
