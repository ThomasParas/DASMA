# DASMA M0 + M1 — Scaffold, Matching Engine & Test Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the DASMA monorepo (M0), then build and measure the matching engine — the pure-TypeScript aligner, the streaming speech recognizer wrapper, and a synthetic-audio test harness — ending in a go/no-go report on whether one laptop mic can produce trustworthy line notes (M1).

**Architecture:** npm-workspaces monorepo. `packages/align` is the engine: plain TypeScript with no browser/Node imports, deterministic, built test-first. `packages/asr` wraps sherpa-onnx streaming Zipformer models behind a `Recognizer` interface (Node binding now; browser WASM in M3). `harness/` is a Node CLI that generates labelled synthetic rehearsals (public-domain scenes + planted errors → local TTS → room simulation), runs them through recognizer + aligner, and scores the line notes against the labels. `apps/web` is a placeholder Vite/React app so CI covers the build from day one.

**Tech Stack:** TypeScript (strict), Node ≥ 24, npm workspaces, Vitest, fast-check, ESLint (typescript-eslint), Prettier, tsx, Vite + React (placeholder), sherpa-onnx-node (ASR + TTS), double-metaphone.

**Spec:** [`docs/superpowers/specs/2026-10-10-dasma-design.md`](../specs/2026-10-10-dasma-design.md) (decisions background: [`docs/preflight-decisions.md`](../../preflight-decisions.md)). This plan implements spec §11 milestones M0 and M1.

**Interface refinements vs. spec §4.2** (made while designing the code; Task 9's last step updates the spec to match):
- `AlignEvent` `flag` carries `alert: boolean`; `lineDone` carries the line's final `notes`; `notRun` carries `at`.
- `Aligner` gains `finalize(now)`, `setAudioQuality(q)`, and a read-only `cursor`.
- `Recognizer.accept(samples, sampleRate)` (recognizer tracks its own clock) plus `flush()`, `reset()`, `dispose()`; `onWords` returns an unsubscribe function; `supportsHotwords` is a flag. The Node binding cannot change hotwords per stream (verified 2026-10-10), so `NodeSherpaRecognizer.supportsHotwords = false` — risk R2 is confirmed for Node; browser WASM is checked in M3.

**Deferred from spec §10 to M3** (needs the browser pipeline): comparing browser audio-processing settings (echo cancellation, noise suppression, auto-gain; risk R7), and live audio-quality estimation feeding `setAudioQuality`. The M1 harness runs the recognizer in Node, where neither exists.

## Global Constraints

- **Offline at runtime.** The only network access anywhere is the explicit `npm run harness -- fetch-models` command.
- **`packages/align` imports nothing** from the browser, Node (`node:*`), or other `@dasma/*` packages. Enforced by its `tsconfig.json` (`lib: ["ES2022"]`, `types: []`) and an ESLint rule.
- **English only** (spec D8). **Word-perfect is the default strictness** (D9).
- **Patience slider** `p ∈ [0,1]` maps to confirmation words `C = 1 + round(3p)` and timeout `T = 0.4 + 2.6p` seconds (spec §7.2 step 5).
- **Default aligner options:** `patience 0.5`, `windowSize 30`, `lostAfter 6`, `longLossSec 10`, `alertMinConfidence 0.75`, `noteMinConfidence 0.5`.
- **Degrade toward silence:** low-confidence differences become `status: 'check'` and never alert (spec §7.4, §9).
- **Dependencies must be permissively licensed** (MIT / BSD / Apache-2.0). Model licences are recorded in the catalog and re-checked before any release.
- **Acceptance targets (spec §10), provisional:** close mic — false alerts ≤ 1 per 10 min, false notes ≤ 1 per 10 min, recall (dropped/wrong word, dropped line) ≥ 90%, alert latency p50 < 500 ms at fastest Patience; far field — false alerts ≤ 1 per scene, false notes ≤ 2 per scene, recall ≥ 75%. If far-field numbers fall well short, the response is per-actor audio, **not** loosening the false-alarm budget.
- TypeScript `strict: true`. Every package exposes TypeScript source directly (`"exports": { ".": "./src/index.ts" }`); there is no build step for packages.

## Review Focus

The five inputs most likely to bite a real user that the main scenario tests would otherwise miss — each is pinned by a test in the owning task:

1. **Recognizer text is UPPERCASE with straight apostrophes; PDF scripts use curly quotes and em dashes** (`DIDN'T` vs `didn’t`, `Wait—what?`). They must normalize identically. → Task 2 (`normalize.test.ts`, "recognizer/PDF parity").
2. **Lines that normalize to zero words** (`"—"`, `"…"`, an empty line). They must not break indexing or line completion. → Task 4 (`expected.test.ts`, "zero-word lines").
3. **Repeated words/phrases in the script** (`"well, well, well"`). One dropped repetition gives exactly one dropped-words note, and re-anchoring prefers the nearest occurrence. → Task 8 (trigram nearest) and Task 9 (`aligner.test.ts`, "repeated words").
4. **Talk before the scene starts** ("okay, are we starting?"). This must produce no notes. → Task 9 (`aligner.test.ts`, "pre-roll chatter").
5. **An expected stream with no words** (every line cut). `push`/`tick`/`finalize` must not throw and must emit no notes. → Task 9 (`aligner.test.ts`, "empty script").

---

## File Structure

```
package.json                     root workspaces + scripts
tsconfig.base.json               shared strict compiler options
vitest.config.ts                 one test runner for all packages
eslint.config.js                 lint rules incl. align boundary rule
.prettierrc.json / .prettierignore
.github/workflows/ci.yml         lint, typecheck, test, build
apps/web/                        placeholder Vite + React app (M0)
packages/align/
  src/types.ts                   all engine data types + default options
  src/numbers.ts                 numberToWords (cardinal / year / ordinal)
  src/normalize.ts               tokenize, normalizeToken, contractions, fillers, function words
  src/phonetic.ts                phoneticKey, wordScore, MATCH_THRESHOLD
  src/expected.ts                buildExpected, toHeardTokens, display helpers, countCheckedWords
  src/window-align.ts            alignWindow (banded DP), Op type + guards
  src/commit.ts                  commitPoint, commitPointOnTimeout (grace window rules)
  src/classify.ts                ops → SM-category notes, stumbles, confidence
  src/finalize-line.ts           line-level paraphrase / transposition merge / lenient filter
  src/trigram-index.ts           re-anchoring index
  src/aligner.ts                 createAligner state machine, patienceToGrace
  src/index.ts                   public exports
  test/helpers/{fixtures,dsl,rng,noise}.ts
  test/*.test.ts
packages/asr/
  src/types.ts                   Recognizer interface, RawWord
  src/words.ts                   tokensToWords (BPE tokens + timestamps → words)
  src/stabilizer.ts              partial results → settled words
  src/catalog.ts                 ASR model catalog (standard / light / candidate)
  src/index.ts
  src/node/sherpa.ts             typed loader for sherpa-onnx-node
  src/node/resolve.ts            resolveAsrModel (find files in a model dir)
  src/node/node-recognizer.ts    NodeSherpaRecognizer
  src/node/index.ts
  test/*.test.ts
harness/
  scenes/earnest-act1.json, scenes/romeo-balcony.json
  src/paths.ts, src/rng.ts
  src/scenes.ts                  Scene types + loader + toScriptLines
  src/perturb.ts                 planted errors → Performance + Labels
  src/room.ts                    fft, convolve, impulse response, noise, EQ, presets
  src/tts.ts                     TtsEngine, renderPerformance, assignVoices, createSherpaTts
  src/run-engine.ts              stream audio through recognizer + aligner
  src/metrics.ts                 scoreRun, aggregate, targets, markdown report
  src/models.ts                  fetch + verify + extract models
  src/cli.ts                     fetch-models | evaluate | gate | baseline
  baselines/baseline.json        committed reference results
  test/*.test.ts
docs/m1-results.md               go/no-go report (Task 19)
```

---

## Task 1: Monorepo scaffold (M0)

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Create: `packages/align/package.json`, `packages/align/tsconfig.json`, `packages/align/src/index.ts`, `packages/align/test/smoke.test.ts`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`

**Interfaces:**
- Produces: workspace package `@dasma/align` exporting `VERSION: string`; root scripts `lint`, `typecheck`, `test`, `build`, `harness` (the `harness` script resolves once Task 13 exists).

- [ ] **Step 1: Write root config files**

`package.json`:
```json
{
  "name": "dasma",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*", "harness"],
  "engines": { "node": ">=24" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "npm run build -w apps/web",
    "format": "prettier --write .",
    "harness": "npm run cli -w harness --"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'harness/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'harness/models/**', 'harness/out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/align/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@dasma/*', 'node:*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'process'],
    },
  },
);
```

`.prettierrc.json`:
```json
{ "singleQuote": true, "printWidth": 110, "trailingComma": "all" }
```

`.prettierignore`:
```
node_modules
dist
harness/models
harness/out
package-lock.json
```

Replace `.gitignore` with:
```
.DS_Store
node_modules/
dist/
coverage/
harness/models/
harness/out/
```

- [ ] **Step 2: Install root dev dependencies**

Run:
```bash
npm install -D typescript vitest fast-check eslint @eslint/js typescript-eslint prettier tsx @types/node
```
Expected: `package-lock.json` created, no errors.

- [ ] **Step 3: Create the `@dasma/align` package with a failing smoke test**

`packages/align/package.json`:
```json
{
  "name": "@dasma/align",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p ." }
}
```

`packages/align/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": [] },
  "include": ["src", "test"]
}
```

`packages/align/test/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index';

describe('align package', () => {
  it('exposes a version', () => {
    expect(VERSION).toBe('0.0.0');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/align/test/smoke.test.ts`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 5: Implement**

`packages/align/src/index.ts`:
```ts
export const VERSION = '0.0.0';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/align/test/smoke.test.ts`
Expected: PASS.

- [ ] **Step 7: Create the placeholder web app**

`apps/web/package.json`:
```json
{
  "name": "@dasma/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -p ."
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DASMA</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/web/src/App.tsx`:
```tsx
export function App() {
  return (
    <main>
      <h1>DASMA</h1>
      <p>Director&apos;s Assistant – Stage Manager App. The engine milestone is in progress.</p>
    </main>
  );
}
```

Install its dependencies:
```bash
npm install react react-dom -w apps/web
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom -w apps/web
```

- [ ] **Step 8: Verify lint, typecheck, test, and build all pass**

Run each:
```bash
npm run lint
npm run typecheck
npm test
npm run build
```
Expected: all exit 0; `apps/web/dist/index.html` exists.

- [ ] **Step 9: Add CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```
(Integration tests that need downloaded models skip themselves when the models are absent, so CI stays offline-safe.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo (align package, placeholder web app, CI)"
```

---

## Task 2: Engine types and text normalization

**Files:**
- Create: `packages/align/src/types.ts`, `packages/align/src/numbers.ts`, `packages/align/src/normalize.ts`
- Test: `packages/align/test/normalize.test.ts`

**Interfaces:**
- Produces (types, used by every later align task):
  - `Category`, `HeardWord`, `HeardToken`, `ScriptLineInput`, `ExpectedWord`, `Strictness`, `NoteDraft`, `AlignEvent`, `AlignOptions`, `DEFAULT_ALIGN_OPTIONS`
- Produces (functions):
  - `numberToWords(n: number, mode?: 'cardinal' | 'ordinal'): string[]`
  - `tokenize(text: string): string[]`
  - `normalizeToken(raw: string): string[]`
  - `expandContraction(norm: string): string[]`
  - `isContraction(norm: string): boolean`
  - `FILLERS: ReadonlySet<string>`, `FUNCTION_WORDS: ReadonlySet<string>`

- [ ] **Step 1: Write the types (no test of their own; they are exercised by everything after)**

`packages/align/src/types.ts`:
```ts
export type Category =
  | 'dropped-line'
  | 'dropped-words'
  | 'added-words'
  | 'wrong-words'
  | 'transposed'
  | 'paraphrase'
  | 'jumped-cue'
  | 'called-for-line';

/** A word as emitted by a recognizer. Times are seconds on the run clock. */
export interface HeardWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  final: boolean;
}

/** A heard word after normalization (one HeardWord may become several tokens, e.g. numbers). */
export interface HeardToken {
  text: string;
  norm: string;
  phon: [string, string];
  start: number;
  end: number;
  confidence: number;
}

export interface ScriptLineInput {
  id: string;
  characterId: string;
  text: string;
  cut?: boolean;
  /** Half-open ranges of raw word indices (from tokenize) that are spoken in overlap. */
  overlapRanges?: Array<[number, number]>;
}

export interface ExpectedWord {
  idx: number;
  lineId: string;
  characterId: string;
  /** Index of the raw token within its line (several ExpectedWords can share one raw token). */
  wordInLine: number;
  raw: string;
  norm: string;
  phon: [string, string];
  zone: 'checked' | 'overlap';
}

export type Strictness = { mode: 'word-perfect' } | { mode: 'lenient'; lineMatchThreshold: number };

export interface NoteDraft {
  lineId: string;
  characterId: string;
  category: Category;
  expected: string;
  heard: string;
  confidence: number;
  status: 'note' | 'check';
  at: number;
}

export type AlignEvent =
  | { type: 'matched'; idx: number; at: number }
  | { type: 'suspect'; idxs: number[]; at: number }
  | { type: 'flag'; note: NoteDraft; alert: boolean; at: number }
  | { type: 'stumble'; idx: number; heard: string; at: number }
  | { type: 'lost'; guesses: number[]; at: number }
  | { type: 'reanchored'; fromIdx: number; toIdx: number; lostFor: number; at: number }
  | { type: 'notRun'; fromIdx: number; toIdx: number; at: number }
  | { type: 'calledForLine'; idx: number; at: number }
  | { type: 'lineDone'; lineId: string; notes: NoteDraft[]; at: number };

export interface AlignOptions {
  /** 0 = instant, 1 = relaxed. */
  patience: number;
  strictness: Strictness;
  windowSize: number;
  lostAfter: number;
  longLossSec: number;
  alertMinConfidence: number;
  noteMinConfidence: number;
}

export const DEFAULT_ALIGN_OPTIONS: AlignOptions = {
  patience: 0.5,
  strictness: { mode: 'word-perfect' },
  windowSize: 30,
  lostAfter: 6,
  longLossSec: 10,
  alertMinConfidence: 0.75,
  noteMinConfidence: 0.5,
};
```

- [ ] **Step 2: Write the failing normalization tests**

`packages/align/test/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { numberToWords } from '../src/numbers';
import {
  FILLERS,
  FUNCTION_WORDS,
  expandContraction,
  isContraction,
  normalizeToken,
  tokenize,
} from '../src/normalize';

describe('numberToWords', () => {
  it.each([
    [0, ['zero']],
    [15, ['fifteen']],
    [40, ['forty']],
    [105, ['one', 'hundred', 'five']],
    [2000, ['two', 'thousand']],
    [3456, ['three', 'thousand', 'four', 'hundred', 'fifty', 'six']],
  ])('cardinal %i', (n, words) => {
    expect(numberToWords(n)).toEqual(words);
  });

  it('reads plausible years as years', () => {
    expect(numberToWords(1984)).toEqual(['nineteen', 'eighty', 'four']);
    expect(numberToWords(1905)).toEqual(['nineteen', 'oh', 'five']);
    expect(numberToWords(1900)).toEqual(['nineteen', 'hundred']);
    expect(numberToWords(2024)).toEqual(['twenty', 'twenty', 'four']);
  });

  it('makes ordinals', () => {
    expect(numberToWords(3, 'ordinal')).toEqual(['third']);
    expect(numberToWords(12, 'ordinal')).toEqual(['twelfth']);
    expect(numberToWords(20, 'ordinal')).toEqual(['twentieth']);
    expect(numberToWords(21, 'ordinal')).toEqual(['twenty', 'first']);
  });
});

describe('tokenize', () => {
  it('splits on whitespace and dashes, keeping punctuation attached', () => {
    expect(tokenize("I didn't think it polite to listen, sir.")).toEqual([
      'I', "didn't", 'think', 'it', 'polite', 'to', 'listen,', 'sir.',
    ]);
    expect(tokenize('Wait—what? No -- never')).toEqual(['Wait', 'what?', 'No', 'never']);
  });
});

describe('normalizeToken', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeToken('Lane?')).toEqual(['lane']);
    expect(normalizeToken("'Hello'")).toEqual(['hello']);
  });

  it('recognizer/PDF parity: curly and straight apostrophes, any case, normalize the same', () => {
    expect(normalizeToken('I’m')).toEqual(["i'm"]);
    expect(normalizeToken("I'M")).toEqual(["i'm"]);
    expect(normalizeToken("DIDN'T")).toEqual(normalizeToken('didn’t'));
  });

  it('expands numbers, ordinals and ampersands', () => {
    expect(normalizeToken('1984')).toEqual(['nineteen', 'eighty', 'four']);
    expect(normalizeToken('21st')).toEqual(['twenty', 'first']);
    expect(normalizeToken('&')).toEqual(['and']);
  });

  it("keeps leading-apostrophe words like 'tis", () => {
    expect(normalizeToken("'Tis")).toEqual(["'tis"]);
  });

  it('returns nothing for pure punctuation', () => {
    expect(normalizeToken('—')).toEqual([]);
    expect(normalizeToken('…')).toEqual([]);
  });
});

describe('contractions', () => {
  it.each([
    ["didn't", ['did', 'not']],
    ["can't", ['can', 'not']],
    ["won't", ['will', 'not']],
    ["i'm", ['i', 'am']],
    ["they're", ['they', 'are']],
    ["it's", ['it', 'is']],
    ["'tis", ['it', 'is']],
    ["lane's", ["lane's"]],
    ['hello', ['hello']],
  ])('expands %s', (w, out) => {
    expect(expandContraction(w)).toEqual(out);
  });

  it('knows what is a contraction', () => {
    expect(isContraction("i'm")).toBe(true);
    expect(isContraction("o'er")).toBe(true);
    expect(isContraction("lane's")).toBe(false);
  });
});

describe('word lists', () => {
  it('has fillers and function words', () => {
    expect(FILLERS.has('um')).toBe(true);
    expect(FILLERS.has('ah')).toBe(false);
    expect(FUNCTION_WORDS.has('the')).toBe(true);
    expect(FUNCTION_WORDS.has('expression')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/normalize.test.ts`
Expected: FAIL — modules `../src/numbers` and `../src/normalize` not found.

- [ ] **Step 4: Implement `numbers.ts`**

`packages/align/src/numbers.ts`:
```ts
const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINAL: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};

function below100(n: number): string[] {
  if (n < 20) return [ONES[n]!];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? [TENS[t]!, ONES[o]!] : [TENS[t]!];
}

function below1000(n: number): string[] {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const out: string[] = [];
  if (h) out.push(ONES[h]!, 'hundred');
  if (r || !h) out.push(...below100(r));
  return out;
}

function cardinal(n: number): string[] {
  if (n === 0) return ['zero'];
  if (n >= 1e12) return String(n).split('').map((d) => ONES[Number(d)]!);
  const out: string[] = [];
  let rest = n;
  const scales: Array<[number, string]> = [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ];
  for (const [value, name] of scales) {
    if (rest >= value) {
      out.push(...below1000(Math.floor(rest / value)), name);
      rest %= value;
    }
  }
  if (rest > 0) out.push(...below1000(rest));
  return out;
}

function year(n: number): string[] {
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return [...below100(hi), 'hundred'];
  if (lo < 10) return [...below100(hi), 'oh', ONES[lo]!];
  return [...below100(hi), ...below100(lo)];
}

function ordinalize(words: string[]): string[] {
  const last = words[words.length - 1]!;
  const rest = words.slice(0, -1);
  let ord: string;
  if (ORDINAL[last]) ord = ORDINAL[last]!;
  else if (last.endsWith('y')) ord = `${last.slice(0, -1)}ieth`;
  else ord = `${last}th`;
  return [...rest, ord];
}

export function numberToWords(n: number, mode: 'cardinal' | 'ordinal' = 'cardinal'): string[] {
  if (mode === 'ordinal') return ordinalize(cardinal(n));
  if ((n >= 1100 && n <= 1999) || (n >= 2010 && n <= 2099)) return year(n);
  return cardinal(n);
}
```

- [ ] **Step 5: Implement `normalize.ts`**

`packages/align/src/normalize.ts`:
```ts
import { numberToWords } from './numbers';

const APOSTROPHES = /[‘’ʼ`´]/g;
const DASHES = /[‐-―−]|--+/g;
const KEEP_LEADING = new Set(["'tis", "'twas", "'em"]);

export const FILLERS: ReadonlySet<string> = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm', 'mhm']);

export const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'it', 'i', 'you', 'he', 'she', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'that', 'this',
  'so', 'as', 'do', 'did', 'if', 'no', 'not', 'oh', 'o', 'have', 'has', 'had', 'will', 'would',
]);

export function tokenize(text: string): string[] {
  return text
    .replace(APOSTROPHES, "'")
    .replace(DASHES, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function normalizeToken(raw: string): string[] {
  const lowered = raw.replace(APOSTROPHES, "'").toLowerCase().replace(/&/g, ' and ');
  const cleaned = lowered.replace(/[^a-z0-9' ]+/g, ' ');
  const out: string[] = [];
  for (const piece of cleaned.split(' ')) {
    if (!piece) continue;
    const part = KEEP_LEADING.has(piece) ? piece : piece.replace(/^'+/, '').replace(/'+$/, '');
    if (!part) continue;
    const ord = /^(\d+)(st|nd|rd|th)$/.exec(part);
    if (ord) {
      out.push(...numberToWords(Number(ord[1]), 'ordinal'));
      continue;
    }
    if (/^\d+$/.test(part)) {
      out.push(...numberToWords(Number(part)));
      continue;
    }
    if (/\d/.test(part)) {
      for (const p of part.split(/(\d+)/)) {
        if (!p) continue;
        out.push(...(/^\d+$/.test(p) ? numberToWords(Number(p)) : [p]));
      }
      continue;
    }
    out.push(part);
  }
  return out;
}

const SPECIAL: Record<string, string[]> = {
  "can't": ['can', 'not'],
  "won't": ['will', 'not'],
  "shan't": ['shall', 'not'],
  "ain't": ['am', 'not'],
  "let's": ['let', 'us'],
  "'tis": ['it', 'is'],
  "'twas": ['it', 'was'],
  "'em": ['them'],
  "o'er": ['over'],
  "e'er": ['ever'],
  "ne'er": ['never'],
  "y'all": ['you', 'all'],
};
const S_EXPANDS = new Set(['it', 'he', 'she', 'that', 'there', 'what', 'here', 'where', 'who', 'how', 'this']);

export function expandContraction(norm: string): string[] {
  const special = SPECIAL[norm];
  if (special) return special;
  let m: RegExpExecArray | null;
  if ((m = /^(.+)n't$/.exec(norm))) return [m[1]!, 'not'];
  if ((m = /^(.+)'ll$/.exec(norm))) return [m[1]!, 'will'];
  if ((m = /^(.+)'re$/.exec(norm))) return [m[1]!, 'are'];
  if ((m = /^(.+)'ve$/.exec(norm))) return [m[1]!, 'have'];
  if ((m = /^(.+)'m$/.exec(norm))) return [m[1]!, 'am'];
  if ((m = /^(.+)'d$/.exec(norm))) return [m[1]!, 'would'];
  if ((m = /^(.+)'s$/.exec(norm)) && S_EXPANDS.has(m[1]!)) return [m[1]!, 'is'];
  return [norm];
}

export function isContraction(norm: string): boolean {
  return norm in SPECIAL || expandContraction(norm).length > 1;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/normalize.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Commit**

```bash
git add packages/align
git commit -m "feat(align): engine types, number words, and text normalization"
```

---

## Task 3: Phonetic keys and word scoring

**Files:**
- Create: `packages/align/src/phonetic.ts`
- Test: `packages/align/test/phonetic.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `phoneticKey(norm: string): [string, string]`
  - `wordScore(h: { norm: string; phon: [string, string] }, e: { norm: string; phon: [string, string] }): number` (1 exact, 0.9 sound-alike, else partial ≤ 0.6)
  - `MATCH_THRESHOLD = 0.85`

- [ ] **Step 1: Install double-metaphone**

Run: `npm install double-metaphone -w packages/align`
Expected: added (MIT licence).

- [ ] **Step 2: Write the failing tests**

`packages/align/test/phonetic.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MATCH_THRESHOLD, phoneticKey, wordScore } from '../src/phonetic';

const w = (norm: string) => ({ norm, phon: phoneticKey(norm) });

describe('phoneticKey', () => {
  it('gives homophones the same primary key', () => {
    expect(phoneticKey('knight')[0]).toBe(phoneticKey('night')[0]);
  });
  it('ignores apostrophes', () => {
    expect(phoneticKey("i'm")[0]).toBe(phoneticKey('im')[0]);
  });
  it('falls back to the word itself when it has no letters', () => {
    expect(phoneticKey('')).toEqual(['', '']);
  });
});

describe('wordScore', () => {
  it('scores identical words 1', () => {
    expect(wordScore(w('expression'), w('expression'))).toBe(1);
  });
  it('scores sound-alike words of 3+ letters as a match', () => {
    expect(wordScore(w('night'), w('knight'))).toBe(0.9);
    expect(wordScore(w('sur'), w('sir'))).toBe(0.9);
    expect(wordScore(w('there'), w('their'))).toBe(0.9);
  });
  it('does not treat short sound-alikes as matches (in/on)', () => {
    const s = wordScore(w('in'), w('on'));
    expect(s).toBeLessThan(MATCH_THRESHOLD);
    expect(s).toBeCloseTo(0.6, 5);
  });
  it('scores unrelated words low', () => {
    expect(wordScore(w('feeling'), w('expression'))).toBeLessThan(0.3);
  });
  it('exports the match threshold', () => {
    expect(MATCH_THRESHOLD).toBe(0.85);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/phonetic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`packages/align/src/phonetic.ts`:
```ts
import { doubleMetaphone } from 'double-metaphone';

export const MATCH_THRESHOLD = 0.85;

export interface Scorable {
  norm: string;
  phon: [string, string];
}

export function phoneticKey(norm: string): [string, string] {
  const letters = norm.replace(/[^a-z]/g, '');
  if (!letters) return [norm, norm];
  const [primary, secondary] = doubleMetaphone(letters);
  const a = primary || letters;
  return [a, secondary || a];
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

const letterCount = (norm: string) => norm.replace(/[^a-z]/g, '').length;

export function wordScore(h: Scorable, e: Scorable): number {
  if (h.norm === e.norm) return 1;
  const [hp, hs] = h.phon;
  const [ep, es] = e.phon;
  const soundAlike = hp === ep || hp === es || hs === ep;
  if (soundAlike && Math.min(letterCount(h.norm), letterCount(e.norm)) >= 3) return 0.9;
  const len = Math.max(hp.length, ep.length, 1);
  return Math.max(0, 0.6 * (1 - levenshtein(hp, ep) / len));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/phonetic.test.ts`
Expected: PASS. (If `double-metaphone` gives `sur`/`sir` different primaries on the installed version, check its output with `node -e "import('double-metaphone').then(m=>console.log(m.doubleMetaphone('sur'),m.doubleMetaphone('sir')))"`, then replace that example with another 3+-letter homophone pair the library does equate, such as `four`/`fore`. Do not change the scoring rule.)

- [ ] **Step 6: Commit**

```bash
git add packages/align package-lock.json
git commit -m "feat(align): phonetic keys and word similarity scoring"
```

---
## Task 4: Expected stream, heard tokens, display helpers

**Files:**
- Create: `packages/align/src/expected.ts`
- Test: `packages/align/test/expected.test.ts`

**Interfaces:**
- Consumes: `tokenize`, `normalizeToken`, `expandContraction`, `FILLERS` (Task 2); `phoneticKey` (Task 3); types (Task 2).
- Produces:
  - `buildExpected(lines: ScriptLineInput[], strictness: Strictness): ExpectedWord[]`
  - `toHeardTokens(words: HeardWord[], strictness: Strictness): HeardToken[]`
  - `displayExpected(words: ExpectedWord[]): string` (dedupes lenient expansions, trims edge punctuation)
  - `displayHeard(tokens: HeardToken[]): string` (normalized words joined by spaces)
  - `countCheckedWords(expected: ExpectedWord[]): Map<string, number>` (checked-zone words per line)

- [ ] **Step 1: Write the failing tests**

`packages/align/test/expected.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  buildExpected,
  countCheckedWords,
  displayExpected,
  displayHeard,
  toHeardTokens,
} from '../src/expected';
import type { HeardWord, Strictness } from '../src/types';

const WP: Strictness = { mode: 'word-perfect' };
const LENIENT: Strictness = { mode: 'lenient', lineMatchThreshold: 0.8 };
const hw = (text: string, start = 0): HeardWord => ({ text, start, end: start + 0.3, confidence: 0.9, final: true });

describe('buildExpected', () => {
  it('flattens lines into indexed words', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Hello there, friend.' },
        { id: 'B', characterId: 'Y', text: 'Hi.' },
      ],
      WP,
    );
    expect(exp.map((w) => w.norm)).toEqual(['hello', 'there', 'friend', 'hi']);
    expect(exp.map((w) => w.idx)).toEqual([0, 1, 2, 3]);
    expect(exp[3]).toMatchObject({ lineId: 'B', characterId: 'Y', wordInLine: 0, raw: 'Hi.', zone: 'checked' });
  });

  it('skips cut lines', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Keep me.' },
        { id: 'B', characterId: 'X', text: 'Cut me.', cut: true },
      ],
      WP,
    );
    expect(exp.map((w) => w.lineId)).toEqual(['A', 'A']);
  });

  it('marks overlap ranges by raw word index', () => {
    const exp = buildExpected(
      [{ id: 'A', characterId: 'X', text: "I didn't think it polite to listen, sir.", overlapRanges: [[4, 8]] }],
      WP,
    );
    expect(exp.map((w) => w.zone)).toEqual([
      'checked', 'checked', 'checked', 'checked', 'overlap', 'overlap', 'overlap', 'overlap',
    ]);
  });

  it('keeps contractions in word-perfect and expands them in lenient', () => {
    const line = [{ id: 'A', characterId: 'X', text: "I'm sorry" }];
    expect(buildExpected(line, WP).map((w) => w.norm)).toEqual(["i'm", 'sorry']);
    const lenient = buildExpected(line, LENIENT);
    expect(lenient.map((w) => w.norm)).toEqual(['i', 'am', 'sorry']);
    expect(lenient.map((w) => w.wordInLine)).toEqual([0, 0, 1]);
  });

  it('zero-word lines: lines with no speakable words add nothing and do not disturb indexing', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'Hello.' },
        { id: 'B', characterId: 'X', text: '—' },
        { id: 'C', characterId: 'X', text: '…' },
        { id: 'D', characterId: 'X', text: '' },
        { id: 'E', characterId: 'X', text: 'Goodbye.' },
      ],
      WP,
    );
    expect(exp.map((w) => [w.idx, w.lineId, w.norm])).toEqual([
      [0, 'A', 'hello'],
      [1, 'E', 'goodbye'],
    ]);
  });
});

