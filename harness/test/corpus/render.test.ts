import { extractDocx, extractPdf, extractText } from '@dasma/script';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseFamilies } from '../../src/corpus/manifest';
import { buildParas } from '../../src/corpus/paras';
import { renderDocument } from '../../src/corpus/render';
import { STYLES } from '../../src/corpus/styles';
import type { DocSpec } from '../../src/corpus/types';
import { docxParaPages, writeDocx } from '../../src/corpus/write-docx';
import { mulberry32 } from '../../src/rng';
import { MINI_PLAY } from '../helpers/mini-play';

describe('writeDocx', () => {
  it('writes paragraphs that extractDocx reads back, with matching estimated pages', async () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.word['2'], mulberry32(1));
    const doc = extractDocx(await writeDocx(paras, { font: 'Arial', size: 11, margin: 72 }));
    expect(doc.lines.map((l) => l.text)).toEqual(paras.map((p) => p.runs.map((r) => r.text).join('').trim()));
    expect(doc.lines.find((l) => l.text === 'HAMLET')).toMatchObject({ centered: true, bold: true });
    expect(doc.lines.find((l) => l.text === 'Enter Hamlet and Horatio.')).toMatchObject({ italic: true, left: 36 });
    const { paraPage } = docxParaPages(paras);
    expect(doc.lines.map((l) => l.page)).toEqual(paraPage);
  });
});

const SAMPLES: DocSpec[] = [
  { family: 'licensed', play: 'earnest', variant: '1', seed: 1 },
  { family: 'licensed', play: 'earnest', variant: 'p', seed: 1 },
  { family: 'word', play: 'dolls-house', variant: '3', seed: 11 },
  { family: 'classical', play: 'hamlet', variant: '3', seed: 11 },
];

describe('renderDocument', () => {
  it.each(SAMPLES)('renders $family $play v$variant s$seed with consistent truth', async (spec) => {
    const doc = await renderDocument(spec);
    const { truth } = doc;
    expect(truth.docId).toBe(`${spec.family}-${spec.play}-v${spec.variant}-s${spec.seed}`);
    expect(truth.pages).toBeGreaterThanOrEqual(8);
    expect(truth.units.length).toBeGreaterThan(100);
    expect(truth.units.every((u) => u.page >= 1 && u.page <= truth.pages)).toBe(true);
    const ids = new Set(truth.cast.map((c) => c.id));
    expect(truth.units.filter((u) => u.kind === 'dialogue').every((u) => ids.has(u.characterId!))).toBe(true);
    expect(truth.units.some((u) => /_|\[/.test(u.kind === 'dialogue' ? u.text : ''))).toBe(false);

    const again = await renderDocument(spec);
    expect(again.truth).toEqual(truth);
    if (doc.format === 'docx') {
      expect(strFromU8(unzipSync(again.bytes!)['word/document.xml'])).toBe(strFromU8(unzipSync(doc.bytes!)['word/document.xml']));
    } else if (doc.format === 'pdf') {
      expect(Buffer.from(again.bytes!).equals(Buffer.from(doc.bytes!))).toBe(true);
    } else expect(again.text).toBe(doc.text);
  });

  it('draws licensed 1 cues that pdf.js reads as centred', async () => {
    const doc = await renderDocument({ family: 'licensed', play: 'earnest', variant: '1', seed: 1 });
    const names = new Set(doc.truth.cast.map((c) => c.name));
    const cues = (await extractPdf(doc.bytes!)).lines.filter((l) => names.has(l.text));
    expect(cues.length).toBeGreaterThan(20);
    expect(cues.filter((l) => l.centered).length / cues.length).toBeGreaterThan(0.9);
  });

  it('writes ligatures into the licensed pasted text', async () => {
    const doc = await renderDocument({ family: 'licensed', play: 'earnest', variant: 'p', seed: 1 });
    expect(doc.format).toBe('text');
    expect(doc.text).toMatch(/[ﬁﬂ]/);
  });
});

describe('renderDocument truth pages', () => {
  it('match the page count each extractor reads back from the rendered document', async () => {
    const pdf = await renderDocument({ family: 'licensed', play: 'earnest', variant: '1', seed: 1 });
    const docx = await renderDocument({ family: 'word', play: 'dolls-house', variant: '3', seed: 11 });
    const text = await renderDocument({ family: 'classical', play: 'hamlet', variant: '3', seed: 11 });
    const read = [(await extractPdf(pdf.bytes!)).pages, extractDocx(docx.bytes!).pages, extractText(text.text!).pages];
    expect(read).toEqual([pdf.truth.pages, docx.truth.pages, text.truth.pages]);
    expect(Math.min(...read)).toBeGreaterThan(8);
  });
});

describe('parseFamilies', () => {
  it('accepts known families and rejects others', () => {
    expect(parseFamilies('word,classical')).toEqual(['word', 'classical']);
    expect(() => parseFamilies('word,poetry')).toThrow(/poetry/);
    expect(() => parseFamilies('')).toThrow(/at least one/);
  });
});
