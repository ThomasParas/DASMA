import { gaussian, type Rng } from './rng';

export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const br = re[b]! * cr - im[b]! * ci;
        const bi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - br;
        im[b] = im[a]! - bi;
        re[a] = re[a]! + br;
        im[a] = im[a]! + bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

const nextPow2 = (x: number) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));

export function convolve(signal: Float32Array, ir: Float32Array): Float32Array {
  const outLen = signal.length + ir.length - 1;
  const block = nextPow2(Math.max(ir.length * 2, 4096));
  const step = block - ir.length + 1;
  const hr = new Float64Array(block);
  const hi = new Float64Array(block);
  hr.set(ir);
  fft(hr, hi, false);
  const out = new Float32Array(outLen);
  for (let pos = 0; pos < signal.length; pos += step) {
    const re = new Float64Array(block);
    const im = new Float64Array(block);
    re.set(signal.subarray(pos, Math.min(pos + step, signal.length)));
    fft(re, im, false);
    for (let k = 0; k < block; k++) {
      const a = re[k]!;
      const b = im[k]!;
      re[k] = a * hr[k]! - b * hi[k]!;
      im[k] = a * hi[k]! + b * hr[k]!;
    }
    fft(re, im, true);
    for (let k = 0; k < block && pos + k < outLen; k++) out[pos + k] = out[pos + k]! + re[k]!;
  }
  return out;
}

export function makeImpulseResponse(sampleRate: number, rt60: number, directToReverbDb: number, rng: Rng): Float32Array {
  if (rt60 <= 0) return Float32Array.from([1]);
  const len = Math.ceil(rt60 * 1.2 * sampleRate);
  const ir = new Float32Array(len);
  let tailEnergy = 0;
  for (let n = 1; n < len; n++) {
    const v = gaussian(rng) * Math.exp((-6.9078 * n) / (rt60 * sampleRate));
    ir[n] = v;
    tailEnergy += v * v;
  }
  const scale = Math.sqrt(1 / (tailEnergy * 10 ** (directToReverbDb / 10)));
  for (let n = 1; n < len; n++) ir[n] = ir[n]! * scale;
  ir[0] = 1;
  return ir;
}

export function addNoise(signal: Float32Array, snrDb: number, rng: Rng): Float32Array {
  const noise = new Float64Array(signal.length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < noise.length; i++) {
    const w = gaussian(rng);
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    noise[i] = b0 + b1 + b2 + w * 0.1848;
  }
  const ps = signal.reduce((s, v) => s + v * v, 0) / Math.max(1, signal.length);
  const pn = noise.reduce((s, v) => s + v * v, 0) / Math.max(1, noise.length);
  const gain = pn > 0 && ps > 0 ? Math.sqrt(ps / 10 ** (snrDb / 10) / pn) : 0;
  return Float32Array.from(signal, (v, i) => v + noise[i]! * gain);
}

function biquad(x: Float32Array, type: 'lowpass' | 'highpass', f0: number, sampleRate: number, q = Math.SQRT1_2): Float32Array {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n]!;
    const yn = (b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    y[n] = yn;
    x2 = x1;
    x1 = xn;
    y2 = y1;
    y1 = yn;
  }
  return y;
}

export function laptopMicEq(signal: Float32Array, sampleRate: number): Float32Array {
  return biquad(biquad(signal, 'highpass', 150, sampleRate), 'lowpass', Math.min(6000, sampleRate * 0.45), sampleRate);
}

export type RoomName = 'close-mic' | 'far-field' | 'far-field-hard';

export interface RoomPreset {
  rt60: number;
  directToReverbDb: number;
  snrDb: number;
  eq: boolean;
}

export const ROOM_PRESETS: Record<RoomName, RoomPreset> = {
  'close-mic': { rt60: 0, directToReverbDb: 20, snrDb: 35, eq: false },
  'far-field': { rt60: 0.6, directToReverbDb: 0, snrDb: 18, eq: true },
  'far-field-hard': { rt60: 0.9, directToReverbDb: -6, snrDb: 10, eq: true },
};

export function applyRoom(signal: Float32Array, sampleRate: number, preset: RoomPreset, rng: Rng): Float32Array {
  let y = signal;
  if (preset.rt60 > 0) {
    y = convolve(y, makeImpulseResponse(sampleRate, preset.rt60, preset.directToReverbDb, rng)).slice(0, signal.length);
  }
  if (preset.eq) y = laptopMicEq(y, sampleRate);
  y = addNoise(y, preset.snrDb, rng);
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.99) {
    const g = 0.99 / peak;
    y = y.map((v) => v * g);
  }
  return y;
}