describe('toHeardTokens', () => {
  it('normalizes recognizer output and drops fillers', () => {
    const toks = toHeardTokens([hw('UM', 0), hw("I'M", 1), hw('SORRY', 2)], WP);
    expect(toks.map((t) => t.norm)).toEqual(["i'm", 'sorry']);
    expect(toks[0]).toMatchObject({ text: "I'M", start: 1, end: 1.3, confidence: 0.9 });
  });

  it('expands contractions in lenient mode', () => {
    expect(toHeardTokens([hw("I'M"), hw('SORRY')], LENIENT).map((t) => t.norm)).toEqual(['i', 'am', 'sorry']);
  });
});

describe('display helpers', () => {
  it('shows expected words once, with edge punctuation trimmed', () => {
    const exp = buildExpected([{ id: 'A', characterId: 'X', text: "I'm sorry, Lane." }], LENIENT);
    expect(displayExpected(exp)).toBe("I'm sorry, Lane");
  });

  it('shows heard tokens as normalized words', () => {
    expect(displayHeard(toHeardTokens([hw('OF'), hw('COURSE')], WP))).toBe('of course');
  });

  it('counts only checked words per line', () => {
    const exp = buildExpected(
      [
        { id: 'A', characterId: 'X', text: 'one two three four', overlapRanges: [[2, 4]] },
        { id: 'B', characterId: 'Y', text: 'five' },
      ],
      WP,
    );
    expect(countCheckedWords(exp)).toEqual(
      new Map([
        ['A', 2],
        ['B', 1],
      ]),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/expected.test.ts`
Expected: FAIL — module `../src/expected` not found.

- [ ] **Step 3: Implement**

`packages/align/src/expected.ts`:
```ts
import { FILLERS, expandContraction, normalizeToken, tokenize } from './normalize';
import { phoneticKey } from './phonetic';
import type { ExpectedWord, HeardToken, HeardWord, ScriptLineInput, Strictness } from './types';

const EDGE_PUNCT = /^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu;

function expand(norm: string, strictness: Strictness): string[] {
  return strictness.mode === 'lenient' ? expandContraction(norm) : [norm];
}

export function buildExpected(lines: ScriptLineInput[], strictness: Strictness): ExpectedWord[] {
  const out: ExpectedWord[] = [];
  for (const line of lines) {
    if (line.cut) continue;
    const ranges = line.overlapRanges ?? [];
    tokenize(line.text).forEach((raw, wordInLine) => {
      const overlap = ranges.some(([s, e]) => wordInLine >= s && wordInLine < e);
      for (const n of normalizeToken(raw)) {
        for (const norm of expand(n, strictness)) {
          out.push({
            idx: out.length,
            lineId: line.id,
            characterId: line.characterId,
            wordInLine,
            raw,
            norm,
            phon: phoneticKey(norm),
            zone: overlap ? 'overlap' : 'checked',
          });
        }
      }
    });
  }
  return out;
}

export function toHeardTokens(words: HeardWord[], strictness: Strictness): HeardToken[] {
  const out: HeardToken[] = [];
  for (const w of words) {
    for (const n of normalizeToken(w.text)) {
      if (FILLERS.has(n)) continue;
      for (const norm of expand(n, strictness)) {
        out.push({ text: w.text, norm, phon: phoneticKey(norm), start: w.start, end: w.end, confidence: w.confidence });
      }
    }
  }
  return out;
}

export function displayExpected(words: ExpectedWord[]): string {
  const seen = new Set<string>();
  const raws: string[] = [];
  for (const w of words) {
    const key = `${w.lineId}#${w.wordInLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    raws.push(w.raw);
  }
  return raws.join(' ').replace(EDGE_PUNCT, '');
}

export function displayHeard(tokens: HeardToken[]): string {
  return tokens.map((t) => t.norm).join(' ');
}

export function countCheckedWords(expected: ExpectedWord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of expected) {
    if (w.zone !== 'checked') continue;
    counts.set(w.lineId, (counts.get(w.lineId) ?? 0) + 1);
  }
  return counts;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/expected.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/align
git commit -m "feat(align): expected word stream, heard tokens, display helpers"
```

---

## Task 5: Windowed alignment and the grace-window commit rules

**Files:**
- Create: `packages/align/src/window-align.ts`, `packages/align/src/commit.ts`
- Create: `packages/align/test/helpers/dsl.ts` (the `heard()` builder; Task 9 extends this file)
- Test: `packages/align/test/window-align.test.ts`, `packages/align/test/commit.test.ts`

**Interfaces:**
- Consumes: `wordScore`, `MATCH_THRESHOLD` (Task 3); `buildExpected`, `toHeardTokens` (Task 4).
- Produces:
  - `type Op = { kind: 'match'; h; e; score } | { kind: 'sub'; h; e; score } | { kind: 'ins'; h } | { kind: 'del'; e }` (`h` indexes the heard array, `e` indexes the window passed in)
  - Type guards `hasE(op)`, `hasH(op)`, `isMatch(op)`
  - `alignWindow(heard: HeardToken[], window: ExpectedWord[], opts?: { global?: boolean; params?: AlignParams }): Op[]` — semi-global by default (the alignment may stop anywhere in the window); `global: true` consumes the whole window
  - `AlignParams`, `DEFAULT_ALIGN_PARAMS`
  - `commitPoint(ops: Op[], confirmWords: number): number` — index of the last op safe to commit (−1 if none)
  - `commitPointOnTimeout(ops: Op[]): number`
  - Test helper `heard(text, opts?)`: builds `HeardWord[]`; `|` = 1 s pause, `||` = 3 s, `|||` = 12 s; default word 0.3 s, gap 0.05 s, confidence 1.

- [ ] **Step 1: Create the test DSL helper**

`packages/align/test/helpers/dsl.ts`:
```ts
import type { HeardWord } from '../../src/types';

export interface HeardOptions {
  start?: number;
  wordDur?: number;
  gap?: number;
  confidence?: number;
}

/** Build recognizer-style words. Pause markers: "|" = 1 s, "||" = 3 s, "|||" = 12 s. */
export function heard(text: string, opts: HeardOptions = {}): HeardWord[] {
  const wordDur = opts.wordDur ?? 0.3;
  const gap = opts.gap ?? 0.05;
  const confidence = opts.confidence ?? 1;
  let t = opts.start ?? 0;
  const out: HeardWord[] = [];
  for (const piece of text.split(/\s+/).filter(Boolean)) {
    if (/^\|+$/.test(piece)) {
      t += piece.length === 1 ? 1 : piece.length === 2 ? 3 : 12;
      continue;
    }
    out.push({ text: piece.replace(/[.,;:!?]+$/, ''), start: t, end: t + wordDur, confidence, final: true });
    t += wordDur + gap;
  }
  return out;
}
```

- [ ] **Step 2: Write the failing alignment tests**

`packages/align/test/window-align.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildExpected, toHeardTokens } from '../src/expected';
import type { Strictness } from '../src/types';
import { alignWindow, hasE, type Op } from '../src/window-align';
import { heard } from './helpers/dsl';

const WP: Strictness = { mode: 'word-perfect' };
const exp = (text: string) => buildExpected([{ id: 'L', characterId: 'C', text }], WP);
const toks = (text: string) => toHeardTokens(heard(text), WP);
const kinds = (ops: Op[]) => ops.map((o) => o.kind);

describe('alignWindow', () => {
  it('aligns a perfect prefix and stops (semi-global)', () => {
    const ops = alignWindow(toks('did you hear'), exp('Did you hear what I was playing'));
    expect(kinds(ops)).toEqual(['match', 'match', 'match']);
    expect(ops.filter(hasE).map((o) => o.e)).toEqual([0, 1, 2]);
  });

  it('finds a substitution', () => {
    const ops = alignWindow(toks('play with marvellous'), exp('play with wonderful expression'));
    expect(kinds(ops)).toEqual(['match', 'match', 'sub']);
    expect(ops[2]).toMatchObject({ kind: 'sub', h: 2, e: 2 });
  });

  it('skips expected words to reach a better match', () => {
    const ops = alignWindow(toks('anyone can play'), exp("I'm sorry anyone can play"));
    expect(kinds(ops)).toEqual(['del', 'del', 'match', 'match', 'match']);
  });

  it('finds an insertion', () => {
    expect(kinds(alignWindow(toks('yes really sir'), exp('yes sir')))).toEqual(['match', 'ins', 'match']);
  });

  it('returns no ops for no heard words', () => {
    expect(alignWindow([], exp('a b c'))).toEqual([]);
  });

  it('global mode consumes the whole window', () => {
    const ops = alignWindow(toks('zebra'), exp('alpha beta gamma'), { global: true });
    expect(ops.filter(hasE).map((o) => o.e).sort()).toEqual([0, 1, 2]);
    expect(ops.filter((o) => o.kind !== 'del')).toHaveLength(1);
  });

  it('global mode with no heard words deletes the whole window', () => {
    expect(kinds(alignWindow([], exp('a b c'), { global: true }))).toEqual(['del', 'del', 'del']);
  });
});
```

`packages/align/test/commit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { commitPoint, commitPointOnTimeout } from '../src/commit';
import type { Op } from '../src/window-align';

const m = (h: number, e: number): Op => ({ kind: 'match', h, e, score: 1 });
const s = (h: number, e: number): Op => ({ kind: 'sub', h, e, score: 0 });
const i = (h: number): Op => ({ kind: 'ins', h });
const d = (e: number): Op => ({ kind: 'del', e });

describe('commitPoint', () => {
  it('commits leading matches immediately', () => {
    expect(commitPoint([m(0, 0), m(1, 1)], 3)).toBe(1);
  });
  it('confirms a substitution after C matching words', () => {
    expect(commitPoint([m(0, 0), s(1, 1), m(2, 2)], 1)).toBe(2);
    expect(commitPoint([m(0, 0), s(1, 1), m(2, 2)], 2)).toBe(0);
  });
  it('requires at least two matches after a skip, even at instant patience', () => {
    expect(commitPoint([d(0), m(0, 1)], 1)).toBe(-1);
    expect(commitPoint([d(0), m(0, 1), m(1, 2)], 1)).toBe(2);
  });
  it('confirms interleaved blocks (transposition shape)', () => {
    expect(commitPoint([m(0, 0), d(1), m(1, 2), i(2), m(3, 3)], 1)).toBe(4);
  });
  it('never commits an unconfirmed trailing deviation', () => {
    expect(commitPoint([s(0, 0)], 1)).toBe(-1);
  });
});

describe('commitPointOnTimeout', () => {
  it('commits trailing substitutions and insertions', () => {
    expect(commitPointOnTimeout([s(0, 0)])).toBe(0);
    expect(commitPointOnTimeout([m(0, 0), i(1), i(2)])).toBe(2);
  });
  it('still requires two matches after a skip', () => {
    expect(commitPointOnTimeout([m(0, 0), d(1), m(1, 2)])).toBe(0);
  });
  it('handles empty input', () => {
    expect(commitPointOnTimeout([])).toBe(-1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/window-align.test.ts packages/align/test/commit.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `window-align.ts`**

`packages/align/src/window-align.ts`:
```ts
import { MATCH_THRESHOLD, wordScore } from './phonetic';
import type { ExpectedWord, HeardToken } from './types';

export type Op =
  | { kind: 'match'; h: number; e: number; score: number }
  | { kind: 'sub'; h: number; e: number; score: number }
  | { kind: 'ins'; h: number }
  | { kind: 'del'; e: number };

export const hasE = (op: Op): op is Extract<Op, { e: number }> => op.kind !== 'ins';
export const hasH = (op: Op): op is Extract<Op, { h: number }> => op.kind !== 'del';
export const isMatch = (op: Op): op is Extract<Op, { kind: 'match' }> => op.kind === 'match';

export interface AlignParams {
  matchThreshold: number;
  subBase: number;
  subSimilarityWeight: number;
  insCost: number;
  delCost: number;
}

export const DEFAULT_ALIGN_PARAMS: AlignParams = {
  matchThreshold: MATCH_THRESHOLD,
  subBase: -0.6,
  subSimilarityWeight: 0.4,
  insCost: -0.7,
  delCost: -0.5,
};

const DIAG = 1;
const LEFT = 2; // deletion: consume an expected word
const UP = 3; // insertion: consume a heard word

export function alignWindow(
  heard: HeardToken[],
  window: ExpectedWord[],
  opts: { global?: boolean; params?: AlignParams } = {},
): Op[] {
  const p = opts.params ?? DEFAULT_ALIGN_PARAMS;
  const n = heard.length;
  const m = window.length;
  if (n === 0) return opts.global ? window.map((_, e) => ({ kind: 'del' as const, e })) : [];
  const W = m + 1;
  const score = new Float64Array((n + 1) * W);
  const pair = new Float64Array((n + 1) * W);
  const back = new Uint8Array((n + 1) * W);
  for (let j = 1; j <= m; j++) {
    score[j] = j * p.delCost;
    back[j] = LEFT;
  }
  for (let i = 1; i <= n; i++) {
    score[i * W] = i * p.insCost;
    back[i * W] = UP;
    for (let j = 1; j <= m; j++) {
      const s = wordScore(heard[i - 1]!, window[j - 1]!);
      pair[i * W + j] = s;
      const diag = score[(i - 1) * W + j - 1]! + (s >= p.matchThreshold ? 1 : p.subBase + p.subSimilarityWeight * s);
      const del = score[i * W + j - 1]! + p.delCost;
      const ins = score[(i - 1) * W + j]! + p.insCost;
      let best = diag;
      let b = DIAG;
      if (del > best) {
        best = del;
        b = LEFT;
      }
      if (ins > best) {
        best = ins;
        b = UP;
      }
      score[i * W + j] = best;
      back[i * W + j] = b;
    }
  }
  let endJ = m;
  if (!opts.global) {
    endJ = 0;
    for (let j = 1; j <= m; j++) if (score[n * W + j]! > score[n * W + endJ]!) endJ = j;
  }
  const ops: Op[] = [];
  let i = n;
  let j = endJ;
  while (i > 0 || j > 0) {
    const b = back[i * W + j];
    if (b === DIAG) {
      const s = pair[i * W + j]!;
      ops.push(
        s >= p.matchThreshold
          ? { kind: 'match', h: i - 1, e: j - 1, score: s }
          : { kind: 'sub', h: i - 1, e: j - 1, score: s },
      );
      i--;
      j--;
    } else if (b === LEFT) {
      ops.push({ kind: 'del', e: j - 1 });
      j--;
    } else {
      ops.push({ kind: 'ins', h: i - 1 });
      i--;
    }
  }
  return ops.reverse();
}
```

- [ ] **Step 5: Implement `commit.ts`**

`packages/align/src/commit.ts`:
```ts
import type { Op } from './window-align';

/**
 * Index of the last op that is safe to commit, or -1.
 * Leading matches always commit. Beyond that, the ops up to p commit when p ends a run of at least
 * `confirmWords` matches and every deviation block before p is followed (within ..p) by enough
 * matches: `confirmWords` normally, max(confirmWords, 2) if the block skips expected words.
 */
export function commitPoint(ops: Op[], confirmWords: number): number {
  let lead = 0;
  while (lead < ops.length && ops[lead]!.kind === 'match') lead++;
  for (let p = ops.length - 1; p >= lead; p--) {
    if (ops[p]!.kind !== 'match') continue;
    let run = 0;
    for (let q = p; q >= 0 && ops[q]!.kind === 'match'; q--) run++;
    if (run < confirmWords) continue;
    if (blocksConfirmed(ops, lead, p, confirmWords)) return p;
  }
  return lead - 1;
}

function blocksConfirmed(ops: Op[], from: number, p: number, confirmWords: number): boolean {
  let i = from;
  while (i <= p) {
    if (ops[i]!.kind === 'match') {
      i++;
      continue;
    }
    let j = i;
    let hasDel = false;
    while (j <= p && ops[j]!.kind !== 'match') {
      if (ops[j]!.kind === 'del') hasDel = true;
      j++;
    }
    let matchesAfter = 0;
    for (let q = j; q <= p; q++) if (ops[q]!.kind === 'match') matchesAfter++;
    if (matchesAfter < (hasDel ? Math.max(confirmWords, 2) : confirmWords)) return false;
    i = j;
  }
  return true;
}

/** After the grace timeout: commit everything except skips that are not followed by two matches. */
export function commitPointOnTimeout(ops: Op[]): number {
  let end = -1;
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === 'match') {
      end = i;
      i++;
      continue;
    }
    let j = i;
    let hasDel = false;
    while (j < ops.length && ops[j]!.kind !== 'match') {
      if (ops[j]!.kind === 'del') hasDel = true;
      j++;
    }
    let k = j;
    while (k < ops.length && ops[k]!.kind === 'match') k++;
    if (hasDel && k - j < 2) break;
    end = k - 1;
    i = k;
  }
  return end;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/window-align.test.ts packages/align/test/commit.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/align
git commit -m "feat(align): windowed DP alignment and grace-window commit rules"
```

---

## Task 6: Classifying differences into line-note categories

**Files:**
- Create: `packages/align/src/classify.ts`
- Create: `packages/align/test/helpers/fixtures.ts`
- Test: `packages/align/test/classify.test.ts`

**Interfaces:**
- Consumes: `Op`, `hasE`, `hasH`, `isMatch`, `alignWindow` (Task 5); `displayExpected`, `displayHeard`, `buildExpected`, `toHeardTokens`, `countCheckedWords` (Task 4); `FUNCTION_WORDS`, `expandContraction`, `isContraction` (Task 2); `wordScore`, `MATCH_THRESHOLD` (Task 3).
- Produces:
  - `interface ClassifyContext { expected: ExpectedWord[]; heard: HeardToken[]; recentMatched: ExpectedWord[]; lastHeardEndBefore: number; strictness: Strictness; audioQuality: number; lineWordCount: Map<string, number>; noteMin: number; at: number; started: boolean }`
  - `classifyOps(ops: Op[] /* e indices absolute into ctx.expected */, ctx: ClassifyContext): { notes: NoteDraft[]; stumbles: Array<{ idx: number; heard: string }> }`
  - `makeNote(category, words, heard, ctx: { audioQuality; noteMin; at }, owner: { lineId; characterId }, opts?: { factor?: number; cap?: number }): NoteDraft`
  - `BASE_CONFIDENCE: Record<Category, number>`, `WORD_LEVEL_CATEGORIES: ReadonlySet<Category>`, `CONTRACTION_CAP = 0.45`
  - Test fixture `EARNEST: ScriptLineInput[]` (5 lines, ids `L1`–`L5`) and `textOf(id)`.

**Confidence rules** (spec §7.4), applied in `makeNote`:
`c = BASE[category] × factor × mean(heard confidence, if any heard words) × (0.5 if every word involved is a function word) × audioQuality`, capped by `cap`. `status = c ≥ noteMin ? 'note' : 'check'`.
Base values: dropped-line 0.95, wrong-words 0.85, paraphrase 0.85, dropped-words 0.8, transposed 0.8, added-words 0.75, jumped-cue 0.7, called-for-line 0.9. Factors: wrong-words whose heard/expected sound similar (sub score ≥ 0.3) × 0.6 (likely a mishear); added runs of ≥ 4 words × 0.5 (likely chatter). Contraction differences are capped at 0.45 (always "check").

- [ ] **Step 1: Create the fixture**

`packages/align/test/helpers/fixtures.ts`:
```ts
import type { ScriptLineInput } from '../../src/types';

// Oscar Wilde, The Importance of Being Earnest (1895) — public domain.
export const EARNEST: ScriptLineInput[] = [
  { id: 'L1', characterId: 'ALGERNON', text: 'Did you hear what I was playing, Lane?' },
  { id: 'L2', characterId: 'LANE', text: "I didn't think it polite to listen, sir." },
  { id: 'L3', characterId: 'ALGERNON', text: "I'm sorry for that, for your sake. I don't play accurately." },
  { id: 'L4', characterId: 'ALGERNON', text: 'Anyone can play accurately, but I play with wonderful expression.' },
  { id: 'L5', characterId: 'LANE', text: 'Yes, sir.' },
];

export const textOf = (id: string, lines: ScriptLineInput[] = EARNEST): string =>
  lines.find((l) => l.id === id)!.text;
```

- [ ] **Step 2: Write the failing tests**

`packages/align/test/classify.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyOps, type ClassifyContext } from '../src/classify';
import { buildExpected, countCheckedWords, toHeardTokens } from '../src/expected';
import type { ScriptLineInput, Strictness } from '../src/types';
import { alignWindow } from '../src/window-align';
import { heard, type HeardOptions } from './helpers/dsl';
import { EARNEST, textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const LENIENT: Strictness = { mode: 'lenient', lineMatchThreshold: 0.8 };
const perf = (...ids: string[]) => ids.map((id) => textOf(id)).join(' ');

function classify(
  heardText: string,
  opts: { lines?: ScriptLineInput[]; strictness?: Strictness; heardOpts?: HeardOptions; ctx?: Partial<ClassifyContext> } = {},
) {
  const strictness = opts.strictness ?? WP;
  const expected = buildExpected(opts.lines ?? EARNEST, strictness);
  const toks = toHeardTokens(heard(heardText, opts.heardOpts), strictness);
  const ops = alignWindow(toks, expected);
  return classifyOps(ops, {
    expected,
    heard: toks,
    recentMatched: [],
    lastHeardEndBefore: -Infinity,
    strictness,
    audioQuality: 1,
    lineWordCount: countCheckedWords(expected),
    noteMin: 0.5,
    at: 0,
    started: false,
    ...opts.ctx,
  });
}

const L4_FEELING = 'Anyone can play accurately, but I play with wonderful feeling.';

describe('classifyOps', () => {
  it('finds nothing in a perfect run', () => {
    expect(classify(perf('L1', 'L2', 'L3', 'L4', 'L5'))).toEqual({ notes: [], stumbles: [] });
  });

  it('wrong word', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '));
    expect(notes).toEqual([
      expect.objectContaining({ lineId: 'L4', category: 'wrong-words', expected: 'expression', heard: 'feeling', status: 'note', confidence: 0.85 }),
    ]);
  });

  it('dropped words', () => {
    const { notes } = classify([perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' '));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ lineId: 'L3', category: 'dropped-words', status: 'note' });
    expect(notes[0]!.expected).toContain('your sake');
  });

  it('dropped line followed by the same character', () => {
    const { notes } = classify(perf('L1', 'L2', 'L4', 'L5'));
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L3', characterId: 'ALGERNON', category: 'dropped-line' })]);
  });

  it('jumped cue: another character comes in early', () => {
    const { notes } = classify(perf('L1', 'L3', 'L4', 'L5'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ lineId: 'L3', characterId: 'ALGERNON', category: 'jumped-cue' });
    expect(notes[0]!.expected).toContain('polite to listen');
  });

  it('a long silence before the next line means the line was dropped, not jumped', () => {
    const { notes } = classify(`${perf('L1')} || ${perf('L3', 'L4', 'L5')}`);
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L2', characterId: 'LANE', category: 'dropped-line' })]);
  });

  it('added words attach to the line they follow', () => {
    const { notes } = classify(`${perf('L1', 'L2', 'L3', 'L4')} Yes, sir, of course.`);
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'added-words', heard: 'of course', status: 'note' })]);
  });

  it('transposed words', () => {
    const { notes } = classify(
      [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with expression wonderful.', perf('L5')].join(' '),
    );
    expect(notes).toEqual([
      expect.objectContaining({ lineId: 'L4', category: 'transposed', expected: 'wonderful expression', heard: 'expression wonderful', status: 'note' }),
    ]);
  });

  it('a pause-and-correct is a stumble, not an added word', () => {
    const r = classify(['Did you hear what you | I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '));
    expect(r.notes).toEqual([]);
    expect(r.stumbles).toHaveLength(1);
  });

  it('repeating words is a stumble', () => {
    const r = classify(['Did you hear did you hear what I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '));
    expect(r.notes).toEqual([]);
    expect(r.stumbles).toHaveLength(1);
  });

  it('ignores talk before the first matched word (pre-roll)', () => {
    expect(classify(`Okay are we starting now | ${perf('L1', 'L2', 'L3', 'L4', 'L5')}`).notes).toEqual([]);
  });

  it('contraction differences are only ever "check" in word-perfect', () => {
    const { notes } = classify([perf('L1', 'L2'), "I am sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' '));
    expect(notes).toEqual([expect.objectContaining({ lineId: 'L3', category: 'wrong-words', status: 'check', confidence: 0.45 })]);
  });

  it('contraction differences vanish in lenient mode', () => {
    const text = [perf('L1', 'L2'), "I am sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' ');
    expect(classify(text, { strictness: LENIENT }).notes).toEqual([]);
  });

  it('a lone added function word is only a "check"', () => {
    const { notes } = classify(['Did you hear what I was playing, the Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' '));
    expect(notes).toEqual([expect.objectContaining({ category: 'added-words', heard: 'the', status: 'check' })]);
  });

  it('lenient mode drops function-word-only differences entirely', () => {
    const text = ['Did you hear what I was playing, the Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ');
    expect(classify(text, { strictness: LENIENT }).notes).toEqual([]);
  });

  it('low recognizer confidence turns a note into a check', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { heardOpts: { confidence: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ category: 'wrong-words', status: 'check', confidence: 0.425 })]);
  });

  it('poor audio quality turns a note into a check', () => {
    const { notes } = classify([perf('L1', 'L2', 'L3'), L4_FEELING, perf('L5')].join(' '), { ctx: { audioQuality: 0.5 } });
    expect(notes).toEqual([expect.objectContaining({ status: 'check', confidence: 0.425 })]);
  });

  it('ignores differences inside overlap zones', () => {
    const lines = EARNEST.map((l) => (l.id === 'L2' ? { ...l, overlapRanges: [[4, 8]] as Array<[number, number]> } : l));
    const text = [perf('L1'), "I didn't think it rather mumbled noise here", perf('L3', 'L4', 'L5')].join(' ');
    expect(classify(text, { lines }).notes).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/classify.test.ts`
Expected: FAIL — module `../src/classify` not found.

- [ ] **Step 4: Implement**

`packages/align/src/classify.ts`:
```ts
import { displayExpected, displayHeard } from './expected';
import { FUNCTION_WORDS, expandContraction, isContraction } from './normalize';
import { MATCH_THRESHOLD, wordScore } from './phonetic';
import type { Category, ExpectedWord, HeardToken, NoteDraft, Strictness } from './types';
import { hasE, hasH, isMatch, type Op } from './window-align';

export interface ClassifyContext {
  expected: ExpectedWord[];
  heard: HeardToken[];
  /** Up to 3 most recently matched expected words before these ops. */
  recentMatched: ExpectedWord[];
  /** End time of the last committed heard word before these ops (-Infinity if none). */
  lastHeardEndBefore: number;
  strictness: Strictness;
  audioQuality: number;
  /** Checked-zone word count per line (for whole-line detection). */
  lineWordCount: Map<string, number>;
  noteMin: number;
  at: number;
  /** Whether anything in this run has matched yet (insertions before the first match are pre-roll talk). */
  started: boolean;
}

export interface Classified {
  notes: NoteDraft[];
  stumbles: Array<{ idx: number; heard: string }>;
}

export const BASE_CONFIDENCE: Record<Category, number> = {
  'dropped-line': 0.95,
  'dropped-words': 0.8,
  'added-words': 0.75,
  'wrong-words': 0.85,
  transposed: 0.8,
  paraphrase: 0.85,
  'jumped-cue': 0.7,
  'called-for-line': 0.9,
};

export const WORD_LEVEL_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'wrong-words',
  'dropped-words',
  'added-words',
  'transposed',
]);

export const CONTRACTION_CAP = 0.45;
const JUMP_GAP_SEC = 1.5;
const STUMBLE_PAUSE_SEC = 0.25;
const SIMILAR_SUB_SCORE = 0.3;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function makeNote(
  category: Category,
  words: ExpectedWord[],
  heard: HeardToken[],
  ctx: { audioQuality: number; noteMin: number; at: number },
  owner: { lineId: string; characterId: string },
  opts: { factor?: number; cap?: number } = {},
): NoteDraft {
  let c = BASE_CONFIDENCE[category] * (opts.factor ?? 1);
  if (heard.length) c *= heard.reduce((s, t) => s + t.confidence, 0) / heard.length;
  const norms = [...words.map((w) => w.norm), ...heard.map((t) => t.norm)];
  if (norms.length && norms.every((n) => FUNCTION_WORDS.has(n))) c *= 0.5;
  const confidence = round3(Math.min(opts.cap ?? 1, Math.max(0, c * ctx.audioQuality)));
  return {
    lineId: owner.lineId,
    characterId: owner.characterId,
    category,
    expected: displayExpected(words),
    heard: displayHeard(heard),
    confidence,
    status: confidence >= ctx.noteMin ? 'note' : 'check',
    at: ctx.at,
  };
}

function groupBy<T>(items: T[], key: (t: T) => string): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && key(last[0]!) === key(item)) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

export function classifyOps(ops: Op[], ctx: ClassifyContext): Classified {
  const notes: NoteDraft[] = [];
  const stumbles: Array<{ idx: number; heard: string }> = [];
  const consumed = new Set<number>();
  const E = (i: number) => ctx.expected[i]!;
  const H = (i: number) => ctx.heard[i]!;
  const lenient = ctx.strictness.mode === 'lenient';

  const add = (
    category: Category,
    words: ExpectedWord[],
    heard: HeardToken[],
    owner: { lineId: string; characterId: string },
    opts: { factor?: number; cap?: number } = {},
  ) => {
    if (lenient && WORD_LEVEL_CATEGORIES.has(category)) {
      const norms = [...words.map((w) => w.norm), ...heard.map((t) => t.norm)];
      if (norms.length && norms.every((n) => FUNCTION_WORDS.has(n))) return;
    }
    notes.push(makeNote(category, words, heard, ctx, owner, opts));
  };

  // 1. Contraction differences ("I'm" vs "I am") — word-perfect only; lenient already expanded both sides.
  if (!lenient) {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]!;
      if (consumed.has(i) || (op.kind !== 'match' && op.kind !== 'sub')) continue;
      const e = E(op.e);
      const h = H(op.h);
      if (e.zone === 'overlap' || e.norm === h.norm) continue;
      const prev = ops[i - 1];
      const next = ops[i + 1];
      const free = (k: number) => !consumed.has(k);
      let pair: { other: number; words: ExpectedWord[]; heard: HeardToken[] } | undefined;
      if (isContraction(e.norm)) {
        const target = expandContraction(e.norm).join(' ');
        if (prev?.kind === 'ins' && free(i - 1) && `${H(prev.h).norm} ${h.norm}` === target) {
          pair = { other: i - 1, words: [e], heard: [H(prev.h), h] };
        } else if (next?.kind === 'ins' && free(i + 1) && `${h.norm} ${H(next.h).norm}` === target) {
          pair = { other: i + 1, words: [e], heard: [h, H(next.h)] };
        }
      }
      if (!pair && isContraction(h.norm)) {
        const target = expandContraction(h.norm).join(' ');
        if (prev?.kind === 'del' && free(i - 1) && `${E(prev.e).norm} ${e.norm}` === target) {
          pair = { other: i - 1, words: [E(prev.e), e], heard: [h] };
        } else if (next?.kind === 'del' && free(i + 1) && `${e.norm} ${E(next.e).norm}` === target) {
          pair = { other: i + 1, words: [e, E(next.e)], heard: [h] };
        }
      }
      if (pair) {
        consumed.add(i);
        consumed.add(pair.other);
        add('wrong-words', pair.words, pair.heard, e, { cap: CONTRACTION_CAP });
      }
    }
  }

  // 2. Transpositions: a skipped word that reappears as an extra word nearby, or two swapped substitutions.
  for (let a = 0; a < ops.length; a++) {
    const da = ops[a]!;
    if (consumed.has(a) || da.kind !== 'del' || E(da.e).zone === 'overlap') continue;
    for (let b = Math.max(0, a - 4); b <= Math.min(ops.length - 1, a + 4); b++) {
      const ib = ops[b]!;
      if (b === a || consumed.has(b) || ib.kind !== 'ins') continue;
      if (wordScore(H(ib.h), E(da.e)) < MATCH_THRESHOLD) continue;
      const span = ops.slice(Math.min(a, b), Math.max(a, b) + 1);
      consumed.add(a);
      consumed.add(b);
      add('transposed', span.filter(hasE).map((o) => E(o.e)), span.filter(hasH).map((o) => H(o.h)), E(da.e));
      break;
    }
  }
  for (let a = 0; a + 1 < ops.length; a++) {
    const x = ops[a]!;
    const y = ops[a + 1]!;
    if (x.kind !== 'sub' || y.kind !== 'sub' || consumed.has(a) || consumed.has(a + 1)) continue;
    if (wordScore(H(x.h), E(y.e)) >= MATCH_THRESHOLD && wordScore(H(y.h), E(x.e)) >= MATCH_THRESHOLD) {
      consumed.add(a);
      consumed.add(a + 1);
      add('transposed', [E(x.e), E(y.e)], [H(x.h), H(y.h)], E(x.e));
    }
  }

  // 3. Insertion runs: pre-roll talk, stumbles (repetition / fragment / pause-and-correct), or added words.
  for (let i = 0; i < ops.length; ) {
    if (ops[i]!.kind !== 'ins' || consumed.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && ops[j]!.kind === 'ins' && !consumed.has(j)) j++;
    for (let k = i; k < j; k++) consumed.add(k);
    const toks = ops.slice(i, j).filter(hasH).map((o) => H(o.h));
    const before = ops.slice(0, i);
    const after = ops.slice(j);
    const nextOp = ops[j];
    const nextMatch = nextOp && isMatch(nextOp) ? nextOp : undefined;
    const prevE = [...before].reverse().find(hasE);
    const nextE = after.find(hasE);
    const preRoll = !ctx.started && !before.some(isMatch);
    const nearOverlap =
      (prevE !== undefined && E(prevE.e).zone === 'overlap') || (nextE !== undefined && E(nextE.e).zone === 'overlap');
    if (preRoll || nearOverlap) {
      i = j;
      continue;
    }
    const prevNorms = [...ctx.recentMatched.map((w) => w.norm), ...before.filter(isMatch).map((o) => E(o.e).norm)].slice(-3);
    const nextNorms = after.filter(isMatch).slice(0, 3).map((o) => E(o.e).norm);
    const repetition = toks.every((t) => prevNorms.includes(t.norm) || nextNorms.includes(t.norm));
    const first = toks[0]!;
    const fragment =
      toks.length === 1 &&
      nextMatch !== undefined &&
      first.phon[0].length > 0 &&
      first.norm.length < E(nextMatch.e).norm.length &&
      E(nextMatch.e).phon[0].startsWith(first.phon[0]);
    const seq = nextMatch ? [...toks, H(nextMatch.h)] : toks;
    const paused = nextMatch !== undefined && seq.some((t, k) => k > 0 && t.start - seq[k - 1]!.end >= STUMBLE_PAUSE_SEC);
    if (repetition || fragment || paused) {
      const idx = nextMatch?.e ?? prevE?.e ?? ctx.recentMatched.at(-1)?.idx ?? 0;
      stumbles.push({ idx, heard: displayHeard(toks) });
    } else {
      const owner = prevE ? E(prevE.e) : (ctx.recentMatched.at(-1) ?? (nextE ? E(nextE.e) : undefined));
      if (owner) add('added-words', [], toks, owner, { factor: toks.length >= 4 ? 0.5 : 1 });
    }
    i = j;
  }

  // 4. Remaining blocks of substitutions and skips.
  const classifyBlock = (i: number, j: number): void => {
    const block = ops.slice(i, j);
    const subs = block
      .filter((o): o is Extract<Op, { kind: 'sub' }> => o.kind === 'sub')
      .filter((o) => E(o.e).zone === 'checked');
    for (const group of groupBy(subs, (o) => E(o.e).lineId)) {
      const similar = group.some((o) => o.score >= SIMILAR_SUB_SCORE);
      add('wrong-words', group.map((o) => E(o.e)), group.map((o) => H(o.h)), E(group[0]!.e), { factor: similar ? 0.6 : 1 });
    }
    const dels = block
      .filter((o): o is Extract<Op, { kind: 'del' }> => o.kind === 'del')
      .map((o) => E(o.e))
      .filter((w) => w.zone === 'checked');
    const whole: ExpectedWord[][] = [];
    for (const words of groupBy(dels, (w) => w.lineId)) {
      if (words.length === ctx.lineWordCount.get(words[0]!.lineId)) whole.push(words);
      else add('dropped-words', words, [], words[0]!);
    }
    if (!whole.length) return;
    const nextMatch = ops.slice(j).find(isMatch);
    const prevH = ops.slice(0, i).reverse().find(hasH);
    const prevEnd = prevH ? H(prevH.h).end : ctx.lastHeardEndBefore;
    const gap = nextMatch ? H(nextMatch.h).start - prevEnd : Infinity;
    const nextWord = nextMatch ? E(nextMatch.e) : undefined;
    const others = whole.filter((ws) => ws[0]!.characterId !== nextWord?.characterId);
    if (nextWord && gap < JUMP_GAP_SEC && others.length) {
      add('jumped-cue', others.flat(), [], nextWord);
      for (const ws of whole) if (ws[0]!.characterId === nextWord.characterId) add('dropped-line', ws, [], ws[0]!);
    } else {
      for (const ws of whole) add('dropped-line', ws, [], ws[0]!);
    }
  };

  for (let i = 0; i < ops.length; ) {
    const op = ops[i]!;
    if (consumed.has(i) || (op.kind !== 'del' && op.kind !== 'sub')) {
      i++;
      continue;
    }
    let j = i;
    while (j < ops.length && !consumed.has(j) && (ops[j]!.kind === 'del' || ops[j]!.kind === 'sub')) j++;
    classifyBlock(i, j);
    i = j;
  }

  return { notes, stumbles };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/classify.test.ts`
Expected: PASS. If a test fails, print the ops (`console.log(alignWindow(...))`) and check them against the scoring constants before changing anything. These tests define the engine's contract. If the DP genuinely picks a different but equivalent alignment (for example a tie in transposition order), assert on category and line only, not on the exact `expected`/`heard` strings, and say so in the commit message.

- [ ] **Step 6: Commit**

```bash
git add packages/align
git commit -m "feat(align): classify alignment differences into SM line-note categories"
```

---

## Task 7: Line-level finalization (paraphrase, transposition merge, lenient threshold)

**Files:**
- Create: `packages/align/src/finalize-line.ts`
- Test: `packages/align/test/finalize-line.test.ts`

**Interfaces:**
- Consumes: `BASE_CONFIDENCE`, `WORD_LEVEL_CATEGORIES` (Task 6); `displayExpected`, `displayHeard` (Task 4).
- Produces:
  - `interface LineState { lineId: string; characterId: string; words: ExpectedWord[]; resolution: Map<number, 'matched' | 'sub' | 'del'>; notes: NoteDraft[]; heard: HeardToken[] }`
  - `interface FinalizeContext { strictness: Strictness; audioQuality: number; noteMin: number; at: number }`
  - `finalizeLine(state: LineState, ctx: FinalizeContext): NoteDraft[]`

Rules:
- **Transposition merge.** An `added-words` note whose heard text equals a `dropped-words` note's expected text on the same line becomes one `transposed` note. This catches transpositions that instant patience committed in two pieces.
- **Paraphrase.** The line has at least 6 checked words; one of its first two and one of its last two words matched; fewer than half the interior words (excluding first two and last two) matched; at least 2 interior words were substituted; and the line has at least one word-level note. Then all word-level notes are replaced by one `paraphrase` note with confidence `0.85 × mean heard confidence × audioQuality`.
- **Lenient.** If the line's matched ratio is at least `lineMatchThreshold`, drop word-level and paraphrase notes. Called-for-line, dropped-line and jumped-cue notes stay.

- [ ] **Step 1: Write the failing tests**

`packages/align/test/finalize-line.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildExpected, toHeardTokens } from '../src/expected';
import { finalizeLine, type LineState } from '../src/finalize-line';
import type { NoteDraft, Strictness } from '../src/types';
import { heard } from './helpers/dsl';
import { textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const CTX = { strictness: WP, audioQuality: 1, noteMin: 0.5, at: 0 };
const words = buildExpected([{ id: 'L4', characterId: 'ALGERNON', text: textOf('L4') }], WP); // 10 words, idx 0..9

function state(res: Array<'matched' | 'sub' | 'del'>, notes: NoteDraft[], heardText = ''): LineState {
  return {
    lineId: 'L4',
    characterId: 'ALGERNON',
    words,
    resolution: new Map(res.map((r, i) => [i, r])),
    notes,
    heard: toHeardTokens(heard(heardText), WP),
  };
}

const note = (category: NoteDraft['category'], expected: string, heardText: string, confidence = 0.8): NoteDraft => ({
  lineId: 'L4',
  characterId: 'ALGERNON',
  category,
  expected,
  heard: heardText,
  confidence,
  status: confidence >= 0.5 ? 'note' : 'check',
  at: 0,
});

describe('finalizeLine', () => {
  it('turns a heavily reworded line into one paraphrase note', () => {
    const s = state(
      ['matched', 'matched', 'matched', 'sub', 'sub', 'sub', 'sub', 'sub', 'sub', 'matched'],
      [note('wrong-words', 'accurately but I play with wonderful', 'correctly though my playing has marvellous', 0.51)],
      'anyone can play correctly though my playing has marvellous expression',
    );
    expect(finalizeLine(s, CTX)).toEqual([
      {
        lineId: 'L4',
        characterId: 'ALGERNON',
        category: 'paraphrase',
        expected: 'Anyone can play accurately, but I play with wonderful expression',
        heard: 'anyone can play correctly though my playing has marvellous expression',
        confidence: 0.85,
        status: 'note',
        at: 0,
      },
    ]);
  });

  it('a single wrong word is not a paraphrase', () => {
    const n = note('wrong-words', 'but', 'and');
    const s = state(['matched', 'matched', 'matched', 'matched', 'sub', 'matched', 'matched', 'matched', 'matched', 'matched'], [n]);
    expect(finalizeLine(s, CTX)).toEqual([n]);
  });

  it('dropped interior words are not a paraphrase', () => {
    const n = note('dropped-words', 'accurately but I play with', '');
    const s = state(['matched', 'matched', 'matched', 'del', 'del', 'del', 'del', 'del', 'matched', 'matched'], [n]);
    expect(finalizeLine(s, CTX)).toEqual([n]);
  });

  it('short lines are never paraphrases', () => {
    const short = buildExpected([{ id: 'S', characterId: 'X', text: 'one two three four five' }], WP);
    const n = note('wrong-words', 'two three four', 'a b c');
    const s: LineState = {
      lineId: 'S',
      characterId: 'X',
      words: short,
      resolution: new Map([[0, 'matched'], [1, 'sub'], [2, 'sub'], [3, 'sub'], [4, 'matched']]),
      notes: [n],
      heard: [],
    };
    expect(finalizeLine(s, CTX)).toEqual([n]);
  });

  it('merges an added and a dropped copy of the same word into a transposition', () => {
    const s = state(
      ['matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'matched', 'del'],
      [note('added-words', '', 'expression', 0.75), note('dropped-words', 'expression', '', 0.8)],
    );
    expect(finalizeLine(s, CTX)).toEqual([
      expect.objectContaining({ category: 'transposed', expected: 'expression', heard: 'expression', confidence: 0.8, status: 'note' }),
    ]);
  });

  it('lenient mode forgives a mostly-right line but keeps called-for-line', () => {
    const lenient = { ...CTX, strictness: { mode: 'lenient', lineMatchThreshold: 0.8 } as Strictness };
    const called = note('called-for-line', 'I play with wonderful expression', 'line', 0.9);
    const s = state(
      ['matched', 'matched', 'matched', 'matched', 'sub', 'matched', 'matched', 'matched', 'matched', 'matched'],
      [note('wrong-words', 'but', 'and'), called],
    );
    expect(finalizeLine(s, lenient)).toEqual([called]);
  });

  it('lenient mode keeps notes on lines below the threshold', () => {
    const lenient = { ...CTX, strictness: { mode: 'lenient', lineMatchThreshold: 0.95 } as Strictness };
    const n = note('wrong-words', 'but', 'and');
    const s = state(['matched', 'matched', 'matched', 'matched', 'sub', 'matched', 'matched', 'matched', 'matched', 'matched'], [n]);
    expect(finalizeLine(s, lenient)).toEqual([n]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/finalize-line.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/align/src/finalize-line.ts`:
```ts
import { BASE_CONFIDENCE, WORD_LEVEL_CATEGORIES } from './classify';
import { displayExpected, displayHeard } from './expected';
import type { ExpectedWord, HeardToken, NoteDraft, Strictness } from './types';

export interface LineState {
  lineId: string;
  characterId: string;
  words: ExpectedWord[];
  resolution: Map<number, 'matched' | 'sub' | 'del'>;
  notes: NoteDraft[];
  heard: HeardToken[];
}

export interface FinalizeContext {
  strictness: Strictness;
  audioQuality: number;
  noteMin: number;
  at: number;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function mergeTranspositions(input: NoteDraft[], noteMin: number): NoteDraft[] {
  const notes = [...input];
  for (let a = 0; a < notes.length; a++) {
    const added = notes[a]!;
    if (added.category !== 'added-words') continue;
    const b = notes.findIndex(
      (n) => n.category === 'dropped-words' && n.expected.toLowerCase() === added.heard.toLowerCase(),
    );
    if (b < 0) continue;
    const dropped = notes[b]!;
    const confidence = Math.max(added.confidence, dropped.confidence);
    const merged: NoteDraft = {
      ...dropped,
      category: 'transposed',
      heard: added.heard,
      confidence,
      status: confidence >= noteMin ? 'note' : 'check',
    };
    notes.splice(Math.max(a, b), 1);
    notes.splice(Math.min(a, b), 1, merged);
    a = -1;
  }
  return notes;
}

export function finalizeLine(state: LineState, ctx: FinalizeContext): NoteDraft[] {
  let notes = mergeTranspositions(state.notes, ctx.noteMin);
  const checked = state.words.filter((w) => w.zone === 'checked');
  const res = (w: ExpectedWord) => state.resolution.get(w.idx);

  if (checked.length >= 6) {
    const interior = checked.slice(2, -2);
    const matchedRatio = interior.filter((w) => res(w) === 'matched').length / interior.length;
    const subs = interior.filter((w) => res(w) === 'sub').length;
    const head = checked.slice(0, 2).some((w) => res(w) === 'matched');
    const tail = checked.slice(-2).some((w) => res(w) === 'matched');
    const hasWordNotes = notes.some((n) => WORD_LEVEL_CATEGORIES.has(n.category));
    if (head && tail && matchedRatio < 0.5 && subs >= 2 && hasWordNotes) {
      const meanConf = state.heard.length
        ? state.heard.reduce((s, t) => s + t.confidence, 0) / state.heard.length
        : 1;
      const confidence = round3(BASE_CONFIDENCE.paraphrase * meanConf * ctx.audioQuality);
      notes = [
        ...notes.filter((n) => !WORD_LEVEL_CATEGORIES.has(n.category)),
        {
          lineId: state.lineId,
          characterId: state.characterId,
          category: 'paraphrase',
          expected: displayExpected(state.words),
          heard: displayHeard(state.heard),
          confidence,
          status: confidence >= ctx.noteMin ? 'note' : 'check',
          at: ctx.at,
        },
      ];
    }
  }

  if (ctx.strictness.mode === 'lenient' && checked.length) {
    const ratio = checked.filter((w) => res(w) === 'matched').length / checked.length;
    if (ratio >= ctx.strictness.lineMatchThreshold) {
      notes = notes.filter((n) => !WORD_LEVEL_CATEGORIES.has(n.category) && n.category !== 'paraphrase');
    }
  }
  return notes;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/finalize-line.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/align
git commit -m "feat(align): line-level paraphrase, transposition merge, lenient filtering"
```

---

## Task 8: Re-anchoring index

**Files:**
- Create: `packages/align/src/trigram-index.ts`
- Test: `packages/align/test/trigram-index.test.ts`

**Interfaces:**
- Consumes: `wordScore` (Task 3); types.
- Produces: `class TrigramIndex { constructor(expected: ExpectedWord[]); find(tokens: HeardToken[], cursor: number, matchThreshold: number): number[] }`. It uses the last 3 tokens and returns the start indices of matching 3-word sequences. They are sorted nearest-first: forward distance counts as-is, backward distance is weighted ×1.5.

- [ ] **Step 1: Write the failing tests**

`packages/align/test/trigram-index.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildExpected, toHeardTokens } from '../src/expected';
import { MATCH_THRESHOLD } from '../src/phonetic';
import { TrigramIndex } from '../src/trigram-index';
import type { Strictness } from '../src/types';
import { heard } from './helpers/dsl';

const WP: Strictness = { mode: 'word-perfect' };
// to0 be1 or2 not3 to4 be5 that6 is7 the8 question9 to10 be11 or12 not13
const expected = buildExpected(
  [{ id: 'A', characterId: 'X', text: 'To be or not to be that is the question to be or not' }],
  WP,
);
const index = new TrigramIndex(expected);
const toks = (t: string) => toHeardTokens(heard(t), WP);

describe('TrigramIndex', () => {
  it('finds every occurrence, nearest forward first', () => {
    expect(index.find(toks('to be or'), 0, MATCH_THRESHOLD)).toEqual([0, 10]);
  });
  it('repeated phrases: prefers the nearest occurrence, forward-biased', () => {
    expect(index.find(toks('to be or'), 5, MATCH_THRESHOLD)).toEqual([10, 0]);
  });
  it('can find a phrase behind the cursor', () => {
    expect(index.find(toks('or not to'), 12, MATCH_THRESHOLD)).toEqual([2]);
  });
  it('uses only the last three tokens', () => {
    expect(index.find(toks('zebra be or not'), 0, MATCH_THRESHOLD)).toEqual([1, 11]);
  });
  it('needs three tokens', () => {
    expect(index.find(toks('be or'), 0, MATCH_THRESHOLD)).toEqual([]);
  });
  it('returns nothing for an unknown phrase', () => {
    expect(index.find(toks('the question mark'), 0, MATCH_THRESHOLD)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/trigram-index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/align/src/trigram-index.ts`:
```ts
import { wordScore } from './phonetic';
import type { ExpectedWord, HeardToken } from './types';

const keyOf = (phons: string[]) => phons.join('|');

export class TrigramIndex {
  private readonly map = new Map<string, number[]>();

  constructor(private readonly expected: ExpectedWord[]) {
    for (let i = 0; i + 2 < expected.length; i++) {
      const key = keyOf(expected.slice(i, i + 3).map((w) => w.phon[0]));
      const list = this.map.get(key);
      if (list) list.push(i);
      else this.map.set(key, [i]);
    }
  }

  find(tokens: HeardToken[], cursor: number, matchThreshold: number): number[] {
    if (tokens.length < 3) return [];
    const last = tokens.slice(-3);
    const rank = (c: number) => (c >= cursor ? c - cursor : (cursor - c) * 1.5);
    return (this.map.get(keyOf(last.map((t) => t.phon[0]))) ?? [])
      .filter((c) => last.every((t, k) => wordScore(t, this.expected[c + k]!) >= matchThreshold))
      .sort((a, b) => rank(a) - rank(b));
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/trigram-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/align
git commit -m "feat(align): trigram index for re-anchoring after the speaker jumps"
```

---
## Task 9: The aligner state machine

**Files:**
- Create: `packages/align/src/aligner.ts`
- Modify: `packages/align/src/index.ts` (public exports)
- Modify: `packages/align/test/helpers/dsl.ts` (add `runScenario`)
- Test: `packages/align/test/aligner.test.ts`
- Modify: `docs/superpowers/specs/2026-10-10-dasma-design.md` §4.2 (interface refinements)

**Interfaces:**
- Consumes: everything from Tasks 2–8 (`alignWindow`, `hasE`, `hasH`, `isMatch`, `Op`, `commitPoint`, `commitPointOnTimeout`, `classifyOps`, `finalizeLine`, `LineState`, `TrigramIndex`, `buildExpected`, `toHeardTokens`, `countCheckedWords`, `displayExpected`, `MATCH_THRESHOLD`, types).
- Produces:
  ```ts
  interface Aligner {
    readonly cursor: number;
    push(words: HeardWord[]): void;      // only final words are used; ignored while paused
    tick(now: number): void;             // grace-window timeout
    finalize(now: number): void;         // end of run: commit what's pending, notRun the rest, final lineDone events
    jumpTo(idx: number): void;           // director's manual jump (no notes for skipped text)
    pause(): void; resume(): void;       // while cues / alert sounds play
    setAudioQuality(q: number): void;    // 0..1, scales confidence
    lookahead(): ExpectedWord[];         // next windowSize words (for recognizer hotwords)
    onEvent(cb: (e: AlignEvent) => void): () => void;
  }
  createAligner(expected: ExpectedWord[], options: AlignOptions): Aligner
  patienceToGrace(patience: number): { confirmWords: number; timeoutSec: number }
  ```
  Test helper: `runScenario(lines, words, opts?) → { expected, aligner, events, lineNotes, flags, types }`.

**Behaviour summary** (spec §7.2):
1. Each settled heard token joins the buffer `H`. `H` is aligned against the next `windowSize` expected words. Ops commit per `commitPoint` (Task 5), and committed ops are classified (Task 6).
2. `tick(now)`: if `now − lastHeardEnd ≥ T`, commit using `commitPointOnTimeout`.
3. **Line completion:** a line emits `lineDone` (with `finalizeLine` notes) once the cursor is at least 2 past its last word. Extra words spoken at the end of a line therefore still attach to it. Remaining lines complete in `finalize`.
4. **Lost:** when `H` has ≥ `lostAfter` tokens (doubled in overlap zones) and fewer than 2 of them match, emit `lost` and search the `TrigramIndex` on every new token. The first match re-anchors:
   - forward after a short loss (< `longLossSec`): the skipped words plus the heard words are classified as a normal alignment (giving dropped line / jumped cue / paraphrase);
   - forward after a long loss: `notRun`, no notes;
   - backward: treated as a restart, so line state from that point is reset;
   - same place: resume.
5. **"Line!"**: the token `line` after ≥ 1 s of silence, when `line` isn't among the next 4 expected words, produces `calledForLine` plus a `called-for-line` note (never alerts). A following `please` is ignored.
6. Insertions before anything has matched (`started === false`) are pre-roll talk and are ignored.

- [ ] **Step 1: Extend the test DSL with `runScenario`**

Replace `packages/align/test/helpers/dsl.ts` with the full file below. `heard()` is unchanged; `runScenario` is new.
```ts
import { createAligner } from '../../src/aligner';
import { buildExpected } from '../../src/expected';
import {
  DEFAULT_ALIGN_OPTIONS,
  type AlignEvent,
  type AlignOptions,
  type HeardWord,
  type ScriptLineInput,
} from '../../src/types';

export interface HeardOptions {
  start?: number;
  wordDur?: number;
  gap?: number;
  confidence?: number;
}

/** Build recognizer-style words. Pause markers: "|" = 1 s, "||" = 3 s, "|||" = 12 s. */
export function heard(text: string, opts: HeardOptions = {}): HeardWord[] {
  const wordDur = opts.wordDur ?? 0.3;
  const gap = opts.gap ?? 0.05;
  const confidence = opts.confidence ?? 1;
  let t = opts.start ?? 0;
  const out: HeardWord[] = [];
  for (const piece of text.split(/\s+/).filter(Boolean)) {
    if (/^\|+$/.test(piece)) {
      t += piece.length === 1 ? 1 : piece.length === 2 ? 3 : 12;
      continue;
    }
    out.push({ text: piece.replace(/[.,;:!?]+$/, ''), start: t, end: t + wordDur, confidence, final: true });
    t += wordDur + gap;
  }
  return out;
}

/** Feed words one at a time (ticking after each), then flush and finalize. */
export function runScenario(lines: ScriptLineInput[], words: HeardWord[], opts: Partial<AlignOptions> = {}) {
  const options: AlignOptions = { ...DEFAULT_ALIGN_OPTIONS, ...opts };
  const expected = buildExpected(lines, options.strictness);
  const aligner = createAligner(expected, options);
  const events: AlignEvent[] = [];
  aligner.onEvent((e) => events.push(e));
  for (const w of words) {
    aligner.push([w]);
    aligner.tick(w.end);
  }
  const end = (words.at(-1)?.end ?? 0) + 10;
  aligner.tick(end);
  aligner.finalize(end);
  return {
    expected,
    aligner,
    events,
    lineNotes: events.flatMap((e) => (e.type === 'lineDone' ? e.notes : [])),
    flags: events.flatMap((e) => (e.type === 'flag' ? [e] : [])),
    types: events.map((e) => e.type),
  };
}
```

- [ ] **Step 2: Write the failing scenario tests**

`packages/align/test/aligner.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createAligner, patienceToGrace } from '../src/aligner';
import { buildExpected } from '../src/expected';
import { DEFAULT_ALIGN_OPTIONS, type AlignEvent, type ScriptLineInput, type Strictness } from '../src/types';
import { heard, runScenario } from './helpers/dsl';
import { EARNEST, textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const P0 = { patience: 0 };
const perf = (...ids: string[]) => ids.map((id) => textOf(id)).join(' ');
const WITH_FEELING = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with wonderful feeling.', perf('L5')].join(' ');
// Word indices in EARNEST: L1 0–7, L2 8–15, L3 16–26, L4 27–36, L5 37–38.

describe('patienceToGrace', () => {
  it('maps the slider to confirmation words and timeout', () => {
    expect(patienceToGrace(0)).toEqual({ confirmWords: 1, timeoutSec: 0.4 });
    const mid = patienceToGrace(0.5);
    expect(mid.confirmWords).toBe(3);
    expect(mid.timeoutSec).toBeCloseTo(1.7);
    expect(patienceToGrace(1)).toEqual({ confirmWords: 4, timeoutSec: 3 });
    expect(patienceToGrace(7)).toEqual({ confirmWords: 4, timeoutSec: 3 });
  });
});

describe('aligner: clean runs', () => {
  it.each([0, 0.5, 1])('a perfect run produces no notes and completes every line (patience %s)', (patience) => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L3', 'L4', 'L5')), { patience });
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.events.flatMap((e) => (e.type === 'lineDone' ? [e.lineId] : []))).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(r.types).not.toContain('lost');
  });

  it('ignores fillers', () => {
    const text = ['Did you um hear what I was uh playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ');
    expect(runScenario(EARNEST, heard(text), P0).lineNotes).toEqual([]);
  });

  it('accepts homophones', () => {
    const KNIGHT: ScriptLineInput[] = [{ id: 'K1', characterId: 'NARRATOR', text: 'The knight rode out into the night.' }];
    expect(runScenario(KNIGHT, heard('the night rode out into the knight'), P0).lineNotes).toEqual([]);
  });

  it('pre-roll chatter: talk before the first line produces no notes', () => {
    expect(runScenario(EARNEST, heard(`Okay are we starting now | ${perf('L1', 'L2', 'L3', 'L4', 'L5')}`), P0).lineNotes).toEqual([]);
  });

  it('empty script: nothing to align, nothing breaks', () => {
    const r = runScenario(EARNEST.map((l) => ({ ...l, cut: true })), heard(perf('L1')));
    expect(r.events).toEqual([]);
  });

  it('cut lines are never expected', () => {
    const lines = EARNEST.map((l) => (l.id === 'L3' ? { ...l, cut: true } : l));
    expect(runScenario(lines, heard(perf('L1', 'L2', 'L4', 'L5')), P0).lineNotes).toEqual([]);
  });

  it('overlap zones are not checked', () => {
    const lines = EARNEST.map((l) => (l.id === 'L2' ? { ...l, overlapRanges: [[4, 8]] as Array<[number, number]> } : l));
    const text = [perf('L1'), "I didn't think it rather mumbled noise here", perf('L3', 'L4', 'L5')].join(' ');
    expect(runScenario(lines, heard(text), P0).lineNotes).toEqual([]);
  });
});

describe('aligner: line errors', () => {
  it.each([0, 0.5, 1])('wrong word (patience %s)', (patience) => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), { patience });
    expect(r.lineNotes).toEqual([
      expect.objectContaining({ lineId: 'L4', category: 'wrong-words', expected: 'expression', heard: 'feeling', status: 'note' }),
    ]);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]!.alert).toBe(true);
  });

  it('dropped words', () => {
    const r = runScenario(EARNEST, heard([perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toHaveLength(1);
    expect(r.lineNotes[0]).toMatchObject({ lineId: 'L3', category: 'dropped-words' });
    expect(r.lineNotes[0]!.expected).toContain('your sake');
  });

  it('dropped line', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L4', 'L5')), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L3', characterId: 'ALGERNON', category: 'dropped-line' })]);
  });

  it('jumped cue', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L3', 'L4', 'L5')), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L3', characterId: 'ALGERNON', category: 'jumped-cue' })]);
  });

  it('a dried actor (long silence) gets a dropped line, not a jumped cue', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1')} || ${perf('L3', 'L4', 'L5')}`), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L2', characterId: 'LANE', category: 'dropped-line' })]);
  });

  it('added words at the end of a line', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1', 'L2', 'L3', 'L4')} Yes, sir, of course.`), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'added-words', heard: 'of course' })]);
  });

  it.each([0, 0.5])('transposed words (patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with expression wonderful.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L4', category: 'transposed', status: 'note' })]);
  });

  it.each([0, 0.5])('paraphrase (patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play correctly, though my playing has marvellous expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L4', category: 'paraphrase', status: 'note' })]);
  });

  it('contractions are "check" in word-perfect and forgiven in lenient', () => {
    const text = [perf('L1', 'L2'), "I am sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' ');
    expect(runScenario(EARNEST, heard(text), P0).lineNotes).toEqual([
      expect.objectContaining({ lineId: 'L3', category: 'wrong-words', status: 'check' }),
    ]);
    expect(runScenario(EARNEST, heard(text), { ...P0, strictness: { mode: 'lenient', lineMatchThreshold: 0.8 } }).lineNotes).toEqual([]);
  });

  it('repeated words: one dropped repetition is exactly one dropped-words note', () => {
    const WELL: ScriptLineInput[] = [
      { id: 'W1', characterId: 'HAMLET', text: 'I humbly thank you; well, well, well.' },
      { id: 'W2', characterId: 'OPHELIA', text: 'My lord, I have remembrances of yours.' },
    ];
    const r = runScenario(WELL, heard('I humbly thank you, well, well. My lord, I have remembrances of yours.'), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'W1', category: 'dropped-words', expected: 'well' })]);
  });
});

