import { appendScripts, importScript, ScriptImportError, type ImportInput, type ImportWarning, type Script, type UnitHint } from '@dasma/script';
import type { ImportedFrom } from '../db/schema';

export type FileKind = 'pdf' | 'docx' | 'text';

export interface ImportSource {
  name: string;
  kind: FileKind;
  bytes?: Uint8Array;
  text?: string;
}

/** Exactly the fields of a new script version. */
export interface ImportOutcome {
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  warnings: ImportWarning[];
  importedFrom: ImportedFrom;
}

export function kindOfFile(name: string): FileKind | null {
  const ext = /\.([^.]+)$/.exec(name.toLowerCase())?.[1];
  return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' ? 'text' : null;
}

const inputOf = (s: ImportSource): ImportInput => (s.kind === 'text' ? { kind: 'text', text: s.text ?? '' } : { kind: s.kind, bytes: s.bytes ?? new Uint8Array() });

function mergeWarnings(a: ImportWarning[], b: ImportWarning[]): ImportWarning[] {
  const seen = new Set(a.map((w) => JSON.stringify(w)));
  return [...a, ...b.filter((w) => !seen.has(JSON.stringify(w)))];
}

/** Spec §5.2: imports each source, then joins them in order with appendScripts. */
export async function runImport(sources: ImportSource[], title: string, onProgress: (message: string) => void = () => {}): Promise<ImportOutcome> {
  if (sources.length === 0) throw new ScriptImportError('empty');
  let out: ImportOutcome | null = null;
  for (const [k, src] of sources.entries()) {
    onProgress(sources.length > 1 ? `Reading file ${k + 1} of ${sources.length}…` : `Reading ${src.name}…`);
    const r = await importScript(inputOf(src), { title });
    if (!out) {
      out = { script: r.script, pages: r.pages, unitHints: r.unitHints, warnings: r.warnings, importedFrom: { kind: src.kind, names: [src.name] } };
      continue;
    }
    const before = out.script.units.length;
    const script = appendScripts(out.script, r.script, out.pages);
    const unitHints: Record<string, UnitHint> = { ...out.unitHints };
    r.script.units.forEach((u, i) => {
      const hint = r.unitHints[u.id];
      if (hint) unitHints[script.units[before + i].id] = hint;
    });
    out = {
      script,
      pages: out.pages + r.pages,
      unitHints,
      warnings: mergeWarnings(out.warnings, r.warnings),
      importedFrom: { kind: out.importedFrom.kind, names: [...out.importedFrom.names, src.name] },
    };
  }
  return out!;
}
