import { cleanDoc, extractPdf } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { buildParas } from '../../src/corpus/paras';
import { STYLES } from '../../src/corpus/styles';
import type { Para } from '../../src/corpus/types';
import { LINE_NUMBER_GAP, PAGE_W, writePdf } from '../../src/corpus/write-pdf';
import { mulberry32 } from '../../src/rng';
import { MINI_PLAY } from '../helpers/mini-play';

const LOOK = { font: 'Times' as const, size: 12, margin: 72 };
const speech = (text: string): Para => ({ runs: [{ text }], kind: 'speech', truth: [], align: 'left', indent: 0, gapBefore: false, numbered: true });

describe('writePdf', () => {
  it('draws the header, paragraphs and footer that pdf.js reads back', async () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.licensed['1'], mulberry32(1));
    const pdf = await writePdf(paras, STYLES.licensed['1'], LOOK, 'MINI PLAY');
    const doc = await extractPdf(pdf.bytes);
    expect(pdf.pages).toBe(1);
    expect(doc.lines[0].text).toBe('MINI PLAY');
    expect(doc.lines[doc.lines.length - 1].text).toBe('1');
    // The fixture's lines are short, so the column is narrow; centring is checked on a full document in Task 15.
    const cue = doc.lines.find((l) => l.text === 'HAMLET')!;
    expect(cue.left).toBeGreaterThan(250);
    expect(doc.lines.some((l) => l.text === '(Enter Hamlet and Horatio.)' && l.italic)).toBe(true);
    expect(pdf.paraPage.every((p) => p === 1)).toBe(true);
  });

  it('is deterministic', async () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.licensed['1'], mulberry32(1));
    const a = await writePdf(paras, STYLES.licensed['1'], LOOK, 'MINI');
    const b = await writePdf(paras, STYLES.licensed['1'], LOOK, 'MINI');
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  it('hyphenates long words at the wrap, and clean-up rejoins them', async () => {
    const pdf = await writePdf([speech(Array(40).fill('incomprehensibilities').join(' '))], STYLES.licensed['3'], { ...LOOK, margin: 72 }, 'T');
    expect(pdf.drawn.some((d) => d.text.endsWith('-'))).toBe(true);
    const clean = cleanDoc(await extractPdf(pdf.bytes));
    const joined = clean.lines.map((l) => l.text).join(' ');
    expect(joined.match(/incomprehensibilities/g)).toHaveLength(40);
  });

  it('numbers every fifth line in the right margin, and clean-up removes the numbers', async () => {
    const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    const pdf = await writePdf(WORDS.map((w) => speech(`This is verse line ${w} of the scene.`)), STYLES.classical['2'], LOOK, 'T');
    const numbers = pdf.drawn.filter((d) => d.para === -1).map((d) => [d.text, d.x]);
    expect(numbers).toEqual([
      ['5', PAGE_W - LOOK.margin + LINE_NUMBER_GAP],
      ['10', PAGE_W - LOOK.margin + LINE_NUMBER_GAP],
    ]);
    const clean = cleanDoc(await extractPdf(pdf.bytes));
    expect(clean.lines.every((l) => l.text.endsWith('scene.'))).toBe(true);
  });

  it('flows onto new pages and records each paragraph’s page', async () => {
    const pdf = await writePdf(Array.from({ length: 120 }, (_, i) => speech(`Paragraph ${i}.`)), STYLES.word['1'], LOOK, 'T');
    expect(pdf.pages).toBeGreaterThan(1);
    expect(pdf.paraPage[0]).toBe(1);
    expect(pdf.paraPage[119]).toBe(pdf.pages);
    expect(pdf.paraPage.every((p, i) => i === 0 || p >= pdf.paraPage[i - 1])).toBe(true);
  });
});