describe('aligner: stumbles, calls, chatter, restarts', () => {
  it('pause-and-correct is a stumble, not a note', () => {
    const r = runScenario(EARNEST, heard(['Did you hear what you | I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('stumble');
  });

  it('repetition is a stumble, not a note', () => {
    const r = runScenario(EARNEST, heard(['Did you hear did you hear what I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('stumble');
  });

  it('called for line', () => {
    const text = [perf('L1', 'L2'), "I'm sorry for that, for your sake. || Line! | I don't play accurately.", perf('L4', 'L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L3', category: 'called-for-line', status: 'note' })]);
    expect(r.types).toContain('calledForLine');
    expect(r.flags.every((f) => !f.alert)).toBe(true);
  });

  it('long off-script talk then a jump: skipped text is "not run", with no notes', () => {
    const text = `${perf('L1', 'L2')} Okay everybody hold on let me fix this chair ||| ${perf('L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('lost');
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'notRun', fromIdx: 16, toIdx: 27 }));
  });

  it('going back to an earlier line is a restart, not an error', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L3', 'L1', 'L2')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('reanchored');
  });
});

describe('aligner: controls', () => {
  const setup = () => {
    const expected = buildExpected(EARNEST, WP);
    const aligner = createAligner(expected, { ...DEFAULT_ALIGN_OPTIONS, patience: 0 });
    const events: AlignEvent[] = [];
    aligner.onEvent((e) => events.push(e));
    return { expected, aligner, events };
  };

  it('jumpTo skips ahead without notes', () => {
    const { expected, aligner, events } = setup();
    const l4 = expected.findIndex((w) => w.lineId === 'L4');
    aligner.push(heard(perf('L1')));
    aligner.jumpTo(l4);
    aligner.push(heard(perf('L4', 'L5'), { start: 10 }));
    aligner.finalize(30);
    expect(events.flatMap((e) => (e.type === 'lineDone' ? e.notes : []))).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'notRun', fromIdx: 8, toIdx: l4 }));
    expect(aligner.cursor).toBe(expected.length);
  });

  it('ignores words while paused', () => {
    const { aligner, events } = setup();
    const words = heard(perf('L1', 'L2', 'L3'));
    aligner.push(words.slice(0, 8));
    aligner.pause();
    aligner.push(words.slice(8, 16));
    aligner.resume();
    aligner.push(words.slice(16));
    aligner.finalize(60);
    const matched = events.flatMap((e) => (e.type === 'matched' ? [e.idx] : []));
    expect(matched.some((i) => i >= 8 && i < 16)).toBe(false);
    expect(matched).toContain(16);
  });

  it('instant patience flags a wrong word as soon as the next word confirms it', () => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), { patience: 0 });
    const flagAt = r.events.findIndex((e) => e.type === 'flag');
    const sirMatchedAt = r.events.findIndex((e) => e.type === 'matched' && e.idx === 38);
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(sirMatchedAt);
  });

  it('relaxed patience shows a suspect before confirming', () => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), { patience: 1 });
    expect(r.types.indexOf('suspect')).toBeGreaterThan(-1);
    expect(r.types.indexOf('suspect')).toBeLessThan(r.types.indexOf('flag'));
  });

  it('exposes the look-ahead window for recognizer hotwords', () => {
    const { aligner } = setup();
    expect(aligner.lookahead().map((w) => w.norm).slice(0, 3)).toEqual(['did', 'you', 'hear']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/align/test/aligner.test.ts`
Expected: FAIL — module `../src/aligner` not found.

- [ ] **Step 4: Implement the aligner**

`packages/align/src/aligner.ts`:
```ts
import { classifyOps } from './classify';
import { commitPoint, commitPointOnTimeout } from './commit';
import { countCheckedWords, displayExpected, toHeardTokens } from './expected';
import { finalizeLine, type LineState } from './finalize-line';
import { MATCH_THRESHOLD } from './phonetic';
import { TrigramIndex } from './trigram-index';
import type { AlignEvent, AlignOptions, ExpectedWord, HeardToken, HeardWord, NoteDraft } from './types';
import { alignWindow, hasE, hasH, isMatch, type Op } from './window-align';

export interface Aligner {
  readonly cursor: number;
  push(words: HeardWord[]): void;
  tick(now: number): void;
  finalize(now: number): void;
  jumpTo(idx: number): void;
  pause(): void;
  resume(): void;
  setAudioQuality(q: number): void;
  lookahead(): ExpectedWord[];
  onEvent(cb: (e: AlignEvent) => void): () => void;
}

const LOST_BUFFER = 12;
const LINE_CALL_GAP_SEC = 1;

export function patienceToGrace(patience: number): { confirmWords: number; timeoutSec: number } {
  const p = Math.min(1, Math.max(0, patience));
  return { confirmWords: 1 + Math.round(3 * p), timeoutSec: 0.4 + 2.6 * p };
}

export function createAligner(expected: ExpectedWord[], options: AlignOptions): Aligner {
  const { confirmWords, timeoutSec } = patienceToGrace(options.patience);
  const index = new TrigramIndex(expected);
  const lineWordCount = countCheckedWords(expected);
  const lines = new Map<string, LineState>();
  const lineOrder: string[] = [];
  const lineFirst = new Map<string, number>();
  const lineLast = new Map<string, number>();
  for (const w of expected) {
    let st = lines.get(w.lineId);
    if (!st) {
      st = { lineId: w.lineId, characterId: w.characterId, words: [], resolution: new Map(), notes: [], heard: [] };
      lines.set(w.lineId, st);
      lineOrder.push(w.lineId);
      lineFirst.set(w.lineId, w.idx);
    }
    st.words.push(w);
    lineLast.set(w.lineId, w.idx);
  }

  const listeners = new Set<(e: AlignEvent) => void>();
  const done = new Set<string>();
  const suspected = new Set<number>();
  let cursor = 0;
  let H: HeardToken[] = [];
  let lost = false;
  let lostSince = 0;
  let paused = false;
  let started = false;
  let skipPlease = false;
  let audioQuality = 1;
  let lastHeardEnd = -Infinity;
  let lastCommittedHeardEnd = -Infinity;
  let recentMatched: ExpectedWord[] = [];

  const emit = (e: AlignEvent) => {
    for (const l of listeners) l(e);
  };
  const windowAt = () => expected.slice(cursor, cursor + options.windowSize);

  function emitLineDone(id: string, at: number): void {
    done.add(id);
    const notes = finalizeLine(lines.get(id)!, {
      strictness: options.strictness,
      audioQuality,
      noteMin: options.noteMinConfidence,
      at,
    });
    emit({ type: 'lineDone', lineId: id, notes, at });
  }

  function checkLinesDone(at: number, final: boolean): void {
    for (const id of lineOrder) {
      if (done.has(id)) continue;
      const st = lines.get(id)!;
      const reached = final ? st.resolution.size > 0 || st.notes.length > 0 : cursor >= lineLast.get(id)! + 2;
      if (reached) emitLineDone(id, at);
    }
  }

  function markSkipped(from: number, to: number): void {
    for (const id of lineOrder) if (lineFirst.get(id)! >= from && lineLast.get(id)! < to) done.add(id);
  }

  function resetFrom(idx: number): void {
    for (const id of lineOrder) {
      if (lineLast.get(id)! < idx) continue;
      const st = lines.get(id)!;
      st.resolution.clear();
      st.notes = [];
      st.heard = [];
      done.delete(id);
    }
    recentMatched = [];
  }

  function commit(ops: Op[], at: number): void {
    if (!ops.length) return;
    const abs: Op[] = ops.map((o) => (hasE(o) ? { ...o, e: o.e + cursor } : o));
    const { notes, stumbles } = classifyOps(abs, {
      expected,
      heard: H,
      recentMatched,
      lastHeardEndBefore: lastCommittedHeardEnd,
      strictness: options.strictness,
      audioQuality,
      lineWordCount,
      noteMin: options.noteMinConfidence,
      at,
      started,
    });
    let attach = recentMatched.at(-1)?.lineId ?? expected[cursor]?.lineId;
    let maxE = cursor - 1;
    let maxH = -1;
    for (const op of abs) {
      if (hasE(op)) {
        const w = expected[op.e]!;
        const st = lines.get(w.lineId)!;
        attach = w.lineId;
        maxE = Math.max(maxE, op.e);
        if (op.kind === 'match') {
          st.resolution.set(op.e, 'matched');
          recentMatched = [...recentMatched, w].slice(-3);
          started = true;
          emit({ type: 'matched', idx: op.e, at });
        } else {
          st.resolution.set(op.e, op.kind);
        }
      }
      if (hasH(op)) {
        maxH = Math.max(maxH, op.h);
        if (attach) lines.get(attach)?.heard.push(H[op.h]!);
      }
    }
    for (const note of notes) {
      lines.get(note.lineId)?.notes.push(note);
      emit({ type: 'flag', note, alert: note.status === 'note' && note.confidence >= options.alertMinConfidence, at });
    }
    for (const s of stumbles) emit({ type: 'stumble', idx: s.idx, heard: s.heard, at });
    if (maxH >= 0) {
      lastCommittedHeardEnd = H[maxH]!.end;
      H = H.slice(maxH + 1);
    }
    cursor = Math.max(cursor, maxE + 1);
    for (const i of [...suspected]) if (i < cursor) suspected.delete(i);
    checkLinesDone(at, false);
  }

  function step(at: number, timeout: boolean): void {
    const ops = alignWindow(H, windowAt());
    const end = timeout ? commitPointOnTimeout(ops) : commitPoint(ops, confirmWords);
    if (end >= 0) commit(ops.slice(0, end + 1), at);
    if (!H.length || lost) return;
    const rest = alignWindow(H, windowAt());
    const fresh = rest
      .filter(hasE)
      .filter((o) => o.kind !== 'match')
      .map((o) => o.e + cursor)
      .filter((i) => !suspected.has(i));
    if (fresh.length) {
      for (const i of fresh) suspected.add(i);
      emit({ type: 'suspect', idxs: fresh, at });
    }
    const limit = expected[cursor]?.zone === 'overlap' ? options.lostAfter * 2 : options.lostAfter;
    if (H.length >= limit && rest.filter(isMatch).length < 2) enterLost(at);
  }

  function enterLost(at: number): void {
    lost = true;
    lostSince = H[0]?.start ?? at;
    suspected.clear();
    emit({ type: 'lost', guesses: index.find(H, cursor, MATCH_THRESHOLD).slice(0, 3), at });
    tryReanchor(at);
  }

  function tryReanchor(at: number): void {
    const c = index.find(H, cursor, MATCH_THRESHOLD)[0];
    if (c === undefined) return;
    const anchor = H.slice(-3);
    const before = H.slice(0, -3);
    const lostFor = anchor[0]!.start - lostSince;
    lost = false;
    emit({ type: 'reanchored', fromIdx: cursor, toIdx: c + 3, lostFor, at });
    const anchorOps = (eOffset: number, hOffset: number): Op[] =>
      anchor.map((_, k) => ({ kind: 'match' as const, h: hOffset + k, e: eOffset + k, score: 1 }));
    if (c > cursor && lostFor < options.longLossSec) {
      const gapOps = alignWindow(before, expected.slice(cursor, c), { global: true });
      commit([...gapOps, ...anchorOps(c - cursor, before.length)], at);
      return;
    }
    if (c > cursor) {
      emit({ type: 'notRun', fromIdx: cursor, toIdx: c, at });
      markSkipped(cursor, c);
    } else if (c < cursor) {
      resetFrom(c);
    }
    cursor = c;
    H = anchor;
    commit(anchorOps(0, 0), at);
  }

  function calledForLine(tok: HeardToken): void {
    skipPlease = true;
    const idx = Math.min(cursor, expected.length - 1);
    const w = expected[idx]!;
    const confidence = Math.round(0.9 * audioQuality * 1000) / 1000;
    const note: NoteDraft = {
      lineId: w.lineId,
      characterId: w.characterId,
      category: 'called-for-line',
      expected: displayExpected(expected.slice(idx, idx + 8)),
      heard: 'line',
      confidence,
      status: confidence >= options.noteMinConfidence ? 'note' : 'check',
      at: tok.end,
    };
    lines.get(w.lineId)!.notes.push(note);
    emit({ type: 'calledForLine', idx, at: tok.end });
    emit({ type: 'flag', note, alert: false, at: tok.end });
  }

  function handleToken(tok: HeardToken): void {
    const gap = tok.start - lastHeardEnd;
    lastHeardEnd = tok.end;
    if (skipPlease) {
      skipPlease = false;
      if (tok.norm === 'please') return;
    }
    if (
      tok.norm === 'line' &&
      gap >= LINE_CALL_GAP_SEC &&
      !expected.slice(cursor, cursor + 4).some((w) => w.norm === 'line')
    ) {
      calledForLine(tok);
      return;
    }
    H.push(tok);
    if (lost) {
      if (H.length > LOST_BUFFER) H.shift();
      tryReanchor(tok.end);
      return;
    }
    step(tok.end, false);
  }

  return {
    get cursor() {
      return cursor;
    },
    push(words) {
      if (!expected.length) return;
      for (const w of words) {
        if (!w.final || paused) continue;
        for (const tok of toHeardTokens([w], options.strictness)) handleToken(tok);
      }
    },
    tick(now) {
      if (!expected.length || paused || lost || !H.length) return;
      if (now - lastHeardEnd >= timeoutSec) step(now, true);
    },
    finalize(now) {
      if (!expected.length) return;
      if (!lost && H.length) step(now, true);
      lost = false;
      H = [];
      if (cursor < expected.length) emit({ type: 'notRun', fromIdx: cursor, toIdx: expected.length, at: now });
      checkLinesDone(now, true);
    },
    jumpTo(idx) {
      if (!expected.length) return;
      const target = Math.max(0, Math.min(expected.length, Math.floor(idx)));
      const at = Number.isFinite(lastHeardEnd) ? lastHeardEnd : 0;
      if (target > cursor) {
        emit({ type: 'notRun', fromIdx: cursor, toIdx: target, at });
        markSkipped(cursor, target);
      } else if (target < cursor) {
        resetFrom(target);
      }
      cursor = target;
      H = [];
      lost = false;
      started = false;
      recentMatched = [];
      suspected.clear();
      checkLinesDone(at, false);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    setAudioQuality(q) {
      audioQuality = Math.min(1, Math.max(0, q));
    },
    lookahead() {
      return windowAt();
    },
    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/align/test/aligner.test.ts`
Expected: PASS.
If a scenario fails, use superpowers:systematic-debugging. Log the events (`console.log(JSON.stringify(r.events, null, 1))`), find the first divergent commit, and fix the engine. Don't weaken the assertion: these scenarios are the spec's §7 contract. The one permitted test change: where two alignments score exactly equal, assert on category and line instead of exact strings.

- [ ] **Step 6: Export the public API**

Replace `packages/align/src/index.ts` with:
```ts
export const VERSION = '0.0.0';
export * from './types';
export { numberToWords } from './numbers';
export { FILLERS, FUNCTION_WORDS, expandContraction, isContraction, normalizeToken, tokenize } from './normalize';
export { MATCH_THRESHOLD, phoneticKey, wordScore } from './phonetic';
export { buildExpected, countCheckedWords, displayExpected, displayHeard, toHeardTokens } from './expected';
export { DEFAULT_ALIGN_PARAMS, alignWindow, hasE, hasH, isMatch } from './window-align';
export type { AlignParams, Op } from './window-align';
export { commitPoint, commitPointOnTimeout } from './commit';
export { BASE_CONFIDENCE, CONTRACTION_CAP, WORD_LEVEL_CATEGORIES, classifyOps, makeNote } from './classify';
export type { ClassifyContext, Classified } from './classify';
export { finalizeLine } from './finalize-line';
export type { FinalizeContext, LineState } from './finalize-line';
export { TrigramIndex } from './trigram-index';
export { createAligner, patienceToGrace } from './aligner';
export type { Aligner } from './aligner';
```

- [ ] **Step 7: Run the whole align suite, lint, and typecheck**

Run:
```bash
npx vitest run packages/align
npm run lint
npm run typecheck
```
Expected: all pass. Lint must report no boundary violations in `packages/align/src`.

- [ ] **Step 8: Update the spec's interface block to match**

In `docs/superpowers/specs/2026-10-10-dasma-design.md` §4.2, make these edits:
- In the `AlignEvent` union, replace the `flag`, `notRun` and `lineDone` members with:
  ```ts
  | { type: 'flag'; note: NoteDraft; alert: boolean; at: number }
  | { type: 'notRun'; fromIdx: number; toIdx: number; at: number }
  | { type: 'lineDone'; lineId: string; notes: NoteDraft[]; at: number };
  ```
- In `interface Aligner`, add:
  ```ts
  readonly cursor: number;
  finalize(now: number): void;          // end of run
  setAudioQuality(q: number): void;     // 0..1
  ```
  and change `onEvent` to return an unsubscribe function `() => void`.
- In `interface Recognizer`, replace `accept(pcm16k: Float32Array, t0: number): void;` with
  ```ts
  accept(samples: Float32Array, sampleRate: number): void; // recognizer keeps its own run clock
  flush(): void;   // end of input
  reset(): void;   // new run
  dispose(): void;
  readonly supportsHotwords: boolean;
  ```
  and change `onWords` to return `() => void`.
- Under risk R2 in §12, append: "Verified 2026-10-10: the Node binding has no per-stream hotwords; the engine does not depend on them."

- [ ] **Step 9: Commit**

```bash
git add packages/align docs/superpowers/specs/2026-10-10-dasma-design.md
git commit -m "feat(align): aligner state machine with grace window, re-anchoring, line calls; sync spec interfaces"
```

---

## Task 10: False-alarm budget under simulated recognizer noise (property tests)

**Files:**
- Create: `packages/align/test/helpers/rng.ts`, `packages/align/test/helpers/noise.ts`
- Modify: `packages/align/test/helpers/fixtures.ts` (add `LONG_SCENE`)
- Test: `packages/align/test/noise.property.test.ts`

**Interfaces:**
- Consumes: `runScenario` (Task 9), `tokenize`, `normalizeToken`, `FUNCTION_WORDS` (Task 2).
- Produces (test helpers only): `mulberry32(seed): () => number`; `simulateRecognizer(lines, rng, rate, actorError?): HeardWord[]`; `VOCAB`; `LONG_SCENE: ScriptLineInput[]` (15 lines).

**Noise model.** This encodes our assumptions about recognizer errors; the M1 harness then checks those assumptions against a real recognizer.
- With probability `rate × 0.5`, a word is **misheard**: 70% a one-vowel mutation, 30% a random word, at confidence 0.2–0.6.
- With probability `rate × 0.25`, a word is **missed**: function words are dropped; other words are misheard instead.
- With probability `rate × 0.25`, a short function word is **inserted** before it, at low confidence.
- Correct words get confidence 0.7–1.0.

- [ ] **Step 1: Write the helpers**

`packages/align/test/helpers/rng.ts`:
```ts
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

`packages/align/test/helpers/noise.ts`:
```ts
import { FUNCTION_WORDS, normalizeToken, tokenize } from '../../src/normalize';
import type { HeardWord, ScriptLineInput } from '../../src/types';

export const VOCAB = ['zebra', 'volcano', 'pickle', 'umbrella', 'jigsaw', 'kettle', 'marmalade', 'trombone', 'walrus', 'yoghurt', 'lantern', 'biscuit'];
const INSERTS = ['the', 'a', 'and', 'of'];
const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.floor(rng() * xs.length)]!;

export function mutate(word: string, rng: () => number): string {
  const vowels = 'aeiou';
  const idxs = [...word].map((c, i) => (vowels.includes(c) ? i : -1)).filter((i) => i >= 0);
  if (!idxs.length) return `${word}s`;
  const chars = [...word];
  chars[pick(idxs, rng)] = pick([...vowels], rng);
  return chars.join('');
}

export interface ActorError {
  lineId: string;
  rawIndex: number;
  replacement: string;
}

export function simulateRecognizer(
  lines: ScriptLineInput[],
  rng: () => number,
  rate: number,
  actorError?: ActorError,
): HeardWord[] {
  const out: HeardWord[] = [];
  let t = 0;
  const say = (text: string, confidence: number) => {
    out.push({ text, start: t, end: t + 0.3, confidence, final: true });
    t += 0.35;
  };
  const low = () => 0.2 + 0.4 * rng();
  const high = () => 0.7 + 0.3 * rng();
  for (const line of lines) {
    if (line.cut) continue;
    tokenize(line.text).forEach((raw, rawIndex) => {
      if (actorError && actorError.lineId === line.id && actorError.rawIndex === rawIndex) {
        say(actorError.replacement, 0.95);
        return;
      }
      for (const word of normalizeToken(raw)) {
        const r = rng();
        if (r < rate * 0.5) say(rng() < 0.7 ? mutate(word, rng) : pick(VOCAB, rng), low());
        else if (r < rate * 0.75) {
          if (!FUNCTION_WORDS.has(word)) say(mutate(word, rng), low());
        } else if (r < rate) {
          say(pick(INSERTS, rng), low());
          say(word, high());
        } else say(word, high());
      }
    });
    t += 0.6;
  }
  return out;
}
```

Append to `packages/align/test/helpers/fixtures.ts`:
```ts
export const LONG_SCENE: ScriptLineInput[] = [
  ...EARNEST,
  { id: 'L6', characterId: 'ALGERNON', text: 'As far as the piano is concerned, sentiment is my forte. I keep science for Life.' },
  { id: 'L7', characterId: 'LANE', text: 'Yes, sir.' },
  { id: 'L8', characterId: 'ALGERNON', text: 'And, speaking of the science of Life, have you got the cucumber sandwiches cut for Lady Bracknell?' },
  { id: 'L9', characterId: 'LANE', text: 'Yes, sir.' },
  { id: 'L10', characterId: 'ALGERNON', text: 'Oh! by the way, Lane, I see from your book that on Thursday night, when Lord Shoreman and Mr. Worthing were dining with me, eight bottles of champagne are entered as having been consumed.' },
  { id: 'L11', characterId: 'LANE', text: 'Yes, sir; eight bottles and a pint.' },
  { id: 'L12', characterId: 'ALGERNON', text: "Why is it that at a bachelor's establishment the servants invariably drink the champagne? I ask merely for information." },
  { id: 'L13', characterId: 'LANE', text: 'I attribute it to the superior quality of the wine, sir. I have often observed that in married households the champagne is rarely of a first-rate brand.' },
  { id: 'L14', characterId: 'ALGERNON', text: 'Good heavens! Is marriage so demoralising as that?' },
  { id: 'L15', characterId: 'LANE', text: 'I believe it is a very pleasant state, sir. I have had very little experience of it myself up to the present.' },
];
```

- [ ] **Step 2: Write the property tests**

`packages/align/test/noise.property.test.ts`:
```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FUNCTION_WORDS, tokenize } from '../src/normalize';
import { runScenario } from './helpers/dsl';
import { LONG_SCENE } from './helpers/fixtures';
import { VOCAB, simulateRecognizer } from './helpers/noise';
import { mulberry32 } from './helpers/rng';

describe('false-alarm budget under simulated recognizer noise', () => {
  it('a perfect, confident recognizer never produces notes', () => {
    const { lineNotes, flags } = runScenario(LONG_SCENE, simulateRecognizer(LONG_SCENE, mulberry32(1), 0));
    expect(lineNotes).toEqual([]);
    expect(flags).toEqual([]);
  });

  it('stays within budget at 5–15% recognizer error with no actor errors', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 0x7fffffff }), fc.double({ min: 0.05, max: 0.15, noNaN: true }), (seed, rate) => {
        const { flags, lineNotes } = runScenario(LONG_SCENE, simulateRecognizer(LONG_SCENE, mulberry32(seed), rate));
        const alerts = flags.filter((f) => f.alert).length;
        const notes = lineNotes.filter((n) => n.status === 'note').length;
        return alerts <= 1 && notes <= 2;
      }),
      { seed: 42, numRuns: 100 },
    );
  });

  it('still detects planted wrong words through 10% noise at least 85% of the time', () => {
    const candidates = LONG_SCENE.flatMap((line) =>
      tokenize(line.text)
        .map((raw, rawIndex) => ({ line, rawIndex, core: raw.replace(/[^A-Za-z]/g, '').toLowerCase() }))
        .filter(({ core }) => core.length >= 4 && !FUNCTION_WORDS.has(core)),
    );
    let detected = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = mulberry32(1000 + trial);
      const target = candidates[Math.floor(rng() * candidates.length)]!;
      const replacement = VOCAB[Math.floor(rng() * VOCAB.length)]!;
      const words = simulateRecognizer(LONG_SCENE, rng, 0.1, { lineId: target.line.id, rawIndex: target.rawIndex, replacement });
      const { lineNotes } = runScenario(LONG_SCENE, words);
      const hit = lineNotes.some(
        (n) => n.lineId === target.line.id && n.status === 'note' && (n.category === 'wrong-words' || n.category === 'paraphrase'),
      );
      if (hit) detected++;
    }
    expect(detected).toBeGreaterThanOrEqual(85);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run packages/align/test/noise.property.test.ts`
Expected: PASS. These tests run against finished code, so they are a check rather than red-green. If the budget property fails, fast-check prints a shrunk counterexample (seed and rate). Reproduce it with `runScenario(LONG_SCENE, simulateRecognizer(LONG_SCENE, mulberry32(seed), rate))`, then use superpowers:systematic-debugging to find which commit created the confident false note, and fix the engine. **Do not raise the budget or lower the detection bar to make it pass.** Those numbers come from the spec (§10), and a failure here is the engine's first real finding.

- [ ] **Step 4: Commit**

```bash
git add packages/align
git commit -m "test(align): property tests for false-alarm budget and detection under recognizer noise"
```

---
## Task 11: Recognizer interface, token→word grouping, and the stabilizer

**Files:**
- Create: `packages/asr/package.json`, `packages/asr/tsconfig.json`
- Create: `packages/asr/src/types.ts`, `packages/asr/src/words.ts`, `packages/asr/src/stabilizer.ts`, `packages/asr/src/catalog.ts`, `packages/asr/src/index.ts`
- Test: `packages/asr/test/words.test.ts`, `packages/asr/test/stabilizer.test.ts`, `packages/asr/test/catalog.test.ts`

**Interfaces:**
- Consumes: `HeardWord` type from `@dasma/align`.
- Produces:
  - `interface RawWord { text: string; start: number; end: number; confidence: number }`
  - `interface Recognizer<M = unknown> { readonly supportsHotwords: boolean; load(model: M): Promise<void>; accept(samples: Float32Array, sampleRate: number): void; flush(): void; reset(): void; onWords(cb: (words: HeardWord[]) => void): () => void; setHotwords(words: string[], boost: number): void; realtimeFactor(): number; dispose(): void }`
  - `tokensToWords(tokens: string[], timestamps: number[], offset: number, logProbs?: number[]): RawWord[]`. A token starting with a space or `▁` starts a new word. `end` = last token time + 0.12 s. `confidence` = exp(mean log-prob), or 1 when absent.
  - `class Stabilizer { constructor(stableUpdates = 2); update(words: RawWord[], endpoint: boolean): HeardWord[] }`. It returns newly settled words (each emitted once, `final: true`). The last word of a partial result is never settled. On an endpoint, all remaining words settle and the state resets.
  - `interface ModelSpec { id; kind: 'asr-streaming-transducer' | 'tts-vits'; role: 'standard' | 'light' | 'candidate' | 'tts'; url; dirName; license }`, `MODEL_CATALOG: ModelSpec[]`, `findModel(id): ModelSpec`

- [ ] **Step 1: Create the package**

`packages/asr/package.json`:
```json
{
  "name": "@dasma/asr",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./node": "./src/node/index.ts"
  },
  "scripts": { "typecheck": "tsc -p ." },
  "dependencies": { "@dasma/align": "*" }
}
```

`packages/asr/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"] },
  "include": ["src", "test"]
}
```

Run `npm install` at the repo root so the workspace link to `@dasma/align` is created.

- [ ] **Step 2: Write the failing tests**

`packages/asr/test/words.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { tokensToWords } from '../src/words';

describe('tokensToWords', () => {
  it('joins BPE pieces into words using leading-space boundaries', () => {
    const words = tokensToWords([' YE', 'T', ' THE', 'SE', ' THOUGHT', 'S'], [0.64, 0.76, 0.96, 1.04, 1.24, 1.44], 10);
    expect(words.map((w) => w.text)).toEqual(['YET', 'THESE', 'THOUGHTS']);
    expect(words[0]!.start).toBeCloseTo(10.64);
    expect(words[0]!.end).toBeCloseTo(10.88);
    expect(words[2]!.end).toBeCloseTo(11.56);
    expect(words.every((w) => w.confidence === 1)).toBe(true);
  });

  it('handles a bare space token and the ▁ marker', () => {
    expect(tokensToWords([' ', 'LESS', '▁WITH'], [1, 1.1, 1.3], 0).map((w) => w.text)).toEqual(['LESS', 'WITH']);
  });

  it('turns log-probabilities into a confidence', () => {
    const [w] = tokensToWords([' HI'], [0], 0, [Math.log(0.5)]);
    expect(w!.confidence).toBeCloseTo(0.5);
  });

  it('returns nothing for no tokens', () => {
    expect(tokensToWords([], [], 0)).toEqual([]);
  });
});
```

`packages/asr/test/stabilizer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Stabilizer } from '../src/stabilizer';
import type { RawWord } from '../src/types';

const w = (text: string, start = 0): RawWord => ({ text, start, end: start + 0.3, confidence: 1 });

describe('Stabilizer', () => {
  it('never settles the last (still-changing) word and needs two stable updates', () => {
    const s = new Stabilizer(2);
    expect(s.update([w('A')], false)).toEqual([]);
    expect(s.update([w('A'), w('B')], false)).toEqual([]);
    expect(s.update([w('A'), w('B')], false).map((x) => x.text)).toEqual(['A']);
    expect(s.update([w('A'), w('B'), w('C')], false)).toEqual([]);
    expect(s.update([w('A'), w('B'), w('C')], false).map((x) => x.text)).toEqual(['B']);
  });

  it('settles everything on an endpoint and starts fresh', () => {
    const s = new Stabilizer(2);
    s.update([w('A'), w('B')], false);
    const out = s.update([w('A'), w('B')], true);
    expect(out.map((x) => x.text)).toEqual(['A', 'B']);
    expect(out.every((x) => x.final)).toBe(true);
    expect(s.update([w('C')], false)).toEqual([]);
    expect(s.update([w('C')], true).map((x) => x.text)).toEqual(['C']);
  });

  it('ignores a word that was revised before it settled', () => {
    const s = new Stabilizer(2);
    expect(s.update([w('A'), w('X'), w('Q')], false)).toEqual([]);
    expect(s.update([w('A'), w('Y'), w('Q')], false).map((x) => x.text)).toEqual(['A']);
    expect(s.update([w('A'), w('Y'), w('Q')], false).map((x) => x.text)).toEqual(['Y']);
  });
});
```

`packages/asr/test/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MODEL_CATALOG, findModel } from '../src/catalog';

