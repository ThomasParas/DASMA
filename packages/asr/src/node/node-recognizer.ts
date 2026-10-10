import type { HeardWord } from '@dasma/align';
import { Stabilizer } from '../stabilizer';
import type { Recognizer } from '../types';
import { tokensToWords } from '../words';
import type { ResolvedAsrModel } from './resolve';
import { loadSherpa, type SherpaOnlineRecognizer, type SherpaOnlineStream } from './sherpa';

const SAMPLE_RATE = 16000;
const FLUSH_PAD_SEC = 0.8;

export class NodeSherpaRecognizer implements Recognizer<ResolvedAsrModel> {
  readonly supportsHotwords = false;
  private rec: SherpaOnlineRecognizer | undefined;
  private stream: SherpaOnlineStream | undefined;
  private readonly listeners = new Set<(words: HeardWord[]) => void>();
  private stabilizer = new Stabilizer(2);
  private fedSec = 0;
  private segmentStart = 0;
  private procMs = 0;

  async load(model: ResolvedAsrModel): Promise<void> {
    this.rec = new (loadSherpa().OnlineRecognizer)({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
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
    this.reset();
  }

  reset(): void {
    if (!this.rec) throw new Error('NodeSherpaRecognizer: call load() first');
    this.stream = this.rec.createStream();
    this.stabilizer = new Stabilizer(2);
    this.fedSec = 0;
    this.segmentStart = 0;
    this.procMs = 0;
  }

  accept(samples: Float32Array, sampleRate: number): void {
    const { rec, stream } = this.ready();
    const t0 = performance.now();
    stream.acceptWaveform({ samples, sampleRate });
    this.fedSec += samples.length / sampleRate;
    while (rec.isReady(stream)) rec.decode(stream);
    this.procMs += performance.now() - t0;
    this.collect(rec.isEndpoint(stream));
  }

  flush(): void {
    const { rec, stream } = this.ready();
    stream.acceptWaveform({ samples: new Float32Array(Math.round(SAMPLE_RATE * FLUSH_PAD_SEC)), sampleRate: SAMPLE_RATE });
    this.fedSec += FLUSH_PAD_SEC;
    while (rec.isReady(stream)) rec.decode(stream);
    this.collect(true);
  }

  onWords(cb: (words: HeardWord[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setHotwords(): void {
    // The Node binding cannot change hotwords per stream (supportsHotwords = false).
  }

  realtimeFactor(): number {
    return this.fedSec > 0 ? this.procMs / 1000 / this.fedSec : 0;
  }

  dispose(): void {
    this.listeners.clear();
    this.stream = undefined;
    this.rec = undefined;
  }

  private collect(endpoint: boolean): void {
    const { rec, stream } = this.ready();
    const r = rec.getResult(stream);
    const timestamps = typeof r.timestamps === 'string' ? (JSON.parse(r.timestamps) as number[]) : (r.timestamps ?? []);
    const words = tokensToWords(r.tokens ?? [], timestamps, this.segmentStart, Array.isArray(r.ys_probs) ? r.ys_probs : undefined);
    const fresh = this.stabilizer.update(words, endpoint);
    if (endpoint) {
      rec.reset(stream);
      this.segmentStart = this.fedSec;
    }
    if (fresh.length) for (const l of this.listeners) l(fresh);
  }

  private ready(): { rec: SherpaOnlineRecognizer; stream: SherpaOnlineStream } {
    if (!this.rec || !this.stream) throw new Error('NodeSherpaRecognizer: call load() first');
    return { rec: this.rec, stream: this.stream };
  }
}
