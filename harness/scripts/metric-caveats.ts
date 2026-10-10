/**
 * Numbers behind the "Metric caveats" section of docs/m1-results.md, per room: how much of the script is excluded
 * from false-alarm counting, how many notes beyond the first sit on planted-error lines (counted nowhere), and core
 * recall with and without the dropped-line category.
 *
 *   npx tsx harness/scripts/metric-caveats.ts harness/out/m1-default/runs.json
 */
import { errorLines, readRuns, scenesById } from './lib';

const scenes = scenesById();
const rows = new Map<
  string,
  {
    lines: number;
    errorLines: number;
    notesOnErrorLines: number;
    extraNotes: number;
    cat: Record<string, { labels: number; detected: number }>;
  }
>();
for (const r of readRuns(process.argv[2])) {
  const row = rows.get(r.room) ?? { lines: 0, errorLines: 0, notesOnErrorLines: 0, extraNotes: 0, cat: {} };
  rows.set(r.room, row);
  const errs = errorLines(r);
  row.lines += scenes.get(r.sceneId)!.lines.length;
  row.errorLines += errs.size;
  for (const id of errs) {
    const n = r.notes.filter((x) => x.lineId === id && x.status === 'note').length;
    row.notesOnErrorLines += n;
    row.extraNotes += Math.max(0, n - 1);
  }
  for (const [k, v] of Object.entries(r.score.perCategory)) {
    const c = (row.cat[k] ??= { labels: 0, detected: 0 });
    c.labels += v.labels;
    c.detected += v.detected;
  }
}
const frac = (a: number, b: number) => `${a}/${b} = ${(a / b).toFixed(3)}`;
for (const [room, row] of rows) {
  const core = ['dropped-words', 'wrong-words', 'dropped-line'].map(
    (k) => row.cat[k] ?? { labels: 0, detected: 0 },
  );
  const noDl = core.slice(0, 2);
  const sum = (cs: typeof core, f: 'labels' | 'detected') => cs.reduce((s, c) => s + c[f], 0);
  console.log(`${room}`);
  console.log(`  lines excluded from false-alarm counting: ${frac(row.errorLines, row.lines)}`);
  console.log(
    `  notes on planted-error lines: ${row.notesOnErrorLines}, of which beyond the first on a line: ${row.extraNotes}`,
  );
  console.log(
    `  core recall: ${frac(sum(core, 'detected'), sum(core, 'labels'))}; without dropped-line: ${frac(sum(noDl, 'detected'), sum(noDl, 'labels'))}`,
  );
}
