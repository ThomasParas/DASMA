import type { Character, Script, Unit, UnitKind } from '../types';
import { EditError } from './ops';

export function indexOfUnit(script: Script, id: string): number {
  const i = script.units.findIndex((u) => u.id === id);
  if (i < 0) throw new EditError(`There is no unit ${id}.`);
  return i;
}

export function requireUnits(script: Script, unitIds: readonly string[]): Set<string> {
  if (unitIds.length === 0) throw new EditError('Select at least one unit.');
  for (const id of unitIds) indexOfUnit(script, id);
  return new Set(unitIds);
}

export function requireCharacter(script: Script, id: string): Character {
  const c = script.characters.find((x) => x.id === id);
  if (!c) throw new EditError(`There is no character ${id}.`);
  return c;
}

export const withUnits = (script: Script, units: Unit[]): Script => ({ ...script, units });

export function replaceUnit(script: Script, i: number, unit: Unit): Script {
  const units = script.units.slice();
  units[i] = unit;
  return withUnits(script, units);
}

export const confirmed = (u: Unit): Unit => (u.tagConfidence === 1 ? u : { ...u, tagConfidence: 1 });

/** The unit as a non-speech kind: no speaker, no overlap marks, confirmed. */
export function asKind(u: Unit, kind: UnitKind): Unit {
  const { characterId, overlapRanges, ...rest } = u;
  void characterId;
  void overlapRanges;
  return { ...rest, kind, tagConfidence: 1 };
}

/** The unit with these overlap ranges, or without the field when there are none. */
export function withRanges(u: Unit, ranges: Array<[number, number]>): Unit {
  const { overlapRanges, ...rest } = u;
  void overlapRanges;
  return ranges.length ? { ...rest, overlapRanges: ranges } : rest;
}

/** Trimmed, de-duplicated (case-insensitive) aliases, without the character's own name. */
export function cleanAliases(aliases: readonly string[], name: string): string[] {
  const seen = new Set([name.trim().toUpperCase()]);
  const out: string[] = [];
  for (const a of aliases) {
    const t = a.trim();
    const key = t.toUpperCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
