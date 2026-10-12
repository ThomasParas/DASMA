import type { Character, Script, UnitKind } from './types';

export interface AnswerKeyUnit {
  kind: UnitKind;
  characterId?: string;
  text: string;
  page: number;
}

/** The `<name>.truth.json` shape `script-eval --set local` reads. Cuts are not part of import truth. */
export interface AnswerKey {
  pages: number;
  cast: Character[];
  units: AnswerKeyUnit[];
}

export function toAnswerKey(script: Script, pages: number): AnswerKey {
  return {
    pages: Math.max(1, pages),
    cast: script.characters.map((c) => ({ id: c.id, name: c.name, aliases: [...c.aliases] })),
    units: script.units.map((u) => ({
      kind: u.kind,
      ...(u.characterId !== undefined ? { characterId: u.characterId } : {}),
      text: u.text,
      page: Math.max(1, u.source[0]?.page ?? 1),
    })),
  };
}
