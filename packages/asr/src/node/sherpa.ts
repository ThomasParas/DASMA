import { createRequire } from 'node:module';

export interface SherpaWave {
  samples: Float32Array;
  sampleRate: number;
}
export interface SherpaOnlineStream {
  acceptWaveform(wave: SherpaWave): void;
}
export interface SherpaOnlineResult {
  text?: string;
  tokens?: string[];
  timestamps?: number[] | string;
  ys_probs?: number[];
}
export interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream;
  isReady(stream: SherpaOnlineStream): boolean;
  decode(stream: SherpaOnlineStream): void;
  isEndpoint(stream: SherpaOnlineStream): boolean;
  reset(stream: SherpaOnlineStream): void;
  getResult(stream: SherpaOnlineStream): SherpaOnlineResult;
}
export interface SherpaOfflineTts {
  generate(request: { text: string; sid: number; speed: number }): SherpaWave;
}
export interface SherpaModule {
  OnlineRecognizer: new (config: unknown) => SherpaOnlineRecognizer;
  OfflineTts: new (config: unknown) => SherpaOfflineTts;
  readWave(path: string): SherpaWave;
  writeWave(path: string, wave: SherpaWave): void;
}

let cached: SherpaModule | undefined;

export function loadSherpa(): SherpaModule {
  cached ??= createRequire(import.meta.url)('sherpa-onnx-node') as SherpaModule;
  return cached;
}
