import { tokenize } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { perturbScene, type Performance } from '../src/perturb';
import { mulberry32 } from '../src/rng';
import type { Scene } from '../src/scenes';

const SCENE: Scene = {
  id: 't',
  title: 'T',
  source: 'test',
  lines: [
    { id: 'A1', character: 'ANN', text: 'The garden looks wonderful in the morning light today.', paraphrase: 'This morning the garden is looking lovely in the sun.' },
    { id: 'B1', character: 'BEN', text: 'I planted every single flower there myself, you know.' },
    { id: 'A2', character: 'ANN', text: 'Then you deserve a medal for patience and skill.' },
    { id: 'B2', character: 'BEN', text: 'Thank you kindly.' },
  ],
};
const run = (opts: Parameters<typeof perturbScene>[2], seed = 7): Performance => perturbScene(SCENE, mulberry32(seed), opts);

describe('perturbScene', () => {
  it('with no errors, performs the scene verbatim', () => {
    const p = run({ errorRate: 0, benignRate: 0 });
    expect(p.labels).toEqual([]);
    expect(p.segments.map((s) => s.text)).toEqual(SCENE.lines.map((l) => l.text));
    expect(p.segments.map((s) => s.speaker)).toEqual(['ANN', 'BEN', 'ANN', 'BEN']);
  });

  it('wrong-words changes exactly one word and labels it', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['wrong-words'] });
    expect(p.labels).toHaveLength(4);
    for (const label of p.labels) {
      const original = tokenize(SCENE.lines.find((l) => l.id === label.lineId)!.text);
      const spoken = tokenize(p.segments[label.segmentIndex]!.text);
      const diffs = original.map((w, i) => (w !== spoken[i] ? i : -1)).filter((i) => i >= 0);
      expect(diffs).toEqual([label.wordIndex]);
    }
  });

  it('dropped-line skips the line and points at the next spoken segment', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['dropped-line'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1', 'B1', 'A2']);
    expect(p.segments.map((s) => s.lineId)).toEqual(['B2']);
    expect(p.labels.every((l) => l.segmentIndex === 0)).toBe(true);
    expect(p.segments[0]!.pauseBefore).toBeGreaterThanOrEqual(2.5);
  });

  it('jumped-cue labels the next (different-character) line, performed cleanly after a short gap', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['jumped-cue'] });
    expect(p.labels.map((l) => [l.kind, l.lineId, l.characterId])).toEqual([
      ['jumped-cue', 'B1', 'BEN'],
      ['jumped-cue', 'B2', 'BEN'],
    ]);
    expect(p.segments.map((s) => s.text)).toEqual([SCENE.lines[1]!.text, SCENE.lines[3]!.text]);
    expect(p.segments[0]!.pauseBefore).toBeCloseTo(0.2);
  });

  it('called-for-line inserts a "Line!" segment and labels it', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['called-for-line'] });
    expect(p.labels).toHaveLength(3); // B2 has only 3 words
    for (const label of p.labels) expect(p.segments[label.segmentIndex]!.text).toBe('Line!');
  });

  it('paraphrase uses the scene text', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['paraphrase'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1']);
    expect(p.segments[0]!.text).toBe(SCENE.lines[0]!.paraphrase);
  });

  it('chatter is spoken by the director before the line', () => {
    const p = run({ errorRate: 0, benignRate: 1, benignKinds: ['chatter'] });
    expect(p.segments.filter((s) => s.speaker === 'DIRECTOR')).toHaveLength(4);
    expect(p.labels.every((l) => l.kind === 'chatter')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const opts = { errorRate: 0.5, benignRate: 0.3 };
    expect(run(opts, 99)).toEqual(run(opts, 99));
  });
});
