import type { HeardWord } from '@dasma/align';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findModel } from '../src/catalog';
import { NodeSherpaRecognizer, loadSherpa, resolveAsrModel } from '../src/node';

const MODELS = fileURLToPath(new URL('../../../harness/models', import.meta.url));
const spec = findModel('zipformer-en-2023-06-21');
const present = existsSync(join(MODELS, spec.dirName));

function testWave() {
  const dir = join(MODELS, spec.dirName, 'test_wavs');
  const file = readdirSync(dir).filter((f) => f.endsWith('.wav')).sort()[0]!;
  return loadSherpa().readWave(join(dir, file));
}

async function transcribe(chunks: Array<{ samples: Float32Array; sampleRate: number }>) {
  const rec = new NodeSherpaRecognizer();
  await rec.load(resolveAsrModel(MODELS, spec));
  const words: HeardWord[] = [];
  rec.onWords((w) => words.push(...w));
  for (const c of chunks) {
    const step = Math.round(c.sampleRate * 0.1);
    for (let i = 0; i < c.samples.length; i += step) rec.accept(c.samples.slice(i, i + step), c.sampleRate);
  }
  rec.flush();
  const rtf = rec.realtimeFactor();
  rec.dispose();
  return { words, rtf };
}

describe.skipIf(!present)('NodeSherpaRecognizer (needs `npm run harness -- fetch-models`)', () => {
  it('transcribes a test wave into ordered, final, timed words', async () => {
    const wave = testWave();
    const dur = wave.samples.length / wave.sampleRate;
    const { words, rtf } = await transcribe([wave]);
    expect(words.length).toBeGreaterThan(3);
    expect(words.every((w) => w.final)).toBe(true);
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
    expect(words[0]!.start).toBeGreaterThanOrEqual(0);
    expect(words.at(-1)!.start).toBeLessThan(dur + 0.5);
    expect(rtf).toBeGreaterThan(0);
    expect(rtf).toBeLessThan(1);
  });

  it('flushes at the sample rate it was fed (e.g. 22.05 kHz TTS audio)', async () => {
    const wave = testWave();
    const rate = 22050;
    const n = Math.floor((wave.samples.length * rate) / wave.sampleRate);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * wave.sampleRate) / rate;
      const j = Math.floor(x);
      const a = wave.samples[j] ?? 0;
      samples[i] = a + ((wave.samples[j + 1] ?? a) - a) * (x - j);
    }
    const { words } = await transcribe([{ samples, sampleRate: rate }]);
    expect(words.length).toBeGreaterThan(3);
    expect(words.at(-1)!.start).toBeLessThan(n / rate + 0.5);
  });

  it('keeps one continuous clock across an endpoint', async () => {
    const wave = testWave();
    const dur = wave.samples.length / wave.sampleRate;
    const silence = { samples: new Float32Array(wave.sampleRate * 3), sampleRate: wave.sampleRate };
    const { words } = await transcribe([wave, silence, wave]);
    const last = words.at(-1)!;
    expect(words.some((w) => w.start < dur)).toBe(true);
    expect(words.some((w) => w.start > dur + 2)).toBe(true);
    const second = words.find((w) => w.start > dur + 2)!;
    expect(second.start).toBeLessThan(dur + 3 + 1.0);
    expect(last.start).toBeGreaterThan(dur + 3);
    expect(last.start).toBeLessThan(2 * dur + 3 + 0.5);
  });
});
