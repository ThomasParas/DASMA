import { FLAG_BELOW, toAnswerKey, type AnswerKey, type AnswerKeyUnit, type ImportResult } from '@dasma/script';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DraftTruthUnit extends AnswerKeyUnit {
  /** The importer was unsure of this unit (tagConfidence below FLAG_BELOW): check it first. */
  check?: true;
}

/** A local answer key (`<name>.truth.json`, the shape `script-eval --set local` reads) with `check` marks. */
export interface DraftTruth extends AnswerKey {
  units: DraftTruthUnit[];
}

/** The importer's own tags as a starting answer key for a real script; the user corrects it by hand. */
export function draftTruth(result: ImportResult): DraftTruth {
  const key = toAnswerKey(result.script, result.pages);
  return {
    ...key,
    units: key.units.map((u, i) => (result.script.units[i].tagConfidence < FLAG_BELOW ? { ...u, check: true as const } : u)),
  };
}

/** Writes the draft; an existing file may hold hand corrections, so it is only replaced when `force` is set. */
export function writeDraftTruth(path: string, draft: DraftTruth, force = false): void {
  if (existsSync(path) && !force) throw new Error(`${path} already exists; pass --force to overwrite it`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
}