describe('model catalog', () => {
  it('has unique ids, a standard and a light ASR model, all from official sherpa-onnx releases', () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MODEL_CATALOG.some((m) => m.role === 'standard')).toBe(true);
    expect(MODEL_CATALOG.some((m) => m.role === 'light')).toBe(true);
    for (const m of MODEL_CATALOG) expect(m.url.startsWith('https://github.com/k2-fsa/sherpa-onnx/releases/')).toBe(true);
  });

  it('finds models by id and rejects unknown ids', () => {
    expect(findModel('zipformer-en-2023-06-21').role).toBe('standard');
    expect(() => findModel('nope')).toThrow(/Unknown model/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/asr/test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`packages/asr/src/types.ts`:
```ts
import type { HeardWord } from '@dasma/align';

export interface RawWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Recognizer<M = unknown> {
  readonly supportsHotwords: boolean;
  load(model: M): Promise<void>;
  /** Feed audio; the recognizer keeps its own run clock from the samples it has seen. */
  accept(samples: Float32Array, sampleRate: number): void;
  /** End of input: settle everything pending. */
  flush(): void;
  /** Start a new run (fresh stream and clock). */
  reset(): void;
  onWords(cb: (words: HeardWord[]) => void): () => void;
  setHotwords(words: string[], boost: number): void;
  /** Processing time ÷ audio time so far. */
  realtimeFactor(): number;
  dispose(): void;
}
```

`packages/asr/src/words.ts`:
```ts
import type { RawWord } from './types';

const BOUNDARY = /^[ ▁]+/;
const TOKEN_TAIL_SEC = 0.12;

export function tokensToWords(tokens: string[], timestamps: number[], offset: number, logProbs?: number[]): RawWord[] {
  const words: RawWord[] = [];
  let cur: { text: string; start: number; last: number; lp: number[] } | undefined;
  const close = () => {
    if (!cur || !cur.text) return;
    const confidence = cur.lp.length ? Math.exp(cur.lp.reduce((s, x) => s + x, 0) / cur.lp.length) : 1;
    words.push({ text: cur.text, start: cur.start, end: cur.last + TOKEN_TAIL_SEC, confidence });
  };
  tokens.forEach((tok, i) => {
    const ts = (timestamps[i] ?? 0) + offset;
    const clean = tok.replace(BOUNDARY, '');
    if (!cur || BOUNDARY.test(tok)) {
      close();
      cur = { text: clean, start: ts, last: ts, lp: [] };
    } else {
      cur.text += clean;
      cur.last = ts;
    }
    const lp = logProbs?.[i];
    if (lp !== undefined) cur.lp.push(lp);
  });
  close();
  return words;
}
```

`packages/asr/src/stabilizer.ts`:
```ts
import type { HeardWord } from '@dasma/align';
import type { RawWord } from './types';

/** Turns a recognizer's ever-changing partial hypothesis into words emitted once, when they stop changing. */
export class Stabilizer {
  private emitted = 0;
  private seen: Array<{ text: string; count: number }> = [];

  constructor(private readonly stableUpdates = 2) {}

  update(words: RawWord[], endpoint: boolean): HeardWord[] {
    const out: HeardWord[] = [];
    const limit = endpoint ? words.length : words.length - 1;
    for (let i = this.emitted; i < limit; i++) {
      const prev = this.seen[i];
      const text = words[i]!.text;
      this.seen[i] = prev && prev.text === text ? { text, count: prev.count + 1 } : { text, count: 1 };
    }
    while (this.emitted < limit && (endpoint || this.seen[this.emitted]!.count >= this.stableUpdates)) {
      out.push({ ...words[this.emitted]!, final: true });
      this.emitted++;
    }
    if (endpoint) {
      this.emitted = 0;
      this.seen = [];
    }
    return out;
  }
}
```

`packages/asr/src/catalog.ts`:
```ts
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
```

`packages/asr/src/index.ts`:
```ts
export type { RawWord, Recognizer } from './types';
export { tokensToWords } from './words';
export { Stabilizer } from './stabilizer';
export { MODEL_CATALOG, findModel } from './catalog';
export type { ModelSpec } from './catalog';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/asr/test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/asr package.json package-lock.json
git commit -m "feat(asr): recognizer interface, BPE token grouping, partial-result stabilizer, model catalog"
```

---

## Task 12: sherpa-onnx Node recognizer

**Files:**
- Create: `packages/asr/src/node/sherpa.ts`, `packages/asr/src/node/resolve.ts`, `packages/asr/src/node/node-recognizer.ts`, `packages/asr/src/node/index.ts`
- Test: `packages/asr/test/resolve.test.ts`, `packages/asr/test/node-recognizer.int.test.ts`

**Interfaces:**
- Consumes: `Recognizer`, `RawWord`, `tokensToWords`, `Stabilizer`, `ModelSpec`, `findModel` (Task 11).
- Produces:
  - `loadSherpa(): SherpaModule`. This is a typed `require('sherpa-onnx-node')` exposing `OnlineRecognizer`, `OfflineTts`, `readWave`, `writeWave`. The harness reuses it for TTS and WAV files.
  - `interface ResolvedAsrModel { id: string; encoder: string; decoder: string; joiner: string; tokens: string }`
  - `resolveAsrModel(modelsRoot: string, spec: ModelSpec): ResolvedAsrModel`. It prefers `*.int8.onnx` and throws a helpful error if the model is missing.
  - `class NodeSherpaRecognizer implements Recognizer<ResolvedAsrModel>`, with `supportsHotwords = false`.

**Notes for the implementer:** sherpa-onnx's Node addon resamples internally, so `accept` may receive any sample rate (TTS audio is 22.05 kHz). Endpoint rule 2 (0.8 s of trailing silence) finalizes words at natural pauses between lines. Word times are `segmentStart + token timestamp`; `segmentStart` advances to the total fed duration at each endpoint reset. The integration test checks this clock across an endpoint.

- [ ] **Step 1: Install the binding**

Run: `npm install sherpa-onnx-node -w packages/asr`
Expected: installs `sherpa-onnx-node` plus a platform package (e.g. `sherpa-onnx-darwin-arm64`). Apache-2.0.

- [ ] **Step 2: Write the failing unit test for model resolution**

`packages/asr/test/resolve.test.ts`:
```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findModel } from '../src/catalog';
import { resolveAsrModel } from '../src/node/resolve';

const spec = findModel('zipformer-en-2023-06-21');

function fakeModelDir(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'dasma-models-'));
  const dir = join(root, spec.dirName);
  mkdirSync(dir);
  for (const f of files) writeFileSync(join(dir, f), '');
  return root;
}

describe('resolveAsrModel', () => {
  it('prefers int8 weights', () => {
    const root = fakeModelDir([
      'encoder-epoch-99-avg-1.onnx', 'encoder-epoch-99-avg-1.int8.onnx',
      'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'joiner-epoch-99-avg-1.onnx', 'tokens.txt',
    ]);
    const m = resolveAsrModel(root, spec);
    expect(m.encoder.endsWith('encoder-epoch-99-avg-1.int8.onnx')).toBe(true);
    expect(m.decoder.endsWith('decoder-epoch-99-avg-1.onnx')).toBe(true);
    expect(m.joiner.endsWith('joiner-epoch-99-avg-1.int8.onnx')).toBe(true);
    expect(m.tokens.endsWith('tokens.txt')).toBe(true);
  });

  it('explains how to fetch a missing model', () => {
    expect(() => resolveAsrModel(mkdtempSync(join(tmpdir(), 'dasma-empty-')), spec)).toThrow(/fetch-models/);
  });

  it('rejects an incomplete model directory', () => {
    expect(() => resolveAsrModel(fakeModelDir(['encoder.onnx', 'tokens.txt']), spec)).toThrow(/missing/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run packages/asr/test/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the Node modules**

`packages/asr/src/node/sherpa.ts`:
```ts
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
```

`packages/asr/src/node/resolve.ts`:
```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelSpec } from '../catalog';

export interface ResolvedAsrModel {
  id: string;
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
}

export function resolveAsrModel(modelsRoot: string, spec: ModelSpec): ResolvedAsrModel {
  const dir = join(modelsRoot, spec.dirName);
  if (!existsSync(dir)) {
    throw new Error(`Model ${spec.id} not found at ${dir}. Run: npm run harness -- fetch-models`);
  }
  const files = readdirSync(dir).sort();
  const pick = (prefix: string) =>
    files.find((f) => f.startsWith(prefix) && f.endsWith('.int8.onnx')) ??
    files.find((f) => f.startsWith(prefix) && f.endsWith('.onnx'));
  const encoder = pick('encoder');
  const decoder = pick('decoder');
  const joiner = pick('joiner');
  if (!encoder || !decoder || !joiner || !files.includes('tokens.txt')) {
    throw new Error(`Model ${spec.id} at ${dir} is missing encoder/decoder/joiner/tokens.txt`);
  }
  return {
    id: spec.id,
    encoder: join(dir, encoder),
    decoder: join(dir, decoder),
    joiner: join(dir, joiner),
    tokens: join(dir, 'tokens.txt'),
  };
}
```

`packages/asr/src/node/node-recognizer.ts`:
```ts
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
```

`packages/asr/src/node/index.ts`:
```ts
export { loadSherpa } from './sherpa';
export type { SherpaModule, SherpaWave } from './sherpa';
export { resolveAsrModel } from './resolve';
export type { ResolvedAsrModel } from './resolve';
export { NodeSherpaRecognizer } from './node-recognizer';
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run packages/asr/test/resolve.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the integration test (it skips until models are downloaded in Task 19)**

`packages/asr/test/node-recognizer.int.test.ts`:
```ts
import type { HeardWord } from '@dasma/align';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findModel } from '../src/catalog';
import { NodeSherpaRecognizer, loadSherpa, resolveAsrModel } from '../src/node';

const MODELS = fileURLToPath(new URL('../../../harness/models', import.meta.url));
const spec = findModel('zipformer-en-2023-06-21');
const present = existsSync(join(MODELS, spec.dirName));

function testWave() {
  const dir = join(MODELS, spec.dirName, 'test_wavs');
  const file = readdirSync(dir).filter((f) => f.endsWith('.wav')).sort()[0]!;
  return loadSherpa().readWave(join(dir, file));
}

async function transcribe(chunks: Array<{ samples: Float32Array; sampleRate: number }>) {
  const rec = new NodeSherpaRecognizer();
  await rec.load(resolveAsrModel(MODELS, spec));
  const words: HeardWord[] = [];
  rec.onWords((w) => words.push(...w));
  for (const c of chunks) {
    const step = Math.round(c.sampleRate * 0.1);
    for (let i = 0; i < c.samples.length; i += step) rec.accept(c.samples.slice(i, i + step), c.sampleRate);
  }
  rec.flush();
  const rtf = rec.realtimeFactor();
  rec.dispose();
  return { words, rtf };
}

describe.skipIf(!present)('NodeSherpaRecognizer (needs `npm run harness -- fetch-models`)', () => {
  it('transcribes a test wave into ordered, final, timed words', async () => {
    const wave = testWave();
    const dur = wave.samples.length / wave.sampleRate;
    const { words, rtf } = await transcribe([wave]);
    expect(words.length).toBeGreaterThan(3);
    expect(words.every((w) => w.final)).toBe(true);
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
    expect(words[0]!.start).toBeGreaterThanOrEqual(0);
    expect(words.at(-1)!.start).toBeLessThan(dur + 0.5);
    expect(rtf).toBeGreaterThan(0);
    expect(rtf).toBeLessThan(1);
  });

  it('keeps one continuous clock across an endpoint', async () => {
    const wave = testWave();
    const dur = wave.samples.length / wave.sampleRate;
    const silence = { samples: new Float32Array(wave.sampleRate * 3), sampleRate: wave.sampleRate };
    const { words } = await transcribe([wave, silence, wave]);
    const last = words.at(-1)!;
    expect(last.start).toBeGreaterThan(dur + 3);
    expect(last.start).toBeLessThan(2 * dur + 3 + 0.5);
  });
});
```

Run: `npx vitest run packages/asr/test/node-recognizer.int.test.ts`
Expected now: SKIPPED (no models yet). Task 19 runs it for real.

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add packages/asr package.json package-lock.json
git commit -m "feat(asr): sherpa-onnx Node recognizer with model resolution and clock-continuity test"
```

---
## Task 13: Harness scaffold, public-domain scenes, and planted errors

**Files:**
- Create: `harness/package.json`, `harness/tsconfig.json`
- Create: `harness/src/paths.ts`, `harness/src/rng.ts`, `harness/src/scenes.ts`, `harness/src/perturb.ts`
- Create: `harness/scenes/earnest-act1.json`, `harness/scenes/romeo-balcony.json`
- Test: `harness/test/scenes.test.ts`, `harness/test/perturb.test.ts`

**Interfaces:**
- Consumes: `tokenize`, `FUNCTION_WORDS`, `ScriptLineInput` from `@dasma/align`.
- Produces:
  - `paths.ts`: `HARNESS_ROOT`, `MODELS_DIR`, `SCENES_DIR`, `OUT_DIR`, `BASELINE_FILE`, `LOCK_FILE`
  - `rng.ts`: `type Rng = () => number`, `mulberry32(seed)`, `hashSeed(text): number`, `gaussian(rng)`, `pick(xs, rng)`, `shuffle(xs, rng)`
  - `scenes.ts`: `interface SceneLine { id; character; text; paraphrase? }`, `interface Scene { id; title; source; lines }`, `loadScenes(ids: string[] | 'all'): Scene[]`, `toScriptLines(scene): ScriptLineInput[]`
  - `perturb.ts`: `ErrorKind`, `BenignKind`, `LabelKind`, `ERROR_KINDS`, `BENIGN_KINDS`, `isBenign(kind)`, `interface Segment { speaker; text; pauseBefore; lineId? }`, `interface Label { kind; lineId; characterId; segmentIndex; wordIndex }`, `interface Performance { segments; labels }`, `interface PerturbOptions { errorRate; benignRate; errorKinds?; benignKinds? }`, `perturbScene(scene, rng, opts): Performance`

**Label semantics** (what the aligner should report, and where):

| Kind | What the "actor" does | Label line | `segmentIndex` / `wordIndex` = the moment it becomes detectable |
|---|---|---|---|
| dropped-words | omits 2–3 interior words | that line | first word after the gap |
| wrong-words | swaps one content word for another | that line | the swapped word |
| added-words | inserts a short phrase | that line | last inserted word |
| transposed | swaps two adjacent content words | that line | the second of the pair |
| paraphrase | says the scene's paraphrase text | that line | last word |
| called-for-line | says half, pauses, "Line!", then the rest | that line | the "Line!" segment |
| dropped-line | skips the line; next line after a 2.5–3.5 s pause | the skipped line | next spoken segment, word 0 |
| jumped-cue | skips the line; the *next* character comes in after 0.2 s | the **next** line (different character) | that segment, word 0 |
| stumble *(benign)* | says part, pauses 0.4 s, repeats the last word and continues | that line | — |
| long-pause *(benign)* | 4–6 s of silence before the line | that line | — |
| chatter *(benign)* | the director talks (12+ words), then the line is said | that line | — |

- [ ] **Step 1: Create the package**

`harness/package.json`:
```json
{
  "name": "@dasma/harness",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "cli": "tsx src/cli.ts",
    "typecheck": "tsc -p ."
  },
  "dependencies": {
    "@dasma/align": "*",
    "@dasma/asr": "*"
  }
}
```

`harness/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"] },
  "include": ["src", "test"]
}
```

`harness/src/paths.ts`:
```ts
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MODELS_DIR = join(HARNESS_ROOT, 'models');
export const SCENES_DIR = join(HARNESS_ROOT, 'scenes');
export const OUT_DIR = join(HARNESS_ROOT, 'out');
export const BASELINE_FILE = join(HARNESS_ROOT, 'baselines', 'baseline.json');
export const LOCK_FILE = join(HARNESS_ROOT, 'models.lock.json');
```

`harness/src/rng.ts`:
```ts
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, for deriving per-run seeds. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function pick<T>(xs: readonly T[], rng: Rng): T {
  return xs[Math.floor(rng() * xs.length)]!;
}

