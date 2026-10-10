import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TtsEngine } from './tts';

type Audio = { samples: Float32Array; sampleRate: number };

export function cacheKey(modelId: string, sid: number, speed: number, text: string): string {
  return createHash('sha256').update(JSON.stringify([modelId, sid, speed, text])).digest('hex');
}

/** File layout: uint32 LE sample rate, then float32 LE samples. */
function encode(a: Audio): Buffer {
  const buf = Buffer.alloc(4 + a.samples.length * 4);
  buf.writeUInt32LE(a.sampleRate, 0);
  Buffer.from(a.samples.buffer, a.samples.byteOffset, a.samples.byteLength).copy(buf, 4);
  return buf;
}

function decode(buf: Buffer): Audio | null {
  if (buf.length < 4 || (buf.length - 4) % 4 !== 0) return null;
  const sampleRate = buf.readUInt32LE(0);
  if (sampleRate === 0) return null;
  // slice() copies into a fresh, 4-byte-aligned ArrayBuffer.
  const samples = new Float32Array(buf.buffer.slice(buf.byteOffset + 4, buf.byteOffset + buf.length));
  return { samples, sampleRate };
}

/**
 * Piper/VITS samples noise, so the same text renders differently each time. Wrapping the engine in this cache
 * renders each (model, voice, speed, text) once and reads it back afterwards, which makes harness runs repeatable.
 */
export function cachedTts(inner: TtsEngine, dir: string, modelId: string): TtsEngine {
  mkdirSync(dir, { recursive: true });
  return {
    synth(text, sid, speed) {
      const file = join(dir, `${cacheKey(modelId, sid, speed, text)}.f32`);
      const hit = existsSync(file) ? decode(readFileSync(file)) : null;
      if (hit) return hit;
      const audio = inner.synth(text, sid, speed);
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, encode(audio));
      renameSync(tmp, file);
      return audio;
    },
  };
}
