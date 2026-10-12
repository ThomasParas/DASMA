import type { Script, Unit, UnitKind } from '../../src/types';

export function unit(id: string, kind: UnitKind, text: string, extra: Partial<Unit> = {}): Unit {
  return { id, kind, text, cut: false, tagConfidence: 0.5, source: [{ page: 1, line: Number(id.slice(1)) }], ...extra };
}

/** Earnest, with the kinds of mistakes M2a makes on real scripts: a heading guess, a fake character "OKAY". */
export function scene(): Script {
  return {
    title: 'Earnest',
    characters: [
      { id: 'algernon', name: 'ALGERNON', aliases: ['ALGY'] },
      { id: 'lane', name: 'LANE', aliases: [] },
      { id: 'okay', name: 'OKAY', aliases: [] },
    ],
    units: [
      unit('u1', 'heading', "Morning-room in Algernon's flat"),
      unit('u2', 'direction', 'Lane is arranging afternoon tea on the table.', { tagConfidence: 0.95 }),
      unit('u3', 'characterName', 'ALGERNON', { tagConfidence: 0.95 }),
      unit('u4', 'dialogue', 'Did you hear what I was playing, Lane?', { characterId: 'algernon', tagConfidence: 0.95 }),
      unit('u5', 'characterName', 'LANE', { tagConfidence: 0.95 }),
      unit('u6', 'dialogue', "I didn't think it polite to listen, sir.", { characterId: 'lane', tagConfidence: 0.95 }),
      unit('u7', 'characterName', 'OKAY.', { tagConfidence: 0.4 }),
      unit('u8', 'dialogue', "I'm sorry for that, for your sake.", { characterId: 'okay', tagConfidence: 0.6 }),
      unit('u9', 'characterName', 'ALGERNON', { tagConfidence: 0.95 }),
      unit('u10', 'dialogue', "I don't play accurately.", { characterId: 'algernon', tagConfidence: 0.95 }),
    ],
  };
}

export const ids = (s: Script): string[] => s.units.map((u) => u.id);
export const byId = (s: Script, id: string): Unit => s.units.find((u) => u.id === id)!;
