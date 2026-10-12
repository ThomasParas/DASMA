import type { Script, Unit, UnitKind } from '../types';
import { FLAG_BELOW } from '../weights';
import { speechReach } from './speaker-ops';

export type CheckReason = 'newCharacter' | 'noSpeaker' | 'heading' | 'unsure';

export interface CheckItem {
  unitId: string;
  kind: UnitKind;
  reason: CheckReason;
}

/** Speeches per character: a speech starts at a dialogue unit whose character differs from the speech before it. */
export function speechCounts(script: Script): Map<string, number> {
  const counts = new Map<string, number>();
  let current: string | null = null;
  for (const u of script.units) {
    if (u.kind === 'characterName' || u.kind === 'heading' || u.kind === 'sceneBreak' || u.kind === 'frontMatter') current = null;
    if (u.kind !== 'dialogue' || !u.characterId) continue;
    if (u.characterId !== current) counts.set(u.characterId, (counts.get(u.characterId) ?? 0) + 1);
    current = u.characterId;
  }
  return counts;
}

/** The character a dialogue unit belongs to, or the one a name unit cues. */
export function speakerOf(units: readonly Unit[], i: number): string | undefined {
  const u = units[i];
  if (u.kind === 'dialogue') return u.characterId;
  if (u.kind === 'characterName') {
    const reach = speechReach(units, i);
    return reach.length ? units[reach[0]].characterId : undefined;
  }
  return undefined;
}

/** Spec §6.1: every unit below FLAG_BELOW, in script order, with the reason shown in the "To check" list. */
export function checkQueue(script: Script): CheckItem[] {
  const counts = speechCounts(script);
  const out: CheckItem[] = [];
  script.units.forEach((u, i) => {
    if (u.tagConfidence >= FLAG_BELOW) return;
    const who = speakerOf(script.units, i);
    let reason: CheckReason = 'unsure';
    if (u.kind === 'dialogue' && !u.characterId) reason = 'noSpeaker';
    else if ((u.kind === 'dialogue' || u.kind === 'characterName') && who && counts.get(who) === 1) reason = 'newCharacter';
    else if (u.kind === 'heading') reason = 'heading';
    out.push({ unitId: u.id, kind: u.kind, reason });
  });
  return out;
}
