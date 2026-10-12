import { estimatedPages } from '@dasma/script';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import type { Para } from './types';

export type DocxFont = 'Times New Roman' | 'Arial' | 'Courier New';
export interface DocxLook {
  font: DocxFont;
  size: number;
  margin: number;
}
const TWIPS = 20;

export async function writeDocx(paras: readonly Para[], look: DocxLook): Promise<Uint8Array> {
  const doc = new Document({
    styles: { default: { document: { run: { font: look.font, size: look.size * 2 } } } },
    sections: [
      {
        properties: { page: { margin: { top: look.margin * TWIPS, bottom: look.margin * TWIPS, left: look.margin * TWIPS, right: look.margin * TWIPS } } },
        children: paras.map(
          (p) =>
            new Paragraph({
              alignment: p.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
              ...(p.indent ? { indent: { left: p.indent * TWIPS } } : {}),
              ...(p.gapBefore ? { spacing: { before: 120 } } : {}),
              children: p.runs.map((r) => new TextRun({ text: r.text, italics: r.italic ?? false, bold: r.bold ?? false })),
            }),
        ),
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

/** Pages per paragraph exactly as extractDocx estimates them for a file without page breaks. */
export function docxParaPages(paras: readonly Para[]): { pages: number; paraPage: number[] } {
  const texts = paras.map((p) => p.runs.map((r) => r.text).join('').replace(/^[\t ]+/, '').replace(/[\t ]+$/, ''));
  const paraPage = estimatedPages(texts);
  return { pages: paraPage.length ? paraPage[paraPage.length - 1] : 0, paraPage };
}
