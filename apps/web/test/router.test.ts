import { describe, expect, it } from 'vitest';
import { href, parseHash } from '../src/router';

describe('router', () => {
  it('parses every route', () => {
    expect(parseHash('')).toEqual({ name: 'library' });
    expect(parseHash('#/')).toEqual({ name: 'library' });
    expect(parseHash('#/new')).toEqual({ name: 'new' });
    expect(parseHash('#/p/abc')).toEqual({ name: 'production', id: 'abc' });
    expect(parseHash('#/p/abc/fix')).toEqual({ name: 'fix', id: 'abc' });
    expect(parseHash('#/p/abc/import')).toEqual({ name: 'import', id: 'abc' });
    expect(parseHash('#/p/abc/reimport')).toEqual({ name: 'reimport', id: 'abc' });
    expect(parseHash('#/p/abc/zzz')).toEqual({ name: 'notFound' });
    expect(parseHash('#/elsewhere')).toEqual({ name: 'notFound' });
  });

  it('builds hrefs that parse back', () => {
    for (const r of [{ name: 'library' }, { name: 'new' }, { name: 'production', id: 'a b' }, { name: 'fix', id: 'x' }] as const) {
      expect(parseHash(href(r))).toEqual(r);
    }
  });
});
