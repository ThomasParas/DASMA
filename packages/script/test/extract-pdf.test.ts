import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { extractPdf, groupItems, mapPdfError } from '../src/extract/pdf';

interface Fonts {
  regular: PDFFont;
  italic: PDFFont;
  bold: PDFFont;
}

async function pdfOf(pages: Array<(page: PDFPage, fonts: Fonts) => void>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  for (const draw of pages) draw(doc.addPage([612, 792]), fonts);
  return doc.save();
}

const LONG = 'Whether tis nobler in the mind to suffer the slings and arrows of outrageous fortune,';

describe('extractPdf', () => {
  it('reads lines in order with centring, italic and bold', async () => {
    const bytes = await pdfOf([
      (page, f) => {
        const w = f.bold.widthOfTextAtSize('HAMLET', 12);
        page.drawText('HAMLET', { x: (612 - w) / 2, y: 700, size: 12, font: f.bold });
        for (let i = 0; i < 6; i++) page.drawText(LONG, { x: 72, y: 684 - i * 16, size: 12, font: f.regular });
        page.drawText('(He sits.)', { x: 108, y: 580, size: 12, font: f.italic });
      },
    ]);
    const doc = await extractPdf(bytes);
    expect(doc.source).toBe('pdf');
    expect(doc.realPages).toBe(true);
    expect(doc.pages).toBe(1);
    expect(doc.lines.map((l) => l.text)).toEqual(['HAMLET', LONG, LONG, LONG, LONG, LONG, LONG, '(He sits.)']);
    expect(doc.lines.map((l) => l.centered)).toEqual([true, false, false, false, false, false, false, false]);
    expect(doc.lines[0].bold).toBe(true);
    expect(doc.lines[7].italic).toBe(true);
    expect(doc.lines[7].left).toBeCloseTo(108, 0);
  });

  it('joins items on one baseline, with a space only across a real gap', async () => {
    const bytes = await pdfOf([
      (page, f) => {
        const name = f.bold.widthOfTextAtSize('NORA.', 12);
        page.drawText('NORA.', { x: 72, y: 700, size: 12, font: f.bold });
        page.drawText('Hello there.', { x: 72 + name + 4, y: 700, size: 12, font: f.regular });
        const hel = f.regular.widthOfTextAtSize('Hel', 12);
        page.drawText('Hel', { x: 72, y: 680, size: 12, font: f.regular });
        page.drawText('lo', { x: 72 + hel, y: 680, size: 12, font: f.regular });
      },
    ]);
    const doc = await extractPdf(bytes);
    expect(doc.lines.map((l) => l.text)).toEqual(['NORA. Hello there.', 'Hello']);
    expect(doc.lines[0].spans.map((s) => [s.text, s.bold])).toEqual([
      ['NORA.', true],
      ['Hello there.', false],
    ]);
  });

  it('keeps words whole when every glyph is its own item (review focus 1)', async () => {
    const bytes = await pdfOf([
      (page, f) => {
        let x = 72;
        for (const ch of 'Hello') {
          page.drawText(ch, { x, y: 700, size: 12, font: f.regular });
          x += f.regular.widthOfTextAtSize(ch, 12) + 0.5;
        }
        x += 4;
        for (const ch of 'world') {
          page.drawText(ch, { x, y: 700, size: 12, font: f.regular });
          x += f.regular.widthOfTextAtSize(ch, 12) + 0.5;
        }
      },
    ]);
    expect((await extractPdf(bytes)).lines.map((l) => l.text)).toEqual(['Hello world']);
  });

  it('numbers lines by page', async () => {
    const bytes = await pdfOf([
      (page, f) => page.drawText('One', { x: 72, y: 700, size: 12, font: f.regular }),
      (page, f) => page.drawText('Two', { x: 72, y: 700, size: 12, font: f.regular }),
    ]);
    const doc = await extractPdf(bytes);
    expect(doc.pages).toBe(2);
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
    ]);
  });

  it('says a PDF with no text is scanned', async () => {
    const bytes = await pdfOf([(page) => page.drawRectangle({ x: 10, y: 10, width: 50, height: 50 })]);
    await expect(extractPdf(bytes)).rejects.toMatchObject({ code: 'noTextLayer' });
  });

  it('says bytes that are not a PDF are unreadable', async () => {
    await expect(extractPdf(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('leaves the caller’s bytes usable', async () => {
    const bytes = await pdfOf([(page, f) => page.drawText('One', { x: 72, y: 700, size: 12, font: f.regular })]);
    await extractPdf(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});

describe('mapPdfError', () => {
  it('maps a password error to encrypted and anything else to unreadable', () => {
    expect(mapPdfError({ name: 'PasswordException' }).code).toBe('encrypted');
    expect(mapPdfError(new Error('boom')).code).toBe('unreadable');
  });
});

describe('groupItems', () => {
  it('puts items within 2 pt of a baseline on one line, sorted by x', () => {
    const item = (text: string, x: number, y: number) => ({ text, x, y, width: text.length * 5, size: 10, italic: false, bold: false });
    const lines = groupItems([item('world', 110, 701), item('Hello', 72, 700), item('Next', 72, 680)], 3);
    expect(lines.map((l) => [l.text, l.page])).toEqual([
      ['Hello world', 3],
      ['Next', 3],
    ]);
  });
});
