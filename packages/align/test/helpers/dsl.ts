import { createAligner } from '../../src/aligner';
import { buildExpected } from '../../src/expected';
import {
  DEFAULT_ALIGN_OPTIONS,
  type AlignEvent,
  type AlignOptions,
  type HeardWord,
  type ScriptLineInput,
} from '../../src/types';

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

/** Feed words one at a time (ticking after each), then flush and finalize. */
export function runScenario(lines: ScriptLineInput[], words: HeardWord[], opts: Partial<AlignOptions> = {}) {
  const options: AlignOptions = { ...DEFAULT_ALIGN_OPTIONS, ...opts };
  const expected = buildExpected(lines, options.strictness);
  const aligner = createAligner(expected, options);
  const events: AlignEvent[] = [];
  aligner.onEvent((e) => events.push(e));
  for (const w of words) {
    aligner.push([w]);
    aligner.tick(w.end);
  }
  const end = (words.at(-1)?.end ?? 0) + 10;
  aligner.tick(end);
  aligner.finalize(end);
  return {
    expected,
    aligner,
    events,
    lineNotes: events.flatMap((e) => (e.type === 'lineDone' ? e.notes : [])),
    flags: events.flatMap((e) => (e.type === 'flag' ? [e] : [])),
    types: events.map((e) => e.type),
  };
}
