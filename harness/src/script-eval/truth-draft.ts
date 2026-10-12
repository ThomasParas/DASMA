import { FLAG_BELOW, type Character, type ImportResult, type UnitKind } from '@dasma/script';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DraftTruthUnit {
  kind: UnitKind;
  characterId?: string;
  text: string;
  page: number;
  /** The importer was unsure of this unit (tagConfidence below FLAG_BELOW): check it first. */
  check?: true;
}

/** A local answer key (`<name>.truth.json`, the shape `script-eval --set local` reads) with `check` marks. */
export interface DraftTruth {
  pages: number;
  cast: Character[];
  units: DraftTruthUnit[];
}

/** The importer's own tags as a starting answer key for a real script; the user corrects it by hand. */
export function draftTruth(result: ImportResult): DraftTruth {
  return {
    pages: Math.max(1, result.pages),
    cast: result.script.characters.map((c) => ({ id: c.id, name: c.name, aliases: [...c.aliases] })),
    units: result.script.units.map((u) => ({
      kind: u.kind,
      ...(u.characterId !== undefined ? { characterId: u.characterId } : {}),
      text: u.text,
      page: Math.max(1, u.source[0]?.page ?? 1),
      ...(u.tagConfidence < FLAG_BELOW ? { check: true as const } : {}),
    })),
  };
}

/** Writes the draft; an existing file may hold hand corrections, so it is only replaced when `force` is set. */
export function writeDraftTruth(path: string, draft: DraftTruth, force = false): void {
  if (existsSync(path) && !force) throw new Error(`${path} already exists; pass --force to overwrite it`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
}
