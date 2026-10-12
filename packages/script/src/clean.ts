import { TEXT_COLUMN } from './extract/text';
import { isHeading } from './patterns';
import type { CleanDoc, CleanLine, RawDoc, RawSpan, SourceKind } from './types';

/** Lines at the top and bottom of each page that may be running headers or footers. */
export const EDGE_LINES = 3;
/** A header must recur in the edge zone on at least this share of pages… */
export const HEADER_PAGE_SHARE = 0.4;
/** …and on at least this many pages. */
export const HEADER_MIN_PAGES = 3;
/** A header may appear outside the edge zone at most this many times per edge appearance (so speaker names survive). */
export const HEADER_INNER_MAX = 0.25;
/** A PDF line number sits further than this (points) outside the text column. */
export const LINE_NUMBER_OUTSIDE = 24;
/** Rule S1, estimated pages: an identical line is a running header when at least this many copies sit in a header position… */
export const TEXT_HEADER_MIN_COPIES = 5;
/** …a header position being within this many lines of a page-number line… */
export const TEXT_HEADER_NEAR_LINES = 2;
/** …or, when page numbers place too few copies, at least this many lines after the previous copy… */
export const TEXT_HEADER_MIN_SPACING = 20;
/** …and within this share of the median spacing between copies. */
export const TEXT_HEADER_SPACING_TOLERANCE = 0.2;
/** A line with more copies than this away from header positions after the first header recurs as content (a speaker name) and is kept. */
export const TEXT_HEADER_MAX_STRAY = 1;

const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };

