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

export const LONG_SCENE: ScriptLineInput[] = [
  ...EARNEST,
  { id: 'L6', characterId: 'ALGERNON', text: 'As far as the piano is concerned, sentiment is my forte. I keep science for Life.' },
  { id: 'L7', characterId: 'LANE', text: 'Yes, sir.' },
  { id: 'L8', characterId: 'ALGERNON', text: 'And, speaking of the science of Life, have you got the cucumber sandwiches cut for Lady Bracknell?' },
  { id: 'L9', characterId: 'LANE', text: 'Yes, sir.' },
  { id: 'L10', characterId: 'ALGERNON', text: 'Oh! by the way, Lane, I see from your book that on Thursday night, when Lord Shoreman and Mr. Worthing were dining with me, eight bottles of champagne are entered as having been consumed.' },
  { id: 'L11', characterId: 'LANE', text: 'Yes, sir; eight bottles and a pint.' },
  { id: 'L12', characterId: 'ALGERNON', text: "Why is it that at a bachelor's establishment the servants invariably drink the champagne? I ask merely for information." },
  { id: 'L13', characterId: 'LANE', text: 'I attribute it to the superior quality of the wine, sir. I have often observed that in married households the champagne is rarely of a first-rate brand.' },
  { id: 'L14', characterId: 'ALGERNON', text: 'Good heavens! Is marriage so demoralising as that?' },
  { id: 'L15', characterId: 'LANE', text: 'I believe it is a very pleasant state, sir. I have had very little experience of it myself up to the present.' },
];
