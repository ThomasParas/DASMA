import type { Script, Unit, UnitKind } from '@dasma/script';
import type { Repo } from '../src/db/repo';
import type { ImportedFrom } from '../src/db/schema';

export const SAMPLE_TEXT = ['ACT I', 'HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n');

export const testDbName = (): string => `test-${crypto.randomUUID()}`;

function unit(id: string, kind: UnitKind, text: string, extra: Partial<Unit> = {}): Unit {
  return { id, kind, text, cut: false, tagConfidence: 0.95, source: [{ page: 1, line: Number(id.slice(1)) }], ...extra };
}

/** Earnest with three unsure units: a heading guess (u1), a fake character "OKAY" (u7, u8). */
export function sampleScript(): Script {
  return {
    title: 'Earnest',
    characters: [
      { id: 'algernon', name: 'ALGERNON', aliases: ['ALGY'] },
      { id: 'lane', name: 'LANE', aliases: [] },
      { id: 'okay', name: 'OKAY', aliases: [] },
    ],
    units: [
      unit('u1', 'heading', "Morning-room in Algernon's flat", { tagConfidence: 0.5 }),
      unit('u2', 'direction', 'Lane is arranging afternoon tea on the table.'),
      unit('u3', 'characterName', 'ALGERNON'),
      unit('u4', 'dialogue', 'Did you hear what I was playing, Lane?', { characterId: 'algernon' }),
      unit('u5', 'characterName', 'LANE'),
      unit('u6', 'dialogue', "I didn't think it polite to listen, sir.", { characterId: 'lane' }),
      unit('u7', 'characterName', 'OKAY.', { tagConfidence: 0.4 }),
      unit('u8', 'dialogue', "I'm sorry for that, for your sake.", { characterId: 'okay', tagConfidence: 0.6 }),
      unit('u9', 'characterName', 'ALGERNON'),
      unit('u10', 'dialogue', "I don't play accurately.", { characterId: 'algernon' }),
    ],
  };
}

export async function seedProduction(
  repo: Repo,
  opts: { title?: string; script?: Script; names?: string[]; kind?: ImportedFrom['kind']; cast?: Record<string, string[]> } = {},
) {
  return repo.createProduction({
    title: opts.title ?? 'Earnest',
    origin: 'created',
    cast: opts.cast,
    version: { script: opts.script ?? sampleScript(), pages: 1, unitHints: {}, importedFrom: { kind: opts.kind ?? 'text', names: opts.names ?? ['earnest.txt'] }, warnings: [] },
  });
}
