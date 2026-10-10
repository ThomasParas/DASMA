/**
 * What would loosening SIMILAR_SUB_SCORE cost? Takes the recognizer's own mishearings (single-word wrong-words
 * `check`s on lines with no planted error) and counts how many would become false notes if the 0.6 "similar"
 * factor were removed, or if the similarity cut were raised to 0.45.
 *
 *   npx tsx harness/scripts/similarity-whatif.ts harness/out/m1-default/runs.json
 */
import { errorLines, readRuns, score } from './lib';

const runs = readRuns(process.argv[2]);
const rooms = [...new Set(runs.map((r) => r.condition))];
for (const room of rooms) {
  const list = runs.filter((r) => r.condition === room);
  let n = 0;
  let similar = 0;
  let flip = 0;
  let flipBelow045 = 0;
  const hist: Record<string, number> = {};
  for (const r of list) {
    const errs = errorLines(r);
    for (const x of r.notes) {
      if (errs.has(x.lineId) || x.category !== 'wrong-words' || x.status !== 'check') continue;
      const e = x.expected.split(/\s+/);
      const h = x.heard.split(/\s+/);
      if (e.length !== 1 || h.length !== 1) continue;
      const s = score(h[0]!, e[0]!);
      n++;
      hist[s.toFixed(2)] = (hist[s.toFixed(2)] ?? 0) + 1;
      if (s < 0.3) continue;
      similar++;
      if (x.confidence / 0.6 >= 0.5) {
        flip++;
        if (s < 0.45) flipBelow045++;
      }
    }
  }
  console.log(
    `${room}: ASR single-word false-check subs ${n} | score>=0.3: ${similar} | become notes if the 0.6 factor is removed: ${flip} (${(flip / list.length).toFixed(2)}/run) | if the cut is raised to 0.45: ${flipBelow045}`,
  );
  console.log(`  score histogram ${JSON.stringify(Object.fromEntries(Object.entries(hist).sort()))}`);
}