export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
```

Run `npm install` at the repo root to link the workspace.

- [ ] **Step 2: Add the scenes (public domain)**

`harness/scenes/earnest-act1.json`:
```json
{
  "id": "earnest-act1",
  "title": "The Importance of Being Earnest — Act I opening",
  "source": "Oscar Wilde, The Importance of Being Earnest (1895). Public domain.",
  "lines": [
    { "id": "E1", "character": "ALGERNON", "text": "Did you hear what I was playing, Lane?" },
    { "id": "E2", "character": "LANE", "text": "I didn't think it polite to listen, sir." },
    { "id": "E3", "character": "ALGERNON", "text": "I'm sorry for that, for your sake. I don't play accurately.", "paraphrase": "I'm sorry about that, for your benefit. I don't play very precisely." },
    { "id": "E4", "character": "ALGERNON", "text": "Anyone can play accurately, but I play with wonderful expression.", "paraphrase": "Anyone can play correctly, though my playing has marvellous expression." },
    { "id": "E5", "character": "LANE", "text": "Yes, sir." },
    { "id": "E6", "character": "ALGERNON", "text": "As far as the piano is concerned, sentiment is my forte. I keep science for Life.", "paraphrase": "When it comes to the piano, feeling is my strength. Science I save for real life." },
    { "id": "E7", "character": "LANE", "text": "Yes, sir." },
    { "id": "E8", "character": "ALGERNON", "text": "And, speaking of the science of Life, have you got the cucumber sandwiches cut for Lady Bracknell?", "paraphrase": "Speaking of science and life, did you get the cucumber sandwiches ready for Lady Bracknell?" },
    { "id": "E9", "character": "LANE", "text": "Yes, sir." },
    { "id": "E10", "character": "ALGERNON", "text": "Oh! by the way, Lane, I see from your book that on Thursday night, when Lord Shoreman and Mr. Worthing were dining with me, eight bottles of champagne are entered as having been consumed.", "paraphrase": "By the way, Lane, your book says that on Thursday, when Lord Shoreman and Mr. Worthing dined here, eight bottles of champagne got drunk." },
    { "id": "E11", "character": "LANE", "text": "Yes, sir; eight bottles and a pint." },
    { "id": "E12", "character": "ALGERNON", "text": "Why is it that at a bachelor's establishment the servants invariably drink the champagne? I ask merely for information." },
    { "id": "E13", "character": "LANE", "text": "I attribute it to the superior quality of the wine, sir. I have often observed that in married households the champagne is rarely of a first-rate brand.", "paraphrase": "I put it down to how good the wine is, sir. In married homes, I find, the champagne is seldom first-rate." },
    { "id": "E14", "character": "ALGERNON", "text": "Good heavens! Is marriage so demoralising as that?" },
    { "id": "E15", "character": "LANE", "text": "I believe it is a very pleasant state, sir. I have had very little experience of it myself up to the present.", "paraphrase": "I hear it is a pleasant state to be in, sir. I have not had much experience of it myself so far." }
  ]
}
```

`harness/scenes/romeo-balcony.json`:
```json
{
  "id": "romeo-balcony",
  "title": "Romeo and Juliet — the balcony (Act II, Scene ii)",
  "source": "William Shakespeare, Romeo and Juliet (c. 1597). Public domain.",
  "lines": [
    { "id": "R1", "character": "JULIET", "text": "O Romeo, Romeo! wherefore art thou Romeo? Deny thy father and refuse thy name.", "paraphrase": "Oh Romeo, Romeo, why must you be Romeo? Disown your father and give up your name." },
    { "id": "R2", "character": "JULIET", "text": "Or, if thou wilt not, be but sworn my love, and I'll no longer be a Capulet." },
    { "id": "R3", "character": "ROMEO", "text": "Shall I hear more, or shall I speak at this?" },
    { "id": "R4", "character": "JULIET", "text": "'Tis but thy name that is my enemy; thou art thyself, though not a Montague." },
    { "id": "R5", "character": "JULIET", "text": "What's Montague? It is nor hand, nor foot, nor arm, nor face, nor any other part belonging to a man." },
    { "id": "R6", "character": "JULIET", "text": "O, be some other name! What's in a name? That which we call a rose by any other word would smell as sweet.", "paraphrase": "Oh, take another name! What is a name anyway? A rose called something else would smell just as sweet." },
    { "id": "R7", "character": "ROMEO", "text": "I take thee at thy word. Call me but love, and I'll be new baptized; henceforth I never will be Romeo.", "paraphrase": "I'll take you at your word. Just call me love and I'll be baptized anew; from now on I'll never be Romeo." },
    { "id": "R8", "character": "JULIET", "text": "What man art thou that thus bescreen'd in night so stumblest on my counsel?" },
    { "id": "R9", "character": "ROMEO", "text": "By a name I know not how to tell thee who I am. My name, dear saint, is hateful to myself, because it is an enemy to thee." },
    { "id": "R10", "character": "JULIET", "text": "My ears have not yet drunk a hundred words of that tongue's utterance, yet I know the sound. Art thou not Romeo and a Montague?" },
    { "id": "R11", "character": "ROMEO", "text": "Neither, fair saint, if either thee dislike." },
    { "id": "R12", "character": "JULIET", "text": "How camest thou hither, tell me, and wherefore? The orchard walls are high and hard to climb.", "paraphrase": "How did you get here, tell me, and why? The orchard walls are tall and difficult to climb." },
    { "id": "R13", "character": "ROMEO", "text": "With love's light wings did I o'erperch these walls; for stony limits cannot hold love out." },
    { "id": "R14", "character": "JULIET", "text": "If they do see thee, they will murder thee." }
  ]
}
```

- [ ] **Step 3: Write the failing tests**

`harness/test/scenes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadScenes, toScriptLines } from '../src/scenes';

