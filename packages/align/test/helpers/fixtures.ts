import type { ScriptLineInput } from '../../src/types';

// Oscar Wilde, The Importance of Being Earnest (1895) — public domain.
export const EARNEST: ScriptLineInput[] = [
  { id: 'L1', characterId: 'ALGERNON', text: 'Did you hear what I was playing, Lane?' },
  { id: 'L2', characterId: 'LANE', text: "I didn't think it polite to listen, sir." },
  { id: 'L3', characterId: 'ALGERNON', text: "I'm sorry for that, for your sake. I don't play accurately." },
  { id: 'L4', characterId: 'ALGERNON', text: 'Anyone can play accurately, but I play with wonderful expression.' },
  { id: 'L5', characterId: 'LANE', text: 'Yes, sir.' },
];

export const textOf = (id: string, lines: ScriptLineInput[] = EARNEST): string =>
  lines.find((l) => l.id === id)!.text;
