import { hashSeed, mulberry32, pick } from '../rng';
import { selectExcerpt } from './excerpt';
import { VARIANT_FORMAT } from './manifest';
import { buildParas } from './paras';
import { loadPlay, type SourcePlay } from './source-play';
import { STYLES } from './styles';
import { docId, type DocFormat, type DocSpec, type TruthFile } from './types';
import { docxParaPages, writeDocx, type DocxFont } from './write-docx';
import { writePdf, type PdfFontFamily } from './write-pdf';
import { classicalText, textFromDrawn, textFromParas } from './write-text';

export interface RenderedDoc {
  spec: DocSpec;
  format: DocFormat;
  bytes?: Uint8Array;
  text?: string;
  truth: TruthFile;
}

const PDF_FONTS: PdfFontFamily[] = ['Times', 'Helvetica', 'Courier'];
const DOCX_FONTS: DocxFont[] = ['Times New Roman', 'Arial', 'Courier New'];
const SIZES = [10, 11, 12];
const MARGINS = [54, 72, 90];

/** Spec §6.2: one deterministic document and its truth, from (family, play, variant, seed). */
export async function renderDocument(spec: DocSpec, play: SourcePlay = loadPlay(spec.play)): Promise<RenderedDoc> {
  const rng = mulberry32(hashSeed(docId(spec)));
  const style = STYLES[spec.family][spec.variant === 'p' ? '1' : spec.variant];
  const { paras, truth: draft, cast } = buildParas(play, selectExcerpt(play, rng), style, rng);
  const format = VARIANT_FORMAT[spec.family][spec.variant];
  const size = pick(SIZES, rng);
  const margin = pick(MARGINS, rng);

  let bytes: Uint8Array | undefined;
  let text: string | undefined;
  let pages: number;
  let paraPage: number[];
  if (spec.family === 'word' && spec.variant !== 'p') {
    bytes = await writeDocx(paras, { font: pick(DOCX_FONTS, rng), size, margin });
    ({ pages, paraPage } = docxParaPages(paras));
  } else if (spec.family === 'word') {
    ({ text, pages, paraPage } = textFromParas(paras));
  } else if (spec.family === 'classical' && spec.variant === '3') {
    ({ text, pages, paraPage } = classicalText(paras));
  } else {
    const pdf = await writePdf(paras, style, { font: pick(PDF_FONTS, rng), size, margin }, play.title);
    if (format === 'pdf') ({ bytes, pages, paraPage } = pdf);
    else ({ text, pages, paraPage } = textFromDrawn(pdf.drawn, margin, spec.family === 'licensed', paras.length));
  }

  const unitPage = new Array<number>(draft.length).fill(0);
  paras.forEach((p, i) => {
    for (const t of p.truth) if (!unitPage[t]) unitPage[t] = paraPage[i] || 1;
  });
  const truth: TruthFile = {
    docId: docId(spec),
    family: spec.family,
    play: spec.play,
    variant: spec.variant,
    seed: spec.seed,
    format,
    pages: Math.max(1, pages),
    cast,
    units: draft.map((t, k) => ({ ...t, page: Math.min(Math.max(1, unitPage[k] || 1), Math.max(1, pages)) })),
  };
  return { spec, format, ...(bytes ? { bytes } : {}), ...(text !== undefined ? { text } : {}), truth };
}