describe('scenes', () => {
  it('loads all bundled scenes with unique line ids', () => {
    const scenes = loadScenes('all');
    expect(scenes.map((s) => s.id).sort()).toEqual(['earnest-act1', 'romeo-balcony']);
    for (const s of scenes) {
      const ids = s.lines.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.source).toMatch(/Public domain/);
    }
  });

  it('loads by id and rejects unknown ids', () => {
    expect(loadScenes(['romeo-balcony'])).toHaveLength(1);
    expect(() => loadScenes(['nope'])).toThrow(/Unknown scene/);
  });

  it('converts to aligner script lines', () => {
    const [scene] = loadScenes(['earnest-act1']);
    expect(toScriptLines(scene!)[0]).toEqual({ id: 'E1', characterId: 'ALGERNON', text: 'Did you hear what I was playing, Lane?' });
  });
});
```

`harness/test/perturb.test.ts`:
```ts
import { tokenize } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { perturbScene, type Performance } from '../src/perturb';
import { mulberry32 } from '../src/rng';
import type { Scene } from '../src/scenes';

const SCENE: Scene = {
  id: 't',
  title: 'T',
  source: 'test',
  lines: [
    { id: 'A1', character: 'ANN', text: 'The garden looks wonderful in the morning light today.', paraphrase: 'This morning the garden is looking lovely in the sun.' },
    { id: 'B1', character: 'BEN', text: 'I planted every single flower there myself, you know.' },
    { id: 'A2', character: 'ANN', text: 'Then you deserve a medal for patience and skill.' },
    { id: 'B2', character: 'BEN', text: 'Thank you kindly.' },
  ],
};
const run = (opts: Parameters<typeof perturbScene>[2], seed = 7): Performance => perturbScene(SCENE, mulberry32(seed), opts);

describe('perturbScene', () => {
  it('with no errors, performs the scene verbatim', () => {
    const p = run({ errorRate: 0, benignRate: 0 });
    expect(p.labels).toEqual([]);
    expect(p.segments.map((s) => s.text)).toEqual(SCENE.lines.map((l) => l.text));
    expect(p.segments.map((s) => s.speaker)).toEqual(['ANN', 'BEN', 'ANN', 'BEN']);
  });

  it('wrong-words changes exactly one word and labels it', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['wrong-words'] });
    expect(p.labels).toHaveLength(4);
    for (const label of p.labels) {
      const original = tokenize(SCENE.lines.find((l) => l.id === label.lineId)!.text);
      const spoken = tokenize(p.segments[label.segmentIndex]!.text);
      const diffs = original.map((w, i) => (w !== spoken[i] ? i : -1)).filter((i) => i >= 0);
      expect(diffs).toEqual([label.wordIndex]);
    }
  });

  it('dropped-line skips the line and points at the next spoken segment', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['dropped-line'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1', 'B1', 'A2']);
    expect(p.segments.map((s) => s.lineId)).toEqual(['B2']);
    expect(p.labels.every((l) => l.segmentIndex === 0)).toBe(true);
    expect(p.segments[0]!.pauseBefore).toBeGreaterThanOrEqual(2.5);
  });

  it('jumped-cue labels the next (different-character) line, performed cleanly after a short gap', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['jumped-cue'] });
    expect(p.labels.map((l) => [l.kind, l.lineId, l.characterId])).toEqual([
      ['jumped-cue', 'B1', 'BEN'],
      ['jumped-cue', 'B2', 'BEN'],
    ]);
    expect(p.segments.map((s) => s.text)).toEqual([SCENE.lines[1]!.text, SCENE.lines[3]!.text]);
    expect(p.segments[0]!.pauseBefore).toBeCloseTo(0.2);
  });

  it('called-for-line inserts a "Line!" segment and labels it', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['called-for-line'] });
    expect(p.labels).toHaveLength(3); // B2 has only 3 words
    for (const label of p.labels) expect(p.segments[label.segmentIndex]!.text).toBe('Line!');
  });

  it('paraphrase uses the scene text', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['paraphrase'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1']);
    expect(p.segments[0]!.text).toBe(SCENE.lines[0]!.paraphrase);
  });

  it('chatter is spoken by the director before the line', () => {
    const p = run({ errorRate: 0, benignRate: 1, benignKinds: ['chatter'] });
    expect(p.segments.filter((s) => s.speaker === 'DIRECTOR')).toHaveLength(4);
    expect(p.labels.every((l) => l.kind === 'chatter')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const opts = { errorRate: 0.5, benignRate: 0.3 };
    expect(run(opts, 99)).toEqual(run(opts, 99));
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run harness/test/scenes.test.ts harness/test/perturb.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement `scenes.ts` and `perturb.ts`**

`harness/src/scenes.ts`:
```ts
import type { ScriptLineInput } from '@dasma/align';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCENES_DIR } from './paths';

export interface SceneLine {
  id: string;
  character: string;
  text: string;
  paraphrase?: string;
}

export interface Scene {
  id: string;
  title: string;
  source: string;
  lines: SceneLine[];
}

export function loadScenes(ids: string[] | 'all'): Scene[] {
  const all = readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(SCENES_DIR, f), 'utf8')) as Scene);
  if (ids === 'all') return all;
  return ids.map((id) => {
    const scene = all.find((s) => s.id === id);
    if (!scene) throw new Error(`Unknown scene "${id}". Known: ${all.map((s) => s.id).join(', ')}`);
    return scene;
  });
}

export function toScriptLines(scene: Scene): ScriptLineInput[] {
  return scene.lines.map((l) => ({ id: l.id, characterId: l.character, text: l.text }));
}
```

`harness/src/perturb.ts`:
```ts
import { FUNCTION_WORDS, tokenize } from '@dasma/align';
import { pick, type Rng } from './rng';
import type { Scene, SceneLine } from './scenes';

export type ErrorKind =
  | 'dropped-line'
  | 'dropped-words'
  | 'added-words'
  | 'wrong-words'
  | 'transposed'
  | 'paraphrase'
  | 'jumped-cue'
  | 'called-for-line';
export type BenignKind = 'stumble' | 'chatter' | 'long-pause';
export type LabelKind = ErrorKind | BenignKind;

export const ERROR_KINDS: ErrorKind[] = [
  'dropped-line', 'dropped-words', 'added-words', 'wrong-words', 'transposed', 'paraphrase', 'jumped-cue', 'called-for-line',
];
export const BENIGN_KINDS: BenignKind[] = ['stumble', 'long-pause', 'chatter'];
export const isBenign = (kind: LabelKind): kind is BenignKind => (BENIGN_KINDS as string[]).includes(kind);

export interface Segment {
  speaker: string;
  text: string;
  pauseBefore: number;
  lineId?: string;
}

export interface Label {
  kind: LabelKind;
  lineId: string;
  characterId: string;
  segmentIndex: number;
  wordIndex: number;
}

export interface Performance {
  segments: Segment[];
  labels: Label[];
}

export interface PerturbOptions {
  errorRate: number;
  benignRate: number;
  errorKinds?: ErrorKind[];
  benignKinds?: BenignKind[];
}

const ADDED = ['really', 'you know', 'indeed', 'of course', 'truly'];
const SUBSTITUTES = [
  'marvellous', 'splendid', 'dreadful', 'curious', 'perfectly', 'certainly', 'evening', 'garden', 'letter',
  'window', 'country', 'money', 'dinner', 'sister', 'journey', 'question', 'carriage', 'umbrella',
];
const CHATTER = [
  'Okay hold on everybody, let me fix this chair before we keep going with the scene.',
  'Sorry, sorry, can we take that bit again from just before the entrance please?',
];
const WORD = /^([^A-Za-z']*)([A-Za-z']+)([^A-Za-z']*)$/;

const core = (raw: string) => raw.replace(/[^A-Za-z']/g, '').toLowerCase();
const isContent = (raw: string) => {
  const c = core(raw);
  return c.length >= 4 && !FUNCTION_WORDS.has(c);
};

function replaceCore(raw: string, replacement: string): string {
  const m = WORD.exec(raw);
  return m ? `${m[1]}${replacement}${m[3]}` : replacement;
}

function swapCores(a: string, b: string): [string, string] {
  const ma = WORD.exec(a);
  const mb = WORD.exec(b);
  if (!ma || !mb) return [b, a];
  return [`${ma[1]}${mb[2]}${ma[3]}`, `${mb[1]}${ma[2]}${mb[3]}`];
}

function feasible(kind: ErrorKind, line: SceneLine, next: SceneLine | undefined): boolean {
  const words = tokenize(line.text);
  switch (kind) {
    case 'dropped-line':
      return next !== undefined;
    case 'jumped-cue':
      return next !== undefined && next.character !== line.character;
    case 'dropped-words':
      return words.length >= 6;
    case 'added-words':
      return words.length >= 3;
    case 'wrong-words':
      return words.some(isContent);
    case 'transposed':
      return words.some((w, i) => i + 1 < words.length && isContent(w) && isContent(words[i + 1]!));
    case 'paraphrase':
      return Boolean(line.paraphrase);
    case 'called-for-line':
      return words.length >= 4;
  }
}

export function perturbScene(scene: Scene, rng: Rng, opts: PerturbOptions): Performance {
  const errorKinds = opts.errorKinds ?? ERROR_KINDS;
  const benignKinds = opts.benignKinds ?? BENIGN_KINDS;
  const segments: Segment[] = [];
  const labels: Label[] = [];
  let carriedPause: number | null = null;
  let pendingJump = false;

  for (let i = 0; i < scene.lines.length; i++) {
    const line = scene.lines[i]!;
    const next = scene.lines[i + 1];
    const words = tokenize(line.text);
    const pauseBefore = carriedPause ?? 0.3 + 0.6 * rng();
    carriedPause = null;
    const label = (kind: LabelKind, segmentIndex: number, wordIndex: number) =>
      labels.push({ kind, lineId: line.id, characterId: line.character, segmentIndex, wordIndex });
    const speak = (text: string, pause: number, speaker = line.character): number => {
      segments.push({ speaker, text, pauseBefore: pause, ...(speaker === line.character ? { lineId: line.id } : {}) });
      return segments.length - 1;
    };

    if (pendingJump) {
      pendingJump = false;
      label('jumped-cue', speak(line.text, pauseBefore), 0);
      continue;
    }

    let kind: LabelKind | null = null;
    const roll = rng();
    if (roll < opts.errorRate) {
      const options = errorKinds.filter((k) => feasible(k, line, next));
      kind = options.length ? pick(options, rng) : null;
    } else if (roll < opts.errorRate + opts.benignRate && benignKinds.length) {
      kind = pick(benignKinds, rng);
    }

    switch (kind) {
      case null:
        speak(line.text, pauseBefore);
        break;
      case 'dropped-line':
        label('dropped-line', segments.length, 0);
        carriedPause = 2.5 + rng();
        break;
      case 'jumped-cue':
        carriedPause = 0.2;
        pendingJump = true;
        break;
      case 'dropped-words': {
        const start = 1 + Math.floor(rng() * (words.length - 4));
        const count = Math.min(2 + Math.floor(rng() * 2), words.length - 1 - start);
        const out = [...words.slice(0, start), ...words.slice(start + count)];
        label('dropped-words', speak(out.join(' '), pauseBefore), start);
        break;
      }
      case 'added-words': {
        const pos = 1 + Math.floor(rng() * (words.length - 1));
        const phrase = pick(ADDED, rng).split(' ');
        const out = [...words.slice(0, pos), ...phrase, ...words.slice(pos)];
        label('added-words', speak(out.join(' '), pauseBefore), pos + phrase.length - 1);
        break;
      }
      case 'wrong-words': {
        const idxs = words.map((w, k) => (isContent(w) ? k : -1)).filter((k) => k >= 0);
        const k = pick(idxs, rng);
        const out = [...words];
        out[k] = replaceCore(words[k]!, pick(SUBSTITUTES.filter((s) => s !== core(words[k]!)), rng));
        label('wrong-words', speak(out.join(' '), pauseBefore), k);
        break;
      }
      case 'transposed': {
        const idxs = words
          .map((w, k) => (k + 1 < words.length && isContent(w) && isContent(words[k + 1]!) ? k : -1))
          .filter((k) => k >= 0);
        const k = pick(idxs, rng);
        const out = [...words];
        [out[k], out[k + 1]] = swapCores(words[k]!, words[k + 1]!);
        label('transposed', speak(out.join(' '), pauseBefore), k + 1);
        break;
      }
      case 'paraphrase': {
        const text = line.paraphrase!;
        label('paraphrase', speak(text, pauseBefore), tokenize(text).length - 1);
        break;
      }
      case 'called-for-line': {
        const mid = Math.floor(words.length / 2);
        speak(words.slice(0, mid).join(' '), pauseBefore);
        const call = speak('Line!', 1.5 + rng());
        speak(words.slice(mid).join(' '), 1.0);
        label('called-for-line', call, 0);
        break;
      }
      case 'stumble': {
        const pos = 1 + Math.floor(rng() * Math.max(1, words.length - 1));
        speak(words.slice(0, pos).join(' '), pauseBefore);
        label('stumble', speak(words.slice(pos - 1).join(' '), 0.4), 0);
        break;
      }
      case 'long-pause':
        label('long-pause', speak(line.text, 4 + 2 * rng()), 0);
        break;
      case 'chatter':
        speak(pick(CHATTER, rng), pauseBefore, 'DIRECTOR');
        label('chatter', speak(line.text, 1.5), 0);
        break;
    }
  }
  return { segments, labels };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run harness/test/scenes.test.ts harness/test/perturb.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add harness package.json package-lock.json
git commit -m "feat(harness): scaffold, public-domain scenes, labelled error injection"
```

---

## Task 14: Room simulation

**Files:**
- Create: `harness/src/room.ts`
- Test: `harness/test/room.test.ts`

**Interfaces:**
- Consumes: `Rng`, `gaussian` (Task 13).
- Produces:
  - `fft(re: Float64Array, im: Float64Array, inverse: boolean): void` (in-place radix-2; the length must be a power of two; the inverse divides by n)
  - `convolve(signal: Float32Array, ir: Float32Array): Float32Array` (FFT overlap-add; output length = signal + ir − 1)
  - `makeImpulseResponse(sampleRate, rt60, directToReverbDb, rng): Float32Array` (direct path = 1 at sample 0, plus an exponentially decaying noise tail)
  - `addNoise(signal, snrDb, rng): Float32Array` (pink-ish noise scaled to an exact SNR over the whole signal)
  - `laptopMicEq(signal, sampleRate): Float32Array` (2nd-order high-pass 150 Hz, low-pass min(6 kHz, 0.45·sr))
  - `type RoomName = 'close-mic' | 'far-field' | 'far-field-hard'`, `ROOM_PRESETS: Record<RoomName, RoomPreset>`, `applyRoom(signal, sampleRate, preset, rng): Float32Array` (same length as the input, peak ≤ 1)

- [ ] **Step 1: Write the failing tests**

`harness/test/room.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ROOM_PRESETS, addNoise, applyRoom, convolve, fft, laptopMicEq, makeImpulseResponse } from '../src/room';
import { mulberry32 } from '../src/rng';

const SR = 16000;
const rms = (x: Float32Array, from = 0) => Math.sqrt(x.subarray(from).reduce((s, v) => s + v * v, 0) / (x.length - from));
const sine = (hz: number, sec = 1) => Float32Array.from({ length: SR * sec }, (_, n) => Math.sin((2 * Math.PI * hz * n) / SR));

describe('fft', () => {
  it('round-trips', () => {
    const rng = mulberry32(1);
    const re = Float64Array.from({ length: 64 }, () => rng() - 0.5);
    const original = Float64Array.from(re);
    const im = new Float64Array(64);
    fft(re, im, false);
    fft(re, im, true);
    for (let i = 0; i < 64; i++) expect(re[i]).toBeCloseTo(original[i]!, 9);
  });
});

describe('convolve', () => {
  it('leaves a signal unchanged with a unit impulse', () => {
    const out = convolve(Float32Array.from([1, 2, 3]), Float32Array.from([1]));
    expect(Array.from(out).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 2, 3]);
  });

  it('matches direct convolution', () => {
    const rng = mulberry32(2);
    const x = Float32Array.from({ length: 5000 }, () => rng() - 0.5);
    const h = Float32Array.from({ length: 300 }, () => rng() - 0.5);
    const out = convolve(x, h);
    expect(out.length).toBe(x.length + h.length - 1);
    for (const n of [0, 1, 299, 1000, 4999, 5298]) {
      let direct = 0;
      for (let k = 0; k < h.length; k++) if (n - k >= 0 && n - k < x.length) direct += x[n - k]! * h[k]!;
      expect(out[n]).toBeCloseTo(direct, 3);
    }
  });
});

describe('makeImpulseResponse', () => {
  it('has a direct path and a decaying tail', () => {
    const ir = makeImpulseResponse(SR, 0.6, 0, mulberry32(3));
    expect(ir[0]).toBe(1);
    expect(ir.length).toBe(Math.ceil(0.6 * 1.2 * SR));
    const tenth = Math.floor(ir.length / 10);
    const early = ir.subarray(1, tenth).reduce((s, v) => s + v * v, 0);
    const late = ir.subarray(ir.length - tenth).reduce((s, v) => s + v * v, 0);
    expect(late).toBeLessThan(early * 0.01);
  });

  it('is just the direct path with no reverb', () => {
    expect(Array.from(makeImpulseResponse(SR, 0, 0, mulberry32(4)))).toEqual([1]);
  });
});

describe('addNoise', () => {
  it('hits the requested signal-to-noise ratio', () => {
    const x = sine(440);
    const y = addNoise(x, 15, mulberry32(5));
    const noise = y.map((v, i) => v - x[i]!);
    const snr = 20 * Math.log10(rms(x) / rms(noise));
    expect(snr).toBeCloseTo(15, 1);
  });
});

describe('laptopMicEq', () => {
  it('cuts low rumble and keeps speech frequencies', () => {
    const low = laptopMicEq(sine(50), SR);
    const mid = laptopMicEq(sine(1000), SR);
    expect(rms(low, SR / 2) / rms(sine(50), SR / 2)).toBeLessThan(0.5);
    const midRatio = rms(mid, SR / 2) / rms(sine(1000), SR / 2);
    expect(midRatio).toBeGreaterThan(0.89);
    expect(midRatio).toBeLessThan(1.12);
  });
});

describe('applyRoom', () => {
  it('keeps length and never clips', () => {
    const x = sine(300, 2).map((v) => v * 0.99);
    for (const preset of Object.values(ROOM_PRESETS)) {
      const y = applyRoom(x, SR, preset, mulberry32(6));
      expect(y.length).toBe(x.length);
      expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(1);
    }
  });

  it('close-mic barely changes the signal', () => {
    const x = sine(300, 1).map((v) => v * 0.5);
    const y = applyRoom(x, SR, ROOM_PRESETS['close-mic'], mulberry32(7));
    let dot = 0;
    for (let i = 0; i < x.length; i++) dot += x[i]! * y[i]!;
    const corr = dot / (Math.sqrt(x.reduce((s, v) => s + v * v, 0)) * Math.sqrt(y.reduce((s, v) => s + v * v, 0)));
    expect(corr).toBeGreaterThan(0.99);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run harness/test/room.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`harness/src/room.ts`:
```ts
import { gaussian, type Rng } from './rng';

export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const br = re[b]! * cr - im[b]! * ci;
        const bi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - br;
        im[b] = im[a]! - bi;
        re[a] = re[a]! + br;
        im[a] = im[a]! + bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

const nextPow2 = (x: number) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));

export function convolve(signal: Float32Array, ir: Float32Array): Float32Array {
  const outLen = signal.length + ir.length - 1;
  const block = nextPow2(Math.max(ir.length * 2, 4096));
  const step = block - ir.length + 1;
  const hr = new Float64Array(block);
  const hi = new Float64Array(block);
  hr.set(ir);
  fft(hr, hi, false);
  const out = new Float32Array(outLen);
  for (let pos = 0; pos < signal.length; pos += step) {
    const re = new Float64Array(block);
    const im = new Float64Array(block);
    re.set(signal.subarray(pos, Math.min(pos + step, signal.length)));
    fft(re, im, false);
    for (let k = 0; k < block; k++) {
      const a = re[k]!;
      const b = im[k]!;
      re[k] = a * hr[k]! - b * hi[k]!;
      im[k] = a * hi[k]! + b * hr[k]!;
    }
    fft(re, im, true);
    for (let k = 0; k < block && pos + k < outLen; k++) out[pos + k] = out[pos + k]! + re[k]!;
  }
  return out;
}

export function makeImpulseResponse(sampleRate: number, rt60: number, directToReverbDb: number, rng: Rng): Float32Array {
  if (rt60 <= 0) return Float32Array.from([1]);
  const len = Math.ceil(rt60 * 1.2 * sampleRate);
  const ir = new Float32Array(len);
  let tailEnergy = 0;
  for (let n = 1; n < len; n++) {
    const v = gaussian(rng) * Math.exp((-6.9078 * n) / (rt60 * sampleRate));
    ir[n] = v;
    tailEnergy += v * v;
  }
  const scale = Math.sqrt(1 / (tailEnergy * 10 ** (directToReverbDb / 10)));
  for (let n = 1; n < len; n++) ir[n] = ir[n]! * scale;
  ir[0] = 1;
  return ir;
}

export function addNoise(signal: Float32Array, snrDb: number, rng: Rng): Float32Array {
  const noise = new Float64Array(signal.length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < noise.length; i++) {
    const w = gaussian(rng);
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    noise[i] = b0 + b1 + b2 + w * 0.1848;
  }
  const ps = signal.reduce((s, v) => s + v * v, 0) / Math.max(1, signal.length);
  const pn = noise.reduce((s, v) => s + v * v, 0) / Math.max(1, noise.length);
  const gain = pn > 0 && ps > 0 ? Math.sqrt(ps / 10 ** (snrDb / 10) / pn) : 0;
  return Float32Array.from(signal, (v, i) => v + noise[i]! * gain);
}

function biquad(x: Float32Array, type: 'lowpass' | 'highpass', f0: number, sampleRate: number, q = Math.SQRT1_2): Float32Array {
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n]!;
    const yn = (b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    y[n] = yn;
    x2 = x1;
    x1 = xn;
    y2 = y1;
    y1 = yn;
  }
  return y;
}

