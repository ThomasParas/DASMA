import { numberToWords } from './numbers';

const APOSTROPHES = /[‘’ʼ`´]/g;
const DASHES = /[‐-―−]|--+/g;
const KEEP_LEADING = new Set(["'tis", "'twas", "'em"]);

export const FILLERS: ReadonlySet<string> = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm', 'mhm']);

export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'it', 'i', 'you', 'he', 'she', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'that', 'this',
  'so', 'as', 'do', 'did', 'if', 'no', 'not', 'oh', 'o', 'have', 'has', 'had', 'will', 'would',
]);

export function tokenize(text: string): string[] {
  return text
    .replace(APOSTROPHES, "'")
    .replace(DASHES, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function normalizeToken(raw: string): string[] {
  const lowered = raw.replace(APOSTROPHES, "'").toLowerCase().replace(/&/g, ' and ');
  const cleaned = lowered.replace(/[^a-z0-9' ]+/g, ' ');
  const out: string[] = [];
  for (const piece of cleaned.split(' ')) {
    if (!piece) continue;
    const part = KEEP_LEADING.has(piece) ? piece : piece.replace(/^'+/, '').replace(/'+$/, '');
    if (!part) continue;
    const ord = /^(\d+)(st|nd|rd|th)$/.exec(part);
    if (ord) {
      out.push(...numberToWords(Number(ord[1]), 'ordinal'));
      continue;
    }
    if (/^\d+$/.test(part)) {
      out.push(...numberToWords(Number(part)));
      continue;
    }
    if (/\d/.test(part)) {
      for (const p of part.split(/(\d+)/)) {
        if (!p) continue;
        out.push(...(/^\d+$/.test(p) ? numberToWords(Number(p)) : [p]));
      }
      continue;
    }
    out.push(part);
  }
  return out;
}

const SPECIAL: Record<string, string[]> = {
  "can't": ['can', 'not'],
  "won't": ['will', 'not'],
  "shan't": ['shall', 'not'],
  "ain't": ['am', 'not'],
  "let's": ['let', 'us'],
  "'tis": ['it', 'is'],
  "'twas": ['it', 'was'],
  "'em": ['them'],
  "o'er": ['over'],
  "e'er": ['ever'],
  "ne'er": ['never'],
  "y'all": ['you', 'all'],
};
const S_EXPANDS = new Set(['it', 'he', 'she', 'that', 'there', 'what', 'here', 'where', 'who', 'how', 'this']);

export function expandContraction(norm: string): string[] {
  const special = SPECIAL[norm];
  if (special) return special;
  let m: RegExpExecArray | null;
  if ((m = /^(.+)n't$/.exec(norm))) return [m[1]!, 'not'];
  if ((m = /^(.+)'ll$/.exec(norm))) return [m[1]!, 'will'];
  if ((m = /^(.+)'re$/.exec(norm))) return [m[1]!, 'are'];
  if ((m = /^(.+)'ve$/.exec(norm))) return [m[1]!, 'have'];
  if ((m = /^(.+)'m$/.exec(norm))) return [m[1]!, 'am'];
  if ((m = /^(.+)'d$/.exec(norm))) return [m[1]!, 'would'];
  if ((m = /^(.+)'s$/.exec(norm)) && S_EXPANDS.has(m[1]!)) return [m[1]!, 'is'];
  return [norm];
}

export function isContraction(norm: string): boolean {
  return norm in SPECIAL || expandContraction(norm).length > 1;
}
