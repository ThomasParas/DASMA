import { MODEL_CATALOG, type ModelSpec } from '@dasma/asr';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

export function checkLock(
  lock: Record<string, string>,
  id: string,
  sha256: string,
  { record = false }: { record?: boolean } = {},
): 'recorded' | 'verified' {
  const known = lock[id];
  if (!known) {
    if (!record) {
      throw new Error(`No pinned SHA-256 for ${id} in models.lock.json. A maintainer must run: npm run harness -- fetch-models --record`);
    }
    lock[id] = sha256;
    return 'recorded';
  }
  if (known !== sha256) throw new Error(`Checksum mismatch for ${id}: expected ${known}, got ${sha256}`);
  return 'verified';
}

/** Reject archive members that are absolute, climb out with "..", or live outside `<dirName>/`. */
export function assertSafeMembers(names: string[], dirName: string): void {
  for (const raw of names) {
    const name = raw.replace(/^(\.\/)+/, '');
    if (!name || name === '.') continue;
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`Unsafe archive member (absolute path): ${raw}`);
    if (name.split(/[\\/]/).includes('..')) throw new Error(`Unsafe archive member (path traversal): ${raw}`);
    if (name !== dirName && !name.startsWith(`${dirName}/`)) throw new Error(`Unsafe archive member (outside ${dirName}/): ${raw}`);
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export type Extractor = (archive: string, destDir: string, dirName: string) => void;

const tarExtract: Extractor = (archive, destDir, dirName) => {
  const listing = execFileSync('tar', ['-tjf', archive], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  assertSafeMembers(listing.split('\n').filter(Boolean), dirName);
  execFileSync('tar', ['-xjf', archive, '-C', destDir, '--no-same-owner']);
};

/**
 * Extract into a fresh temp directory, check the expected model directory came out, then move it into place.
 * A failed or interrupted extraction never leaves a partial `<modelsDir>/<dirName>` behind.
 */
export function extractAndInstall(archive: string, modelsDir: string, id: string, dirName: string, extract: Extractor = tarExtract): void {
  const temp = join(modelsDir, `.extract-${id}`);
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true });
  try {
    extract(archive, temp, dirName);
    if (!existsSync(join(temp, dirName))) throw new Error(`Archive for ${id} did not contain ${dirName}/`);
    renameSync(join(temp, dirName), join(modelsDir, dirName));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export async function fetchModels(only?: string, log: (msg: string) => void = console.log, record = false): Promise<void> {
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
    try {
      const res = await fetch(spec.url);
      if (!res.ok || !res.body) throw new Error(`Download failed for ${spec.id}: HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(archive));
      const sha = await sha256File(archive);
      log(`  sha256 ${sha} (${checkLock(lock, spec.id, sha, { record })})`);
      extractAndInstall(archive, MODELS_DIR, spec.id, spec.dirName);
      writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
    } finally {
      rmSync(archive, { force: true });
    }
  }
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
}
