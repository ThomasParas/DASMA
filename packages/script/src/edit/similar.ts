import { normalizeCueToken } from '../cues';
import type { Script, Unit, UnitHint } from '../types';
import { checkQueue, speakerOf } from './check';

function nameKey(script: Script, i: number): string | undefined {
  const u = script.units[i];
  if (u.kind === 'characterName') return normalizeCueToken(u.text);
  const who = speakerOf(script.units, i);
  const name = script.characters.find((c) => c.id === who)?.name;
  return name === undefined ? undefined : normalizeCueToken(name);
}

const sameFirstSource = (a: Unit, b: Unit): boolean =>
  !!a.source[0] && !!b.source[0] && a.source[0].page === b.source[0].page && a.source[0].line === b.source[0].line;

/** Spec §4 "hints follow ids": a unit without its own hint (a split piece) takes the hint of the unit before it when both start on the same source line. */
export function effectiveHints(script: Script, hints: Readonly<Record<string, UnitHint>>): Map<string, UnitHint> {
  const out = new Map<string, UnitHint>();
  script.units.forEach((u, i) => {
    const prev = script.units[i - 1];
    const h = hints[u.id] ?? (prev && sameFirstSource(prev, u) ? out.get(prev.id) : undefined);
    if (h) out.set(u.id, h);
  });
  return out;
}

/** Spec §6.4: the other unsure units "like this one" — same reason and kind, same band and italic when both have hints. */
export function similarUnits(script: Script, rawHints: Readonly<Record<string, UnitHint>>, unitId: string): string[] {
  const queue = checkQueue(script);
  const self = queue.find((q) => q.unitId === unitId);
  if (!self) return [];
  const index = new Map(script.units.map((u, i) => [u.id, i]));
  const hints = effectiveHints(script, rawHints);
  const h = hints.get(unitId);
  const key = self.reason === 'newCharacter' ? nameKey(script, index.get(unitId)!) : undefined;
  return queue
    .filter((q) => q.unitId !== unitId && q.reason === self.reason && q.kind === self.kind)
    .filter((q) => {
      const o = hints.get(q.unitId);
      return !h || !o || (o.band === h.band && o.italic === h.italic);
    })
    .filter((q) => self.reason !== 'newCharacter' || nameKey(script, index.get(q.unitId)!) === key)
    .map((q) => q.unitId);
}
