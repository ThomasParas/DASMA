import type { RawDoc, RawLine } from '../types';
import { assignEstimatedPages } from './pages';

/** Width of one text column, in the same units as pdf points, so bands compare across formats. */
export const TEXT_COLUMN = 6;
const TAB = '    ';

export function extractText(text: string): RawDoc {
  const lines: RawLine[] = [];
  let page = 1;
  let sawFormFeed = false;
  for (const physical of text.replace(/\r\n?/g, '\n').split('\n')) {
    physical.split('\f').forEach((piece, k) => {
      if (k > 0) {
        page++;
        sawFormFeed = true;
      }
      const expanded = piece.replace(/\t/g, TAB);
      const body = expanded.trim();
      if (!body) return;
      const left = (expanded.length - expanded.trimStart().length) * TEXT_COLUMN;
      const right = left + body.length * TEXT_COLUMN;
      lines.push({
        page,
        text: body,
        spans: [{ text: body, left, right, italic: false, bold: false }],
        left,
        right,
        centered: false,
        italic: false,
        bold: false,
        size: 0,
      });
    });
  }
  let pages = 0;
  if (lines.length) pages = sawFormFeed ? lines[lines.length - 1].page : assignEstimatedPages(lines);
  return { source: 'text', pageWidth: 80 * TEXT_COLUMN, pages, realPages: sawFormFeed, lines };
}
