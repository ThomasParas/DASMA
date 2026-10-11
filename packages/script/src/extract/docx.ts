import { strFromU8, unzipSync } from 'fflate';
import { ScriptImportError } from '../errors';
import type { RawDoc, RawLine, RawSpan } from '../types';
import { spanShare } from './lines';
import { assignEstimatedPages } from './pages';
import { xmlEvents, type XmlAttrs } from './xml';

const TWIPS_PER_POINT = 20;
/** Indent given to each leading tab, in points (Word's default tab stop is half an inch). */
export const DOCX_TAB_INDENT = 36;
/** Assumed character width, in points, for span positions (Word files carry no glyph positions). */
const CHAR_WIDTH = 6;
const DEFAULT_PAGE_WIDTH = 612;

interface StyleProps {
  italic?: boolean;
  bold?: boolean;
  centered?: boolean;
  left?: number;
}
interface Run {
  text: string;
  italic?: boolean;
  bold?: boolean;
}
interface Para {
  styleId: string;
  centered?: boolean;
  left?: number;
  breakBefore: boolean;
  breakAfter: boolean;
  runs: Run[];
}

function on(attrs: XmlAttrs): boolean {
  const v = attrs['w:val'];
  return v === undefined || !['0', 'false', 'off', 'none'].includes(v);
}

function indentOf(attrs: XmlAttrs): number | undefined {
  const v = attrs['w:left'] ?? attrs['w:start'];
  return v === undefined ? undefined : Number(v) / TWIPS_PER_POINT;
}

export function readStyles(xml: string): Map<string, StyleProps> {
  const styles = new Map<string, StyleProps>();
  const stack: string[] = [];
  let id: string | null = null;
  let props: StyleProps = {};
  for (const e of xmlEvents(xml)) {
    if (e.type === 'open') {
      const parent = stack[stack.length - 1];
      if (e.name === 'w:style') {
        id = e.attrs['w:styleId'] ?? '';
        props = {};
      } else if (id !== null) {
        if (e.name === 'w:i' && parent === 'w:rPr') props.italic = on(e.attrs);
        else if (e.name === 'w:b' && parent === 'w:rPr') props.bold = on(e.attrs);
        else if (e.name === 'w:jc' && parent === 'w:pPr') props.centered = e.attrs['w:val'] === 'center';
        else if (e.name === 'w:ind' && parent === 'w:pPr') props.left = indentOf(e.attrs);
      }
      if (!e.selfClosing) stack.push(e.name);
      else if (e.name === 'w:style' && id !== null) {
        styles.set(id, props);
        id = null;
      }
    } else if (e.type === 'close') {
      stack.pop();
      if (e.name === 'w:style' && id !== null) {
        styles.set(id, props);
        id = null;
      }
    }
  }
  return styles;
}

