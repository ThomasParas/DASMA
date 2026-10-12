import { describe, expect, it } from 'vitest';
import { isSupportedBrowser } from '../src/browser';
import { safeFileName, stem } from '../src/files';

describe('isSupportedBrowser', () => {
  it('accepts Chrome and Edge, not Safari or Firefox', () => {
    expect(isSupportedBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe(true);
    expect(isSupportedBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')).toBe(true);
    expect(isSupportedBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe(false);
    expect(isSupportedBrowser('Mozilla/5.0 (Macintosh; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe(false);
  });
});

describe('file names', () => {
  it('takes the stem and replaces characters files cannot hold', () => {
    expect(stem('hamlet.final.pdf')).toBe('hamlet.final');
    expect(stem('README')).toBe('README');
    expect(safeFileName('Romeo/Juliet: Act 1')).toBe('Romeo-Juliet- Act 1');
    expect(safeFileName(' / ')).toBe('-');
    expect(safeFileName('   ')).toBe('script');
  });
});