export function laptopMicEq(signal: Float32Array, sampleRate: number): Float32Array {
  return biquad(biquad(signal, 'highpass', 150, sampleRate), 'lowpass', Math.min(6000, sampleRate * 0.45), sampleRate);
}

export type RoomName = 'close-mic' | 'far-field' | 'far-field-hard';

export interface RoomPreset {
  rt60: number;
  directToReverbDb: number;
  snrDb: number;
  eq: boolean;
}

export const ROOM_PRESETS: Record<RoomName, RoomPreset> = {
  'close-mic': { rt60: 0, directToReverbDb: 20, snrDb: 35, eq: false },
  'far-field': { rt60: 0.6, directToReverbDb: 0, snrDb: 18, eq: true },
  'far-field-hard': { rt60: 0.9, directToReverbDb: -6, snrDb: 10, eq: true },
};

export function applyRoom(signal: Float32Array, sampleRate: number, preset: RoomPreset, rng: Rng): Float32Array {
  let y = signal;
  if (preset.rt60 > 0) {
    y = convolve(y, makeImpulseResponse(sampleRate, preset.rt60, preset.directToReverbDb, rng)).slice(0, signal.length);
  }
  if (preset.eq) y = laptopMicEq(y, sampleRate);
  y = addNoise(y, preset.snrDb, rng);
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.99) {
    const g = 0.99 / peak;
    y = y.map((v) => v * g);
  }
  return y;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run harness/test/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harness
git commit -m "feat(harness): room simulation (reverb, noise, laptop-mic EQ)"
```

---

## Task 15: Rendering performances with local TTS

**Files:**
- Create: `harness/src/tts.ts`
- Test: `harness/test/tts.test.ts`, `harness/test/tts.int.test.ts`

**Interfaces:**
- Consumes: `Performance`, `Segment` (Task 13); `Rng`, `shuffle` (Task 13); `loadSherpa` (Task 12).
- Produces:
  - `interface TtsEngine { synth(text: string, sid: number, speed: number): { samples: Float32Array; sampleRate: number } }`
  - `interface RenderedSegment { seg: Segment; start: number; end: number }`
  - `interface RenderedPerformance { samples: Float32Array; sampleRate: number; segments: RenderedSegment[] }`
  - `renderPerformance(perf: Performance, voices: Record<string, number>, tts: TtsEngine, speed?: number): RenderedPerformance` (each segment is preceded by its `pauseBefore`; 1 s tail; times derived from sample counts)
  - `VOICE_POOL: number[]`, `assignVoices(speakers: string[], rng: Rng): Record<string, number>` (distinct speaker ids from the pool)
  - `createSherpaTts(modelDir: string): TtsEngine`
  - `TTS_MODEL_DIR` (the libritts_r multi-speaker Piper voice directory under `MODELS_DIR`)

- [ ] **Step 1: Write the failing unit test**

`harness/test/tts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Performance } from '../src/perturb';
import { mulberry32 } from '../src/rng';
import { VOICE_POOL, assignVoices, renderPerformance, type TtsEngine } from '../src/tts';

const fakeTts: TtsEngine = {
  synth: (text) => ({
    samples: new Float32Array(Math.round(16000 * 0.32 * text.split(/\s+/).filter(Boolean).length)).fill(0.1),
    sampleRate: 16000,
  }),
};

describe('renderPerformance', () => {
  it('lays segments out on one timeline with their pauses', () => {
    const perf: Performance = {
      segments: [
        { speaker: 'A', text: 'one two', pauseBefore: 0.5, lineId: 'L1' },
        { speaker: 'B', text: 'three', pauseBefore: 1, lineId: 'L2' },
      ],
      labels: [],
    };
    const r = renderPerformance(perf, { A: 1, B: 2 }, fakeTts);
    expect(r.sampleRate).toBe(16000);
    expect(r.segments[0]!.start).toBeCloseTo(0.5);
    expect(r.segments[0]!.end).toBeCloseTo(1.14);
    expect(r.segments[1]!.start).toBeCloseTo(2.14);
    expect(r.segments[1]!.end).toBeCloseTo(2.46);
    expect(r.samples.length).toBe(Math.round(3.46 * 16000));
  });
});

