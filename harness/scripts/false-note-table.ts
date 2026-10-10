/**
 * Count false notes (status `note` on a line with no planted error) per room and category, with up to three
 * examples each. This produces the "Where false notes come from" table in docs/m1-results.md.
 *
 *   npx tsx harness/scripts/false-note-table.ts harness/out/m1-default/runs.json
 */
import { errorLines, readRuns } from './lib';

const counts: Record<string, number> = {};
const examples: Record<string, string[]> = {};
for (const r of readRuns(process.argv[2])) {
  const errs = errorLines(r);
  for (const n of r.notes) {
    if (n.status !== 'note' || errs.has(n.lineId)) continue;
    const key = `${r.condition} / ${n.category}`;
    counts[key] = (counts[key] ?? 0) + 1;
    const list = (examples[key] ??= []);
    if (list.length < 3) list.push(`expected "${n.expected}" heard "${n.heard}"`);
  }
}
console.log(JSON.stringify({ counts, examples }, null, 2));
