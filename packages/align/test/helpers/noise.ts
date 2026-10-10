import { FUNCTION_WORDS, normalizeToken, tokenize } from '../../src/normalize';
import type { HeardWord, ScriptLineInput } from '../../src/types';

export const VOCAB = ['zebra', 'volcano', 'pickle', 'umbrella', 'jigsaw', 'kettle', 'marmalade', 'trombone', 'walrus', 'yoghurt', 'lantern', 'biscuit'];
const INSERTS = ['the', 'a', 'and', 'of'];
const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)]!;

export function mutate(word: string, rng: () => number): string {
  const vowels = 'aeiou';
  const idxs = [...word].map((c, i) => (vowels.includes(c) ? i : -1)).filter((i) => i >= 0);
  if (!idxs.length) return `${word}s`;
  const chars = [...word];
  chars[pick(idxs, rng)] = pick([...vowels], rng);
  return chars.join('');
}

export interface ActorError {
  lineId: string;
  rawIndex: number;
  replacement: string;
}

export function simulateRecognizer(
  lines: ScriptLineInput[],
  rng: () => number,
  rate: number,
  actorError?: ActorError,
): HeardWord[] {
  const out: HeardWord[] = [];
  let t = 0;
  const say = (text: string, confidence: number) => {
    out.push({ text, start: t, end: t + 0.3, confidence, final: true });
    t += 0.35;
  };
  const low = () => 0.2 + 0.4 * rng();
  const high = () => 0.7 + 0.3 * rng();
  for (const line of lines) {
    if (line.cut) continue;
    tokenize(line.text).forEach((raw, rawIndex) => {
      if (actorError && actorError.lineId === line.id && actorError.rawIndex === rawIndex) {
        say(actorError.replacement, 0.95);
        return;
      }
      for (const word of normalizeToken(raw)) {
        const r = rng();
        if (r < rate * 0.5) say(rng() < 0.7 ? mutate(word, rng) : pick(VOCAB, rng), low());
        else if (r < rate * 0.75) {
          if (!FUNCTION_WORDS.has(word)) say(mutate(word, rng), low());
        } else if (r < rate) {
          say(pick(INSERTS, rng), low());
          say(word, high());
        } else say(word, high());
      }
    });
    t += 0.6;
  }
  return out;
}
