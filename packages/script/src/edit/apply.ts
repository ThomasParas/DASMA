import type { Script } from '../types';
import { EditError, type EditOp } from './ops';
import { editAliases, mergeCharacters, moveSpeeches, newCharacter, renameCharacter, setName, speechBy, splitAlias } from './speaker-ops';
import { confirm, editText, insertSceneBreak, remove, removeSceneBreak, setCut, setKind } from './unit-ops';

export interface EditOptions {
  /** Character ids never pruned: the production's cast-list keys. */
  keep?: readonly string[];
}

function dialogueCounts(script: Script): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of script.units) if (u.kind === 'dialogue' && u.characterId) counts.set(u.characterId, (counts.get(u.characterId) ?? 0) + 1);
  return counts;
}

/** Removes characters with no dialogue, unless their id is in `keep`. */
export function pruneCharacters(script: Script, keep: readonly string[]): Script {
  const has = dialogueCounts(script);
  const characters = script.characters.filter((c) => has.has(c.id) || keep.includes(c.id));
  return characters.length === script.characters.length ? script : { ...script, characters };
}

/** Removes only the characters this edit emptied (they had dialogue before and have none after). */
function pruneEmptied(before: Script, after: Script, keep: readonly string[]): Script {
  if (after === before) return after;
  const had = dialogueCounts(before);
  const has = dialogueCounts(after);
  const characters = after.characters.filter((c) => !(had.has(c.id) && !has.has(c.id) && !keep.includes(c.id)));
  return characters.length === after.characters.length ? after : { ...after, characters };
}

function applyOne(script: Script, op: Exclude<EditOp, { type: 'batch' }>): Script {
  switch (op.type) {
    case 'confirm':
      return confirm(script, op.unitIds);
    case 'setKind':
      return setKind(script, op.unitIds, op.kind);
    case 'editText':
      return editText(script, op.unitId, op.text);
    case 'remove':
      return remove(script, op.unitIds);
    case 'setCut':
      return setCut(script, op.unitIds, op.cut);
    case 'insertSceneBreak':
      return insertSceneBreak(script, op.beforeUnitId);
    case 'removeSceneBreak':
      return removeSceneBreak(script, op.unitId);
    case 'speechBy':
      return speechBy(script, op.unitIds, op.characterId);
    case 'newCharacter':
      return newCharacter(script, op.id, op.name);
    case 'setName':
      return setName(script, op.unitId, op.characterId);
    case 'moveSpeeches':
      return moveSpeeches(script, op.unitIds, op.characterId);
    case 'renameCharacter':
      return renameCharacter(script, op.characterId, op.name);
    case 'editAliases':
      return editAliases(script, op.characterId, op.aliases);
    case 'mergeCharacters':
      return mergeCharacters(script, op.fromId, op.intoId);
    case 'splitAlias':
      return splitAlias(script, op.characterId, op.alias, op.newId, op.unitIds);
    default:
      // Transitional until Tasks 3 and 4 add the remaining ops; Task 4 replaces this with an exhaustive check.
      throw new EditError(`${op.type} is not available yet.`);
  }
}

/** Spec §6.2: applies one op (a batch is one undo step) and returns a new script; throws EditError, leaving `script` unchanged. */
export function applyEdit(script: Script, op: EditOp, opts: EditOptions = {}): Script {
  if (op.type === 'batch') return op.ops.reduce((s, o) => applyEdit(s, o, opts), script);
  return pruneEmptied(script, applyOne(script, op), opts.keep ?? []);
}
