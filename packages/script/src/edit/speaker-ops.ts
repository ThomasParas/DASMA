import { normalizeCueToken } from '../cues';
import type { Script, Unit, UnitHint, UnitKind } from '../types';
import { EditError } from './ops';
import { asKind, cleanAliases, indexOfUnit, requireCharacter, requireUnits, withUnits } from './util';

const SPEECH_ENDS: ReadonlySet<UnitKind> = new Set(['characterName', 'heading', 'sceneBreak', 'frontMatter']);

/** Indices of the dialogue units after unit i, up to the next name, heading, scene break or front matter. */
export function speechReach(units: readonly Unit[], i: number): number[] {
  const out: number[] = [];
  for (let k = i + 1; k < units.length; k++) {
    if (SPEECH_ENDS.has(units[k].kind)) break;
    if (units[k].kind === 'dialogue') out.push(k);
  }
  return out;
}

const speak = (u: Unit, characterId: string): Unit => ({ ...u, kind: 'dialogue', characterId, tagConfidence: 1 });

export function speechBy(script: Script, unitIds: readonly string[], characterId: string): Script {
  requireCharacter(script, characterId);
  requireUnits(script, unitIds);
  const units = script.units.slice();
  for (const id of unitIds) {
    const i = units.findIndex((u) => u.id === id);
    if (units[i].kind === 'characterName') for (const k of speechReach(units, i)) units[k] = speak(units[k], characterId);
    units[i] = speak(units[i], characterId);
  }
  return withUnits(script, units);
}

export function newCharacter(script: Script, id: string, name: string): Script {
  const n = name.trim();
  if (!n) throw new EditError('A character needs a name.');
  if (!id || script.characters.some((c) => c.id === id)) throw new EditError(`The character id ${id} is already used.`);
  return { ...script, characters: [...script.characters, { id, name: n, aliases: [] }] };
}

export function setName(script: Script, unitId: string, characterId: string): Script {
  requireCharacter(script, characterId);
  const i = indexOfUnit(script, unitId);
  const units = script.units.slice();
  units[i] = asKind(units[i], 'characterName');
  for (const k of speechReach(units, i)) units[k] = speak(units[k], characterId);
  return withUnits(script, units);
}

export function moveSpeeches(script: Script, unitIds: readonly string[], characterId: string): Script {
  requireCharacter(script, characterId);
  const ids = requireUnits(script, unitIds);
  if (script.units.some((u) => ids.has(u.id) && u.kind !== 'dialogue')) throw new EditError('Only speeches can be moved to a character.');
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? speak(u, characterId) : u)));
}

export function renameCharacter(script: Script, characterId: string, name: string): Script {
  requireCharacter(script, characterId);
  const n = name.trim();
  if (!n) throw new EditError('A character needs a name.');
  return { ...script, characters: script.characters.map((c) => (c.id === characterId ? { ...c, name: n, aliases: cleanAliases(c.aliases, n) } : c)) };
}

export function editAliases(script: Script, characterId: string, aliases: readonly string[]): Script {
  const c = requireCharacter(script, characterId);
  return { ...script, characters: script.characters.map((x) => (x.id === characterId ? { ...x, aliases: cleanAliases(aliases, c.name) } : x)) };
}

export function mergeCharacters(script: Script, fromId: string, intoId: string): Script {
  if (fromId === intoId) throw new EditError('Pick a different character to merge into.');
  const from = requireCharacter(script, fromId);
  const into = requireCharacter(script, intoId);
  const aliases = cleanAliases([...into.aliases, from.name, ...from.aliases], into.name);
  return {
    ...script,
    characters: script.characters.filter((c) => c.id !== fromId).map((c) => (c.id === intoId ? { ...c, aliases } : c)),
    units: script.units.map((u) => (u.kind === 'dialogue' && u.characterId === fromId ? speak(u, intoId) : u)),
  };
}

export function splitAlias(script: Script, characterId: string, alias: string, newId: string, unitIds: readonly string[]): Script {
  const c = requireCharacter(script, characterId);
  const match = c.aliases.find((a) => a.toUpperCase() === alias.trim().toUpperCase());
  if (!match) throw new EditError(`${alias} is not an alias of ${c.name}.`);
  if (script.characters.some((x) => x.id === newId)) throw new EditError(`The character id ${newId} is already used.`);
  const ids = new Set(unitIds);
  for (const id of ids) {
    const u = script.units[indexOfUnit(script, id)];
    if (u.kind !== 'dialogue' || u.characterId !== characterId) throw new EditError(`Unit ${id} is not a speech by ${c.name}.`);
  }
  const characters = script.characters.flatMap((x) =>
    x.id === characterId ? [{ ...x, aliases: x.aliases.filter((a) => a !== match) }, { id: newId, name: match, aliases: [] }] : [x],
  );
  return { ...script, characters, units: script.units.map((u) => (ids.has(u.id) ? speak(u, newId) : u)) };
}

/** Speeches by `characterId` that were cued by `alias`: through a name unit, or (inline cues) through the import hints. */
export function aliasSpeeches(script: Script, hints: Readonly<Record<string, UnitHint>>, characterId: string, alias: string): string[] {
  const token = normalizeCueToken(alias);
  const found = new Set<string>();
  script.units.forEach((u, i) => {
    if (u.kind === 'dialogue' && u.characterId === characterId && hints[u.id]?.cue === token) found.add(u.id);
    if (u.kind === 'characterName' && normalizeCueToken(u.text) === token) {
      for (const k of speechReach(script.units, i)) if (script.units[k].characterId === characterId) found.add(script.units[k].id);
    }
  });
  return script.units.filter((u) => found.has(u.id)).map((u) => u.id);
}
