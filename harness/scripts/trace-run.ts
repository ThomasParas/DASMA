/**
 * Re-run one (scene, seed, condition) and print the performance, what the recognizer heard, and every aligner event.
 * The condition is `<mode>-<room>`, e.g. `solo-close-mic` or `director-far-field`; solo also needs the character.
 * `oracle` uses a perfect recognizer; `asr` uses the real model. Note that TTS audio is not reproducible run to run.
 *
 *   npx tsx harness/scripts/trace-run.ts <scene-id> <seed> <condition> <oracle|asr> [character] [--patience 0.5] [--model id]
 */
import { DEFAULT_ALIGN_OPTIONS, buildExpected } from '@dasma/align';
import { findModel, type Recognizer } from '@dasma/asr';
import { NodeSherpaRecognizer, resolveAsrModel } from '@dasma/asr/node';
import { parseArgs } from 'node:util';
import { MODELS_DIR } from '../src/paths';
import type { Mode } from '../src/evaluate';
import { SOLO_BENIGN_KINDS, SOLO_ERROR_KINDS, perturbScene } from '../src/perturb';
import { hashSeed, mulberry32 } from '../src/rng';
import { ROOM_PRESETS, applyRoom, type RoomName } from '../src/room';
import { runEngine } from '../src/run-engine';
import { loadScenes, toScriptLines } from '../src/scenes';
import { assignVoices, createSherpaTts, renderPerformance } from '../src/tts';
import { ScriptedRecognizer, oracleWords } from '../test/helpers/scripted-recognizer';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    patience: { type: 'string', default: '0.5' },
    model: { type: 'string', default: 'zipformer-en-2023-06-21' },
  },
});
const [sceneId, seedArg, conditionArg, mode, characterArg] = positionals;
if (!sceneId || !seedArg || !conditionArg || (mode !== 'oracle' && mode !== 'asr')) {
  throw new Error('Usage: trace-run.ts <scene-id> <seed> <condition> <oracle|asr> [character] [--patience p] [--model id]');
}
const parts = /^(solo|director)-(.+)$/.exec(conditionArg);
if (!parts) throw new Error(`Condition must be <solo|director>-<room>, got "${conditionArg}"`);
const runMode = parts[1] as Mode;
const room = parts[2] as RoomName;
if (!(room in ROOM_PRESETS)) throw new Error(`Unknown room ${room}`);
const character = runMode === 'solo' ? characterArg : null;
if (runMode === 'solo' && !character) throw new Error('A solo condition needs the character as a fourth argument');
const seed = Number(seedArg);
const scene = loadScenes([sceneId])[0]!;
const strictness = { mode: 'word-perfect' } as const;
const expected = buildExpected(toScriptLines(scene).filter((l) => !character || l.characterId === character), strictness);
// Same rng sequence as harness/src/evaluate.ts.
const who = character ? `${scene.id}:${character}` : scene.id;
const rng = mulberry32(hashSeed(`${who}:${seed}`));
const perf = perturbScene(scene, rng, {
  errorRate: 0.35,
  benignRate: 0.2,
  ...(character ? { solo: character, errorKinds: SOLO_ERROR_KINDS, benignKinds: SOLO_BENIGN_KINDS } : {}),
});
const voices = assignVoices([...new Set(perf.segments.map((s) => s.speaker))], rng);
const rendered = renderPerformance(perf, voices, createSherpaTts());
const audio = applyRoom(
  rendered.samples,
  rendered.sampleRate,
  ROOM_PRESETS[room],
  mulberry32(hashSeed(`${room}:${who}:${seed}`)),
);

console.log('LABELS', perf.labels.map((l) => `${l.kind}:${l.lineId}`).join(' '));
for (const s of rendered.segments)
  console.log(`SEG ${s.start.toFixed(1)}-${s.end.toFixed(1)} ${s.seg.speaker}: ${s.seg.text}`);

let recognizer: Recognizer;
if (mode === 'oracle') recognizer = new ScriptedRecognizer(oracleWords(rendered));
else {
  const asr = new NodeSherpaRecognizer();
  await asr.load(resolveAsrModel(MODELS_DIR, findModel(values.model)));
  recognizer = asr;
}
const heard: string[] = [];
recognizer.onWords((ws) =>
  heard.push(...ws.map((w) => `${w.text.toLowerCase()}@${w.start.toFixed(1)}(${w.confidence.toFixed(2)})`)),
);
const run = runEngine(audio, rendered.sampleRate, recognizer, expected, {
  ...DEFAULT_ALIGN_OPTIONS,
  patience: Number(values.patience),
});
console.log('HEARD', heard.join(' '));
for (const { event, audioTime } of run.events) {
  const t = `t=${audioTime.toFixed(1)}`;
  if (event.type === 'flag') {
    const n = event.note;
    console.log(
      `FLAG ${t} alert=${event.alert} ${n.lineId} ${n.category} ${n.status} "${n.expected}"->"${n.heard}" ${n.confidence}`,
    );
  } else if (event.type === 'lineDone') {
    console.log(
      `DONE ${t} ${event.lineId} ${event.notes.map((n) => `${n.status}:${n.category} "${n.expected}"->"${n.heard}" ${n.confidence}`).join(' | ')}`,
    );
  } else console.log(`EV ${t} ${JSON.stringify(event)}`);
}
recognizer.dispose();
