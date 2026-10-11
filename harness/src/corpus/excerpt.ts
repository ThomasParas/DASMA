import type { Rng } from '../rng';
import type { SourcePlay, SourceUnit } from './source-play';

/** About 15 pages of 46 page lines. */
export const EXCERPT_LINES = 15 * 46;
const EST_CHARS_PER_LINE = 65;

const estLines = (u: SourceUnit): number =>
  u.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / EST_CHARS_PER_LINE)), 0) + 1;

/** Front matter, then body units from a seeded heading until about 15 pages (spec §6.2). */
export function selectExcerpt(play: SourcePlay, rng: Rng): SourceUnit[] {
  const front = play.units.filter((u) => u.kind === 'frontMatter');
  const body = play.units.filter((u) => u.kind !== 'frontMatter');
  const remaining = new Array<number>(body.length + 1).fill(0);
  for (let i = body.length - 1; i >= 0; i--) remaining[i] = remaining[i + 1] + estLines(body[i]);
  let starts = body.flatMap((u, i) => (u.kind === 'heading' && remaining[i] >= EXCERPT_LINES ? [i] : []));
  if (!starts.length) starts = body.flatMap((u, i) => (u.kind === 'heading' ? [i] : [])).slice(0, 1);
  const start = starts.length ? starts[Math.floor(rng() * starts.length)] : 0;
  const out: SourceUnit[] = [];
  let used = 0;
  for (let i = start; i < body.length && used < EXCERPT_LINES; i++) {
    out.push(body[i]);
    used += estLines(body[i]);
  }
  return [...front, ...out];
}
