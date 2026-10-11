import type { RawSpan } from '../types';

export function letterCount(s: string): number {
  return s.replace(/\s/g, '').length;
}

/** Share of the spans' non-space characters for which `pick` holds (0 when there are none). */
export function spanShare(spans: readonly RawSpan[], pick: (s: RawSpan) => boolean): number {
  const total = spans.reduce((n, s) => n + letterCount(s.text), 0);
  if (total === 0) return 0;
  return spans.filter(pick).reduce((n, s) => n + letterCount(s.text), 0) / total;
}
