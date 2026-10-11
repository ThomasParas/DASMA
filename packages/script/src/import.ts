import { cleanDoc } from './clean';
import { ScriptImportError } from './errors';
import { extractDocx } from './extract/docx';
import { extractPdf } from './extract/pdf';
import { extractText } from './extract/text';
import { applyOverlapMarks } from './overlap';
import { profileDoc } from './profile';
import { tagLines } from './tag';
import type { ImportInput, ImportResult, ImportWarning, RawDoc } from './types';
import { buildUnits } from './units';
import { FLAG_BELOW, MANY_FLAGGED_SHARE } from './weights';

export const UNTITLED = 'Untitled script';
const OLE = [0xd0, 0xcf, 0x11, 0xe0];

/** Legacy .doc (OLE) and RTF files are refused with "save as .docx" (spec §4.1); .pages is caught by the docx reader. */
export function sniffUnsupported(bytes: Uint8Array): boolean {
  if (OLE.every((b, i) => bytes[i] === b)) return true;
  return String.fromCharCode(...bytes.subarray(0, 5)) === '{\\rtf';
}

async function extract(input: ImportInput): Promise<RawDoc> {
  if (input.kind === 'text') return extractText(input.text);
  if (sniffUnsupported(input.bytes)) throw new ScriptImportError('unsupportedFormat');
  return input.kind === 'pdf' ? extractPdf(input.bytes) : extractDocx(input.bytes);
}

/** Spec §3.2: bytes or text → tagged Script, with the profile, warnings and page count. */
export async function importScript(input: ImportInput, opts: { title?: string } = {}): Promise<ImportResult> {
  const doc = cleanDoc(await extract(input));
  if (doc.lines.length === 0) throw new ScriptImportError('empty');
  const profile = profileDoc(doc);
  const built = buildUnits(doc, tagLines(doc, profile), profile);
  const units = applyOverlapMarks(built.units);

  const warnings: ImportWarning[] = [];
  if (!units.some((u) => u.kind === 'dialogue' && u.characterId)) warnings.push({ code: 'noSpeakers' });
  if (profile.primary && profile.secondary) warnings.push({ code: 'mixedConventions', conventions: [profile.primary, profile.secondary] });
  warnings.push(...built.warnings);
  const flagged = units.filter((u) => u.tagConfidence < FLAG_BELOW).length;
  if (units.length && flagged / units.length > MANY_FLAGGED_SHARE) warnings.push({ code: 'manyFlagged', share: flagged / units.length });

  const title = opts.title ?? units.find((u) => u.kind === 'frontMatter')?.text.split('\n')[0] ?? UNTITLED;
  return { script: { title, characters: built.cast.characters, units }, profile, warnings, pages: doc.pages };
}
