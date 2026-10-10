import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ALL_MODELS, TTS_MODEL, assertSafeMembers, checkLock, extractAndInstall } from '../src/models';

describe('model lock', () => {
  it('refuses an unpinned hash unless recording, and records when asked', () => {
    const lock: Record<string, string> = {};
    expect(() => checkLock(lock, 'm', 'abc')).toThrow(/No pinned SHA-256 for m.*fetch-models --record/);
    expect(lock).toEqual({});
    expect(checkLock(lock, 'm', 'abc', { record: true })).toBe('recorded');
    expect(lock).toEqual({ m: 'abc' });
  });

  it('verifies a matching hash and rejects a changed one, with or without record', () => {
    const lock: Record<string, string> = { m: 'abc' };
    expect(checkLock(lock, 'm', 'abc')).toBe('verified');
    expect(() => checkLock(lock, 'm', 'def')).toThrow(/Checksum mismatch/);
    expect(() => checkLock(lock, 'm', 'def', { record: true })).toThrow(/Checksum mismatch/);
    expect(lock).toEqual({ m: 'abc' });
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

describe('assertSafeMembers', () => {
  it('accepts members inside the model directory', () => {
    expect(() => assertSafeMembers(['model-dir/', 'model-dir/a.onnx', './model-dir/sub/b.txt', 'model-dir'], 'model-dir')).not.toThrow();
  });

  it.each([['/etc/passwd'], ['../x'], ['model-dir/../../x'], ['a/../../x'], ['other-dir/file'], ['model-dir-evil/file']])('rejects %s', (name) => {
    expect(() => assertSafeMembers(['model-dir/ok', name], 'model-dir')).toThrow(/Unsafe archive member/);
  });
});
