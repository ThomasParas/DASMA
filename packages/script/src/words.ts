/** Separators exactly as `tokenize` (@dasma/align) splits: whitespace, Unicode dashes, and runs of two or more hyphens. */
const SEPARATORS = /(?:\s|[‐-―−]|--+)+/gu;

/** Character spans [start, end) of each `tokenize` word, so word k of a unit is `text.slice(...wordSpans(text)[k])`. */
export function wordSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (const m of text.matchAll(SEPARATORS)) {
    if (m.index > start) spans.push([start, m.index]);
    start = m.index + m[0].length;
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans;
}
