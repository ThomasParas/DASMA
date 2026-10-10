import { describe, expect, it } from 'vitest';
import { parseEvaluateOptions } from '../src/cli-args';

const base = {
  seeds: '10',
  rooms: 'close-mic,far-field',
  patience: '0.5',
  strictness: 'word-perfect',
  'error-rate': '0.35',
  'benign-rate': '0.2',
};
const parse = (over: Partial<Record<keyof typeof base, string>> = {}) => parseEvaluateOptions({ ...base, ...over });

describe('parseEvaluateOptions', () => {
  it('parses the defaults', () => {
    expect(parse()).toEqual({
      seeds: 10,
      rooms: ['close-mic', 'far-field'],
      patience: 0.5,
      strictness: { mode: 'word-perfect' },
      errorRate: 0.35,
      benignRate: 0.2,
    });
  });

  it('accepts the boundary values', () => {
    expect(parse({ patience: '0', 'error-rate': '1', 'benign-rate': '0', seeds: '1' })).toMatchObject({ patience: 0, errorRate: 1, benignRate: 0, seeds: 1 });
  });

  it('lenient strictness carries the line match threshold', () => {
    expect(parse({ strictness: 'lenient' }).strictness).toEqual({ mode: 'lenient', lineMatchThreshold: 0.8 });
  });

  it.each(['0', '-3', '1.5', 'abc', '', ' ', '1e2', '5x'])('rejects --seeds %j', (seeds) => {
    expect(() => parse({ seeds })).toThrow(/--seeds must be a positive integer/);
  });

  it.each(['patience', 'error-rate', 'benign-rate'] as const)('rejects a non-finite or out-of-range --%s', (key) => {
    for (const bad of ['-0.1', '1.1', 'NaN', 'Infinity', 'abc', '', ' ']) {
      expect(() => parse({ [key]: bad }), `${key}=${JSON.stringify(bad)}`).toThrow(new RegExp(`--${key} must be a number from 0 to 1`));
    }
  });

  it('rejects an unknown room and names the known ones', () => {
    expect(() => parse({ rooms: 'close-mic,garage' })).toThrow(/Unknown room "garage"\. Known: close-mic, far-field, far-field-hard/);
  });

  it('dedupes rooms, keeping first-seen order, and ignores blanks around commas', () => {
    expect(parse({ rooms: 'far-field, close-mic,far-field,' }).rooms).toEqual(['far-field', 'close-mic']);
  });

  it('rejects an empty room list', () => {
    expect(() => parse({ rooms: '' })).toThrow(/--rooms needs at least one room/);
  });

  it('rejects an unknown strictness instead of silently using word-perfect', () => {
    expect(() => parse({ strictness: 'strict' })).toThrow(/--strictness must be word-perfect or lenient/);
  });
});
