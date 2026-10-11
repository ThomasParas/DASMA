import { estimatedPages } from '@dasma/script';
import type { DrawnLine, Para } from './types';

export interface TextLayout {
  text: string;
  pages: number;
  /** Page each paragraph starts on (same estimate the text extractor makes). */
  paraPage: number[];
}

/** Width of the left line-number column in classical 3, in characters. */
export const NUMBER_WIDTH = 6;
const COLUMN = 6;
const CENTER_PAD = 20;
const runsText = (p: Para): string => p.runs.map((r) => r.text).join('');

function layout(lines: Array<{ text: string; para: number }>, paraCount: number): TextLayout {
  const body = lines.filter((l) => l.text.trim());
  const pages = estimatedPages(body.map((l) => l.text.replace(/\t/g, '    ').trim()));
  const paraPage = new Array<number>(paraCount).fill(0);
  body.forEach((l, i) => {
    if (l.para >= 0 && paraPage[l.para] === 0) paraPage[l.para] = pages[i];
  });
  return { text: `${lines.map((l) => l.text).join('\n')}\n`, pages: pages.length ? pages[pages.length - 1] : 0, paraPage };
}

/** A PDF's drawn lines as copy-pasted text (variant p): indentation as spaces, headers and footers kept. */
export function textFromDrawn(drawn: readonly DrawnLine[], margin: number, ligatures: boolean, paraCount: number): TextLayout {
  const lines = drawn.map((d) => {
    let t = d.text;
    if (ligatures && d.para >= 0) t = t.replace(/fi/g, 'ﬁ').replace(/fl/g, 'ﬂ');
    return { text: ' '.repeat(Math.max(0, Math.round((d.x - margin) / COLUMN))) + t, para: d.para };
  });
  return layout(lines, paraCount);
}

/** A Word file's paragraphs as pasted text (word p): one line per paragraph, no indentation, a blank line before gaps. */
export function textFromParas(paras: readonly Para[]): TextLayout {
  const lines: Array<{ text: string; para: number }> = [];
  paras.forEach((p, i) => {
    if (p.gapBefore) lines.push({ text: '', para: -1 });
    lines.push({ text: runsText(p), para: i });
  });
  return layout(lines, paras.length);
}

/** Classical 3: pasted text with a 6-character left line-number column, every 5 speech lines, restarting at headings. */
export function classicalText(paras: readonly Para[]): TextLayout {
  const lines: Array<{ text: string; para: number }> = [];
  let n = 0;
  paras.forEach((p, i) => {
    if (p.kind === 'heading') n = 0;
    if (p.gapBefore) lines.push({ text: '', para: -1 });
    let prefix = ' '.repeat(NUMBER_WIDTH);
    if (p.numbered) {
      n++;
      if (n % 5 === 0) prefix = `${String(n).padStart(3)}   `;
    }
    const indent = ' '.repeat(Math.round(p.indent / COLUMN));
    const body = p.align === 'center' ? ' '.repeat(CENTER_PAD) + runsText(p) : runsText(p);
    lines.push({ text: prefix + indent + body, para: i });
  });
  return layout(lines, paras.length);
}
