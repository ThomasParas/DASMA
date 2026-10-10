/**
 * Phonetic-score evidence for the engine calibration findings:
 *  1. sound-alike pairs (sir/sorry, line/lion) and recognizer mishearings seen in the runs;
 *  2. how close the harness's planted SUBSTITUTES come to the words they replace;
 *  3. the align property test "still detects planted wrong words through 10% noise", re-run with every miss explained.
 *
 *   npx tsx harness/scripts/word-scores.ts
 */
import { FUNCTION_WORDS, tokenize } from '@dasma/align';
import { runScenario } from '../../packages/align/test/helpers/dsl';
import { LONG_SCENE } from '../../packages/align/test/helpers/fixtures';
import { VOCAB, simulateRecognizer } from '../../packages/align/test/helpers/noise';
import { mulberry32 } from '../../packages/align/test/helpers/rng';
import { describeNote, score } from './lib';

console.log('# 1. Pairs (heard -> expected)');
const PAIRS: Array<[string, string]> = [
  ['sorry', 'sir'],
  ['lion', 'line'],
  ['nine', 'banana'],
  ['are', 'sir'],
  ['mister', 'mr'],
  ['piao', 'piano'],
  ['vowed', 'got'],
  ['cuff', 'cut'],
  ['hath', 'have'],
  ['german', 'shoreman'],
  ['ought', 'up'],
];
for (const [h, e] of PAIRS) console.log(`  ${h} -> ${e}: ${score(h, e).toFixed(2)}`);

console.log('\n# 2. Best-scoring harness SUBSTITUTES per scene word (>= 0.3 is "similar", downgraded x0.6)');
const SUBSTITUTES = [
  'marvellous',
  'splendid',
  'dreadful',
  'curious',
  'perfectly',
  'certainly',
  'evening',
  'garden',
  'letter',
  'window',
  'country',
  'money',
  'dinner',
  'sister',
  'journey',
  'question',
  'carriage',
  'umbrella',
]; // mirrors harness/src/perturb.ts
for (const w of [
  'invariably',
  'observed',
  'accurately',
  'consumed',
  'wonderful',
  'expression',
  'superior',
  'pleasant',
  'champagne',
]) {
  const ranked = SUBSTITUTES.map((s) => [s, score(s, w)] as const).sort((a, b) => b[1] - a[1]);
  console.log(
    `  ${w.padEnd(12)} ${ranked
      .slice(0, 3)
      .map(([s, v]) => `${s}:${v.toFixed(2)}`)
      .join(' ')}  (>=0.3: ${ranked.filter(([, v]) => v >= 0.3).length}/${SUBSTITUTES.length})`,
  );
}

console.log('\n# 3. Property test misses (same seeds as packages/align/test/noise.property.test.ts)');
const candidates = LONG_SCENE.flatMap((line) =>
  tokenize(line.text)
    .map((raw, rawIndex) => ({ line, rawIndex, core: raw.replace(/[^A-Za-z]/g, '').toLowerCase() }))
    .filter(({ core }) => core.length >= 4 && !FUNCTION_WORDS.has(core)),
);
let detected = 0;
for (let trial = 0; trial < 100; trial++) {
  const rng = mulberry32(1000 + trial);
  const target = candidates[Math.floor(rng() * candidates.length)]!;
  const replacement = VOCAB[Math.floor(rng() * VOCAB.length)]!;
  const words = simulateRecognizer(LONG_SCENE, rng, 0.1, {
    lineId: target.line.id,
    rawIndex: target.rawIndex,
    replacement,
  });
  const on = runScenario(LONG_SCENE, words).lineNotes.filter((n) => n.lineId === target.line.id);
  if (on.some((n) => n.status === 'note' && (n.category === 'wrong-words' || n.category === 'paraphrase')))
    detected++;
  else
    console.log(
      `  MISS ${target.core} -> ${replacement} score ${score(replacement, target.core).toFixed(2)}: ${on.map(describeNote).join(' | ') || '(no notes)'}`,
    );
}
console.log(`  detected ${detected}/100`);
