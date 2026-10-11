// In the browser (M2b) the app must set pdfjs GlobalWorkerOptions.workerSrc; Node runs pdf.js without a worker.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ScriptImportError } from '../errors';
import type { RawDoc, RawLine, RawSpan } from '../types';
import { spanShare } from './lines';

/** Items whose baselines are this close, in points, are one line. */
export const BASELINE_TOLERANCE = 2;
/** A gap of at least this × the font size between two items on a line is a space. */
export const SPACE_GAP = 0.2;
const CENTER_TOLERANCE = 0.03;
const CENTER_NARROWER = 0.05;

export interface PdfItem {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  italic: boolean;
  bold: boolean;
}

export function mapPdfError(err: unknown): ScriptImportError {
  const name = (err as { name?: unknown } | null)?.name;
  return new ScriptImportError(name === 'PasswordException' ? 'encrypted' : 'unreadable');
}

function buildLine(row: PdfItem[], page: number): RawLine {
  let text = '';
  const spans: RawSpan[] = [];
  row.forEach((it, i) => {
    if (i > 0) {
      const prev = row[i - 1];
      const gap = it.x - (prev.x + prev.width);
      if (gap >= SPACE_GAP * Math.max(prev.size, it.size) && !/\s$/.test(text) && !/^\s/.test(it.text)) text += ' ';
    }
    text += it.text;
    const t = it.text.trim();
    if (t) spans.push({ text: t, left: it.x, right: it.x + it.width, italic: it.italic, bold: it.bold });
  });
  return {
    page,
    text: text.trim(),
    spans,
    left: row[0].x,
    right: Math.max(...row.map((it) => it.x + it.width)),
    centered: false,
    italic: spanShare(spans, (s) => s.italic) > 0.5,
    bold: spanShare(spans, (s) => s.bold) > 0.5,
    size: Math.max(...row.map((it) => it.size)),
  };
}

export function groupItems(items: readonly PdfItem[], page: number): RawLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= BASELINE_TOLERANCE) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => buildLine(row.sort((a, b) => a.x - b.x), page));
}

/**
 * A line is centred when its midpoint is within 3% of the page width of the text column's midpoint and it is at least
 * 5% of the page width narrower than the column. Page margins are symmetric, so the page centre also counts as the
 * column's midpoint: a ragged right edge would otherwise pull the measured midpoint off-centre.
 */
export function markCentered(lines: RawLine[], pageWidth: number): void {
  if (!lines.length) return;
  const lefts = lines.map((l) => l.left).sort((a, b) => a - b);
  const rights = lines.map((l) => l.right).sort((a, b) => a - b);
  const colLeft = lefts[Math.floor(lefts.length * 0.1)];
  const colRight = rights[Math.min(rights.length - 1, Math.floor(rights.length * 0.9))];
  const mid = (colLeft + colRight) / 2;
  for (const l of lines) {
    const lineMid = (l.left + l.right) / 2;
    const nearMid =
      Math.abs(lineMid - mid) <= CENTER_TOLERANCE * pageWidth ||
      Math.abs(lineMid - pageWidth / 2) <= CENTER_TOLERANCE * pageWidth;
    l.centered = nearMid && l.right - l.left <= colRight - colLeft - CENTER_NARROWER * pageWidth;
  }
}

interface FontStyle {
  italic: boolean;
  bold: boolean;
}

function fontStyle(objs: { get(id: string): unknown }, fontName: string, cache: Map<string, FontStyle>): FontStyle {
  const cached = cache.get(fontName);
  if (cached) return cached;
  let style: FontStyle = { italic: false, bold: false };
  try {
    const f = objs.get(fontName) as { italic?: boolean; bold?: boolean; black?: boolean; name?: string } | undefined;
    const name = f?.name ?? '';
    style = {
      italic: Boolean(f?.italic) || /italic|oblique/i.test(name),
      bold: Boolean(f?.bold || f?.black) || /bold|black|semibold|heavy/i.test(name),
    };
  } catch {
    // Font not resolved: treat as plain.
  }
  cache.set(fontName, style);
  return style;
}

export async function extractPdf(bytes: Uint8Array): Promise<RawDoc> {
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    fontExtraProperties: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const lines: RawLine[] = [];
    let pageWidth = 612;
    const styles = new Map<string, FontStyle>();
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      if (p === 1) pageWidth = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      await page.getOperatorList(); // loads the fonts, so commonObjs can answer italic/bold
      const items: PdfItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({
          text: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          size: Math.hypot(it.transform[0], it.transform[1]),
          ...fontStyle(page.commonObjs, it.fontName, styles),
        });
      }
      lines.push(...groupItems(items, p));
      page.cleanup();
    }
    if (lines.length === 0) throw new ScriptImportError('noTextLayer');
    markCentered(lines, pageWidth);
    return { source: 'pdf', pageWidth, pages: pdf.numPages, realPages: true, lines };
  } catch (err) {
    if (err instanceof ScriptImportError) throw err;
    throw mapPdfError(err);
  } finally {
    await task.destroy();
  }
}
