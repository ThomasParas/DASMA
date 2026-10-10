import type { TtsEngine } from '../../src/tts';

/** 0.32 s of constant signal per word at 16 kHz. */
export const fakeTts: TtsEngine = {
  synth: (text) => ({
    samples: new Float32Array(Math.round(16000 * 0.32 * text.split(/\s+/).filter(Boolean).length)).fill(0.1),
    sampleRate: 16000,
  }),
};
