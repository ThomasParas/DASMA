import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FUNCTION_WORDS, tokenize } from '../src/normalize';
import { runScenario } from './helpers/dsl';
import { LONG_SCENE } from './helpers/fixtures';
import { VOCAB, simulateRecognizer } from './helpers/noise';
import { mulberry32 } from './helpers/rng';

describe('false-alarm budget under simulated recognizer noise', () => {
  it('a perfect, confident recognizer never produces notes', () => {
    const { lineNotes, flags } = runScenario(LONG_SCENE, simulateRecognizer(LONG_SCENE, mulberry32(1), 0));
    expect(lineNotes).toEqual([]);
    expect(flags).toEqual([]);
  });

  it('stays within budget at 5–15% recognizer error with no actor errors', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0x7fffffff }), fc.double({ min: 0.05, max: 0.15, noNaN: true }), (seed, rate) => {
        const { flags, lineNotes } = runScenario(LONG_SCENE, simulateRecognizer(LONG_SCENE, mulberry32(seed), rate));
        const alerts = flags.filter((f) => f.alert).length;
        const notes = lineNotes.filter((n) => n.status === 'note').length;
        return alerts <= 1 && notes <= 2;
      }),
      { seed: 42, numRuns: 100 },
    );
  });

  it('still detects planted wrong words through 10% noise at least 85% of the time', () => {
    const candidates = LONG_SCENE.flatMap((line) =>
      tokenize(line.text)
        .map((raw, rawIndex) => ({ line, rawIndex, core: raw.replace(/[^A-Za-z]/g, '').toLowerCase() }))
        .filter(({ core }) => core.length >= 4 && !FUNCTION_WORDS.has(core)),
    );
    let detected = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = mulberry32(1000 + trial);
      const target = candidates[Math.floor(rng() * candidates.length)]!;
      const replacement = VOCAB[Math.floor(rng() * VOCAB.length)]!;
      const words = simulateRecognizer(LONG_SCENE, rng, 0.1, { lineId: target.line.id, rawIndex: target.rawIndex, replacement });
      const { lineNotes } = runScenario(LONG_SCENE, words);
      const hit = lineNotes.some(
        (n) => n.lineId === target.line.id && n.status === 'note' && (n.category === 'wrong-words' || n.category === 'paraphrase'),
      );
      if (hit) detected++;
    }
    expect(detected).toBeGreaterThanOrEqual(85);
  });
});
