import { DEFAULT_ALIGN_OPTIONS, buildExpected, type NoteDraft, type Strictness } from '@dasma/align';
import type { Recognizer } from '@dasma/asr';
import { aggregate, scoreRun, type Aggregate, type EvalReport, type ScoredRun } from './metrics';
import { perturbScene, type Label } from './perturb';
import { hashSeed, mulberry32 } from './rng';
import { ROOM_PRESETS, applyRoom, type RoomName } from './room';
import { runEngine } from './run-engine';
import { loadScenes, toScriptLines, type Scene } from './scenes';
import { assignVoices, renderPerformance, type RenderedPerformance, type TtsEngine } from './tts';

export interface EvalConfig {
  sceneIds: string[] | 'all';
  seeds: number;
  rooms: RoomName[];
  patience: number;
  strictness: Strictness;
  errorRate: number;
  benignRate: number;
  model: string;
}

export interface EvalDeps {
  tts: TtsEngine;
  makeRecognizer: (rendered: RenderedPerformance) => Recognizer;
  scenes?: Scene[];
  onRun?: (info: { room: RoomName; sceneId: string; seed: number; score: ScoredRun }) => void;
  saveAudio?: (name: string, samples: Float32Array, sampleRate: number) => void;
}

export interface RunRecord {
  room: RoomName;
  sceneId: string;
  seed: number;
  labels: Label[];
  notes: NoteDraft[];
  score: ScoredRun;
  durationSec: number;
  rtf: number;
}

export function evaluate(config: EvalConfig, deps: EvalDeps): { report: EvalReport; runs: RunRecord[] } {
  const scenes = deps.scenes ?? loadScenes(config.sceneIds);
  const options = { ...DEFAULT_ALIGN_OPTIONS, patience: config.patience, strictness: config.strictness };
  const scored = new Map<RoomName, Array<ScoredRun & { durationSec: number; rtf: number }>>(config.rooms.map((r) => [r, []]));
  const runs: RunRecord[] = [];
  for (const scene of scenes) {
    const expected = buildExpected(toScriptLines(scene), config.strictness);
    for (let seed = 1; seed <= config.seeds; seed++) {
      const rng = mulberry32(hashSeed(`${scene.id}:${seed}`));
      const perf = perturbScene(scene, rng, { errorRate: config.errorRate, benignRate: config.benignRate });
      const voices = assignVoices([...new Set(perf.segments.map((s) => s.speaker))], rng);
      const rendered = renderPerformance(perf, voices, deps.tts);
      for (const room of config.rooms) {
        const audio = applyRoom(rendered.samples, rendered.sampleRate, ROOM_PRESETS[room], mulberry32(hashSeed(`${room}:${scene.id}:${seed}`)));
        deps.saveAudio?.(`${room}-${scene.id}-${seed}`, audio, rendered.sampleRate);
        const run = runEngine(audio, rendered.sampleRate, deps.makeRecognizer(rendered), expected, options);
        const score = scoreRun(perf.labels, run.events, rendered.segments);
        scored.get(room)!.push({ ...score, durationSec: run.durationSec, rtf: run.rtf });
        // Same rule as scoreRun: a later lineDone for a line supersedes earlier ones.
        const finalByLine = new Map<string, NoteDraft[]>();
        for (const { event } of run.events) if (event.type === 'lineDone') finalByLine.set(event.lineId, event.notes);
        runs.push({
          room,
          sceneId: scene.id,
          seed,
          labels: perf.labels,
          notes: [...finalByLine.values()].flat(),
          score,
          durationSec: run.durationSec,
          rtf: run.rtf,
        });
        deps.onRun?.({ room, sceneId: scene.id, seed, score });
      }
    }
  }
  const conditions: Record<string, Aggregate> = {};
  for (const [room, list] of scored) conditions[room] = aggregate(list);
  return { report: { createdAt: new Date().toISOString(), config: { ...config }, conditions }, runs };
}
