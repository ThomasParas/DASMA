export interface ModelSpec {
  id: string;
  kind: 'asr-streaming-transducer' | 'tts-vits';
  role: 'standard' | 'light' | 'candidate' | 'tts';
  url: string;
  dirName: string;
  license: string;
}

const ASR = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'zipformer-en-2023-06-21',
    kind: 'asr-streaming-transducer',
    role: 'standard',
    url: `${ASR}/sherpa-onnx-streaming-zipformer-en-2023-06-21.tar.bz2`,
    dirName: 'sherpa-onnx-streaming-zipformer-en-2023-06-21',
    license: 'Apache-2.0 (k2-fsa icefall recipe; LibriSpeech + GigaSpeech). Re-check the model card before shipping.',
  },
  {
    id: 'zipformer-en-20M-2023-02-17',
    kind: 'asr-streaming-transducer',
    role: 'light',
    url: `${ASR}/sherpa-onnx-streaming-zipformer-en-20M-2023-02-17.tar.bz2`,
    dirName: 'sherpa-onnx-streaming-zipformer-en-20M-2023-02-17',
    license: 'Apache-2.0 (k2-fsa icefall recipe; LibriSpeech). Re-check the model card before shipping.',
  },
  {
    id: 'zipformer-en-2023-06-26',
    kind: 'asr-streaming-transducer',
    role: 'candidate',
    url: `${ASR}/sherpa-onnx-streaming-zipformer-en-2023-06-26.tar.bz2`,
    dirName: 'sherpa-onnx-streaming-zipformer-en-2023-06-26',
    license: 'Apache-2.0 (k2-fsa icefall recipe; LibriSpeech). Re-check the model card before shipping.',
  },
];

export function findModel(id: string): ModelSpec {
  const m = MODEL_CATALOG.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model "${id}". Known: ${MODEL_CATALOG.map((x) => x.id).join(', ')}`);
  return m;
}
