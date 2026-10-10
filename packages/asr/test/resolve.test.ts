import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findModel } from '../src/catalog';
import { resolveAsrModel } from '../src/node/resolve';

const spec = findModel('zipformer-en-2023-06-21');

function fakeModelDir(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dasma-models-'));
  const dir = join(root, spec.dirName);
  mkdirSync(dir);
  for (const f of files) writeFileSync(join(dir, f), '');
  return root;
}

describe('resolveAsrModel', () => {
  it('prefers int8 weights', () => {
    const root = fakeModelDir([
      'encoder-epoch-99-avg-1.onnx', 'encoder-epoch-99-avg-1.int8.onnx',
      'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'joiner-epoch-99-avg-1.onnx', 'tokens.txt',
    ]);
    const m = resolveAsrModel(root, spec);
    expect(m.encoder.endsWith('encoder-epoch-99-avg-1.int8.onnx')).toBe(true);
    expect(m.decoder.endsWith('decoder-epoch-99-avg-1.onnx')).toBe(true);
    expect(m.joiner.endsWith('joiner-epoch-99-avg-1.int8.onnx')).toBe(true);
    expect(m.tokens.endsWith('tokens.txt')).toBe(true);
  });

  it('explains how to fetch a missing model', () => {
    expect(() => resolveAsrModel(mkdtempSync(join(tmpdir(), 'dasma-empty-')), spec)).toThrow(/fetch-models/);
  });

  it('rejects an incomplete model directory', () => {
    expect(() => resolveAsrModel(fakeModelDir(['encoder.onnx', 'tokens.txt']), spec)).toThrow(/missing/);
  });
});
