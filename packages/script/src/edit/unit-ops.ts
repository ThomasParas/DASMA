import type { Script, Unit } from '../types';
import { nextUnitId } from './ids';
import { EditError, type EditOp } from './ops';
import { asKind, confirmed, indexOfUnit, replaceUnit, requireUnits, withRanges, withUnits } from './util';

export const SCENE_BREAK_TEXT = '* * *';

export function confirm(script: Script, unitIds: readonly string[]): Script {
  const ids = requireUnits(script, unitIds);
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? confirmed(u) : u)));
}

export function setKind(script: Script, unitIds: readonly string[], kind: Extract<EditOp, { type: 'setKind' }>['kind']): Script {
  const ids = requireUnits(script, unitIds);
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? asKind(u, kind) : u)));
}

export function editText(script: Script, unitId: string, text: string): Script {
  const i = indexOfUnit(script, unitId);
  const t = text.trim();
  if (!t) throw new EditError('A unit needs some text; use Remove to delete it.');
  return replaceUnit(script, i, withRanges({ ...script.units[i], text: t, tagConfidence: 1 }, []));
}

export function remove(script: Script, unitIds: readonly string[]): Script {
  const ids = requireUnits(script, unitIds);
  if (ids.size >= script.units.length) throw new EditError('A script needs at least one unit.');
  return withUnits(script, script.units.filter((u) => !ids.has(u.id)));
}

export function setCut(script: Script, unitIds: readonly string[], cut: boolean): Script {
  const ids = requireUnits(script, unitIds);
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? { ...u, cut, tagConfidence: 1 } : u)));
}

export function insertSceneBreak(script: Script, beforeUnitId: string): Script {
  const i = indexOfUnit(script, beforeUnitId);
  const unit: Unit = {
    id: nextUnitId(script),
    kind: 'sceneBreak',
    text: SCENE_BREAK_TEXT,
    cut: false,
    tagConfidence: 1,
    source: script.units[i].source.slice(0, 1),
  };
  const units = script.units.slice();
  units.splice(i, 0, unit);
  return withUnits(script, units);
}

export function removeSceneBreak(script: Script, unitId: string): Script {
  const i = indexOfUnit(script, unitId);
  if (script.units[i].kind !== 'sceneBreak') throw new EditError('That unit is not a scene break.');
  return remove(script, [unitId]);
}
