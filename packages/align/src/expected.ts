import { FILLERS, expandContraction, normalizeToken, tokenize } from './normalize';
import { phoneticKey } from './phonetic';
import type { ExpectedWord, HeardToken, HeardWord, ScriptLineInput, Strictness } from './types';

const EDGE_PUNCT = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;

function expand(norm: string, strictness: Strictness): string[] {
  return strictness.mode === 'lenient' ? expandContraction(norm) : [norm];
}

export function buildExpected(lines: ScriptLineInput[], strictness: Strictness): ExpectedWord[] {
  const out: ExpectedWord[] = [];
  for (const line of lines) {
    if (line.cut) continue;
    const ranges = line.overlapRanges ?? [];
    tokenize(line.text).forEach((raw, wordInLine) => {
      const overlap = ranges.some(([s, e]) => wordInLine >= s && wordInLine < e);
      for (const n of normalizeToken(raw)) {
        // A scripted filler ("Um", "Hmm") is never expected: heard fillers are dropped, so expecting one would flag every actor.
        if (FILLERS.has(n)) continue;
        for (const norm of expand(n, strictness)) {
          out.push({
            idx: out.length,
            lineId: line.id,
            characterId: line.characterId,
            wordInLine,
            raw,
            norm,
            phon: phoneticKey(norm),
            zone: overlap ? 'overlap' : 'checked',
          });
        }
      }
    });
  }
  return out;
}

export function toHeardTokens(words: HeardWord[], strictness: Strictness): HeardToken[] {
  const out: HeardToken[] = [];
  for (const w of words) {
    for (const n of normalizeToken(w.text)) {
      if (FILLERS.has(n)) continue;
      for (const norm of expand(n, strictness)) {
        out.push({ text: w.text, norm, phon: phoneticKey(norm), start: w.start, end: w.end, confidence: w.confidence });
      }
    }
  }
  return out;
}

export function displayExpected(words: ExpectedWord[]): string {
  const seen = new Set<string>();
  const raws: string[] = [];
  for (const w of words) {
    const key = `${w.lineId}#${w.wordInLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    raws.push(w.raw);
  }
  return raws.join(' ').replace(EDGE_PUNCT, '');
}

export function displayHeard(tokens: HeardToken[]): string {
  return tokens.map((t) => t.norm).join(' ');
}

export function countCheckedWords(expected: ExpectedWord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of expected) {
    if (w.zone !== 'checked') continue;
    counts.set(w.lineId, (counts.get(w.lineId) ?? 0) + 1);
  }
  return counts;
}
