import { cleanDoc } from '../src/clean';
import { extractText } from '../src/extract/text';
import type { CleanDoc, RawDoc, RawLine } from '../src/types';
import { ScriptFormatError, ScriptImportError } from '../src/errors';

/** The `code` of the ScriptImportError (or `reason` of the ScriptFormatError) `fn` throws; null if it doesn't throw. */
export function thrownCode(fn: () => unknown): string | null {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScriptImportError) return err.code;
    if (err instanceof ScriptFormatError) return err.reason;
    throw err;
  }
  return null;
}

export function line(text: string, opts: Partial<RawLine> = {}): RawLine {
  const left = opts.left ?? 72;
  const right = opts.right ?? left + text.length * 6;
  return {
    page: 1,
    text,
    spans: [{ text, left, right, italic: opts.italic ?? false, bold: opts.bold ?? false }],
    left,
    right,
    centered: false,
    italic: false,
    bold: false,
    size: 12,
    ...opts,
  };
}

export function rawDoc(lines: RawLine[], opts: Partial<RawDoc> = {}): RawDoc {
  return { source: 'pdf', pageWidth: 612, pages: Math.max(1, ...lines.map((l) => l.page)), realPages: true, lines, ...opts };
}

export function textDoc(text: string): CleanDoc {
  return cleanDoc(extractText(text));
}
