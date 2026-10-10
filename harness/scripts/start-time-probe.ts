/**
 * Check what sherpa-onnx-node's `start_time` means. Feeds a test wave, 3 s silence, the wave, 3 s silence and
 * the wave again (0.1 s chunks) straight into the binding and prints every endpoint result. If start_time is
 * stream-absolute and token timestamps are relative to it, start_time + first token time of the second copy
 * equals 6.63 + 3 + (first token time of the first copy).
 *
 *   npx tsx harness/scripts/start-time-probe.ts
 */
import { findModel } from '@dasma/asr';
import { loadSherpa, resolveAsrModel } from '@dasma/asr/node';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS_DIR } from '../src/paths';

const spec = findModel('zipformer-en-2023-06-21');
const model = resolveAsrModel(MODELS_DIR, spec);
const sherpa = loadSherpa();
const rec = new sherpa.OnlineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: { encoder: model.encoder, decoder: model.decoder, joiner: model.joiner },
    tokens: model.tokens,
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
  },
  decodingMethod: 'greedy_search',
  enableEndpoint: true,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 0.8,
  rule3MinUtteranceLength: 20,
});
const wavDir = join(MODELS_DIR, spec.dirName, 'test_wavs');
const wave = sherpa.readWave(
  join(
    wavDir,
    readdirSync(wavDir)
      .filter((f) => f.endsWith('.wav'))
      .sort()[0]!,
  ),
);
const dur = wave.samples.length / wave.sampleRate;
const silence = new Float32Array(wave.sampleRate * 3);
console.log(
  `wave ${dur.toFixed(2)} s; copies start at 0, ${(dur + 3).toFixed(2)}, ${(2 * dur + 6).toFixed(2)} s`,
);
const stream = rec.createStream();
const step = Math.round(wave.sampleRate * 0.1);
let fed = 0;
const show = (label: string) => {
  const r = rec.getResult(stream);
  const ts = typeof r.timestamps === 'string' ? (JSON.parse(r.timestamps) as number[]) : (r.timestamps ?? []);
  const abs = ts.length && typeof r.start_time === 'number' ? (r.start_time + ts[0]!).toFixed(2) : '-';
  console.log(
    `${label} fed=${fed.toFixed(2)} start_time=${r.start_time} firstTs=${ts[0] ?? '-'} start_time+firstTs=${abs} text="${r.text ?? ''}"`,
  );
};
for (const chunk of [wave.samples, silence, wave.samples, silence, wave.samples]) {
  for (let i = 0; i < chunk.length; i += step) {
    const part = chunk.slice(i, i + step);
    stream.acceptWaveform({ samples: part, sampleRate: wave.sampleRate });
    fed += part.length / wave.sampleRate;
    while (rec.isReady(stream)) rec.decode(stream);
    if (rec.isEndpoint(stream)) {
      show('ENDPOINT');
      rec.reset(stream);
    }
  }
}
stream.acceptWaveform({
  samples: new Float32Array(Math.round(wave.sampleRate * 0.8)),
  sampleRate: wave.sampleRate,
});
while (rec.isReady(stream)) rec.decode(stream);
show('FINAL');