describe('assignVoices', () => {
  it('gives each speaker a distinct voice from the pool, deterministically', () => {
    const a = assignVoices(['ANN', 'BEN', 'DIRECTOR'], mulberry32(1));
    expect(new Set(Object.values(a)).size).toBe(3);
    expect(Object.values(a).every((sid) => VOICE_POOL.includes(sid))).toBe(true);
    expect(assignVoices(['ANN', 'BEN', 'DIRECTOR'], mulberry32(1))).toEqual(a);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run harness/test/tts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`harness/src/tts.ts`:
```ts
import { loadSherpa } from '@dasma/asr/node';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS_DIR } from './paths';
import type { Performance, Segment } from './perturb';
import { shuffle, type Rng } from './rng';

export interface TtsEngine {
  synth(text: string, sid: number, speed: number): { samples: Float32Array; sampleRate: number };
}

export interface RenderedSegment {
  seg: Segment;
  start: number;
  end: number;
}

export interface RenderedPerformance {
  samples: Float32Array;
  sampleRate: number;
  segments: RenderedSegment[];
}

/** Speaker ids in the libritts_r Piper voice (904 speakers) chosen to sound distinct. */
export const VOICE_POOL = [3, 14, 27, 45, 63, 88, 102, 130, 166, 199, 240, 287];
export const TTS_MODEL_DIR = join(MODELS_DIR, 'vits-piper-en_US-libritts_r-medium');

export function assignVoices(speakers: string[], rng: Rng): Record<string, number> {
  const pool = shuffle(VOICE_POOL, rng);
  return Object.fromEntries(speakers.map((s, i) => [s, pool[i % pool.length]!]));
}

export function renderPerformance(
  perf: Performance,
  voices: Record<string, number>,
  tts: TtsEngine,
  speed = 1,
): RenderedPerformance {
  const chunks: Float32Array[] = [];
  const segments: RenderedSegment[] = [];
  let sampleRate = 0;
  let total = 0;
  for (const seg of perf.segments) {
    const audio = tts.synth(seg.text, voices[seg.speaker] ?? VOICE_POOL[0]!, speed);
    if (!sampleRate) sampleRate = audio.sampleRate;
    const pad = new Float32Array(Math.round(seg.pauseBefore * sampleRate));
    chunks.push(pad, audio.samples);
    total += pad.length;
    const start = total / sampleRate;
    total += audio.samples.length;
    segments.push({ seg, start, end: total / sampleRate });
  }
  if (!sampleRate) sampleRate = 16000;
  const tail = new Float32Array(sampleRate);
  chunks.push(tail);
  total += tail.length;
  const samples = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    samples.set(c, offset);
    offset += c.length;
  }
  return { samples, sampleRate, segments };
}

export function createSherpaTts(modelDir: string = TTS_MODEL_DIR): TtsEngine {
  const model = readdirSync(modelDir).find((f) => f.endsWith('.onnx'));
  if (!model) throw new Error(`No .onnx voice in ${modelDir}. Run: npm run harness -- fetch-models`);
  const tts = new (loadSherpa().OfflineTts)({
    model: {
      vits: { model: join(modelDir, model), tokens: join(modelDir, 'tokens.txt'), dataDir: join(modelDir, 'espeak-ng-data') },
      numThreads: 2,
      provider: 'cpu',
      debug: false,
    },
    maxNumSentences: 1,
  });
  return {
    synth(text, sid, speed) {
      const audio = tts.generate({ text, sid, speed });
      return { samples: Float32Array.from(audio.samples), sampleRate: audio.sampleRate };
    },
  };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run harness/test/tts.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the TTS integration test (it skips until models are downloaded)**

`harness/test/tts.int.test.ts`:
```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TTS_MODEL_DIR, createSherpaTts } from '../src/tts';

describe.skipIf(!existsSync(TTS_MODEL_DIR))('sherpa TTS (needs `npm run harness -- fetch-models`)', () => {
  it('speaks a sentence in two different voices', () => {
    const tts = createSherpaTts();
    const a = tts.synth('Did you hear what I was playing, Lane?', 3, 1);
    const b = tts.synth('Did you hear what I was playing, Lane?', 287, 1);
    expect(a.sampleRate).toBeGreaterThan(8000);
    expect(a.samples.length / a.sampleRate).toBeGreaterThan(1);
    expect(a.samples.length).not.toBe(b.samples.length);
  });
});
```
If, in Task 19, `generate` rejects the `{ text, sid, speed }` request shape, the installed `sherpa-onnx-node` is using the newer config API. Change the call in `createSherpaTts` to `tts.generate({ text, generationConfig: new (sherpa.GenerationConfig)({ sid, speed }) })` (adding `GenerationConfig` to `SherpaModule`), and keep this test unchanged.

- [ ] **Step 6: Commit**

```bash
git add harness
git commit -m "feat(harness): render labelled performances with local multi-speaker TTS"
```

---

## Task 16: Streaming audio through recognizer and aligner

**Files:**
- Create: `harness/src/run-engine.ts`
- Create: `harness/test/helpers/scripted-recognizer.ts`
- Test: `harness/test/run-engine.test.ts`

**Interfaces:**
- Consumes: `createAligner`, `ExpectedWord`, `AlignEvent`, `AlignOptions`, `HeardWord` (`@dasma/align`); `Recognizer` (`@dasma/asr`).
- Produces:
  - `interface TimedEvent { event: AlignEvent; audioTime: number }` (`audioTime` = how much audio had been fed when the event fired)
  - `interface EngineRun { events: TimedEvent[]; rtf: number; durationSec: number }`
  - `runEngine(samples, sampleRate, recognizer, expected, options, chunkSec = 0.1): EngineRun`
  - Test helper `ScriptedRecognizer implements Recognizer<null>`. It emits pre-set words once `fed − delay ≥ word.end`. Task 18 reuses it as an "oracle" recognizer.

- [ ] **Step 1: Write the helper and the failing test**

`harness/test/helpers/scripted-recognizer.ts`:
```ts
import type { HeardWord } from '@dasma/align';
import type { Recognizer } from '@dasma/asr';

/** A fake recognizer that "hears" a fixed word list with a fixed delay. */
export class ScriptedRecognizer implements Recognizer<null> {
  readonly supportsHotwords = false;
  private fed = 0;
  private next = 0;
  private readonly listeners = new Set<(w: HeardWord[]) => void>();

  constructor(
    private readonly words: HeardWord[],
    private readonly delay = 0.2,
  ) {}

  async load(): Promise<void> {}

  accept(samples: Float32Array, sampleRate: number): void {
    this.fed += samples.length / sampleRate;
    this.emitUntil(this.fed - this.delay);
  }

  flush(): void {
    this.emitUntil(Infinity);
  }

  reset(): void {
    this.fed = 0;
    this.next = 0;
  }

  onWords(cb: (w: HeardWord[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setHotwords(): void {
    // not applicable
  }

  realtimeFactor(): number {
    return 0.01;
  }

  dispose(): void {
    this.listeners.clear();
  }

  private emitUntil(t: number): void {
    const out: HeardWord[] = [];
    while (this.next < this.words.length && this.words[this.next]!.end <= t) out.push(this.words[this.next++]!);
    if (out.length) for (const l of this.listeners) l(out);
  }
}
```

`harness/test/run-engine.test.ts`:
```ts
import { DEFAULT_ALIGN_OPTIONS, buildExpected, type HeardWord, type ScriptLineInput } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { runEngine } from '../src/run-engine';
import { ScriptedRecognizer } from './helpers/scripted-recognizer';

const LINES: ScriptLineInput[] = [
  { id: 'A', characterId: 'X', text: 'one two three four five six' },
  { id: 'B', characterId: 'Y', text: 'seven eight nine ten' },
];
const SR = 16000;
const expected = buildExpected(LINES, { mode: 'word-perfect' });
const options = { ...DEFAULT_ALIGN_OPTIONS, patience: 0 };

function words(text: string): HeardWord[] {
  return text.split(' ').map((w, i) => ({ text: w, start: 0.5 + i * 0.4, end: 0.8 + i * 0.4, confidence: 0.95, final: true }));
}

describe('runEngine', () => {
  it('runs a clean performance to completion', () => {
    const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(words('one two three four five six seven eight nine ten')), expected, options);
    expect(run.durationSec).toBe(6);
    expect(run.events.flatMap(({ event }) => (event.type === 'lineDone' ? [event.lineId] : []))).toEqual(['A', 'B']);
    expect(run.events.some(({ event }) => event.type === 'flag')).toBe(false);
  });

  it('stamps flags with the audio time at which they fired', () => {
    const heard = words('one two three four five six seven eight banana ten');
    const run = runEngine(new Float32Array(SR * 6), SR, new ScriptedRecognizer(heard), expected, options);
    const flag = run.events.find(({ event }) => event.type === 'flag');
    expect(flag).toBeDefined();
    expect(flag!.audioTime).toBeGreaterThanOrEqual(heard[8]!.end);
    expect(flag!.event).toMatchObject({ alert: true, note: { lineId: 'B', category: 'wrong-words' } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run harness/test/run-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`harness/src/run-engine.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run harness/test/run-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harness
git commit -m "feat(harness): stream audio through recognizer and aligner with timed events"
```

---

## Task 17: Scoring, aggregation, targets, and the report

**Files:**
- Create: `harness/src/metrics.ts`
- Test: `harness/test/metrics.test.ts`

**Interfaces:**
- Consumes: `Label`, `isBenign` (Task 13); `RenderedSegment` (Task 15); `TimedEvent` (Task 16); `tokenize`, `NoteDraft` (`@dasma/align`).
- Produces:
  - `CORE_KINDS` (dropped-words, wrong-words, dropped-line: the spec's recall target)
  - `interface ScoredRun { errorLabels; detected; detectedInclChecks; sameCategory; coreLabels; coreDetected; perCategory: Record<string, { labels; detected }>; falseNotes; falseChecks; falseAlerts; benignViolations; alertLatencies: number[] }`
  - `labelTime(label, segments): number | null`
  - `scoreRun(labels, events, segments): ScoredRun`
  - `interface Aggregate { runs; audioMinutes; errorLabels; recall; recallInclChecks; coreRecall; sameCategoryRate; perCategory; falseNotesPerRun; falseAlertsPerRun; falseChecksPerRun; benignViolationsPerRun; falseNotesPer10Min; falseAlertsPer10Min; latencyP50: number | null; latencyP95: number | null; rtfMean }`
  - `aggregate(runs: Array<ScoredRun & { durationSec: number; rtf: number }>): Aggregate`
  - `interface EvalReport { createdAt: string; config: Record<string, unknown>; conditions: Record<string, Aggregate> }`
  - `TARGETS`, `checkTargets(room, agg)`, `formatReport(report): string`, `compareToBaseline(report, baseline): { pass: boolean; lines: string[] }`

Definitions:
- **Detected:** at least one `status: 'note'` on the labelled line in the final (`lineDone`) notes.
- **False note:** a `'note'` on a line with no error label. **False check:** a `'check'` on such a line, reported for information only.
- **False alert:** an alerting flag on a line with no error label. **Benign violation:** a false note on a line with a benign label.
- **Latency:** the time of the first alerting flag on the labelled line, minus the estimated end of the error word. That estimate spaces words evenly through the rendered segment, so it is approximate.
- **Gate:** fail if `coreRecall` drops by more than 0.03, `falseAlertsPerRun` rises by more than 0.2, or `falseNotesPerRun` rises by more than 0.3, for any condition present in both reports.

- [ ] **Step 1: Write the failing tests**

`harness/test/metrics.test.ts`:
```ts
import type { NoteDraft } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { aggregate, checkTargets, compareToBaseline, formatReport, scoreRun, type EvalReport } from '../src/metrics';
import type { Label } from '../src/perturb';
import type { TimedEvent } from '../src/run-engine';
import type { RenderedSegment } from '../src/tts';

const note = (lineId: string, category: NoteDraft['category'], status: 'note' | 'check' = 'note'): NoteDraft => ({
  lineId, characterId: 'X', category, expected: '', heard: '', confidence: status === 'note' ? 0.8 : 0.4, status, at: 0,
});

const segments: RenderedSegment[] = [
  { seg: { speaker: 'X', text: 'one two three four', pauseBefore: 0, lineId: 'A' }, start: 0, end: 2 },
  { seg: { speaker: 'X', text: 'five six seven eight', pauseBefore: 1, lineId: 'B' }, start: 3, end: 5 },
];
const labels: Label[] = [
  { kind: 'wrong-words', lineId: 'A', characterId: 'X', segmentIndex: 0, wordIndex: 1 },
  { kind: 'stumble', lineId: 'B', characterId: 'X', segmentIndex: 1, wordIndex: 0 },
];
const events: TimedEvent[] = [
  { event: { type: 'flag', note: note('A', 'wrong-words'), alert: true, at: 1.5 }, audioTime: 1.6 },
  { event: { type: 'lineDone', lineId: 'A', notes: [note('A', 'wrong-words')], at: 2 }, audioTime: 2.1 },
  { event: { type: 'flag', note: note('B', 'added-words'), alert: true, at: 4 }, audioTime: 4 },
  { event: { type: 'lineDone', lineId: 'B', notes: [note('B', 'added-words'), note('B', 'dropped-words', 'check')], at: 5 }, audioTime: 5 },
];

describe('scoreRun', () => {
  it('scores detections, false notes, false alerts, and latency', () => {
    const s = scoreRun(labels, events, segments);
    expect(s).toMatchObject({
      errorLabels: 1, detected: 1, detectedInclChecks: 1, sameCategory: 1, coreLabels: 1, coreDetected: 1,
      falseNotes: 1, falseChecks: 1, falseAlerts: 1, benignViolations: 1,
    });
    expect(s.perCategory['wrong-words']).toEqual({ labels: 1, detected: 1 });
    expect(s.alertLatencies).toHaveLength(1);
    expect(s.alertLatencies[0]).toBeCloseTo(0.6);
  });
});

describe('aggregate', () => {
  it('rolls runs up into rates', () => {
    const agg = aggregate([{ ...scoreRun(labels, events, segments), durationSec: 600, rtf: 0.2 }]);
    expect(agg).toMatchObject({ runs: 1, audioMinutes: 10, recall: 1, coreRecall: 1, falseAlertsPerRun: 1, falseNotesPerRun: 1, rtfMean: 0.2 });
    expect(agg.falseAlertsPer10Min).toBeCloseTo(1);
    expect(agg.latencyP50).toBeCloseTo(0.6);
  });
});

describe('targets and report', () => {
  const agg = aggregate([{ ...scoreRun(labels, events, segments), durationSec: 600, rtf: 0.2 }]);
  const report: EvalReport = { createdAt: '2026-10-10T00:00:00Z', config: { seeds: 1 }, conditions: { 'close-mic': agg } };

  it('checks the spec targets', () => {
    const rows = checkTargets('close-mic', agg);
    expect(rows.find((r) => r.label.startsWith('False alerts'))!.pass).toBe(true);
    expect(rows.find((r) => r.label.startsWith('Recall'))!.pass).toBe(true);
  });

  it('formats a markdown report', () => {
    const md = formatReport(report);
    expect(md).toContain('## close-mic');
    expect(md).toContain('| Recall (dropped/wrong word, dropped line)');
    expect(md).toMatch(/PASS|FAIL/);
  });

  it('gates regressions against a baseline', () => {
    expect(compareToBaseline(report, report).pass).toBe(true);
    const worse: EvalReport = { ...report, conditions: { 'close-mic': { ...agg, coreRecall: agg.coreRecall - 0.05 } } };
    expect(compareToBaseline(worse, report).pass).toBe(false);
    const noisier: EvalReport = { ...report, conditions: { 'close-mic': { ...agg, falseAlertsPerRun: agg.falseAlertsPerRun + 0.5 } } };
    expect(compareToBaseline(noisier, report).pass).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run harness/test/metrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`harness/src/metrics.ts`:
```ts
import { tokenize, type NoteDraft } from '@dasma/align';
import { isBenign, type Label } from './perturb';
import type { TimedEvent } from './run-engine';
import type { RenderedSegment } from './tts';

export const CORE_KINDS: ReadonlySet<string> = new Set(['dropped-words', 'wrong-words', 'dropped-line']);

export interface ScoredRun {
  errorLabels: number;
  detected: number;
  detectedInclChecks: number;
  sameCategory: number;
  coreLabels: number;
  coreDetected: number;
  perCategory: Record<string, { labels: number; detected: number }>;
  falseNotes: number;
  falseChecks: number;
  falseAlerts: number;
  benignViolations: number;
  alertLatencies: number[];
}

export function labelTime(label: Label, segments: RenderedSegment[]): number | null {
  const s = segments[label.segmentIndex];
  if (!s) return null;
  const n = Math.max(1, tokenize(s.seg.text).length);
  return s.start + ((Math.min(label.wordIndex, n - 1) + 1) / n) * (s.end - s.start);
}

export function scoreRun(labels: Label[], events: TimedEvent[], segments: RenderedSegment[]): ScoredRun {
  const notes: NoteDraft[] = events.flatMap(({ event }) => (event.type === 'lineDone' ? event.notes : []));
  const flags = events.flatMap(({ event, audioTime }) => (event.type === 'flag' ? [{ note: event.note, alert: event.alert, audioTime }] : []));
  const errors = labels.filter((l) => !isBenign(l.kind));
  const errorLines = new Set(errors.map((l) => l.lineId));
  const benignLines = new Set(labels.filter((l) => isBenign(l.kind)).map((l) => l.lineId));
  const s: ScoredRun = {
    errorLabels: 0, detected: 0, detectedInclChecks: 0, sameCategory: 0, coreLabels: 0, coreDetected: 0,
    perCategory: {}, falseNotes: 0, falseChecks: 0, falseAlerts: 0, benignViolations: 0, alertLatencies: [],
  };
  for (const label of errors) {
    const onLine = notes.filter((n) => n.lineId === label.lineId);
    const hit = onLine.some((n) => n.status === 'note');
    const cat = (s.perCategory[label.kind] ??= { labels: 0, detected: 0 });
    s.errorLabels++;
    cat.labels++;
    if (hit) {
      s.detected++;
      cat.detected++;
    }
    if (onLine.length) s.detectedInclChecks++;
    if (onLine.some((n) => n.status === 'note' && n.category === label.kind)) s.sameCategory++;
    if (CORE_KINDS.has(label.kind)) {
      s.coreLabels++;
      if (hit) s.coreDetected++;
    }
    const t = labelTime(label, segments);
    const alert = flags.find((f) => f.alert && f.note.lineId === label.lineId);
    if (t !== null && alert) s.alertLatencies.push(Math.max(0, alert.audioTime - t));
  }
  for (const n of notes) {
    if (errorLines.has(n.lineId)) continue;
    if (n.status === 'note') {
      s.falseNotes++;
      if (benignLines.has(n.lineId)) s.benignViolations++;
    } else s.falseChecks++;
  }
  s.falseAlerts = flags.filter((f) => f.alert && !errorLines.has(f.note.lineId)).length;
  return s;
}

export interface Aggregate {
  runs: number;
  audioMinutes: number;
  errorLabels: number;
  recall: number;
  recallInclChecks: number;
  coreRecall: number;
  sameCategoryRate: number;
  perCategory: Record<string, { labels: number; detected: number }>;
  falseNotesPerRun: number;
  falseAlertsPerRun: number;
  falseChecksPerRun: number;
  benignViolationsPerRun: number;
  falseNotesPer10Min: number;
  falseAlertsPer10Min: number;
  latencyP50: number | null;
  latencyP95: number | null;
  rtfMean: number;
}

export function aggregate(runs: Array<ScoredRun & { durationSec: number; rtf: number }>): Aggregate {
  const sum = (f: (r: ScoredRun & { durationSec: number; rtf: number }) => number) => runs.reduce((s, r) => s + f(r), 0);
  const n = Math.max(1, runs.length);
  const minutes = sum((r) => r.durationSec) / 60;
  const per10 = (x: number) => (minutes > 0 ? (x / minutes) * 10 : 0);
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 1);
  const lat = runs.flatMap((r) => r.alertLatencies).sort((a, b) => a - b);
  const pct = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.max(0, Math.ceil(p * lat.length) - 1))]! : null);
  const perCategory: Record<string, { labels: number; detected: number }> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.perCategory)) {
      const c = (perCategory[k] ??= { labels: 0, detected: 0 });
      c.labels += v.labels;
      c.detected += v.detected;
    }
  }
  const errorLabels = sum((r) => r.errorLabels);
  return {
    runs: runs.length,
    audioMinutes: minutes,
    errorLabels,
    recall: ratio(sum((r) => r.detected), errorLabels),
    recallInclChecks: ratio(sum((r) => r.detectedInclChecks), errorLabels),
    coreRecall: ratio(sum((r) => r.coreDetected), sum((r) => r.coreLabels)),
    sameCategoryRate: ratio(sum((r) => r.sameCategory), errorLabels),
    perCategory,
    falseNotesPerRun: sum((r) => r.falseNotes) / n,
    falseAlertsPerRun: sum((r) => r.falseAlerts) / n,
    falseChecksPerRun: sum((r) => r.falseChecks) / n,
    benignViolationsPerRun: sum((r) => r.benignViolations) / n,
    falseNotesPer10Min: per10(sum((r) => r.falseNotes)),
    falseAlertsPer10Min: per10(sum((r) => r.falseAlerts)),
    latencyP50: pct(0.5),
    latencyP95: pct(0.95),
    rtfMean: sum((r) => r.rtf) / n,
  };
}

export interface EvalReport {
  createdAt: string;
  config: Record<string, unknown>;
  conditions: Record<string, Aggregate>;
}

type Target = { metric: keyof Aggregate; op: '<=' | '>=' | '<'; value: number; label: string };

const FAR: Target[] = [
  { metric: 'falseAlertsPerRun', op: '<=', value: 1, label: 'False alerts per scene' },
  { metric: 'falseNotesPerRun', op: '<=', value: 2, label: 'False notes per scene' },
  { metric: 'coreRecall', op: '>=', value: 0.75, label: 'Recall (dropped/wrong word, dropped line)' },
];

export const TARGETS: Record<string, Target[]> = {
  'close-mic': [
    { metric: 'falseAlertsPer10Min', op: '<=', value: 1, label: 'False alerts per 10 min' },
    { metric: 'falseNotesPer10Min', op: '<=', value: 1, label: 'False notes per 10 min' },
    { metric: 'coreRecall', op: '>=', value: 0.9, label: 'Recall (dropped/wrong word, dropped line)' },
    { metric: 'latencyP50', op: '<', value: 0.5, label: 'Alert latency p50, s (meaningful at --patience 0)' },
  ],
  'far-field': FAR,
  'far-field-hard': FAR,
};

export function checkTargets(room: string, agg: Aggregate): Array<{ label: string; value: number | null; target: string; pass: boolean }> {
  return (TARGETS[room] ?? []).map((t) => {
    const value = agg[t.metric] as number | null;
    const pass = value !== null && (t.op === '<=' ? value <= t.value : t.op === '>=' ? value >= t.value : value < t.value);
    return { label: t.label, value, target: `${t.op} ${t.value}`, pass };
  });
}

const fmt = (v: number | null) => (v === null ? 'n/a' : Number.isInteger(v) ? String(v) : v.toFixed(3));

export function formatReport(report: EvalReport): string {
  const out: string[] = [`# DASMA harness report`, '', `Created ${report.createdAt}`, '', '```json', JSON.stringify(report.config, null, 2), '```', ''];
  for (const [room, agg] of Object.entries(report.conditions)) {
    out.push(`## ${room}`, '', `${agg.runs} runs, ${agg.audioMinutes.toFixed(1)} min of audio, ${agg.errorLabels} planted errors, mean RTF ${agg.rtfMean.toFixed(3)}`, '');
    out.push('| Target | Value | Required | Result |', '|---|---|---|---|');
    for (const row of checkTargets(room, agg)) out.push(`| ${row.label} | ${fmt(row.value)} | ${row.target} | ${row.pass ? 'PASS' : 'FAIL'} |`);
    out.push('', '| Metric | Value |', '|---|---|');
    for (const key of ['recall', 'recallInclChecks', 'sameCategoryRate', 'falseNotesPerRun', 'falseAlertsPerRun', 'falseChecksPerRun', 'benignViolationsPerRun', 'latencyP50', 'latencyP95'] as const) {
      out.push(`| ${key} | ${fmt(agg[key])} |`);
    }
    out.push('', '| Category | Planted | Detected | Rate |', '|---|---|---|---|');
    for (const [k, v] of Object.entries(agg.perCategory)) out.push(`| ${k} | ${v.labels} | ${v.detected} | ${fmt(v.labels ? v.detected / v.labels : null)} |`);
    out.push('');
  }
  return out.join('\n');
}

export function compareToBaseline(report: EvalReport, baseline: EvalReport): { pass: boolean; lines: string[] } {
  const lines: string[] = [];
  let pass = true;
  for (const [room, agg] of Object.entries(report.conditions)) {
    const base = baseline.conditions[room];
    if (!base) {
      lines.push(`${room}: no baseline — skipped`);
      continue;
    }
    const checks: Array<[string, boolean]> = [
      [`coreRecall ${fmt(agg.coreRecall)} vs ${fmt(base.coreRecall)}`, agg.coreRecall >= base.coreRecall - 0.03],
      [`falseAlertsPerRun ${fmt(agg.falseAlertsPerRun)} vs ${fmt(base.falseAlertsPerRun)}`, agg.falseAlertsPerRun <= base.falseAlertsPerRun + 0.2],
      [`falseNotesPerRun ${fmt(agg.falseNotesPerRun)} vs ${fmt(base.falseNotesPerRun)}`, agg.falseNotesPerRun <= base.falseNotesPerRun + 0.3],
    ];
    for (const [text, ok] of checks) {
      lines.push(`${room}: ${ok ? 'ok  ' : 'FAIL'} ${text}`);
      if (!ok) pass = false;
    }
  }
  return { pass, lines };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run harness/test/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harness
git commit -m "feat(harness): scoring, aggregation, spec targets, report, and regression gate"
```

---
## Task 18: Model download, the evaluation pipeline, and the CLI

**Files:**
- Create: `harness/src/models.ts`, `harness/src/evaluate.ts`, `harness/src/cli.ts`
- Create: `harness/test/helpers/fake-tts.ts`
- Modify: `harness/test/helpers/scripted-recognizer.ts` (add `oracleWords`)
- Test: `harness/test/models.test.ts`, `harness/test/evaluate.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 11–17; `MODEL_CATALOG`, `findModel`, `ModelSpec` (`@dasma/asr`); `NodeSherpaRecognizer`, `resolveAsrModel`, `loadSherpa` (`@dasma/asr/node`).
- Produces:
  - `TTS_MODEL: ModelSpec`, `ALL_MODELS`, `checkLock(lock, id, sha256): 'recorded' | 'verified'` (throws on mismatch), `fetchModels(only?, log?)`
  - `interface EvalConfig { sceneIds: string[] | 'all'; seeds: number; rooms: RoomName[]; patience: number; strictness: Strictness; errorRate: number; benignRate: number; model: string }`
  - `interface EvalDeps { tts: TtsEngine; makeRecognizer: (rendered: RenderedPerformance) => Recognizer; scenes?: Scene[]; onRun?: (info) => void; saveAudio?: (name, samples, sampleRate) => void }`
  - `interface RunRecord { room; sceneId; seed; labels; notes; score; durationSec; rtf }`
  - `evaluate(config, deps): { report: EvalReport; runs: RunRecord[] }`. Each scene×seed is rendered once and played through every room, so rooms are compared on identical performances.
  - CLI: `npm run harness -- fetch-models | evaluate | gate | baseline`. Relative paths resolve against the directory you ran `npm` from (`INIT_CWD`).

**Security note:** `fetch-models` is the only code that touches the network. It downloads only from the official `k2-fsa/sherpa-onnx` GitHub releases listed in the catalog. It records each archive's SHA-256 in `harness/models.lock.json` on first download and refuses any later download whose hash differs. Archives are extracted with the system `tar` into `harness/models/`, which is git-ignored.

- [ ] **Step 1: Test helpers**

`harness/test/helpers/fake-tts.ts`:
```ts
import type { TtsEngine } from '../../src/tts';

/** 0.32 s of constant signal per word at 16 kHz. */
export const fakeTts: TtsEngine = {
  synth: (text) => ({
    samples: new Float32Array(Math.round(16000 * 0.32 * text.split(/\s+/).filter(Boolean).length)).fill(0.1),
    sampleRate: 16000,
  }),
};
```

Append to `harness/test/helpers/scripted-recognizer.ts` (and add `import type { RenderedPerformance } from '../../src/tts';` to its imports):
```ts
/** Words exactly as performed, spaced evenly through each rendered segment — a perfect recognizer. */
export function oracleWords(rendered: RenderedPerformance, confidence = 0.95): HeardWord[] {
  return rendered.segments
    .flatMap(({ seg, start, end }) => {
      const toks = seg.text.split(/\s+/).filter(Boolean);
      const d = (end - start) / Math.max(1, toks.length);
      return toks.map((t, k) => ({
        text: t.replace(/[^A-Za-z0-9']/g, ''),
        start: start + k * d,
        end: start + (k + 1) * d - 0.02,
        confidence,
        final: true,
      }));
    })
    .filter((w) => w.text);
}
```

- [ ] **Step 2: Write the failing tests**

`harness/test/models.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ALL_MODELS, TTS_MODEL, checkLock } from '../src/models';

describe('model lock', () => {
  it('records a new hash, verifies a matching one, and rejects a changed one', () => {
    const lock: Record<string, string> = {};
    expect(checkLock(lock, 'm', 'abc')).toBe('recorded');
    expect(lock).toEqual({ m: 'abc' });
    expect(checkLock(lock, 'm', 'abc')).toBe('verified');
    expect(() => checkLock(lock, 'm', 'def')).toThrow(/Checksum mismatch/);
  });

  it('only downloads from official sherpa-onnx releases', () => {
    expect(TTS_MODEL.kind).toBe('tts-vits');
    for (const m of ALL_MODELS) expect(m.url.startsWith('https://github.com/k2-fsa/sherpa-onnx/releases/download/')).toBe(true);
  });
});
```

`harness/test/evaluate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { evaluate, type EvalConfig } from '../src/evaluate';
import { fakeTts } from './helpers/fake-tts';
import { ScriptedRecognizer, oracleWords } from './helpers/scripted-recognizer';

const config: EvalConfig = {
  sceneIds: 'all',
  seeds: 3,
  rooms: ['close-mic'],
  patience: 0.5,
  strictness: { mode: 'word-perfect' },
  errorRate: 0.35,
  benignRate: 0.2,
  model: 'oracle',
};
const deps = { tts: fakeTts, makeRecognizer: (r: Parameters<typeof oracleWords>[0]) => new ScriptedRecognizer(oracleWords(r)) };

describe('evaluate (end to end, perfect recognizer)', () => {
  it('finds planted errors without false alarms', () => {
    const { report, runs } = evaluate(config, deps);
    const agg = report.conditions['close-mic']!;
    expect(agg.runs).toBe(6);
    expect(runs).toHaveLength(6);
    expect(agg.errorLabels).toBeGreaterThan(10);
    expect(agg.coreRecall).toBeGreaterThanOrEqual(0.7);
    expect(agg.recallInclChecks).toBeGreaterThanOrEqual(0.8);
    expect(agg.falseAlertsPerRun).toBeLessThanOrEqual(0.5);
    expect(agg.falseNotesPerRun).toBeLessThanOrEqual(0.5);
  });

  it('is deterministic', () => {
    const one = { ...config, seeds: 1 };
    expect(evaluate(one, deps).report.conditions).toEqual(evaluate(one, deps).report.conditions);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run harness/test/models.test.ts harness/test/evaluate.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `models.ts`**

`harness/src/models.ts`:
```ts
import { MODEL_CATALOG, type ModelSpec } from '@dasma/asr';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { LOCK_FILE, MODELS_DIR } from './paths';

export const TTS_MODEL: ModelSpec = {
  id: 'piper-en_US-libritts_r-medium',
  kind: 'tts-vits',
  role: 'tts',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-libritts_r-medium.tar.bz2',
  dirName: 'vits-piper-en_US-libritts_r-medium',
  license: 'Piper voice trained on LibriTTS-R. Used only to generate test audio; never shipped.',
};

export const ALL_MODELS: ModelSpec[] = [...MODEL_CATALOG, TTS_MODEL];

export function checkLock(lock: Record<string, string>, id: string, sha256: string): 'recorded' | 'verified' {
  const known = lock[id];
  if (!known) {
    lock[id] = sha256;
    return 'recorded';
  }
  if (known !== sha256) throw new Error(`Checksum mismatch for ${id}: expected ${known}, got ${sha256}`);
  return 'verified';
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function fetchModels(only?: string, log: (msg: string) => void = console.log): Promise<void> {
  mkdirSync(MODELS_DIR, { recursive: true });
  const lock: Record<string, string> = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, 'utf8')) : {};
  for (const spec of ALL_MODELS) {
    if (only && spec.id !== only) continue;
    if (existsSync(join(MODELS_DIR, spec.dirName))) {
      log(`✓ ${spec.id} already present`);
      continue;
    }
    const archive = join(MODELS_DIR, `${spec.dirName}.tar.bz2`);
    log(`↓ ${spec.id}\n  ${spec.url}`);
    const res = await fetch(spec.url);
    if (!res.ok || !res.body) throw new Error(`Download failed for ${spec.id}: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as unknown as WebReadableStream), createWriteStream(archive));
    const sha = await sha256File(archive);
    log(`  sha256 ${sha} (${checkLock(lock, spec.id, sha)})`);
    execFileSync('tar', ['-xjf', archive, '-C', MODELS_DIR]);
    rmSync(archive);
    writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  }
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
}
```

- [ ] **Step 5: Implement `evaluate.ts`**

`harness/src/evaluate.ts`:
```ts
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
        runs.push({
          room,
          sceneId: scene.id,
          seed,
          labels: perf.labels,
          notes: run.events.flatMap(({ event }) => (event.type === 'lineDone' ? event.notes : [])),
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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run harness/test/models.test.ts harness/test/evaluate.test.ts`
Expected: PASS.
The oracle test runs the whole pipeline (perturb → render → room → engine → score) with a perfect recognizer. If it fails, the bug is in label semantics or scoring, not the recognizer. Print `runs` and compare each missed label with the notes on its line. If perturb and the aligner disagree about where a note belongs (for example a jumped-cue landing on the skipped line), fix whichever side contradicts the label-semantics table in Task 13. Do not loosen the thresholds.

- [ ] **Step 7: Implement the CLI**

`harness/src/cli.ts`:
```ts
import type { Strictness } from '@dasma/align';
import { findModel } from '@dasma/asr';
import { NodeSherpaRecognizer, loadSherpa, resolveAsrModel } from '@dasma/asr/node';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { evaluate } from './evaluate';
import { compareToBaseline, formatReport, type EvalReport } from './metrics';
import { fetchModels } from './models';
import { BASELINE_FILE, MODELS_DIR, OUT_DIR } from './paths';
import { ROOM_PRESETS, type RoomName } from './room';
import { createSherpaTts } from './tts';

const USAGE = `Usage: npm run harness -- <command> [options]

  fetch-models [--only <model-id>]            Download ASR + TTS models into harness/models (needs network)
  evaluate [options]                          Generate labelled rehearsals, run the engine, score it
      --scenes all|<id,id>      default all
      --seeds <n>               default 10
      --rooms <a,b>             default close-mic,far-field   (also: far-field-hard)
      --model <id>              default zipformer-en-2023-06-21
      --patience <0..1>         default 0.5
      --strictness <mode>       word-perfect | lenient   default word-perfect
      --error-rate <0..1>       default 0.35
      --benign-rate <0..1>      default 0.2
      --out <dir>               default harness/out/<timestamp>
      --save-audio              also write each rehearsal as WAV
  gate --report <path> [--baseline <path>]    Exit 1 if results regressed vs the baseline
  baseline --report <path>                    Make a report the new baseline`;

const fromCwd = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

async function runEvaluate(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      scenes: { type: 'string', default: 'all' },
      seeds: { type: 'string', default: '10' },
      rooms: { type: 'string', default: 'close-mic,far-field' },
      model: { type: 'string', default: 'zipformer-en-2023-06-21' },
      patience: { type: 'string', default: '0.5' },
      strictness: { type: 'string', default: 'word-perfect' },
      'error-rate': { type: 'string', default: '0.35' },
      'benign-rate': { type: 'string', default: '0.2' },
      out: { type: 'string' },
      'save-audio': { type: 'boolean', default: false },
    },
  });
  const rooms = values.rooms.split(',') as RoomName[];
  for (const r of rooms) if (!(r in ROOM_PRESETS)) throw new Error(`Unknown room "${r}". Known: ${Object.keys(ROOM_PRESETS).join(', ')}`);
  const strictness: Strictness =
    values.strictness === 'lenient' ? { mode: 'lenient', lineMatchThreshold: 0.8 } : { mode: 'word-perfect' };
  const out = values.out ? fromCwd(values.out) : join(OUT_DIR, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(out, { recursive: true });

  const recognizer = new NodeSherpaRecognizer();
  await recognizer.load(resolveAsrModel(MODELS_DIR, findModel(values.model)));
  const sherpa = loadSherpa();
  const { report, runs } = evaluate(
    {
      sceneIds: values.scenes === 'all' ? 'all' : values.scenes.split(','),
      seeds: Number(values.seeds),
      rooms,
      patience: Number(values.patience),
      strictness,
      errorRate: Number(values['error-rate']),
      benignRate: Number(values['benign-rate']),
      model: values.model,
    },
    {
      tts: createSherpaTts(),
      makeRecognizer: () => {
        recognizer.reset();
        return recognizer;
      },
      onRun: ({ room, sceneId, seed, score }) =>
        console.log(`${room} ${sceneId} #${seed}: detected ${score.detected}/${score.errorLabels}, false notes ${score.falseNotes}, false alerts ${score.falseAlerts}`),
      saveAudio: values['save-audio']
        ? (name, samples, sampleRate) => sherpa.writeWave(join(out, `${name}.wav`), { samples, sampleRate })
        : undefined,
    },
  );
  recognizer.dispose();
  const md = formatReport(report);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, 'runs.json'), `${JSON.stringify(runs, null, 2)}\n`);
  writeFileSync(join(out, 'report.md'), md);
  console.log(`\n${md}\nWrote ${out}`);
}

function runGate(args: string[]): void {
  const { values } = parseArgs({ args, options: { report: { type: 'string' }, baseline: { type: 'string' } } });
  if (!values.report) throw new Error('gate needs --report <path>');
  const baselinePath = values.baseline ? fromCwd(values.baseline) : BASELINE_FILE;
  if (!existsSync(baselinePath)) {
    console.error(`No baseline at ${baselinePath}. Create one with: npm run harness -- baseline --report <path>`);
    process.exitCode = 1;
    return;
  }
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as EvalReport;
  const { pass, lines } = compareToBaseline(read(fromCwd(values.report)), read(baselinePath));
  console.log(lines.join('\n'));
  console.log(pass ? 'GATE PASS' : 'GATE FAIL');
  if (!pass) process.exitCode = 1;
}

function runBaseline(args: string[]): void {
  const { values } = parseArgs({ args, options: { report: { type: 'string' } } });
  if (!values.report) throw new Error('baseline needs --report <path>');
  mkdirSync(dirname(BASELINE_FILE), { recursive: true });
  copyFileSync(fromCwd(values.report), BASELINE_FILE);
  console.log(`Baseline set from ${values.report}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'fetch-models': {
      const { values } = parseArgs({ args, options: { only: { type: 'string' } } });
      await fetchModels(values.only);
      return;
    }
    case 'evaluate':
      return runEvaluate(args);
    case 'gate':
      return runGate(args);
    case 'baseline':
      return runBaseline(args);
    default:
      console.log(USAGE);
      if (command && command !== '--help') process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

- [ ] **Step 8: Check the CLI wiring, then lint, typecheck, and run the full suite**

Run:
```bash
npm run harness -- --help
npm run lint
npm run typecheck
npm test
```
Expected: the usage text prints; lint, typecheck, and every test pass (integration tests skip).

- [ ] **Step 9: Commit**

```bash
git add harness
git commit -m "feat(harness): model fetch with checksum lock, evaluation pipeline, CLI"
```

---

## Task 19: Run the M1 evaluation and write the go/no-go report

This task runs the real models, so it needs network access once (for `fetch-models`) and several minutes of CPU. It ends at a **checkpoint**: stop and present `docs/m1-results.md` to the user. Do not start M2.

**Files:**
- Create: `harness/models.lock.json` (written by `fetch-models`), `harness/baselines/baseline.json`, `docs/m1-results.md`

- [ ] **Step 1: Download the models**

Run: `npm run harness -- fetch-models`
Expected: four models are downloaded and extracted under `harness/models/` (several hundred MB in total), and `harness/models.lock.json` lists four SHA-256 hashes.

- [ ] **Step 2: Run the integration tests for real**

Run: `npx vitest run packages/asr/test/node-recognizer.int.test.ts harness/test/tts.int.test.ts`
Expected: PASS, not skipped.
- If the clock-continuity test fails because the last word starts after `2·dur + 3.5`, the binding's timestamps are already absolute. Change `NodeSherpaRecognizer.collect` to pass offset `0` instead of `this.segmentStart`, and re-run.
- If the TTS test fails on the request shape, apply the `GenerationConfig` fallback described in Task 15, Step 5.

- [ ] **Step 3: Smoke-run one scene and listen to it**

Run: `npm run harness -- evaluate --scenes earnest-act1 --seeds 1 --rooms close-mic,far-field --save-audio --out harness/out/smoke`
Expected: two run lines and a report. Open one of `harness/out/smoke/*.wav` and listen. You should hear the scene in distinct voices, the far-field version should sound roomy and noisy, and the planted errors listed in `runs.json` should be audible where they belong.

- [ ] **Step 4: Run the full evaluation matrix**

```bash
npm run harness -- evaluate --seeds 10 --rooms close-mic,far-field,far-field-hard --out harness/out/m1-default
npm run harness -- evaluate --seeds 10 --rooms close-mic --patience 0 --out harness/out/m1-instant
npm run harness -- evaluate --seeds 10 --rooms close-mic,far-field --model zipformer-en-20M-2023-02-17 --out harness/out/m1-light
```
Expected: each command finishes and writes `report.md`, `report.json`, and `runs.json`.

- [ ] **Step 5: Find the most common false notes**

```bash
node -e "
const runs = require('./harness/out/m1-default/runs.json');
const benign = new Set(['stumble','chatter','long-pause']);
const counts = {}; const examples = {};
for (const r of runs) {
  const errLines = new Set(r.labels.filter(l => !benign.has(l.kind)).map(l => l.lineId));
  for (const n of r.notes) if (n.status === 'note' && !errLines.has(n.lineId)) {
    const k = r.room + ' / ' + n.category;
    counts[k] = (counts[k] || 0) + 1;
    (examples[k] ||= []).length < 3 && examples[k].push('expected \"' + n.expected + '\" heard \"' + n.heard + '\"');
  }
}
console.log(JSON.stringify({ counts, examples }, null, 2));
"
```

- [ ] **Step 6: Record the baseline and check that the gate works**

```bash
npm run harness -- baseline --report harness/out/m1-default/report.json
npm run harness -- gate --report harness/out/m1-default/report.json
```
Expected: `GATE PASS`. A report compared with itself must pass.

- [ ] **Step 7: Write `docs/m1-results.md`**

Use this structure. Copy the numbers from the three `report.md` files and the Step 5 output, and don't round away failures.

```markdown
# M1 Results — Matching Engine & Harness (go/no-go)

Date: <date> · Commit: <`git rev-parse --short HEAD`> · Spec: docs/superpowers/specs/2026-10-10-dasma-design.md §10–§11

## What was measured
- Scenes: earnest-act1, romeo-balcony (public domain) · 10 seeds each · error rate 0.35, benign rate 0.2
- Recognizer: <model> (sherpa-onnx streaming Zipformer, int8, Node binding, no hotwords)
- Audio: synthetic multi-speaker TTS (Piper libritts_r) + simulated rooms (close-mic; far-field RT60 0.6 s, SNR 18 dB, laptop EQ; far-field-hard RT60 0.9 s, SNR 10 dB)
- Caveat: synthetic voices are cleaner and more regular than real actors — treat these numbers as an upper bound until real recordings (D21) are run through the same harness.

## Results vs. spec targets
### Close mic — patience 0.5 (m1-default) and 0 (m1-instant, latency)
| Target | Required | Measured | Result |
|---|---|---|---|
| False alerts / 10 min | ≤ 1 | | |
| False notes / 10 min | ≤ 1 | | |
| Recall (dropped/wrong word, dropped line) | ≥ 0.90 | | |
| Alert latency p50 (patience 0) | < 0.5 s | | |

### Far field (laptop across the room)
| Target | Required | Measured | Result |
|---|---|---|---|
| False alerts / scene | ≤ 1 | | |
| False notes / scene | ≤ 2 | | |
| Recall | ≥ 0.75 | | |

### Far field (hard room) and light model
<same tables, copied from m1-default far-field-hard and m1-light>

## Detection by category
<per-category table from m1-default report.md, close-mic and far-field side by side>

## Where false notes come from
<Step 5 output: top categories with 2–3 examples each, and a one-line diagnosis per category>

## Speed
Mean real-time factor per model and room (must be well under 1.0 for live use in a browser later).

## Recommendation
One of:
- **GO** — close-mic meets every target; far-field meets both false-alarm targets with recall ≥ 0.6. Proceed to M2 (scripts) with the current engine defaults.
- **GO WITH ENGINE CHANGES** — false-alarm targets met but recall short (or vice versa); list the specific engine changes and re-run before M3.
- **SINGLE-LAPTOP NO-GO** — far-field false alarms exceed budget even at patience 1. Per spec §10, bring per-actor audio sources forward rather than loosening the budget.

Next data needed: real rehearsal recordings (D21) run through `harness` in the same report format.
```

- [ ] **Step 8: Commit and stop at the checkpoint**

```bash
git add harness/models.lock.json harness/baselines/baseline.json docs/m1-results.md
git commit -m "docs: M1 engine evaluation results and go/no-go recommendation"
```
**Checkpoint:** present `docs/m1-results.md` to the user and wait for their decision before writing the M2 plan.
