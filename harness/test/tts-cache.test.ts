import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TtsEngine } from '../src/tts';
import { cacheKey, cachedTts } from '../src/tts-cache';

/** Like Piper: a different render every call, so only the cache can make audio repeatable. */
function counting(): TtsEngine & { calls: number } {
  const engine = {
    calls: 0,
    synth(text: string, sid: number, speed: number) {
      engine.calls++;
      return { samples: Float32Array.from([text.length, sid, speed, Math.random()]), sampleRate: 22050 };
    },
  };
  return engine;
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'dasma-tts-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('cachedTts', () => {
  it('renders once, then returns identical audio from disk', () => {
    const inner = counting();
    const tts = cachedTts(inner, tmp(), 'model-a');
    const a = tts.synth('Yes, sir.', 14, 1);
    const b = tts.synth('Yes, sir.', 14, 1);
    expect(inner.calls).toBe(1);
    expect(b.sampleRate).toBe(22050);
    expect(Array.from(b.samples)).toEqual(Array.from(a.samples));
  });

  it('a second wrapper on the same directory (a new process) reads the cache', () => {
    const dir = tmp();
    const first = cachedTts(counting(), dir, 'model-a').synth('Hello', 3, 1);
    const inner = counting();
    const again = cachedTts(inner, dir, 'model-a').synth('Hello', 3, 1);
    expect(inner.calls).toBe(0);
    expect(Array.from(again.samples)).toEqual(Array.from(first.samples));
  });

  it('keys on model, voice, speed and text', () => {
    const keys = [cacheKey('m', 1, 1, 't'), cacheKey('n', 1, 1, 't'), cacheKey('m', 2, 1, 't'), cacheKey('m', 1, 1.1, 't'), cacheKey('m', 1, 1, 'u')];
    expect(new Set(keys).size).toBe(5);
    expect(cacheKey('m', 1, 1, 't')).toBe(keys[0]);
  });

  it('re-renders a truncated cache file instead of failing', () => {
    const dir = tmp();
    const inner = counting();
    const tts = cachedTts(inner, dir, 'model-a');
    tts.synth('Line', 3, 1);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    writeFileSync(join(dir, files[0]!), Buffer.from([1, 2, 3, 4, 5, 6]));
    const out = tts.synth('Line', 3, 1);
    expect(inner.calls).toBe(2);
    expect(out.samples.length).toBe(4);
    expect(readdirSync(dir)).toHaveLength(1);
  });

  it('re-renders a cache file truncated on a sample boundary', () => {
    const dir = tmp();
    const inner = counting();
    const tts = cachedTts(inner, dir, 'model-a');
    const full = tts.synth('Line', 3, 1);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const file = join(dir, files[0]!);
    const bytes = readFileSync(file);
    writeFileSync(file, bytes.subarray(0, bytes.length - 4));
    const out = tts.synth('Line', 3, 1);
    expect(inner.calls).toBe(2);
    expect(out.samples.length).toBe(full.samples.length);
    expect(out.sampleRate).toBe(22050);
    expect(tts.synth('Line', 3, 1).samples.length).toBe(full.samples.length);
    expect(inner.calls).toBe(2);
  });
});
