import { normaliseRanges } from '../overlap';
import type { Script } from '../types';
import { wordSpans } from '../words';
import { nextUnitId } from './ids';
import { EditError } from './ops';
import { setCut } from './unit-ops';
import { indexOfUnit, replaceUnit, withRanges, withUnits } from './util';

type Range = [number, number];

function checkRange(from: number, to: number, count: number, message: string): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > count) throw new EditError(message);
}

export function split(script: Script, unitId: string, atWord: number): Script {
  const i = indexOfUnit(script, unitId);
  const u = script.units[i];
  const spans = wordSpans(u.text);
  if (!Number.isInteger(atWord) || atWord < 1 || atWord >= spans.length) throw new EditError('Pick a word after the first one to split before.');
  const at = spans[atWord][0];
  const first: Range[] = [];
  const second: Range[] = [];
  for (const [a, b] of u.overlapRanges ?? []) {
    if (a < atWord) first.push([a, Math.min(b, atWord)]);
    if (b > atWord) second.push([Math.max(a, atWord) - atWord, b - atWord]);
  }
  const units = script.units.slice();
  units.splice(
    i,
    1,
    withRanges({ ...u, text: u.text.slice(0, at).trimEnd(), tagConfidence: 1 }, first),
    withRanges({ ...u, id: nextUnitId(script), text: u.text.slice(at), source: [...u.source], tagConfidence: 1 }, second),
  );
  return withUnits(script, units);
}

export function join(script: Script, unitId: string): Script {
  const i = indexOfUnit(script, unitId);
  if (i === 0) throw new EditError('There is nothing before this unit to join it to.');
  const prev = script.units[i - 1];
  const u = script.units[i];
  const offset = wordSpans(prev.text).length;
  const ranges =
    prev.kind === 'dialogue' ? normaliseRanges([...(prev.overlapRanges ?? []), ...(u.overlapRanges ?? []).map(([a, b]): Range => [a + offset, b + offset])]) : [];
  const joined = withRanges({ ...prev, text: `${prev.text} ${u.text}`, source: [...prev.source, ...u.source], tagConfidence: 1 }, ranges);
  const units = script.units.slice();
  units.splice(i - 1, 2, joined);
  return withUnits(script, units);
}

export function setCutWords(script: Script, unitId: string, from: number, to: number, cut: boolean): Script {
  const count = wordSpans(script.units[indexOfUnit(script, unitId)].text).length;
  checkRange(from, to, count, 'Select the words to cut.');
  if (from === 0 && to === count) return setCut(script, [unitId], cut);
  let s = to < count ? split(script, unitId, to) : script;
  let target = unitId;
  if (from > 0) {
    s = split(s, unitId, from);
    target = s.units[indexOfUnit(s, unitId) + 1].id;
  }
  return setCut(s, [target], cut);
}

function subtract(ranges: readonly Range[], from: number, to: number): Range[] {
  const out: Range[] = [];
  for (const [a, b] of ranges) {
    if (b <= from || a >= to) out.push([a, b]);
    else {
      if (a < from) out.push([a, from]);
      if (b > to) out.push([to, b]);
    }
  }
  return out;
}

export function setOverlap(script: Script, unitId: string, from: number, to: number, on: boolean): Script {
  const i = indexOfUnit(script, unitId);
  const u = script.units[i];
  if (u.kind !== 'dialogue') throw new EditError('Overlap can only be marked on speech.');
  checkRange(from, to, wordSpans(u.text).length, 'Select the overlapping words.');
  const current = u.overlapRanges ?? [];
  const ranges = on ? normaliseRanges([...current, [from, to]]) : subtract(current, from, to);
  return replaceUnit(script, i, withRanges({ ...u, tagConfidence: 1 }, ranges));
}