export function extractDocx(bytes: Uint8Array): RawDoc {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ScriptImportError('unreadable');
  }
  const documentXml = files['word/document.xml'];
  if (!documentXml) {
    if (Object.keys(files).some((n) => n.startsWith('Index/') || n === 'index.xml')) {
      throw new ScriptImportError('unsupportedFormat');
    }
    throw new ScriptImportError('unreadable');
  }
  const styles = files['word/styles.xml'] ? readStyles(strFromU8(files['word/styles.xml'])) : new Map<string, StyleProps>();

  const lines: RawLine[] = [];
  let page = 1;
  let sawBreak = false;
  let pageWidth = DEFAULT_PAGE_WIDTH;
  const stack: string[] = [];
  let para: Para | null = null;
  let run: Run | null = null;
  let inText = false;

  const emit = (p: Para): void => {
    if (p.breakBefore && lines.length > 0) {
      page++;
      sawBreak = true;
    }
    const style = styles.get(p.styleId) ?? {};
    const runs = p.runs.filter((r) => r.text.length > 0);
    const joined = runs.map((r) => r.text).join('');
    const lead = /^[\t ]*/.exec(joined)?.[0] ?? '';
    const tabs = lead.split('\t').length - 1;
    const text = joined.slice(lead.length).replace(/[\t ]+$/, '');
    if (text) {
      const left = (p.left ?? style.left ?? 0) + tabs * DOCX_TAB_INDENT;
      const spans: RawSpan[] = [];
      let offset = 0;
      let skip = lead.length;
      for (const r of runs) {
        let t = r.text;
        if (skip > 0) {
          const cut = Math.min(skip, t.length);
          t = t.slice(cut);
          skip -= cut;
        }
        if (offset + t.length > text.length) t = t.slice(0, Math.max(0, text.length - offset));
        if (!t) continue;
        spans.push({
          text: t,
          left: left + offset * CHAR_WIDTH,
          right: left + (offset + t.length) * CHAR_WIDTH,
          italic: r.italic ?? style.italic ?? false,
          bold: r.bold ?? style.bold ?? false,
        });
        offset += t.length;
      }
      lines.push({
        page,
        text,
        spans,
        left,
        right: left + text.length * CHAR_WIDTH,
        centered: p.centered ?? style.centered ?? false,
        italic: spanShare(spans, (s) => s.italic) > 0.5,
        bold: spanShare(spans, (s) => s.bold) > 0.5,
        size: 0,
      });
    }
    if (p.breakAfter) page++;
  };

  const pageBreak = (): void => {
    sawBreak = true;
    const hasText = para !== null && (para.runs.some((r) => r.text.trim()) || (run !== null && run.text.trim() !== ''));
    if (para !== null && hasText) para.breakAfter = true;
    else page++;
  };

  for (const e of xmlEvents(strFromU8(documentXml))) {
    if (e.type === 'text') {
      if (inText && run) run.text += e.text;
      continue;
    }
    if (e.type === 'close') {
      stack.pop();
      if (e.name === 'w:t') inText = false;
      else if (e.name === 'w:r' && run && para) {
        para.runs.push(run);
        run = null;
      } else if (e.name === 'w:p' && para) {
        emit(para);
        para = null;
      }
      continue;
    }
    const parent = stack[stack.length - 1];
    const grand = stack[stack.length - 2];
    switch (e.name) {
      case 'w:p':
        para = { styleId: '', breakBefore: false, breakAfter: false, runs: [] };
        break;
      case 'w:pStyle':
        if (para && parent === 'w:pPr') para.styleId = e.attrs['w:val'] ?? '';
        break;
      case 'w:jc':
        if (para && parent === 'w:pPr') para.centered = e.attrs['w:val'] === 'center';
        break;
      case 'w:ind':
        if (para && parent === 'w:pPr') para.left = indentOf(e.attrs);
        break;
      case 'w:pageBreakBefore':
        if (para && parent === 'w:pPr' && on(e.attrs)) para.breakBefore = true;
        break;
      case 'w:r':
        if (para) run = { text: '' };
        break;
      case 'w:i':
        if (run && parent === 'w:rPr' && grand === 'w:r') run.italic = on(e.attrs);
        break;
      case 'w:b':
        if (run && parent === 'w:rPr' && grand === 'w:r') run.bold = on(e.attrs);
        break;
      case 'w:t':
        inText = !e.selfClosing;
        break;
      case 'w:tab':
        if (run && parent === 'w:r') run.text += '\t';
        break;
      case 'w:br':
        if (e.attrs['w:type'] === 'page') pageBreak();
        else if (run) run.text += ' ';
        break;
      case 'w:lastRenderedPageBreak':
        pageBreak();
        break;
      case 'w:pgSz':
        if (e.attrs['w:w']) pageWidth = Number(e.attrs['w:w']) / TWIPS_PER_POINT;
        break;
    }
    if (!e.selfClosing) stack.push(e.name);
  }

  let pages = 0;
  if (lines.length) pages = sawBreak ? Math.max(...lines.map((l) => l.page)) : assignEstimatedPages(lines);
  return { source: 'docx', pageWidth, pages, realPages: sawBreak, lines };
}
