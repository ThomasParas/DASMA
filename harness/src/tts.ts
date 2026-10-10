import { loadSherpa } from '@dasma/asr/node';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS_DIR } from './paths';
import type { Performance, Segment } from './perturb';
import { shuffle, type Rng } from './rng';

export interface TtsEngine {
  synth(text: string, sid: number, speed: number): { samples: Float32Array; sampleRate: number };
}

export interface RenderedSegment {
  seg: Segment;
  start: number;
  end: number;
}

export interface RenderedPerformance {
  samples: Float32Array;
  sampleRate: number;
  segments: RenderedSegment[];
}

/** Speaker ids in the libritts_r Piper voice (904 speakers) chosen to sound distinct. */
export const VOICE_POOL = [3, 14, 27, 45, 63, 88, 102, 130, 166, 199, 240, 287];
export const TTS_MODEL_DIR = join(MODELS_DIR, 'vits-piper-en_US-libritts_r-medium');

export function assignVoices(speakers: string[], rng: Rng): Record<string, number> {
  const pool = shuffle(VOICE_POOL, rng);
  return Object.fromEntries(speakers.map((s, i) => [s, pool[i % pool.length]!]));
}

export function renderPerformance(
  perf: Performance,
  voices: Record<string, number>,
  tts: TtsEngine,
  speed = 1,
): RenderedPerformance {
  const chunks: Float32Array[] = [];
  const segments: RenderedSegment[] = [];
  let sampleRate = 0;
  let total = 0;
  for (const seg of perf.segments) {
    const audio = tts.synth(seg.text, voices[seg.speaker] ?? VOICE_POOL[0]!, speed);
    if (!sampleRate) sampleRate = audio.sampleRate;
    const pad = new Float32Array(Math.round(seg.pauseBefore * sampleRate));
    chunks.push(pad, audio.samples);
    total += pad.length;
    const start = total / sampleRate;
    total += audio.samples.length;
    segments.push({ seg, start, end: total / sampleRate });
  }
  if (!sampleRate) sampleRate = 16000;
  const tail = new Float32Array(sampleRate);
  chunks.push(tail);
  total += tail.length;
  const samples = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    samples.set(c, offset);
    offset += c.length;
  }
  return { samples, sampleRate, segments };
}

export function createSherpaTts(modelDir: string = TTS_MODEL_DIR): TtsEngine {
  const model = readdirSync(modelDir).find((f) => f.endsWith('.onnx'));
  if (!model) throw new Error(`No .onnx voice in ${modelDir}. Run: npm run harness -- fetch-models`);
  const tts = new (loadSherpa().OfflineTts)({
    model: {
      vits: { model: join(modelDir, model), tokens: join(modelDir, 'tokens.txt'), dataDir: join(modelDir, 'espeak-ng-data') },
      numThreads: 2,
      provider: 'cpu',
      debug: false,
    },
    maxNumSentences: 1,
  });
  return {
    synth(text, sid, speed) {
      const audio = tts.generate({ text, sid, speed });
      return { samples: Float32Array.from(audio.samples), sampleRate: audio.sampleRate };
    },
  };
}
