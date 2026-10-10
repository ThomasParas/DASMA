import type { RawWord } from './types';

const BOUNDARY = /^[ ▁]+/;
const TOKEN_TAIL_SEC = 0.12;

export function tokensToWords(tokens: string[], timestamps: number[], offset: number, logProbs?: number[]): RawWord[] {
  const words: RawWord[] = [];
  let cur: { text: string; start: number; last: number; lp: number[] } | undefined;
  const close = () => {
    if (!cur || !cur.text) return;
    const confidence = cur.lp.length ? Math.exp(cur.lp.reduce((s, x) => s + x, 0) / cur.lp.length) : 1;
    words.push({ text: cur.text, start: cur.start, end: cur.last + TOKEN_TAIL_SEC, confidence });
  };
  tokens.forEach((tok, i) => {
    const ts = (timestamps[i] ?? 0) + offset;
    const clean = tok.replace(BOUNDARY, '');
    if (!cur || BOUNDARY.test(tok)) {
      close();
      cur = { text: clean, start: ts, last: ts, lp: [] };
    } else {
      cur.text += clean;
      cur.last = ts;
    }
    const lp = logProbs?.[i];
    if (lp !== undefined) cur.lp.push(lp);
  });
  close();
  return words;
}
