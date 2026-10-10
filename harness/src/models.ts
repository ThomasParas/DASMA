import { MODEL_CATALOG, type ModelSpec } from '@dasma/asr';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { LOCK_FILE, MODELS_DIR } from './paths';

export const TTS_MODEL: ModelSpec = {
  id: 'piper-en_US-libritts_r-medium',
  kind: 'tts-vits',
  role: 'tts',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-libritts_r-medium.tar.bz2',
  dirName: 'vits-piper-en_US-libritts_r-medium',
  license: 'Piper voice trained on LibriTTS-R. Used only to generate test audio; never shipped.',
};

export const ALL_MODELS: ModelSpec[] = [...MODEL_CATALOG, TTS_MODEL];

export function checkLock(lock: Record<string, string>, id: string, sha256: string): 'recorded' | 'verified' {
  const known = lock[id];
  if (!known) {
    lock[id] = sha256;
    return 'recorded';
  }
  if (known !== sha256) throw new Error(`Checksum mismatch for ${id}: expected ${known}, got ${sha256}`);
  return 'verified';
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function fetchModels(only?: string, log: (msg: string) => void = console.log): Promise<void> {
  mkdirSync(MODELS_DIR, { recursive: true });
  const lock: Record<string, string> = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : {};
  for (const spec of ALL_MODELS) {
    if (only && spec.id !== only) continue;
    if (existsSync(join(MODELS_DIR, spec.dirName))) {
      log(`✓ ${spec.id} already present`);
      continue;
    }
    const archive = join(MODELS_DIR, `${spec.dirName}.tar.bz2`);
    log(`↓ ${spec.id}\n  ${spec.url}`);
    const res = await fetch(spec.url);
    if (!res.ok || !res.body) throw new Error(`Download failed for ${spec.id}: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(archive));
    const sha = await sha256File(archive);
    log(`  sha256 ${sha} (${checkLock(lock, spec.id, sha)})`);
    execFileSync('tar', ['-xjf', archive, '-C', MODELS_DIR]);
    rmSync(archive);
    writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  }
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
}
