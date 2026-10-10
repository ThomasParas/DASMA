import { describe, expect, it } from 'vitest';
import { ROOM_PRESETS, addNoise, applyRoom, convolve, fft, laptopMicEq, makeImpulseResponse } from '../src/room';
import { mulberry32 } from '../src/rng';

const SR = 16000;
const rms = (x: Float32Array, from = 0) => Math.sqrt(x.subarray(from).reduce((s, v) => s + v * v, 0) / (x.length - from));
const sine = (hz: number, sec = 1) => Float32Array.from({ length: SR * sec }, (_, n) => Math.sin((2 * Math.PI * hz * n) / SR));

describe('fft', () => {
  it('round-trips', () => {
    const rng = mulberry32(1);
    const re = Float64Array.from({ length: 64 }, () => rng() - 0.5);
    const original = Float64Array.from(re);
    const im = new Float64Array(64);
    fft(re, im, false);
    fft(re, im, true);
    for (let i = 0; i < 64; i++) expect(re[i]).toBeCloseTo(original[i]!, 9);
  });
});

describe('convolve', () => {
  it('leaves a signal unchanged with a unit impulse', () => {
    const out = convolve(Float32Array.from([1, 2, 3]), Float32Array.from([1]));
    expect(Array.from(out).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 2, 3]);
  });

  it('matches direct convolution', () => {
    const rng = mulberry32(2);
    const x = Float32Array.from({ length: 5000 }, () => rng() - 0.5);
    const h = Float32Array.from({ length: 300 }, () => rng() - 0.5);
    const out = convolve(x, h);
    expect(out.length).toBe(x.length + h.length - 1);
    for (const n of [0, 1, 299, 1000, 4999, 5298]) {
      let direct = 0;
      for (let k = 0; k < h.length; k++) if (n - k >= 0 && n - k < x.length) direct += x[n - k]! * h[k]!;
      expect(out[n]).toBeCloseTo(direct, 3);
    }
  });
});

describe('makeImpulseResponse', () => {
  it('has a direct path and a decaying tail', () => {
    const ir = makeImpulseResponse(SR, 0.6, 0, mulberry32(3));
    expect(ir[0]).toBe(1);
    expect(ir.length).toBe(Math.ceil(0.6 * 1.2 * SR));
    const tenth = Math.floor(ir.length / 10);
    const early = ir.subarray(1, tenth).reduce((s, v) => s + v * v, 0);
    const late = ir.subarray(ir.length - tenth).reduce((s, v) => s + v * v, 0);
    expect(late).toBeLessThan(early * 0.01);
  });

  it('is just the direct path with no reverb', () => {
    expect(Array.from(makeImpulseResponse(SR, 0, 0, mulberry32(4)))).toEqual([1]);
  });
});

describe('addNoise', () => {
  it('hits the requested signal-to-noise ratio', () => {
    const x = sine(440);
    const y = addNoise(x, 15, mulberry32(5));
    const noise = y.map((v, i) => v - x[i]!);
    const snr = 20 * Math.log10(rms(x) / rms(noise));
    expect(snr).toBeCloseTo(15, 1);
  });
});

describe('laptopMicEq', () => {
  it('cuts low rumble and keeps speech frequencies', () => {
    const low = laptopMicEq(sine(50), SR);
    const mid = laptopMicEq(sine(1000), SR);
    expect(rms(low, SR / 2) / rms(sine(50), SR / 2)).toBeLessThan(0.5);
    const midRatio = rms(mid, SR / 2) / rms(sine(1000), SR / 2);
    expect(midRatio).toBeGreaterThan(0.89);
    expect(midRatio).toBeLessThan(1.12);
  });
});

describe('applyRoom', () => {
  it('keeps length and never clips', () => {
    const x = sine(300, 2).map((v) => v * 0.99);
    for (const preset of Object.values(ROOM_PRESETS)) {
      const y = applyRoom(x, SR, preset, mulberry32(6));
      expect(y.length).toBe(x.length);
      expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(1);
    }
  });

  it('close-mic barely changes the signal', () => {
    const x = sine(300, 1).map((v) => v * 0.5);
    const y = applyRoom(x, SR, ROOM_PRESETS['close-mic'], mulberry32(7));
    let dot = 0;
    for (let i = 0; i < x.length; i++) dot += x[i]! * y[i]!;
    const corr = dot / (Math.sqrt(x.reduce((s, v) => s + v * v, 0)) * Math.sqrt(y.reduce((s, v) => s + v * v, 0)));
    expect(corr).toBeGreaterThan(0.99);
  });
});
