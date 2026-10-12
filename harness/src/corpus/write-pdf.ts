import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { StyleSpec } from './styles';
import type { DrawnLine, Para, Run } from './types';

export type PdfFontFamily = 'Times' | 'Helvetica' | 'Courier';
export interface PdfLook {
  font: PdfFontFamily;
  size: number;
  /** Points, all four sides. */
  margin: number;
}
export interface PdfLayout {
  bytes: Uint8Array;
  pages: number;
  paraPage: number[];
  drawn: DrawnLine[];
}

export const PAGE_W = 612;
export const PAGE_H = 792;
/** Right-margin line numbers sit this far right of the text column. */
export const LINE_NUMBER_GAP = 30;
const LINE_HEIGHT = 1.3;
const PARA_GAP = 0.5;
const HYPHEN_MIN_LETTERS = 8;

const FONT_SETS: Record<PdfFontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanBoldItalic],
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBold, StandardFonts.HelveticaBoldOblique],
  Courier: [StandardFonts.Courier, StandardFonts.CourierOblique, StandardFonts.CourierBold, StandardFonts.CourierBoldOblique],
};

interface Word {
  text: string;
  font: PDFFont;
}

function segments(line: Word[]): Word[] {
  const out: Word[] = [];
  line.forEach((word, k) => {
    const text = k < line.length - 1 ? `${word.text} ` : word.text;
    const last = out[out.length - 1];
    if (last && last.font === word.font) last.text += text;
    else out.push({ text, font: word.font });
  });
  return out;
}

export async function writePdf(paras: readonly Para[], style: StyleSpec, look: PdfLook, title: string): Promise<PdfLayout> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const [regular, italic, bold, boldItalic] = await Promise.all(FONT_SETS[look.font].map((f) => doc.embedFont(f)));
  const fontOf = (r: Run): PDFFont => (r.bold ? (r.italic ? boldItalic : bold) : r.italic ? italic : regular);
  const width = PAGE_W - 2 * look.margin;
  const lh = look.size * LINE_HEIGHT;
  const widthOf = (w: Word): number => w.font.widthOfTextAtSize(w.text, look.size);
  const space = (f: PDFFont): number => f.widthOfTextAtSize(' ', look.size);

  const drawn: DrawnLine[] = [];
  const paraPage = new Array<number>(paras.length).fill(0);
  let page!: PDFPage;
  let pageNo = 0;
  let y = 0;
  let lineInScene = 0;
  const put = (text: string, x: number, yy: number, font: PDFFont, para: number): void => {
    page.drawText(text, { x, y: yy, size: look.size, font });
    drawn.push({ page: pageNo, x, text, para });
  };
  const footer = (): void => {
    if (!style.footer) return;
    const t = style.footer === 'dashed' ? `- ${pageNo} -` : String(pageNo);
    put(t, (PAGE_W - regular.widthOfTextAtSize(t, look.size)) / 2, look.margin / 2, regular, -1);
  };
  const newPage = (): void => {
    if (pageNo > 0) footer();
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    y = PAGE_H - look.margin;
    if (style.header) put(title, look.margin, PAGE_H - look.margin / 2, italic, -1);
  };

  const hyphenate = (word: Word, room: number): [Word, Word] | null => {
    const m = /^([a-z]+)[,.;:!?]?$/.exec(word.text);
    if (!m || m[1].length < HYPHEN_MIN_LETTERS) return null;
    for (let k = m[1].length - 3; k >= 3; k--) {
      const head = { text: `${word.text.slice(0, k)}-`, font: word.font };
      if (widthOf(head) <= room) return [head, { text: word.text.slice(k), font: word.font }];
    }
    return null;
  };
  const wrap = (p: Para): Word[][] => {
    const avail = width - p.indent;
    const words = p.runs.flatMap((r) => r.text.replace(/\t/g, ' ').split(/\s+/).filter(Boolean).map((text) => ({ text, font: fontOf(r) })));
    const lines: Word[][] = [];
    let cur: Word[] = [];
    let curW = 0;
    for (const word of words) {
      const add = (cur.length ? space(word.font) : 0) + widthOf(word);
      if (!cur.length || curW + add <= avail) {
        cur.push(word);
        curW += add;
        continue;
      }
      const split = style.hyphenate ? hyphenate(word, avail - curW - space(word.font)) : null;
      if (split) {
        cur.push(split[0]);
        lines.push(cur);
        cur = [split[1]];
        curW = widthOf(split[1]);
        continue;
      }
      lines.push(cur);
      cur = [word];
      curW = widthOf(word);
    }
    if (cur.length) lines.push(cur);
    return lines;
  };

  newPage();
  paras.forEach((p, i) => {
    if (p.kind === 'heading') lineInScene = 0;
    if (p.gapBefore && y < PAGE_H - look.margin) y -= lh * PARA_GAP;
    for (const line of wrap(p)) {
      if (y - lh < look.margin) newPage();
      y -= lh;
      if (!paraPage[i]) paraPage[i] = pageNo;
      const segs = segments(line);
      const lineW = segs.reduce((n, s) => n + widthOf(s), 0);
      const x0 = p.align === 'center' ? look.margin + (width - lineW) / 2 : look.margin + p.indent;
      let x = x0;
      for (const s of segs) {
        page.drawText(s.text, { x, y, size: look.size, font: s.font });
        x += widthOf(s);
      }
      drawn.push({ page: pageNo, x: x0, text: segs.map((s) => s.text).join('').trimEnd(), para: i });
      if (style.lineNumbers === 'right' && p.numbered && ++lineInScene % 5 === 0) {
        put(String(lineInScene), PAGE_W - look.margin + LINE_NUMBER_GAP, y, regular, -1);
      }
    }
  });
  footer();
  return { bytes: await doc.save(), pages: pageNo, paraPage, drawn };
}
