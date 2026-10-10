/**
 * Is the Piper TTS deterministic? Renders the same sentence with the same voice twice and compares.
 *
 *   npx tsx harness/scripts/tts-determinism.ts
 */
import { createSherpaTts } from '../src/tts';

const tts = createSherpaTts();
const text = 'It is nor hand, nor foot, nor arm.';
const a = tts.synth(text, 14, 1).samples;
const b = tts.synth(text, 14, 1).samples;
let maxDiff = 0;
for (let i = 0; i < Math.min(a.length, b.length); i++) maxDiff = Math.max(maxDiff, Math.abs(a[i]! - b[i]!));
console.log(
  `render 1: ${a.length} samples, render 2: ${b.length} samples, max sample difference ${maxDiff.toFixed(3)}`,
);
console.log(a.length === b.length && maxDiff === 0 ? 'deterministic' : 'NOT deterministic');
