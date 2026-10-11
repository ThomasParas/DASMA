import { AlignmentType, Document, Packer, PageBreak, Paragraph, TextRun } from 'docx';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractDocx, readStyles } from '../src/extract/docx';
import { thrownCode } from './helpers';

async function docxOf(children: Paragraph[]): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function rawDocx(body: string, styles?: string): Uint8Array {
  return zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    ...(styles ? { 'word/styles.xml': strToU8(`<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`) } : {}),
  });
}

describe('extractDocx', () => {
  it('reads alignment, indentation, bold and italic runs', async () => {
    const doc = extractDocx(
      await docxOf([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HAMLET', bold: true })] }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun('To be, '), new TextRun({ text: '(aside)', italics: true }), new TextRun(' or not')],
        }),
      ]),
    );
    expect(doc.source).toBe('docx');
    const [name, speech] = doc.lines;
    expect([name.text, name.centered, name.bold, name.left]).toEqual(['HAMLET', true, true, 0]);
    expect([speech.text, speech.centered, speech.left, speech.italic]).toEqual(['To be, (aside) or not', false, 36, false]);
    expect(speech.spans.map((s) => [s.text, s.italic])).toEqual([
      ['To be, ', false],
      ['(aside)', true],
      [' or not', false],
    ]);
  });

  it('turns leading tabs into indent and keeps an interior tab as whitespace', async () => {
    const doc = extractDocx(await docxOf([new Paragraph({ children: [new TextRun('\tNORA:\tHello')] })]));
    expect([doc.lines[0].text, doc.lines[0].left]).toEqual(['NORA:\tHello', 36]);
  });

  it('starts a new page at a page break', async () => {
    const doc = extractDocx(
      await docxOf([new Paragraph('First page'), new Paragraph({ children: [new PageBreak()] }), new Paragraph('Second page')]),
    );
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['First page', 1],
      ['Second page', 2],
    ]);
    expect(doc.realPages).toBe(true);
    expect(doc.pages).toBe(2);
  });

  it('estimates pages when there are no page breaks', async () => {
    const doc = extractDocx(await docxOf(Array.from({ length: 51 }, (_, i) => new Paragraph(`Line ${i}`))));
    expect(doc.realPages).toBe(false);
    expect(doc.lines[50].page).toBe(2);
  });

  it('applies paragraph-style italics unless a run turns them off', () => {
    const styles =
      '<w:style w:type="paragraph" w:styleId="Dir"><w:name w:val="Direction"/><w:rPr><w:i/></w:rPr></w:style>';
    const body =
      '<w:p><w:pPr><w:pStyle w:val="Dir"/></w:pPr><w:r><w:t>He sits.</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Dir"/></w:pPr><w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t>Not italic.</w:t></w:r></w:p>';
    const doc = extractDocx(rawDocx(body, styles));
    expect(doc.lines.map((l) => [l.text, l.italic])).toEqual([
      ['He sits.', true],
      ['Not italic.', false],
    ]);
  });

  it('turns a soft line break into a space', () => {
    const doc = extractDocx(rawDocx('<w:p><w:r><w:t>To be,</w:t><w:br/><w:t>or not to be.</w:t></w:r></w:p>'));
    expect(doc.lines.map((l) => l.text)).toEqual(['To be, or not to be.']);
  });

  it('counts an explicit page break once when Word also writes lastRenderedPageBreak', () => {
    const doc = extractDocx(
      rawDocx(
        '<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
          '<w:p><w:r><w:lastRenderedPageBreak/><w:t>Two</w:t></w:r></w:p>',
      ),
    );
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
    ]);
    expect(doc.pages).toBe(2);
  });

  it('counts pageBreakBefore once when Word also writes lastRenderedPageBreak', () => {
    const doc = extractDocx(
      rawDocx(
        '<w:p><w:r><w:t>One</w:t></w:r></w:p>' +
          '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:lastRenderedPageBreak/><w:t>Two</w:t></w:r></w:p>',
      ),
    );
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
    ]);
    expect(doc.pages).toBe(2);
  });

  it('starts a new page at a lastRenderedPageBreak on its own', () => {
    const doc = extractDocx(
      rawDocx('<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:r><w:lastRenderedPageBreak/><w:t>Two</w:t></w:r></w:p>'),
    );
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
    ]);
    expect(doc.realPages).toBe(true);
  });

  it('starts a new page at pageBreakBefore', () => {
    const doc = extractDocx(
      rawDocx('<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Two</w:t></w:r></w:p>'),
    );
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
    ]);
    expect(doc.pages).toBe(2);
  });

  it('treats damaged XML as unreadable', () => {
    expect(thrownCode(() => extractDocx(rawDocx('<w:p><w:r><w:t>&#x110000;</w:t></w:r></w:p>')))).toBe('unreadable');
  });

  it('decodes XML entities', () => {
    const doc = extractDocx(rawDocx('<w:p><w:r><w:t>Tom &amp; Jerry &#8212; &lt;yes&gt;</w:t></w:r></w:p>'));
    expect(doc.lines[0].text).toBe('Tom & Jerry — <yes>');
  });

  it('rejects bytes that are not a zip as unreadable', () => {
    expect(thrownCode(() => extractDocx(new Uint8Array([1, 2, 3, 4])))).toBe('unreadable');
  });

  it('says a Pages file is unsupported', () => {
    expect(thrownCode(() => extractDocx(zipSync({ 'Index/Document.iwa': new Uint8Array([0]) })))).toBe('unsupportedFormat');
  });

  it('says a zip without a Word document is unreadable', () => {
    expect(thrownCode(() => extractDocx(zipSync({ 'hello.txt': strToU8('hi') })))).toBe('unreadable');
  });
});

describe('readStyles', () => {
  it('reads italic, bold, centring and indent per style id', () => {
    const styles = readStyles(
      `<w:styles ${W}><w:style w:styleId="Cue"><w:pPr><w:jc w:val="center"/><w:ind w:left="1440"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`,
    );
    expect(styles.get('Cue')).toEqual({ centered: true, left: 72, bold: true });
  });
});
