import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { importScript, sniffUnsupported } from '../src/import';

const PLAY = [
  'THE TRAGEDY OF HAMLET',
  'CHARACTERS',
  'HAMLET, a prince',
  'HORATIO, his friend',
  'ACT I',
  'HAMLET',
  'To be, or not to be.',
  'HORATIO',
  'My lord.',
  '(He sits.)',
  'HAMLET',
  'Then sit.',
  'HORATIO',
  'I sit.',
].join('\n');

const SPEECHES: Array<[string, string]> = [
  ['HAMLET', 'To be, or not to be, that is the question: whether tis nobler in the mind to suffer'],
  ['HORATIO', 'My lord, I came to see your father’s funeral, and stayed to see the wedding after it.'],
  ['HAMLET', 'I pray thee do not mock me, fellow student; I think it was to see my mother’s wedding.'],
  ['HORATIO', 'Indeed, my lord, it followed hard upon, so hard that the baked meats did serve them both.'],
];

const shape = (units: Array<{ kind: string; characterId?: string }>) => units.map((u) => [u.kind, u.characterId ?? null]);
const EXPECTED_SHAPE = [
  ['characterName', null],
  ['dialogue', 'hamlet'],
  ['characterName', null],
  ['dialogue', 'horatio'],
  ['characterName', null],
  ['dialogue', 'hamlet'],
  ['characterName', null],
  ['dialogue', 'horatio'],
  ['direction', null],
];

describe('importScript', () => {
  it('imports pasted text into a tagged script', async () => {
    const { script, warnings, pages } = await importScript({ kind: 'text', text: PLAY });
    expect(script.title).toBe('THE TRAGEDY OF HAMLET');
    expect(shape(script.units)).toEqual([
      ['frontMatter', null],
      ['heading', null],
      ['characterName', null],
      ['dialogue', 'hamlet'],
      ['characterName', null],
      ['dialogue', 'horatio'],
      ['direction', null],
      ['characterName', null],
      ['dialogue', 'hamlet'],
      ['characterName', null],
      ['dialogue', 'horatio'],
    ]);
    expect(script.characters.map((c) => c.id)).toEqual(['hamlet', 'horatio']);
    expect(warnings).toEqual([]);
    expect(pages).toBe(1);
  });

  it('keeps a pasted excerpt with no title or heading free of front matter (review focus 3)', async () => {
    const { script } = await importScript({
      kind: 'text',
      text: ['NORA. Hello, Torvald.', 'HELMER. Is that my lark?', 'NORA. It is.', 'HELMER. Come here.'].join('\n'),
    });
    expect(shape(script.units)).toEqual([
      ['dialogue', 'nora'],
      ['dialogue', 'helmer'],
      ['dialogue', 'nora'],
      ['dialogue', 'helmer'],
    ]);
    expect(script.title).toBe('Untitled script');
  });

  it('uses a given title', async () => {
    expect((await importScript({ kind: 'text', text: PLAY }, { title: 'Hamlet (rehearsal)' })).script.title).toBe('Hamlet (rehearsal)');
  });

  it('imports a PDF', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const regular = await doc.embedFont(StandardFonts.TimesRoman);
    const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let y = 720;
    for (const [who, says] of SPEECHES) {
      page.drawText(who, { x: (612 - bold.widthOfTextAtSize(who, 12)) / 2, y, size: 12, font: bold });
      page.drawText(says, { x: 72, y: y - 16, size: 11, font: regular });
      y -= 40;
    }
    page.drawText('He walks slowly to the window and looks out.', { x: 108, y, size: 11, font: italic });
    const { script } = await importScript({ kind: 'pdf', bytes: await doc.save() });
    expect(shape(script.units)).toEqual(EXPECTED_SHAPE);
  });

  it('imports a Word file', async () => {
    const children = SPEECHES.flatMap(([who, says]) => [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: who, bold: true })] }),
      new Paragraph(says),
    ]);
    children.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: 'He walks slowly to the window and looks out.', italics: true })] }));
    const bytes = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
    const { script } = await importScript({ kind: 'docx', bytes });
    expect(shape(script.units)).toEqual(EXPECTED_SHAPE);
  });

  it.each([
    ['blank text', { kind: 'text' as const, text: '   \n\n' }, 'empty'],
    ['only a soft hyphen', { kind: 'text' as const, text: ' ­ ' }, 'empty'],
    ['a legacy .doc', { kind: 'docx' as const, bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]) }, 'unsupportedFormat'],
    ['an RTF file', { kind: 'pdf' as const, bytes: new TextEncoder().encode('{\\rtf1 hello}') }, 'unsupportedFormat'],
    ['garbage as PDF', { kind: 'pdf' as const, bytes: new Uint8Array([1, 2, 3, 4]) }, 'unreadable'],
  ])('rejects %s', async (_, input, code) => {
    await expect(importScript(input)).rejects.toMatchObject({ code });
  });

  it('rejects a PDF with no text as scanned', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawRectangle({ x: 10, y: 10, width: 40, height: 40 });
    await expect(importScript({ kind: 'pdf', bytes: await doc.save() })).rejects.toMatchObject({ code: 'noTextLayer' });
  });

  it('warns when no speaker is found', async () => {
    const { warnings } = await importScript({ kind: 'text', text: 'It was a dark and stormy night.\nThe rain fell.\nNobody spoke.' });
    expect(warnings).toContainEqual({ code: 'noSpeakers' });
  });

  it('warns about mixed conventions', async () => {
    const text = ['Nora: Hi.', 'Helmer: Hello.', 'Nora: Bye.', 'Helmer: Go.', 'Nora: Fine.', 'Helmer: Yes.', 'NORA', 'Again.', 'HELMER', 'Again?'].join('\n');
    expect((await importScript({ kind: 'text', text })).warnings).toContainEqual({ code: 'mixedConventions', conventions: ['inlineColon', 'ownLine'] });
  });

  it('warns about an ambiguous alias and about many flagged units', async () => {
    // Both long names appear twice so they are known cues from the first line (no front matter); 8 of 24 units are LADY speeches.
    const text = ['LADY BRACKNELL', 'Good.', 'LADY MACBETH', 'Out.', 'LADY BRACKNELL', 'Indeed.', 'LADY MACBETH', 'Out, out.', ...Array.from({ length: 8 }, (_, i) => `LADY\nLine ${'abcdefgh'[i]}.`)].join('\n');
    const { warnings } = await importScript({ kind: 'text', text });
    expect(warnings).toContainEqual({ code: 'ambiguousAlias', token: 'LADY', candidates: ['LADY BRACKNELL', 'LADY MACBETH'] });
    expect(warnings.some((w) => w.code === 'manyFlagged')).toBe(true);
  });
});

