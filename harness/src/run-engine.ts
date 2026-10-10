import { createAligner, type AlignEvent, type AlignOptions, type ExpectedWord } from '@dasma/align';
import type { Recognizer } from '@dasma/asr';

export interface TimedEvent {
  event: AlignEvent;
  audioTime: number;
}

export interface EngineRun {
  events: TimedEvent[];
  rtf: number;
  durationSec: number;
}

export function runEngine(
  samples: Float32Array,
  sampleRate: number,
  recognizer: Recognizer,
  expected: ExpectedWord[],
  options: AlignOptions,
  chunkSec = 0.1,
): EngineRun {
  const aligner = createAligner(expected, options);
  const durationSec = samples.length / sampleRate;
  let audioTime = 0;
  const events: TimedEvent[] = [];
  aligner.onEvent((event) => events.push({ event, audioTime }));
  const off = recognizer.onWords((words) => aligner.push(words));
  const chunk = Math.max(1, Math.round(chunkSec * sampleRate));
  for (let pos = 0; pos < samples.length; pos += chunk) {
    const end = Math.min(pos + chunk, samples.length);
    audioTime = end / sampleRate;
    recognizer.accept(samples.slice(pos, end), sampleRate);
    aligner.tick(audioTime);
  }
  audioTime = durationSec;
  recognizer.flush();
  aligner.finalize(durationSec + 5);
  off();
  return { events, rtf: recognizer.realtimeFactor(), durationSec };
}
