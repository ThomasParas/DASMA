import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG, findModel } from '../src/catalog';

describe('model catalog', () => {
  it('has unique ids, a standard and a light ASR model, all from official sherpa-onnx releases', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODEL_CATALOG.some((m) => m.role === 'standard')).toBe(true);
    expect(MODEL_CATALOG.some((m) => m.role === 'light')).toBe(true);
    for (const m of MODEL_CATALOG) expect(m.url.startsWith('https://github.com/k2-fsa/sherpa-onnx/releases/')).toBe(true);
  });

  it('finds models by id and rejects unknown ids', () => {
    expect(findModel('zipformer-en-2023-06-21').role).toBe('standard');
    expect(() => findModel('nope')).toThrow(/Unknown model/);
  });
});
