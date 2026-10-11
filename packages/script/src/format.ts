import { ScriptFormatError } from './errors';
import type { Character, Script, SourceRef, Unit, UnitKind } from './types';

export const DASMA_FORMAT = 'dasma-script';
export const DASMA_FORMAT_VERSION = 1;
export const DASMA_MIME = 'application/vnd.dasma+json';
export const DASMA_EXTENSION = '.dasma';

const KINDS: readonly UnitKind[] = ['dialogue', 'direction', 'characterName', 'heading', 'sceneBreak', 'frontMatter'];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
function fail(path: string): never {
  throw new ScriptFormatError('invalid', path);
}

export function writeDasma(script: Script, opts: { cast?: Record<string, string[]>; now?: Date } = {}): string {
  const file = {
    format: DASMA_FORMAT,
    formatVersion: DASMA_FORMAT_VERSION,
    title: script.title,
    characters: script.characters,
    units: script.units,
    ...(opts.cast ? { cast: opts.cast } : {}),
    exportedAt: (opts.now ?? new Date()).toISOString(),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function readCharacter(v: unknown, path: string): Character {
  if (!isObj(v)) fail(path);
  if (typeof v.id !== 'string' || v.id === '') fail(`${path}.id`);
  if (typeof v.name !== 'string') fail(`${path}.name`);
  if (!isStrings(v.aliases)) fail(`${path}.aliases`);
  return { id: v.id, name: v.name, aliases: [...v.aliases] };
}

function readRanges(v: unknown, path: string): Array<[number, number]> {
  if (!Array.isArray(v)) fail(path);
  let end = 0;
  return v.map((r) => {
    if (!Array.isArray(r) || r.length !== 2 || !isInt(r[0]) || !isInt(r[1]) || r[0] < end || r[1] <= r[0]) fail(path);
    end = r[1];
    return [r[0], r[1]] as [number, number];
  });
}

function readSource(v: unknown, path: string): SourceRef[] {
  if (!Array.isArray(v)) fail(path);
  return v.map((s) => {
    if (!isObj(s) || !isInt(s.page) || s.page < 1 || !isInt(s.line) || s.line < 0) fail(path);
    return { page: s.page, line: s.line };
  });
}

function readUnit(v: unknown, path: string, characterIds: Set<string>): Unit {
  if (!isObj(v)) fail(path);
  if (typeof v.id !== 'string' || v.id === '') fail(`${path}.id`);
  if (!KINDS.includes(v.kind as UnitKind)) fail(`${path}.kind`);
  if (v.characterId !== undefined && (typeof v.characterId !== 'string' || !characterIds.has(v.characterId))) fail(`${path}.characterId`);
  if (typeof v.text !== 'string') fail(`${path}.text`);
  if (typeof v.cut !== 'boolean') fail(`${path}.cut`);
  const overlapRanges = v.overlapRanges === undefined ? undefined : readRanges(v.overlapRanges, `${path}.overlapRanges`);
  if (typeof v.tagConfidence !== 'number' || !(v.tagConfidence >= 0 && v.tagConfidence <= 1)) fail(`${path}.tagConfidence`);
  const source = readSource(v.source, `${path}.source`);
  return {
    id: v.id,
    kind: v.kind as UnitKind,
    ...(v.characterId !== undefined ? { characterId: v.characterId as string } : {}),
    text: v.text,
    cut: v.cut,
    ...(overlapRanges ? { overlapRanges } : {}),
    tagConfidence: v.tagConfidence,
    source,
  };
}

/** Spec §8.1: validates by hand and returns only known fields. */
export function readDasma(text: string): { script: Script; cast?: Record<string, string[]>; exportedAt: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScriptFormatError('notJson');
  }
  if (!isObj(data) || data.format !== DASMA_FORMAT) throw new ScriptFormatError('notDasma');
  if (!isInt(data.formatVersion) || data.formatVersion < 1) fail('formatVersion');
  if (data.formatVersion > DASMA_FORMAT_VERSION) throw new ScriptFormatError('newerVersion');
  if (typeof data.title !== 'string') fail('title');
  if (typeof data.exportedAt !== 'string') fail('exportedAt');
  if (!Array.isArray(data.characters)) fail('characters');
  const characters = data.characters.map((c: unknown, i: number) => readCharacter(c, `characters[${i}]`));
  const characterIds = new Set<string>();
  characters.forEach((c, i) => {
    if (characterIds.has(c.id)) fail(`characters[${i}].id`);
    characterIds.add(c.id);
  });
  if (!Array.isArray(data.units)) fail('units');
  const unitIds = new Set<string>();
  const units = data.units.map((u: unknown, i: number) => {
    const unit = readUnit(u, `units[${i}]`, characterIds);
    if (unitIds.has(unit.id)) fail(`units[${i}].id`);
    unitIds.add(unit.id);
    return unit;
  });
  let cast: Record<string, string[]> | undefined;
  if (data.cast !== undefined) {
    if (!isObj(data.cast)) fail('cast');
    cast = {};
    for (const [id, actors] of Object.entries(data.cast)) {
      if (!characterIds.has(id) || !isStrings(actors)) fail(`cast.${id}`);
      cast[id] = [...actors];
    }
  }
  return { script: { title: data.title, characters, units }, ...(cast ? { cast } : {}), exportedAt: data.exportedAt };
}