describe('sniffUnsupported', () => {
  it('recognises legacy Word and RTF signatures', () => {
    expect(sniffUnsupported(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true);
    expect(sniffUnsupported(new TextEncoder().encode('{\\rtf1'))).toBe(true);
    expect(sniffUnsupported(new TextEncoder().encode('%PDF-1.7'))).toBe(false);
  });
});

describe('running-line rules keep headings and numbered speakers (ruling R22)', () => {
  it('imports Scene 1..Scene 4 as four headings', async () => {
    const parts: string[] = ['MY PLAY', ''];
    const words = ['apples', 'rivers', 'clocks', 'lamps', 'doors', 'birds', 'coats', 'ships', 'roads', 'bells', 'cards', 'trees'];
    let w = 0;
    for (let s = 1; s <= 4; s++) {
      parts.push(`Scene ${s}`, '');
      for (let i = 0; i < 3; i++) parts.push('ANNA', `Anna talks about ${words[w++ % 12]} today.`, 'BEN', `Ben answers about ${words[w++ % 12]} again.`);
    }
    const r = await importScript({ kind: 'text', text: parts.join('\n') });
    expect(r.script.units.filter((u) => u.kind === 'heading').map((u) => u.text)).toEqual(['Scene 1', 'Scene 2', 'Scene 3', 'Scene 4']);
  });

  it('gives GUARD 1 and GUARD 2 their own characters', async () => {
    const text = [
      'SCENE ONE',
      ...['one', 'two', 'three'].flatMap((n) => ['GUARD 1', `Halt, number ${n}.`, 'GUARD 2', `Pass, number ${n}.`, 'ANNA', `Thank you, number ${n}.`]),
    ].join('\n');
    const r = await importScript({ kind: 'text', text });
    expect(r.script.characters.map((c) => c.id).sort()).toEqual(['anna', 'guard-1', 'guard-2']);
    const speeches = (id: string) => r.script.units.filter((u) => u.kind === 'dialogue' && u.characterId === id);
    expect(speeches('guard-1')).toHaveLength(3);
    expect(speeches('guard-2')).toHaveLength(3);
  });

  it('gives one-off numbered speakers in a multi-page paste their own characters (R28)', async () => {
    const out: string[] = [];
    for (let p = 1; p <= 8; p++) {
      for (let k = 0; k < 22; k++) out.push(k % 2 ? 'HELMER' : 'NORA', `Speech ${String.fromCharCode(97 + p)} ${String.fromCharCode(97 + k)} goes on here.`);
      if (p === 2) out.push('SOLDIER 1', 'Halt there!');
      if (p === 4) out.push('SOLDIER 2', 'Who goes?');
      if (p === 6) out.push('SOLDIER 3', 'Only me.');
    }
    const r = await importScript({ kind: 'text', text: out.join('\n') });
    expect(r.script.characters.map((c) => c.id).sort()).toEqual(['helmer', 'nora', 'soldier-1', 'soldier-2', 'soldier-3']);
    const speech = (id: string) => r.script.units.filter((u) => u.kind === 'dialogue' && u.characterId === id).map((u) => u.text);
    expect(speech('soldier-1')).toEqual(['Halt there!']);
    expect(speech('soldier-2')).toEqual(['Who goes?']);
    expect(speech('soldier-3')).toEqual(['Only me.']);
  });
});
