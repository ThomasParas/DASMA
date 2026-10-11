import { describe, expect, it } from 'vitest';
import { estimatedPages } from '../src/extract/pages';
import { extractText } from '../src/extract/text';

describe('extractText', () => {
  it('reads indentation from leading spaces and tabs, and skips blank lines', () => {
    const doc = extractText('HAMLET\n\n    To be, or not to be.\n\t(He sits.)\r\n');
    expect(doc.source).toBe('text');
    expect(doc.lines.map((l) => [l.text, l.left])).toEqual([
      ['HAMLET', 0],
      ['To be, or not to be.', 24],
      ['(He sits.)', 24],
    ]);
    expect(doc.lines[0].spans).toEqual([{ text: 'HAMLET', left: 0, right: 36, italic: false, bold: false }]);
    expect(doc.lines.every((l) => !l.centered && !l.italic && !l.bold && l.size === 0)).toBe(true);
  });

  it('starts a new page at each form feed', () => {
    const doc = extractText('One\fTwo\nThree\f\fFour');
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
      ['Three', 2],
      ['Four', 4],
    ]);
    expect(doc.realPages).toBe(true);
    expect(doc.pages).toBe(4);
  });

  it('estimates pages when there are no form feeds', () => {
    const doc = extractText(Array.from({ length: 51 }, (_, i) => `Line ${i}`).join('\n'));
    expect(doc.realPages).toBe(false);
    expect(doc.lines[49].page).toBe(1);
    expect(doc.lines[50].page).toBe(2);
    expect(doc.pages).toBe(2);
  });

  it('gives an empty document no pages', () => {
    expect(extractText('  \n\n').pages).toBe(0);
  });
});

describe('estimatedPages', () => {
  it('counts a long line as several page lines', () => {
    expect(estimatedPages(['x'.repeat(80 * 49), 'a', 'b'])).toEqual([1, 1, 2]);
  });
});
