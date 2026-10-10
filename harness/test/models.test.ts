import { describe, expect, it } from 'vitest';
import { ALL_MODELS, TTS_MODEL, checkLock } from '../src/models';

describe('model lock', () => {
  it('records a new hash, verifies a matching one, and rejects a changed one', () => {
    const lock: Record<string, string> = {};
    expect(checkLock(lock, 'm', 'abc')).toBe('recorded');
    expect(lock).toEqual({ m: 'abc' });
    expect(checkLock(lock, 'm', 'abc')).toBe('verified');
    expect(() => checkLock(lock, 'm', 'def')).toThrow(/Checksum mismatch/);
  });

  it('only downloads from official sherpa-onnx releases', () => {
    expect(TTS_MODEL.kind).toBe('tts-vits');
    for (const m of ALL_MODELS) expect(m.url.startsWith('https://github.com/k2-fsa/sherpa-onnx/releases/download/')).toBe(true);
  });
});
