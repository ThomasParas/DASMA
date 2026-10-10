import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TTS_MODEL_DIR, createSherpaTts } from '../src/tts';

describe.skipIf(!existsSync(TTS_MODEL_DIR))('sherpa TTS (needs `npm run harness -- fetch-models`)', () => {
  it('speaks a sentence in two different voices', () => {
    const tts = createSherpaTts();
    const a = tts.synth('Did you hear what I was playing, Lane?', 3, 1);
    const b = tts.synth('Did you hear what I was playing, Lane?', 287, 1);
    expect(a.sampleRate).toBeGreaterThan(8000);
    expect(a.samples.length / a.sampleRate).toBeGreaterThan(1);
    expect(a.samples.length !== b.samples.length || a.samples.some((x, i) => x !== b.samples[i])).toBe(true);
  });
});
