import { importScript, type ImportInput } from '@dasma/script';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { renderDocument } from '../corpus/render';
import type { DocFormat, DocSpec, TruthFile } from '../corpus/types';
import { scoreDocument, type DocScore } from './score';

export function inputFor(format: DocFormat, data: Uint8Array | string): ImportInput {
  if (format === 'text') return { kind: 'text', text: typeof data === 'string' ? data : new TextDecoder().decode(data) };
  return { kind: format, bytes: typeof data === 'string' ? new TextEncoder().encode(data) : data };
}

export async function evaluateScripts(specs: readonly DocSpec[], onDoc?: (s: DocScore) => void): Promise<DocScore[]> {
  const scores: DocScore[] = [];
  for (const spec of specs) {
    const doc = await renderDocument(spec);
    const { script } = await importScript(inputFor(doc.format, doc.bytes ?? doc.text ?? ''));
    const score = scoreDocument(doc.truth, script);
    onDoc?.(score);
    scores.push(score);
  }
  return scores;
}

export interface LocalDoc {
  name: string;
  /** The script's file name, for error messages. */
  file: string;
  input: ImportInput;
  truth: TruthFile;
}

const LOCAL_FORMATS: Record<string, DocFormat> = { '.pdf': 'pdf', '.docx': 'docx', '.txt': 'text' };

function readTruth(path: string): Pick<TruthFile, 'pages' | 'cast' | 'units'> {
  let t: Partial<Pick<TruthFile, 'pages' | 'cast' | 'units'>> | null;
  try {
    t = JSON.parse(readFileSync(path, 'utf8')) as typeof t;
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!t || typeof t.pages !== 'number' || !Array.isArray(t.cast) || !Array.isArray(t.units)) {
    throw new Error(`${path} must hold { pages, cast, units }`);
  }
  t.units.forEach((u: unknown, i: number) => {
    const unit = u as Partial<Record<'kind' | 'text' | 'page', unknown>> | null;
    const bad = (field: string, want: string): never => {
      throw new Error(`${path}: unit ${i} must have ${field} as ${want}`);
    };
    if (typeof unit?.kind !== 'string') bad('kind', 'a string');
    if (typeof unit?.text !== 'string') bad('text', 'a string');
    if (!Number.isInteger(unit?.page) || (unit?.page as number) < 1) bad('page', 'a positive integer');
  });
  return { pages: t.pages, cast: t.cast, units: t.units };
}

/** harness/local/<name>.{pdf,docx,txt}, each with a hand-written <name>.truth.json holding { pages, cast, units } (spec §6.6). */
export function loadLocalDocs(dir: string): { docs: LocalDoc[]; skipped: string[] } {
  const docs: LocalDoc[] = [];
  const skipped: string[] = [];
  if (!existsSync(dir)) return { docs, skipped };
  for (const file of readdirSync(dir).sort()) {
    const ext = extname(file).toLowerCase();
    const format = LOCAL_FORMATS[ext];
    if (!format) continue;
    const name = file.slice(0, -ext.length);
    const truthPath = join(dir, `${name}.truth.json`);
    if (!existsSync(truthPath)) {
      skipped.push(file);
      continue;
    }
    const t = readTruth(truthPath);
    const data = readFileSync(join(dir, file));
    docs.push({
      name,
      file,
      input: inputFor(format, format === 'text' ? data.toString('utf8') : new Uint8Array(data)),
      truth: { docId: name, family: 'local', play: name, variant: 'local', seed: 0, format, pages: t.pages, cast: t.cast, units: t.units },
    });
  }
  return { docs, skipped };
}

export async function evaluateLocal(docs: readonly LocalDoc[]): Promise<DocScore[]> {
  const scores: DocScore[] = [];
  for (const d of docs) {
    try {
      scores.push(scoreDocument(d.truth, (await importScript(d.input)).script));
    } catch (err) {
      throw new Error(`${d.file}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
  }
  return scores;
}
