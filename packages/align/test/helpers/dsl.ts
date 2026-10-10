import type { HeardWord } from '../../src/types';

export interface HeardOptions {
  start?: number;
  wordDur?: number;
  gap?: number;
  confidence?: number;
}

/** Build recognizer-style words. Pause markers: "|" = 1 s, "||" = 3 s, "|||" = 12 s. */
export function heard(text: string, opts: HeardOptions = {}): HeardWord[] {
  const wordDur = opts.wordDur ?? 0.3;
  const gap = opts.gap ?? 0.05;
  const confidence = opts.confidence ?? 1;
  let t = opts.start ?? 0;
  const out: HeardWord[] = [];
  for (const piece of text.split(/\s+/).filter(Boolean)) {
    if (/^\|+$/.test(piece)) {
      t += piece.length === 1 ? 1 : piece.length === 2 ? 3 : 12;
      continue;
    }
    out.push({ text: piece.replace(/[.,;:!?]+$/, ''), start: t, end: t + wordDur, confidence, final: true });
    t += wordDur + gap;
  }
  return out;
}
