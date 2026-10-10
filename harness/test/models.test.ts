import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_MODELS, TTS_MODEL, checkLock, extractAndInstall } from '../src/models';

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

describe('extractAndInstall', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dasma-models-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('moves the extracted model into place and removes the temp dir', () => {
    extractAndInstall('archive', root, 'm', 'model-dir', (_archive, dest) => {
      mkdirSync(join(dest, 'model-dir'));
      writeFileSync(join(dest, 'model-dir', 'file'), 'x');
    });
    expect(existsSync(join(root, 'model-dir', 'file'))).toBe(true);
    expect(readdirSync(root)).toEqual(['model-dir']);
  });

  it('leaves no partial model or temp dir when extraction fails midway', () => {
    expect(() =>
      extractAndInstall('archive', root, 'm', 'model-dir', (_archive, dest) => {
        mkdirSync(join(dest, 'model-dir'));
        writeFileSync(join(dest, 'model-dir', 'half'), 'x');
        throw new Error('tar interrupted');
      }),
    ).toThrow(/tar interrupted/);
    expect(existsSync(join(root, 'model-dir'))).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it('rejects an archive that lacks the expected directory', () => {
    expect(() => extractAndInstall('archive', root, 'm', 'model-dir', () => {})).toThrow(/did not contain model-dir/);
    expect(readdirSync(root)).toEqual([]);
  });

  it('clears a stale temp dir from an earlier interrupted run', () => {
    mkdirSync(join(root, '.extract-m', 'model-dir'), { recursive: true });
    writeFileSync(join(root, '.extract-m', 'model-dir', 'stale'), 'x');
    extractAndInstall('archive', root, 'm', 'model-dir', (_a, dest) => mkdirSync(join(dest, 'model-dir')));
    expect(readdirSync(join(root, 'model-dir'))).toEqual([]);
  });
});