export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[\u00ad\u200b]/g, '')
    .replace(/[\u00a0\u2000-\u200a\u202f\u205f\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAGE_NUMBER = /^(page\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?$/i;
const ROMAN_PAGE = /^[-–—]?\s*[ivxl]{1,6}\s*[-–—]?$/;

export function isPageNumber(text: string): boolean {
  const t = text.trim();
  return PAGE_NUMBER.test(t) || ROMAN_PAGE.test(t);
}

/** Copies regularly spaced after their previous copy: each gap within the tolerance of the median gap. */
function onSpacing(idxs: number[]): number[] {
  const gaps = idxs.slice(1).map((i, k) => i - idxs[k]);
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median < TEXT_HEADER_MIN_SPACING) return [];
  return idxs.filter((_, k) => k > 0 && Math.abs(gaps[k - 1] - median) <= TEXT_HEADER_SPACING_TOLERANCE * median);
}

/**
 * Rule S1 (spec §6.5a), estimated pages: indices of running-header copies. A line recurring with identical text is a
 * header when enough copies sit next to a page-number line (or, failing that, at a regular spacing) and it is not a
 * recurring cue token: a speaker name also recurs away from page boundaries, so it is never removed. Copies before
 * the first header position (a title page) stay.
 */
function textRunningHeaders(lines: CleanLine[]): Set<number> {
  const pageNumber = lines.map((l) => isPageNumber(l.text));
  const nearPage = (i: number): boolean =>
    pageNumber.slice(Math.max(0, i - TEXT_HEADER_NEAR_LINES), i + TEXT_HEADER_NEAR_LINES + 1).some(Boolean);
  const copies = new Map<string, number[]>();
  lines.forEach((l, i) => {
    if (pageNumber[i]) return;
    const key = l.text.replace(/\s+/g, ' ').trim();
    const idxs = copies.get(key);
    if (idxs) idxs.push(i);
    else copies.set(key, [i]);
  });
  const drop = new Set<number>();
  for (const idxs of copies.values()) {
    if (idxs.length < TEXT_HEADER_MIN_COPIES) continue;
    let placed = idxs.filter(nearPage);
    if (placed.length < TEXT_HEADER_MIN_COPIES) placed = onSpacing(idxs);
    if (placed.length < TEXT_HEADER_MIN_COPIES) continue;
    const at = new Set(placed);
    const stray = idxs.filter((i) => i > placed[0] && !at.has(i)).length;
    if (stray > TEXT_HEADER_MAX_STRAY) continue;
    for (const i of placed) drop.add(i);
  }
  return drop;
}

const mask = (t: string): string => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

function removeRunningLines(lines: CleanLine[], raw: RawDoc): CleanLine[] {
  if (raw.realPages) {
    if (raw.pages < HEADER_MIN_PAGES) return lines;
    const byPage = new Map<number, number[]>();
    lines.forEach((l, i) => byPage.set(l.page, [...(byPage.get(l.page) ?? []), i]));
    const edge = new Set<number>();
    const edgePages = new Map<string, Set<number>>();
    const edgeCount = new Map<string, number>();
    const innerCount = new Map<string, number>();
    for (const [page, idxs] of byPage) {
      idxs.forEach((idx, k) => {
        const key = mask(lines[idx].text);
        if (k < EDGE_LINES || k >= idxs.length - EDGE_LINES) {
          edge.add(idx);
          edgePages.set(key, (edgePages.get(key) ?? new Set()).add(page));
          edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        } else {
          innerCount.set(key, (innerCount.get(key) ?? 0) + 1);
        }
      });
    }
    const minPages = Math.max(HEADER_MIN_PAGES, Math.ceil(HEADER_PAGE_SHARE * raw.pages));
    const drop = new Set(
      [...edgePages]
        .filter(([key, pages]) => pages.size >= minPages && (innerCount.get(key) ?? 0) <= HEADER_INNER_MAX * (edgeCount.get(key) ?? 0))
        .map(([key]) => key),
    );
    return lines.filter((l, i) => !(edge.has(i) && drop.has(mask(l.text))));
  }
  const digits = new Map<string, string[]>();
  for (const l of lines) {
    if (!/\d/.test(l.text)) continue;
    const key = mask(l.text);
    digits.set(key, [...(digits.get(key) ?? []), (l.text.match(/\d+/g) ?? []).join(',')]);
  }
  const drop = new Set([...digits].filter(([, ds]) => ds.length >= 3 && new Set(ds).size >= 2).map(([key]) => key));
  const headers = textRunningHeaders(lines);
  return lines.filter((l, i) => !drop.has(mask(l.text)) && !headers.has(i));
}

const isNumberSpan = (s: RawSpan): boolean => /^\d{1,4}$/.test(s.text.trim());

function textColumn(lines: CleanLine[]): { left: number; right: number } {
  const lefts: number[] = [];
  const rights: number[] = [];
  for (const l of lines) {
    const body = l.spans.filter((s) => !isNumberSpan(s));
    if (!body.length) continue;
    lefts.push(Math.min(...body.map((s) => s.left)));
    rights.push(Math.max(...body.map((s) => s.right)));
  }
  lefts.sort((a, b) => a - b);
  rights.sort((a, b) => a - b);
  if (!lefts.length) return { left: 0, right: Number.POSITIVE_INFINITY };
  return { left: lefts[Math.floor(lefts.length * 0.1)], right: rights[Math.min(rights.length - 1, Math.floor(rights.length * 0.9))] };
}

const LEADING_NUMBER = /^(\d{1,4})(?:\t|\s{2,})(?=\S)/;
const TRAILING_NUMBER = /(?<=\S)(?:\t|\s{2,})(\d{1,4})$/;

/** Removes the first `n` characters from the spans' text, dropping spans that become empty. */
function dropPrefix(spans: RawSpan[], n: number): RawSpan[] {
  const out: RawSpan[] = [];
  let left = n;
  for (const s of spans) {
    const cut = Math.min(left, s.text.length);
    left -= cut;
    const text = s.text.slice(cut);
    if (text.length > 0) out.push({ ...s, text });
  }
  return out;
}

/** Removes the last `n` characters from the spans' text, dropping spans that become empty. */
function dropSuffix(spans: RawSpan[], n: number): RawSpan[] {
  const out: RawSpan[] = [];
  let left = n;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i];
    const cut = Math.min(left, s.text.length);
    left -= cut;
    const text = s.text.slice(0, s.text.length - cut);
    if (text.length > 0) out.unshift({ ...s, text });
  }
  return out;
}

