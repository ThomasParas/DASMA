import type { ScriptLineInput } from '@dasma/align';
import type { Script } from './types';

/** characterId given to a dialogue unit whose speaker was not resolved (such units are always flagged). */
export const UNKNOWN_CHARACTER = 'unknown';

/** Spec §9: dialogue units, in order, as the engine's script lines. */
export function toAlignLines(script: Script): ScriptLineInput[] {
  return script.units
    .filter((u) => u.kind === 'dialogue')
    .map((u) => ({
      id: u.id,
      characterId: u.characterId ?? UNKNOWN_CHARACTER,
      text: u.text,
      cut: u.cut,
      ...(u.overlapRanges ? { overlapRanges: u.overlapRanges } : {}),
    }));
}
