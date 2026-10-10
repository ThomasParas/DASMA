import type { HeardWord } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { AudioQualityMeter } from '../src/quality';

const w = (end: number, confidence: number): HeardWord => ({ text: 'x', start: end - 0.3, end, confidence, final: true });

describe('AudioQualityMeter', () => {
  it('is 1 before any words', () => {
    expect(new AudioQualityMeter().value()).toBe(1);
  });

  it('maps mean word confidence over the window to [0.6, 1]', () => {
    const hi = new AudioQualityMeter();
    hi.push([w(1, 0.9), w(2, 0.9)]);
    expect(hi.value()).toBe(1);
    const lo = new AudioQualityMeter();
    lo.push([w(1, 0.2)]);
    expect(lo.value()).toBe(0.6);
    const mid = new AudioQualityMeter();
    mid.push([w(1, 0.6), w(2, 0.7)]);
    expect(mid.value()).toBeCloseTo(0.7);
  });

  it('forgets words older than the window', () => {
    const m = new AudioQualityMeter({ windowSec: 10 });
    m.push([w(1, 0.2)]);
    m.push([w(20, 0.9)]);
    expect(m.value()).toBe(1);
  });
});