function removeLineNumbers(lines: CleanLine[], source: SourceKind): CleanLine[] {
  const col = source === 'pdf' ? textColumn(lines) : null;
  let last = 0;
  const accept = (n: number): boolean => {
    if (n % 5 !== 0 || n <= last) return false;
    last = n;
    return true;
  };
  const out: CleanLine[] = [];
  for (const l of lines) {
    if (isHeading(l.text)) last = 0;
    if (col) {
      const idx = l.spans.findIndex(
        (s) => isNumberSpan(s) && (s.left > col.right + LINE_NUMBER_OUTSIDE || s.right < col.left - LINE_NUMBER_OUTSIDE),
      );
      if (idx >= 0 && accept(Number(l.spans[idx].text))) {
        const spans = l.spans.filter((_, k) => k !== idx);
        if (!spans.length) continue;
        const n = l.spans[idx].text.trim();
        const text = idx === l.spans.length - 1 ? l.text.replace(new RegExp(`\\s*${n}$`), '') : l.text.replace(new RegExp(`^${n}\\s*`), '');
        out.push({ ...l, spans, text, left: Math.min(...spans.map((s) => s.left)), right: Math.max(...spans.map((s) => s.right)) });
        continue;
      }
      out.push(l);
      continue;
    }
    const lead = LEADING_NUMBER.exec(l.text);
    if (lead && accept(Number(lead[1]))) {
      const text = l.text.slice(lead[0].length);
      const shift = source === 'text' ? lead[0].length * TEXT_COLUMN : 0;
      const spans = dropPrefix(l.spans, lead[0].length);
      if (spans.length && shift) spans[0] = { ...spans[0], left: spans[0].left + shift };
      out.push({ ...l, text, left: l.left + shift, spans });
      continue;
    }
    const trail = TRAILING_NUMBER.exec(l.text);
    if (trail && accept(Number(trail[1]))) {
      const text = l.text.slice(0, trail.index);
      const spans = dropSuffix(l.spans, l.text.length - trail.index);
      out.push({ ...l, text, spans });
      continue;
    }
    out.push(l);
  }
  return out;
}

function joinHyphenated(lines: CleanLine[]): CleanLine[] {
  const out: CleanLine[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && /\p{L}-$/u.test(prev.text) && !/--$/.test(prev.text) && /^\p{Ll}/u.test(l.text)) {
      const spans = prev.spans.map((s) => ({ ...s }));
      const tail = spans[spans.length - 1];
      if (tail) tail.text = tail.text.replace(/-$/, '');
      out[out.length - 1] = { ...prev, text: prev.text.slice(0, -1) + l.text, spans: [...spans, ...l.spans], source: [...prev.source, ...l.source] };
      continue;
    }
    out.push(l);
  }
  return out;
}

function normalizeLine(l: CleanLine): CleanLine {
  return {
    ...l,
    text: normalizeText(l.text),
    spans: l.spans.map((s) => ({ ...s, text: normalizeText(s.text) })).filter((s) => s.text.length > 0),
  };
}

/** Spec §4.2, rules in order: running lines, page numbers, line numbers, hyphenation, characters, empties. */
export function cleanDoc(raw: RawDoc): CleanDoc {
  let lines: CleanLine[] = raw.lines.map((l, i) => ({ ...l, spans: l.spans.map((s) => ({ ...s })), source: [{ page: l.page, line: i }] }));
  lines = removeRunningLines(lines, raw);
  lines = lines.filter((l) => !isPageNumber(l.text));
  lines = removeLineNumbers(lines, raw.source);
  lines = joinHyphenated(lines);
  lines = lines.map(normalizeLine).filter((l) => l.text.length > 0);
  return { source: raw.source, pageWidth: raw.pageWidth, pages: raw.pages, realPages: raw.realPages, lines };
}
