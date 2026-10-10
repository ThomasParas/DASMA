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
  private readonly stableSec: number | undefined;
  private rec: SherpaOnlineRecognizer | undefined;
  private stream: SherpaOnlineStream | undefined;
  private readonly listeners = new Set<(words: HeardWord[]) => void>();
  private stabilizer: Stabilizer;
  private fedSec = 0;
  /** Rate of the last accepted chunk: sherpa aborts the process if one stream is fed two different rates. */
  private feedRate = SAMPLE_RATE;
  private segmentStart = 0;
  private procMs = 0;

  constructor(opts: { stableSec?: number } = {}) {
    this.stableSec = opts.stableSec;
    this.stabilizer = new Stabilizer({ stableSec: this.stableSec });
  }

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
    this.stabilizer = new Stabilizer({ stableSec: this.stableSec });
    this.fedSec = 0;
    this.feedRate = SAMPLE_RATE;
    this.segmentStart = 0;
    this.procMs = 0;
  }

  accept(samples: Float32Array, sampleRate: number): void {
    const { rec, stream } = this.ready();
    const t0 = performance.now();
    stream.acceptWaveform({ samples, sampleRate });
    this.feedRate = sampleRate;
    this.fedSec += samples.length / sampleRate;
    while (rec.isReady(stream)) rec.decode(stream);
    this.procMs += performance.now() - t0;
    this.collect(rec.isEndpoint(stream));
  }

  flush(): void {
    const { rec, stream } = this.ready();
    stream.acceptWaveform({ samples: new Float32Array(Math.round(this.feedRate * FLUSH_PAD_SEC)), sampleRate: this.feedRate });
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

  /**
   * sherpa-onnx-node (1.13.x) exposes no explicit free: each recognizer/stream handle is an N-API
   * external whose finalizer calls SherpaOnnxDestroyOnlineRecognizer / SherpaOnnxDestroyOnlineStream.
   * Dropping our references is therefore what releases native memory (on the next GC). The same
   * applies to the stream replaced by reset() and the recognizer replaced by a second load().
   */
  dispose(): void {
    this.listeners.clear();
    this.stream = undefined;
    this.rec = undefined;
  }

  private collect(endpoint: boolean): void {
    const { rec, stream } = this.ready();
    const r = rec.getResult(stream);
    const timestamps = typeof r.timestamps === 'string' ? (JSON.parse(r.timestamps) as number[]) : (r.timestamps ?? []);
    // Verified with sherpa-onnx-node 1.13.8: start_time is stream-absolute (seconds since the stream began) and
    // token timestamps are relative to it. It lags the fed-sample clock slightly (chunk + right context).
    const offset = typeof r.start_time === 'number' ? r.start_time : this.segmentStart;
    const words = tokensToWords(r.tokens ?? [], timestamps, offset, Array.isArray(r.ys_probs) ? r.ys_probs : undefined);
    const fresh = this.stabilizer.update(words, endpoint, this.fedSec);
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
