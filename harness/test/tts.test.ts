import { describe, expect, it } from 'vitest';
import type { Performance } from '../src/perturb';
import { mulberry32 } from '../src/rng';
import { VOICE_POOL, assignVoices, renderPerformance } from '../src/tts';
import { fakeTts } from './helpers/fake-tts';

describe('renderPerformance', () => {
  it('lays segments out on one timeline with their pauses', () => {
    const perf: Performance = {
      segments: [
        { speaker: 'A', text: 'one two', pauseBefore: 0.5, lineId: 'L1' },
        { speaker: 'B', text: 'three', pauseBefore: 1, lineId: 'L2' },
      ],
      labels: [],
    };
    const r = renderPerformance(perf, { A: 1, B: 2 }, fakeTts);
    expect(r.sampleRate).toBe(16000);
    expect(r.segments[0]!.start).toBeCloseTo(0.5);
    expect(r.segments[0]!.end).toBeCloseTo(1.14);
    expect(r.segments[1]!.start).toBeCloseTo(2.14);
    expect(r.segments[1]!.end).toBeCloseTo(2.46);
    expect(r.samples.length).toBe(Math.round(3.46 * 16000));
  });

  it('renders a silent (cue) segment as silence of the same length', () => {
    const perf: Performance = {
      segments: [
        { speaker: 'A', text: 'one two', pauseBefore: 0, lineId: 'L1' },
        { speaker: 'B', text: 'three four five', pauseBefore: 0, silent: true },
      ],
      labels: [],
    };
    const r = renderPerformance(perf, { A: 1, B: 2 }, fakeTts);
    expect(r.segments[1]!.end - r.segments[1]!.start).toBeCloseTo(0.96);
    const cue = r.samples.subarray(Math.round(r.segments[1]!.start * 16000), Math.round(r.segments[1]!.end * 16000));
    expect(cue.every((x) => x === 0)).toBe(true);
    expect(r.samples[100]).toBeCloseTo(0.1);
  });
});

describe('assignVoices', () => {
  it('gives each speaker a distinct voice from the pool, deterministically', () => {
    const a = assignVoices(['ANN', 'BEN', 'DIRECTOR'], mulberry32(1));
    expect(new Set(Object.values(a)).size).toBe(3);
    expect(Object.values(a).every((sid) => VOICE_POOL.includes(sid))).toBe(true);
    expect(assignVoices(['ANN', 'BEN', 'DIRECTOR'], mulberry32(1))).toEqual(a);
  });
});
