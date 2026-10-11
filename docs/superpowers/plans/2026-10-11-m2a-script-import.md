# M2a Script Import Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/script`, which turns a PDF, a Word file or pasted text into a tagged DASMA `Script`. Then prove on a synthetic public-domain corpus that the result is "fast to fix".

**Architecture:**
- **Pipeline.** Each format has its own extractor that produces one shared line form, `RawDoc`. Clean-up and a document profile follow. Next, a seven-state sequence tagger decodes every line, using Viterbi for the tags and forward-backward for the confidences. Unit building and cast/alias building run last.
- **Purity.** Everything except the two file readers is pure TypeScript.
- **Harness.** It turns five Project Gutenberg plays into tagged source files. It renders them in twelve layout styles (PDF, Word, text), re-imports each document, and scores the result by aligning the words against the truth.

**Tech Stack:** TypeScript 6 (strict), Vitest 5, Node ≥ 24, npm workspaces, `pdfjs-dist` 6.3.289, `fflate` 0.8.3. The harness also uses `pdf-lib` 1.17.1, `docx` 9.7.1 and `diff` 9.0.0.

**Spec:** [`docs/superpowers/specs/2026-10-11-script-import-design.md`](../specs/2026-10-11-script-import-design.md), cited as "spec §n". The parent is [`docs/superpowers/specs/2026-10-10-dasma-design.md`](../specs/2026-10-10-dasma-design.md), cited as "MVP spec §n".

## Global Constraints

- **Purity.** Every file in `packages/script/src` is pure TypeScript, with no `node:*` imports and none of the globals `window`, `document`, `navigator`, `process` or `Buffer`. The one exception is `extract/pdf.ts` and `extract/docx.ts`, which may import `pdfjs-dist` and `fflate` respectively (spec §3.1).
- `@dasma/align` is the only workspace import in `packages/script`. Use it for the `ScriptLineInput` type, `tokenize` and `normalizeToken` (spec §3.1).
- **Exact version pins, with no `^`:**
  - `pdfjs-dist` `6.3.289`
  - `fflate` `0.8.3`
  - `pdf-lib` `1.17.1`
  - `docx` `9.7.1`
  - `diff` `9.0.0`

  `pdf-lib` and `docx` are devDependencies of both `packages/script` and the harness. `diff` is a devDependency of the harness only.
- Everything stays offline. Import never touches the network. The only network step in the whole plan is Task 12's one-off download of five Gutenberg texts.
- Never commit a licensed script. Test material is public domain or synthetic, and `harness/local/` is git-ignored (spec §1).
- **Commits.** Use the repo-local email `5440145+ThomasParas@users.noreply.github.com` (check with `git config user.email` before the first commit), and end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- **Gate targets, per family, on the held-out set (spec §1).** They are never loosened:

  | Target | Required |
  |---|---|
  | Fixes per page, mean | ≤ 1 |
  | Fixes on the worst page | ≤ 4 |
  | Speaker accuracy | ≥ 0.98 |
  | Flagged share of errors | ≥ 0.90 |
  | False flags per page | ≤ 2 |
  | Text accuracy | ≥ 0.995 |
- There are at most two measure-and-tune rounds (spec §6.5).
- Import error messages, verbatim (spec §5.4):
  - `noTextLayer`: "Scanned PDFs aren't supported yet; paste the text instead."
  - `encrypted`: "This PDF is password-protected; remove the password and try again."
  - `unreadable`: "This file couldn't be read; it may be damaged."
  - `unsupportedFormat`: "Save it as .docx or PDF and try again."
  - `empty`: "No script text was found in this file."
- **Tests and checks.**
  - Run all tests with `npm test`, and one file with `npx vitest run <path>`.
  - Typecheck with `npm run typecheck` and lint with `npm run lint`. Both must pass at the end of every task.
- **Weights.** Every hand-set scoring constant lives in `packages/script/src/weights.ts`. If a tagging test fails only because of a weight value, change `weights.ts`, not the test. Then say so in the task report.

## Review Focus

The spec implies these five inputs, and no task would otherwise test them. Each line names the task that adds the pinning test:

1. **A PDF that stores each word, or each glyph, as its own text item**, with small kerning gaps. Words must come out whole ("Hello", not "H e l l o"). Pinned in Task 3.
2. **Character names with accents, apostrophes, hyphens or abbreviation periods** (`JOSÉ`, `O'BRIEN`, `MARY-ANNE`, `MRS. ALVING`). They must be recognised as cues and get stable, readable ids. Pinned in Task 5.
3. **A pasted scene excerpt with no title, cast list or heading.** No line may become front matter, and every speech keeps its speaker. Pinned in Task 9.
4. **A Word file with a soft line break (Shift+Enter, `<w:br/>`) inside a paragraph.** The words on either side are kept and separated by a space. Pinned in Task 2.
5. **A re-import where a scene was inserted mid-script and the user had cut lines.** Cuts and ids survive, and the inserted lines get fresh ids. Pinned in Task 11.

## File Structure

**`packages/script/`, the new package**

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json` | Workspace package `@dasma/script`. |
| `src/types.ts` | `RawSpan`, `RawLine`, `RawDoc`, `SourceRef`, `CleanLine`, `CleanDoc`, `SpeakerConvention`, `DocProfile`, `UnitKind`, `Unit`, `Character`, `Script`, `ImportInput`, `ImportWarning`, `ImportResult`. |
| `src/errors.ts` | `ScriptImportError` and its messages; `ScriptFormatError`. |
| `src/extract/pages.ts` | `estimatedPages`, `assignEstimatedPages`. |
| `src/extract/lines.ts` | `letterCount`, `spanShare`, helpers shared by the extractors. |
| `src/extract/text.ts` | `extractText`. |
| `src/extract/xml.ts` | A minimal XML event reader. |
| `src/extract/docx.ts` | `extractDocx`, `readStyles`. Uses fflate. |
| `src/extract/pdf.ts` | `extractPdf`, `groupItems`, `markCentered`, `mapPdfError`. Uses pdfjs-dist. |
| `src/clean.ts` | `cleanDoc`, `normalizeText`, and the clean-up thresholds. |
| `src/patterns.ts` | `isHeading`, `CAST_LIST_HEADER`, `SCENE_BREAK`. |
| `src/cues.ts` | `matchCue`, `normalizeCueToken`, `capsShare`, `isStopToken`. |
| `src/characters.ts` | `buildCast`, `inCastList`, `slugId`. |
| `src/profile.ts` | `profileDoc`, `clusterBands`, `nearestBand`. |
| `src/weights.ts` | Every hand-set constant: emission weights, transitions, alias confidences, stop tokens, `FLAG_BELOW`, `MANY_FLAGGED_SHARE`. |
| `src/decode.ts` | Generic Viterbi and forward-backward in log space. |
| `src/tag.ts` | `STATES`, `CATEGORY`, `lineFeatures`, `tagLines`. |
| `src/units.ts` | `buildUnits`: line states to units, splitting out inline directions. |
| `src/overlap.ts` | `applyOverlapMarks`. |
| `src/import.ts` | `importScript`, `sniffUnsupported`. |
| `src/align-adapter.ts` | `toAlignLines`, `UNKNOWN_CHARACTER`. |
| `src/format.ts` | `writeDasma`, `readDasma`. |
| `src/diff.ts` | `diffScripts`, `carryOver`, `similarity`. |
| `src/index.ts` | Public exports. |
| `test/*.test.ts`, `test/helpers.ts` | Vitest tests. |

**`harness/`**

| File | Responsibility |
|---|---|
| `src/corpus/source-play.ts` | `SourcePlay` types, `loadPlay`, `PLAY_IDS`. |
| `src/corpus/convert-gutenberg.ts` | `convertGutenberg`, `PLAY_CONFIGS`. |
| `corpus/plays/*.json` | The five committed source plays. |
| `src/corpus/types.ts` | `Family`, `Variant`, `DocFormat`, `DocSpec`, `TruthUnit`, `TruthFile`, `Run`, `Para`, `docId`. |
| `src/corpus/manifest.ts` | `FAMILIES`, `FAMILY_PLAYS`, `VARIANT_FORMAT`, `corpusDocs`. |
| `src/corpus/styles.ts` | `StyleSpec`, `STYLES`. |
| `src/corpus/excerpt.ts` | `selectExcerpt`. |
| `src/corpus/paras.ts` | `buildParas`, `abbreviation`, `titleCase`. |
| `src/corpus/write-text.ts` | `textFromDrawn`, `textFromParas`, `classicalText`. |
| `src/corpus/write-pdf.ts` | `writePdf`. |
| `src/corpus/write-docx.ts` | `writeDocx`, `docxParaPages`. |
| `src/corpus/render.ts` | `renderDocument`. |
| `src/script-eval/score.ts` | `scoreDocument`, `alignWords`, `wordErrors`, `resolveCast`, `words`. |
| `src/script-eval/report.ts` | `familyMetrics`, `gateFailures`, `formatScriptReport`, `SCRIPT_GATE`. |
| `src/script-eval/evaluate-scripts.ts` | `evaluateScripts`, `loadLocalDocs`. |
| `src/script-eval/dump.ts` | `renderDumpHtml`. |
| `src/cli.ts` (modify) | Adds the `convert-plays`, `build-corpus`, `script-eval` and `script-dump` commands. |
| `src/paths.ts` (modify) | Adds `PLAYS_DIR`, `CORPUS_OUT_DIR`, `LOCAL_DIR`, `DUMP_DIR`, `SCRIPT_EVAL_DIR`. |

**Other files touched**

| File | Change |
|---|---|
| `eslint.config.js` | Boundary rules for `packages/script`. |
| `.gitignore` | Adds `harness/local/`. |
| `docs/script-import-results.md` | Results of the measure-and-tune rounds. |
| `docs/superpowers/specs/2026-10-10-dasma-design.md` | MVP spec updates (spec §7). |
| `README.md` | Package table. |

---

### Task 1: Scaffold `packages/script`: types, errors, pages, text extraction

**Files:**
- Create: `packages/script/package.json`, `packages/script/tsconfig.json`
- Create: `packages/script/src/types.ts`, `src/errors.ts`, `src/extract/pages.ts`, `src/extract/lines.ts`, `src/extract/text.ts`, `src/index.ts`
- Create: `packages/script/test/extract-text.test.ts`
- Modify: `eslint.config.js`, `package-lock.json` (via `npm install`)

**Interfaces:**
- Consumes: nothing.
- Produces: every type in spec §4.1, §5.1 and §7, exactly as written below; `ScriptImportError` (`.code: ImportErrorCode`); `ScriptFormatError` (`.reason`, `.path?`); `IMPORT_ERROR_MESSAGES`; `estimatedPages(texts: readonly string[]): number[]`; `assignEstimatedPages(lines: {page: number; text: string}[]): number`; `letterCount(s: string): number`; `spanShare(spans: RawSpan[], pick: (s: RawSpan) => boolean): number`; `extractText(text: string): RawDoc`; `TEXT_COLUMN = 6`.

- [ ] **Step 1: Create the package files**

`packages/script/package.json`:

```json
{
  "name": "@dasma/script",
  "version": "0.0.0",
  "license": "MIT",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p ."
  },
  "dependencies": {
    "@dasma/align": "*",
    "fflate": "0.8.3",
    "pdfjs-dist": "6.3.289"
  },
  "devDependencies": {
    "docx": "9.7.1",
    "pdf-lib": "1.17.1"
  }
}
```

`packages/script/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "types": ["node"] },
  "include": ["src", "test"]
}
```

`node` types are listed only so the tests can use `docx`'s `Buffer` results. ESLint keeps Node APIs out of `src` (Step 2).

Run: `npm install`
Expected: installs without errors. `package-lock.json` now lists `pdfjs-dist@6.3.289`, `fflate@0.8.3`, `docx@9.7.1` and `pdf-lib@1.17.1`.

- [ ] **Step 2: Add the ESLint boundary**

In `eslint.config.js`, add these two blocks after the existing `packages/align/src/**/*.ts` block, inside the same `tseslint.config(...)` call:

```js
  {
    files: ['packages/script/src/**/*.ts'],
    ignores: ['packages/script/src/extract/pdf.ts', 'packages/script/src/extract/docx.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'packages/script stays free of Node APIs.' },
            { group: ['pdfjs-dist', 'pdfjs-dist/*', 'fflate'], message: 'Only extract/pdf.ts and extract/docx.ts read files.' },
            { group: ['@dasma/*', '!@dasma/align'], message: '@dasma/align is the only workspace import.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'process', 'Buffer'],
    },
  },
  {
    files: ['packages/script/src/extract/pdf.ts', 'packages/script/src/extract/docx.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['node:*', '@dasma/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'process', 'Buffer'],
    },
  },
```

- [ ] **Step 3: Write the types and errors**

`packages/script/src/types.ts`:

```ts
export type SourceKind = 'pdf' | 'docx' | 'text';

export interface RawSpan {
  text: string;
  left: number;
  right: number;
  italic: boolean;
  bold: boolean;
}

export interface RawLine {
  /** 1-based. */
  page: number;
  /** The spans' text in reading order. */
  text: string;
  /** pdf: text items; docx: runs; text: one span. */
  spans: RawSpan[];
  /** Left edge in points (pdf), twips/20 (docx) or leading-space columns × 6 (text). */
  left: number;
  right: number;
  centered: boolean;
  /** More than half the line's letters are italic. */
  italic: boolean;
  bold: boolean;
  /** Font size in points; 0 if unknown. */
  size: number;
}

export interface RawDoc {
  source: SourceKind;
  pageWidth: number;
  pages: number;
  /** False when pages were estimated (docx without page breaks, text without form feeds). */
  realPages: boolean;
  lines: RawLine[];
}

/** Where a cleaned line came from: its page and its index in `RawDoc.lines`. */
export interface SourceRef {
  page: number;
  line: number;
}

export interface CleanLine extends RawLine {
  source: SourceRef[];
}

export interface CleanDoc {
  source: SourceKind;
  pageWidth: number;
  pages: number;
  realPages: boolean;
  lines: CleanLine[];
}

export type SpeakerConvention = 'ownLine' | 'inlinePeriod' | 'inlineColon' | 'classicalAbbrev';

export interface DocProfile {
  /** Indent bands: left edges clustered within 12 pt (pdf/docx) or one text column. */
  bands: number[];
  speakerBand: number | 'centered' | null;
  dialogueBand: number | null;
  directionBand: number | null;
  primary: SpeakerConvention | null;
  /** Kept when it covers at least 15% of recurring speeches. */
  secondary: SpeakerConvention | null;
  /** Shares, 0..1, among direction-like lines (italic, bracketed or off the speaker/dialogue bands). */
  directionMarks: { italic: number; parens: number; brackets: number; ownBand: number };
  /** Names from a cast-list block, normalized cue tokens. */
  castList: string[];
  /** Candidate speaker token → count in speaker position (only tokens seen at least twice). */
  cueTokens: Map<string, number>;
  /** Index of the first line that is not front matter. */
  frontMatterEnd: number;
}

export type UnitKind = 'dialogue' | 'direction' | 'characterName' | 'heading' | 'sceneBreak' | 'frontMatter';

export interface Unit {
  id: string;
  kind: UnitKind;
  characterId?: string;
  text: string;
  cut: boolean;
  /** Half-open ranges of `tokenize` word indices spoken in overlap. */
  overlapRanges?: Array<[number, number]>;
  /** 0..1 */
  tagConfidence: number;
  source: SourceRef[];
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
}

export interface Script {
  title: string;
  characters: Character[];
  units: Unit[];
}

export type ImportInput =
  | { kind: 'pdf'; bytes: Uint8Array }
  | { kind: 'docx'; bytes: Uint8Array }
  | { kind: 'text'; text: string };

export type ImportWarning =
  | { code: 'noSpeakers' }
  | { code: 'mixedConventions'; conventions: [SpeakerConvention, SpeakerConvention] }
  | { code: 'manyFlagged'; share: number }
  | { code: 'ambiguousAlias'; token: string; candidates: string[] };

export interface ImportResult {
  script: Script;
  profile: DocProfile;
  warnings: ImportWarning[];
  pages: number;
}
```

`packages/script/src/errors.ts`:

```ts
export type ImportErrorCode = 'noTextLayer' | 'encrypted' | 'unreadable' | 'unsupportedFormat' | 'empty';

export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  noTextLayer: "Scanned PDFs aren't supported yet; paste the text instead.",
  encrypted: 'This PDF is password-protected; remove the password and try again.',
  unreadable: "This file couldn't be read; it may be damaged.",
  unsupportedFormat: 'Save it as .docx or PDF and try again.',
  empty: 'No script text was found in this file.',
};

export class ScriptImportError extends Error {
  readonly code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(IMPORT_ERROR_MESSAGES[code]);
    this.name = 'ScriptImportError';
    this.code = code;
  }
}

export type FormatErrorReason = 'notJson' | 'notDasma' | 'newerVersion' | 'invalid';

const FORMAT_MESSAGES: Record<FormatErrorReason, string> = {
  notJson: 'This file is not a DASMA script.',
  notDasma: 'This file is not a DASMA script.',
  newerVersion: 'This script was made with a newer version of DASMA.',
  invalid: 'This DASMA script is damaged',
};

export class ScriptFormatError extends Error {
  readonly reason: FormatErrorReason;
  /** For `invalid`: the field at fault, e.g. `units[12].kind`. */
  readonly path?: string;
  constructor(reason: FormatErrorReason, path?: string) {
    super(path ? `${FORMAT_MESSAGES[reason]} (${path}).` : FORMAT_MESSAGES[reason]);
    this.name = 'ScriptFormatError';
    this.reason = reason;
    this.path = path;
  }
}
```

- [ ] **Step 4: Write the failing tests for pages and text extraction**

`packages/script/test/extract-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { estimatedPages } from '../src/extract/pages';
import { extractText } from '../src/extract/text';

describe('extractText', () => {
  it('reads indentation from leading spaces and tabs, and skips blank lines', () => {
    const doc = extractText('HAMLET\n\n    To be, or not to be.\n\t(He sits.)\r\n');
    expect(doc.source).toBe('text');
    expect(doc.lines.map((l) => [l.text, l.left])).toEqual([
      ['HAMLET', 0],
      ['To be, or not to be.', 24],
      ['(He sits.)', 24],
    ]);
    expect(doc.lines[0].spans).toEqual([{ text: 'HAMLET', left: 0, right: 36, italic: false, bold: false }]);
    expect(doc.lines.every((l) => !l.centered && !l.italic && !l.bold && l.size === 0)).toBe(true);
  });

  it('starts a new page at each form feed', () => {
    const doc = extractText('One\fTwo\nThree\f\fFour');
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
      ['Three', 2],
      ['Four', 4],
    ]);
    expect(doc.realPages).toBe(true);
    expect(doc.pages).toBe(4);
  });

  it('estimates pages when there are no form feeds', () => {
    const doc = extractText(Array.from({ length: 51 }, (_, i) => `Line ${i}`).join('\n'));
    expect(doc.realPages).toBe(false);
    expect(doc.lines[49].page).toBe(1);
    expect(doc.lines[50].page).toBe(2);
    expect(doc.pages).toBe(2);
  });

  it('gives an empty document no pages', () => {
    expect(extractText('  \n\n').pages).toBe(0);
  });
});

describe('estimatedPages', () => {
  it('counts a long line as several page lines', () => {
    expect(estimatedPages(['x'.repeat(80 * 49), 'a', 'b'])).toEqual([1, 1, 2]);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/extract-text.test.ts`
Expected: FAIL, because `../src/extract/pages` and `../src/extract/text` don't exist yet.

- [ ] **Step 6: Implement pages, lines and text extraction**

`packages/script/src/extract/pages.ts`:

```ts
/** Page lines per estimated page. */
export const PAGE_LINES = 50;
/** Characters per estimated page line. */
export const CHARS_PER_PAGE_LINE = 80;

/**
 * Pages for documents without real page breaks (spec §4.1): each line fills
 * max(1, ceil(characters / 80)) page lines and a page holds 50. Returns the
 * 1-based page each line starts on. The corpus renderers use this too.
 */
export function estimatedPages(texts: readonly string[]): number[] {
  const pages: number[] = [];
  let used = 0;
  for (const text of texts) {
    pages.push(Math.floor(used / PAGE_LINES) + 1);
    used += Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE_LINE));
  }
  return pages;
}

/** Sets each line's page from `estimatedPages`; returns the page count (0 for no lines). */
export function assignEstimatedPages(lines: Array<{ page: number; text: string }>): number {
  const pages = estimatedPages(lines.map((l) => l.text));
  lines.forEach((l, i) => {
    l.page = pages[i];
  });
  return pages.length ? pages[pages.length - 1] : 0;
}
```

`packages/script/src/extract/lines.ts`:

```ts
import type { RawSpan } from '../types';

export function letterCount(s: string): number {
  return s.replace(/\s/g, '').length;
}

/** Share of the spans' non-space characters for which `pick` holds (0 when there are none). */
export function spanShare(spans: readonly RawSpan[], pick: (s: RawSpan) => boolean): number {
  const total = spans.reduce((n, s) => n + letterCount(s.text), 0);
  if (total === 0) return 0;
  return spans.filter(pick).reduce((n, s) => n + letterCount(s.text), 0) / total;
}
```

`packages/script/src/extract/text.ts`:

```ts
import type { RawDoc, RawLine } from '../types';
import { assignEstimatedPages } from './pages';

/** Width of one text column, in the same units as pdf points, so bands compare across formats. */
export const TEXT_COLUMN = 6;
const TAB = '    ';

export function extractText(text: string): RawDoc {
  const lines: RawLine[] = [];
  let page = 1;
  let sawFormFeed = false;
  for (const physical of text.replace(/\r\n?/g, '\n').split('\n')) {
    physical.split('\f').forEach((piece, k) => {
      if (k > 0) {
        page++;
        sawFormFeed = true;
      }
      const expanded = piece.replace(/\t/g, TAB);
      const body = expanded.trim();
      if (!body) return;
      const left = (expanded.length - expanded.trimStart().length) * TEXT_COLUMN;
      const right = left + body.length * TEXT_COLUMN;
      lines.push({
        page,
        text: body,
        spans: [{ text: body, left, right, italic: false, bold: false }],
        left,
        right,
        centered: false,
        italic: false,
        bold: false,
        size: 0,
      });
    });
  }
  let pages = 0;
  if (lines.length) pages = sawFormFeed ? page : assignEstimatedPages(lines);
  return { source: 'text', pageWidth: 80 * TEXT_COLUMN, pages, realPages: sawFormFeed, lines };
}
```

`packages/script/src/index.ts`:

```ts
export * from './types';
export { IMPORT_ERROR_MESSAGES, ScriptFormatError, ScriptImportError } from './errors';
export type { FormatErrorReason, ImportErrorCode } from './errors';
export { CHARS_PER_PAGE_LINE, PAGE_LINES, assignEstimatedPages, estimatedPages } from './extract/pages';
export { TEXT_COLUMN, extractText } from './extract/text';
```

- [ ] **Step 7: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/extract-text.test.ts && npm run typecheck && npm run lint`
Expected: 5 tests pass. Typecheck and lint are clean.

- [ ] **Step 8: Commit**

```bash
git add packages/script eslint.config.js package-lock.json
git commit -m "feat(script): scaffold @dasma/script with types, errors, pages and text extraction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Word extraction (`extract/xml.ts`, `extract/docx.ts`)

**Files:**
- Create: `packages/script/src/extract/xml.ts`, `packages/script/src/extract/docx.ts`
- Create: `packages/script/test/extract-docx.test.ts`, `packages/script/test/helpers.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `RawDoc`, `RawLine`, `RawSpan` (Task 1); `ScriptImportError`; `assignEstimatedPages`; `spanShare`.
- Produces: `extractDocx(bytes: Uint8Array): RawDoc`; `readStyles(xml: string): Map<string, {italic?: boolean; bold?: boolean; centered?: boolean; left?: number}>`; `DOCX_TAB_INDENT = 36`; `xmlEvents(xml: string): Generator<XmlEvent>`; `thrownCode(fn)` test helper.

- [ ] **Step 1: Write the test helper and the failing tests**

`packages/script/test/helpers.ts`:

```ts
import { ScriptFormatError, ScriptImportError } from '../src/errors';

/** The `code` of the ScriptImportError (or `reason` of the ScriptFormatError) `fn` throws; null if it doesn't throw. */
export function thrownCode(fn: () => unknown): string | null {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScriptImportError) return err.code;
    if (err instanceof ScriptFormatError) return err.reason;
    throw err;
  }
  return null;
}
```

`packages/script/test/extract-docx.test.ts`:

```ts
import { AlignmentType, Document, Packer, PageBreak, Paragraph, TextRun } from 'docx';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractDocx, readStyles } from '../src/extract/docx';
import { thrownCode } from './helpers';

async function docxOf(children: Paragraph[]): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function rawDocx(body: string, styles?: string): Uint8Array {
  return zipSync({
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`),
    ...(styles ? { 'word/styles.xml': strToU8(`<?xml version="1.0"?><w:styles ${W}>${styles}</w:styles>`) } : {}),
  });
}

describe('extractDocx', () => {
  it('reads alignment, indentation, bold and italic runs', async () => {
    const doc = extractDocx(
      await docxOf([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'HAMLET', bold: true })] }),
        new Paragraph({
          indent: { left: 720 },
          children: [new TextRun('To be, '), new TextRun({ text: '(aside)', italics: true }), new TextRun(' or not')],
        }),
      ]),
    );
    expect(doc.source).toBe('docx');
    const [name, speech] = doc.lines;
    expect([name.text, name.centered, name.bold, name.left]).toEqual(['HAMLET', true, true, 0]);
    expect([speech.text, speech.centered, speech.left, speech.italic]).toEqual(['To be, (aside) or not', false, 36, false]);
    expect(speech.spans.map((s) => [s.text, s.italic])).toEqual([
      ['To be, ', false],
      ['(aside)', true],
      [' or not', false],
    ]);
  });

  it('turns leading tabs into indent and keeps an interior tab as whitespace', async () => {
    const doc = extractDocx(await docxOf([new Paragraph({ children: [new TextRun('\tNORA:\tHello')] })]));
    expect([doc.lines[0].text, doc.lines[0].left]).toEqual(['NORA:\tHello', 36]);
  });

  it('starts a new page at a page break', async () => {
    const doc = extractDocx(
      await docxOf([new Paragraph('First page'), new Paragraph({ children: [new PageBreak()] }), new Paragraph('Second page')]),
    );
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['First page', 1],
      ['Second page', 2],
    ]);
    expect(doc.realPages).toBe(true);
    expect(doc.pages).toBe(2);
  });

  it('estimates pages when there are no page breaks', async () => {
    const doc = extractDocx(await docxOf(Array.from({ length: 51 }, (_, i) => new Paragraph(`Line ${i}`))));
    expect(doc.realPages).toBe(false);
    expect(doc.lines[50].page).toBe(2);
  });

  it('applies paragraph-style italics unless a run turns them off', () => {
    const styles =
      '<w:style w:type="paragraph" w:styleId="Dir"><w:name w:val="Direction"/><w:rPr><w:i/></w:rPr></w:style>';
    const body =
      '<w:p><w:pPr><w:pStyle w:val="Dir"/></w:pPr><w:r><w:t>He sits.</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Dir"/></w:pPr><w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t>Not italic.</w:t></w:r></w:p>';
    const doc = extractDocx(rawDocx(body, styles));
    expect(doc.lines.map((l) => [l.text, l.italic])).toEqual([
      ['He sits.', true],
      ['Not italic.', false],
    ]);
  });

  it('turns a soft line break into a space (review focus 4)', () => {
    const doc = extractDocx(rawDocx('<w:p><w:r><w:t>To be,</w:t><w:br/><w:t>or not to be.</w:t></w:r></w:p>'));
    expect(doc.lines.map((l) => l.text)).toEqual(['To be, or not to be.']);
  });

  it('decodes XML entities', () => {
    const doc = extractDocx(rawDocx('<w:p><w:r><w:t>Tom &amp; Jerry &#8212; &lt;yes&gt;</w:t></w:r></w:p>'));
    expect(doc.lines[0].text).toBe('Tom & Jerry — <yes>');
  });

  it('rejects bytes that are not a zip as unreadable', () => {
    expect(thrownCode(() => extractDocx(new Uint8Array([1, 2, 3, 4])))).toBe('unreadable');
  });

  it('says a Pages file is unsupported', () => {
    expect(thrownCode(() => extractDocx(zipSync({ 'Index/Document.iwa': new Uint8Array([0]) })))).toBe('unsupportedFormat');
  });

  it('says a zip without a Word document is unreadable', () => {
    expect(thrownCode(() => extractDocx(zipSync({ 'hello.txt': strToU8('hi') })))).toBe('unreadable');
  });
});

describe('readStyles', () => {
  it('reads italic, bold, centring and indent per style id', () => {
    const styles = readStyles(
      `<w:styles ${W}><w:style w:styleId="Cue"><w:pPr><w:jc w:val="center"/><w:ind w:left="1440"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`,
    );
    expect(styles.get('Cue')).toEqual({ centered: true, left: 72, bold: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/extract-docx.test.ts`
Expected: FAIL, because `../src/extract/docx` doesn't exist yet.

- [ ] **Step 3: Implement the XML reader**

`packages/script/src/extract/xml.ts`:

```ts
export type XmlAttrs = Record<string, string>;
export type XmlEvent =
  | { type: 'open'; name: string; attrs: XmlAttrs; selfClosing: boolean }
  | { type: 'close'; name: string }
  | { type: 'text'; text: string };

// Groups: 1 CDATA body; 2 "/" of a closing tag; 3 tag name; 4 attributes; 5 "/" of a self-closing tag; 6 text.
const TOKEN =
  /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return NAMED[e];
  });
}

/** Streams the tags and text of a well-formed XML document. Declarations and comments are skipped. */
export function* xmlEvents(xml: string): Generator<XmlEvent> {
  for (const m of xml.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      yield { type: 'text', text: m[1] };
    } else if (m[3] !== undefined) {
      if (m[2] === '/') {
        yield { type: 'close', name: m[3] };
        continue;
      }
      const attrs: XmlAttrs = {};
      for (const a of (m[4] ?? '').matchAll(ATTR)) attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
      yield { type: 'open', name: m[3], attrs, selfClosing: m[5] === '/' };
    } else if (m[6] !== undefined) {
      yield { type: 'text', text: decodeEntities(m[6]) };
    }
  }
}
```

- [ ] **Step 4: Implement the Word extractor**

`packages/script/src/extract/docx.ts`:

```ts
import { strFromU8, unzipSync } from 'fflate';
import { ScriptImportError } from '../errors';
import type { RawDoc, RawLine, RawSpan } from '../types';
import { spanShare } from './lines';
import { assignEstimatedPages } from './pages';
import { xmlEvents, type XmlAttrs } from './xml';

const TWIPS_PER_POINT = 20;
/** Indent given to each leading tab, in points (Word's default tab stop is half an inch). */
export const DOCX_TAB_INDENT = 36;
/** Assumed character width, in points, for span positions (Word files carry no glyph positions). */
const CHAR_WIDTH = 6;
const DEFAULT_PAGE_WIDTH = 612;

interface StyleProps {
  italic?: boolean;
  bold?: boolean;
  centered?: boolean;
  left?: number;
}
interface Run {
  text: string;
  italic?: boolean;
  bold?: boolean;
}
interface Para {
  styleId: string;
  centered?: boolean;
  left?: number;
  breakBefore: boolean;
  breakAfter: boolean;
  runs: Run[];
}

function on(attrs: XmlAttrs): boolean {
  const v = attrs['w:val'];
  return v === undefined || !['0', 'false', 'off', 'none'].includes(v);
}

function indentOf(attrs: XmlAttrs): number | undefined {
  const v = attrs['w:left'] ?? attrs['w:start'];
  return v === undefined ? undefined : Number(v) / TWIPS_PER_POINT;
}

export function readStyles(xml: string): Map<string, StyleProps> {
  const styles = new Map<string, StyleProps>();
  const stack: string[] = [];
  let id: string | null = null;
  let props: StyleProps = {};
  for (const e of xmlEvents(xml)) {
    if (e.type === 'open') {
      const parent = stack[stack.length - 1];
      if (e.name === 'w:style') {
        id = e.attrs['w:styleId'] ?? '';
        props = {};
      } else if (id !== null) {
        if (e.name === 'w:i' && parent === 'w:rPr') props.italic = on(e.attrs);
        else if (e.name === 'w:b' && parent === 'w:rPr') props.bold = on(e.attrs);
        else if (e.name === 'w:jc' && parent === 'w:pPr') props.centered = e.attrs['w:val'] === 'center';
        else if (e.name === 'w:ind' && parent === 'w:pPr') props.left = indentOf(e.attrs);
      }
      if (!e.selfClosing) stack.push(e.name);
      else if (e.name === 'w:style' && id !== null) {
        styles.set(id, props);
        id = null;
      }
    } else if (e.type === 'close') {
      stack.pop();
      if (e.name === 'w:style' && id !== null) {
        styles.set(id, props);
        id = null;
      }
    }
  }
  return styles;
}

export function extractDocx(bytes: Uint8Array): RawDoc {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ScriptImportError('unreadable');
  }
  const documentXml = files['word/document.xml'];
  if (!documentXml) {
    if (Object.keys(files).some((n) => n.startsWith('Index/') || n === 'index.xml')) {
      throw new ScriptImportError('unsupportedFormat');
    }
    throw new ScriptImportError('unreadable');
  }
  const styles = files['word/styles.xml'] ? readStyles(strFromU8(files['word/styles.xml'])) : new Map<string, StyleProps>();

  const lines: RawLine[] = [];
  let page = 1;
  let sawBreak = false;
  let pageWidth = DEFAULT_PAGE_WIDTH;
  const stack: string[] = [];
  let para: Para | null = null;
  let run: Run | null = null;
  let inText = false;

  const emit = (p: Para): void => {
    if (p.breakBefore && lines.length > 0) {
      page++;
      sawBreak = true;
    }
    const style = styles.get(p.styleId) ?? {};
    const runs = p.runs.filter((r) => r.text.length > 0);
    const joined = runs.map((r) => r.text).join('');
    const lead = /^[\t ]*/.exec(joined)?.[0] ?? '';
    const tabs = lead.split('\t').length - 1;
    const text = joined.slice(lead.length).replace(/[\t ]+$/, '');
    if (text) {
      const left = (p.left ?? style.left ?? 0) + tabs * DOCX_TAB_INDENT;
      const spans: RawSpan[] = [];
      let offset = 0;
      let skip = lead.length;
      for (const r of runs) {
        let t = r.text;
        if (skip > 0) {
          const cut = Math.min(skip, t.length);
          t = t.slice(cut);
          skip -= cut;
        }
        if (offset + t.length > text.length) t = t.slice(0, Math.max(0, text.length - offset));
        if (!t) continue;
        spans.push({
          text: t,
          left: left + offset * CHAR_WIDTH,
          right: left + (offset + t.length) * CHAR_WIDTH,
          italic: r.italic ?? style.italic ?? false,
          bold: r.bold ?? style.bold ?? false,
        });
        offset += t.length;
      }
      lines.push({
        page,
        text,
        spans,
        left,
        right: left + text.length * CHAR_WIDTH,
        centered: p.centered ?? style.centered ?? false,
        italic: spanShare(spans, (s) => s.italic) > 0.5,
        bold: spanShare(spans, (s) => s.bold) > 0.5,
        size: 0,
      });
    }
    if (p.breakAfter) page++;
  };

  const pageBreak = (): void => {
    sawBreak = true;
    const hasText = para !== null && (para.runs.some((r) => r.text.trim()) || (run !== null && run.text.trim() !== ''));
    if (para !== null && hasText) para.breakAfter = true;
    else page++;
  };

  for (const e of xmlEvents(strFromU8(documentXml))) {
    if (e.type === 'text') {
      if (inText && run) run.text += e.text;
      continue;
    }
    if (e.type === 'close') {
      stack.pop();
      if (e.name === 'w:t') inText = false;
      else if (e.name === 'w:r' && run && para) {
        para.runs.push(run);
        run = null;
      } else if (e.name === 'w:p' && para) {
        emit(para);
        para = null;
      }
      continue;
    }
    const parent = stack[stack.length - 1];
    const grand = stack[stack.length - 2];
    switch (e.name) {
      case 'w:p':
        para = { styleId: '', breakBefore: false, breakAfter: false, runs: [] };
        break;
      case 'w:pStyle':
        if (para && parent === 'w:pPr') para.styleId = e.attrs['w:val'] ?? '';
        break;
      case 'w:jc':
        if (para && parent === 'w:pPr') para.centered = e.attrs['w:val'] === 'center';
        break;
      case 'w:ind':
        if (para && parent === 'w:pPr') para.left = indentOf(e.attrs);
        break;
      case 'w:pageBreakBefore':
        if (para && parent === 'w:pPr' && on(e.attrs)) para.breakBefore = true;
        break;
      case 'w:r':
        if (para) run = { text: '' };
        break;
      case 'w:i':
        if (run && parent === 'w:rPr' && grand === 'w:r') run.italic = on(e.attrs);
        break;
      case 'w:b':
        if (run && parent === 'w:rPr' && grand === 'w:r') run.bold = on(e.attrs);
        break;
      case 'w:t':
        inText = !e.selfClosing;
        break;
      case 'w:tab':
        if (run && parent === 'w:r') run.text += '\t';
        break;
      case 'w:br':
        if (e.attrs['w:type'] === 'page') pageBreak();
        else if (run) run.text += ' ';
        break;
      case 'w:lastRenderedPageBreak':
        pageBreak();
        break;
      case 'w:pgSz':
        if (e.attrs['w:w']) pageWidth = Number(e.attrs['w:w']) / TWIPS_PER_POINT;
        break;
    }
    if (!e.selfClosing) stack.push(e.name);
  }

  let pages = 0;
  if (lines.length) pages = sawBreak ? Math.max(...lines.map((l) => l.page)) : assignEstimatedPages(lines);
  return { source: 'docx', pageWidth, pages, realPages: sawBreak, lines };
}
```

Add to `packages/script/src/index.ts`:

```ts
export { DOCX_TAB_INDENT, extractDocx } from './extract/docx';
```

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/extract-docx.test.ts && npm run typecheck && npm run lint`
Expected: 11 tests pass. Typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add packages/script
git commit -m "feat(script): read Word files from document.xml with alignment, indent and styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: PDF extraction (`extract/pdf.ts`)

**Files:**
- Create: `packages/script/src/extract/pdf.ts`
- Create: `packages/script/test/extract-pdf.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `RawDoc`, `RawLine`, `RawSpan`, `ScriptImportError`, `spanShare`.
- Produces:
  - `extractPdf(bytes: Uint8Array): Promise<RawDoc>`
  - `groupItems(items: readonly PdfItem[], page: number): RawLine[]`
  - `markCentered(lines: RawLine[], pageWidth: number): void`
  - `mapPdfError(err: unknown): ScriptImportError`
  - `interface PdfItem { text: string; x: number; y: number; width: number; size: number; italic: boolean; bold: boolean }`
  - the constants `BASELINE_TOLERANCE = 2` and `SPACE_GAP = 0.2`

- [ ] **Step 1: Write the failing tests**

`packages/script/test/extract-pdf.test.ts`:

```ts
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { extractPdf, groupItems, mapPdfError } from '../src/extract/pdf';

interface Fonts {
  regular: PDFFont;
  italic: PDFFont;
  bold: PDFFont;
}

async function pdfOf(pages: Array<(page: PDFPage, fonts: Fonts) => void>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  for (const draw of pages) draw(doc.addPage([612, 792]), fonts);
  return doc.save();
}

const LONG = 'Whether tis nobler in the mind to suffer the slings and arrows of outrageous fortune,';

describe('extractPdf', () => {
  it('reads lines in order with centring, italic and bold', async () => {
    const bytes = await pdfOf([
      (page, f) => {
        const w = f.bold.widthOfTextAtSize('HAMLET', 12);
        page.drawText('HAMLET', { x: (612 - w) / 2, y: 700, size: 12, font: f.bold });
        for (let i = 0; i < 6; i++) page.drawText(LONG, { x: 72, y: 684 - i * 16, size: 12, font: f.regular });
        page.drawText('(He sits.)', { x: 108, y: 580, size: 12, font: f.italic });
      },
    ]);
    const doc = await extractPdf(bytes);
    expect(doc.source).toBe('pdf');
    expect(doc.realPages).toBe(true);
    expect(doc.pages).toBe(1);
    expect(doc.lines.map((l) => l.text)).toEqual(['HAMLET', LONG, LONG, LONG, LONG, LONG, LONG, '(He sits.)']);
    expect(doc.lines.map((l) => l.centered)).toEqual([true, false, false, false, false, false, false, false]);
    expect(doc.lines[0].bold).toBe(true);
    expect(doc.lines[7].italic).toBe(true);
    expect(doc.lines[7].left).toBeCloseTo(108, 0);
  });

  it('joins items on one baseline, with a space only across a real gap', async () => {
    const bytes = await pdfOf([
      (page, f) => {
        const name = f.bold.widthOfTextAtSize('NORA.', 12);
        page.drawText('NORA.', { x: 72, y: 700, size: 12, font: f.bold });
        page.drawText('Hello there.', { x: 72 + name + 4, y: 700, size: 12, font: f.regular });
        const hel = f.regular.widthOfTextAtSize('Hel', 12);
        page.drawText('Hel', { x: 72, y: 680, size: 12, font: f.regular });
        page.drawText('lo', { x: 72 + hel, y: 680, size: 12, font: f.regular });
      },
    ]);
    const doc = await extractPdf(bytes);
    expect(doc.lines.map((l) => l.text)).toEqual(['NORA. Hello there.', 'Hello']);
    expect(doc.lines[0].spans.map((s) => [s.text, s.bold])).toEqual([
      ['NORA.', true],
      ['Hello there.', false],
    ]);
  });

  it('keeps words whole when every glyph is its own item (review focus 1)', async () => {
    const bytes = await pdfOf([
      (page, f) => {
        let x = 72;
        for (const ch of 'Hello') {
          page.drawText(ch, { x, y: 700, size: 12, font: f.regular });
          x += f.regular.widthOfTextAtSize(ch, 12) + 0.5;
        }
        x += 4;
        for (const ch of 'world') {
          page.drawText(ch, { x, y: 700, size: 12, font: f.regular });
          x += f.regular.widthOfTextAtSize(ch, 12) + 0.5;
        }
      },
    ]);
    expect((await extractPdf(bytes)).lines.map((l) => l.text)).toEqual(['Hello world']);
  });

  it('numbers lines by page', async () => {
    const bytes = await pdfOf([
      (page, f) => page.drawText('One', { x: 72, y: 700, size: 12, font: f.regular }),
      (page, f) => page.drawText('Two', { x: 72, y: 700, size: 12, font: f.regular }),
    ]);
    const doc = await extractPdf(bytes);
    expect(doc.pages).toBe(2);
    expect(doc.lines.map((l) => [l.text, l.page])).toEqual([
      ['One', 1],
      ['Two', 2],
    ]);
  });

  it('says a PDF with no text is scanned', async () => {
    const bytes = await pdfOf([(page) => page.drawRectangle({ x: 10, y: 10, width: 50, height: 50 })]);
    await expect(extractPdf(bytes)).rejects.toMatchObject({ code: 'noTextLayer' });
  });

  it('says bytes that are not a PDF are unreadable', async () => {
    await expect(extractPdf(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({ code: 'unreadable' });
  });

  it('leaves the caller’s bytes usable', async () => {
    const bytes = await pdfOf([(page, f) => page.drawText('One', { x: 72, y: 700, size: 12, font: f.regular })]);
    await extractPdf(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});

describe('mapPdfError', () => {
  it('maps a password error to encrypted and anything else to unreadable', () => {
    expect(mapPdfError({ name: 'PasswordException' }).code).toBe('encrypted');
    expect(mapPdfError(new Error('boom')).code).toBe('unreadable');
  });
});

describe('groupItems', () => {
  it('puts items within 2 pt of a baseline on one line, sorted by x', () => {
    const item = (text: string, x: number, y: number) => ({ text, x, y, width: text.length * 5, size: 10, italic: false, bold: false });
    const lines = groupItems([item('world', 110, 701), item('Hello', 72, 700), item('Next', 72, 680)], 3);
    expect(lines.map((l) => [l.text, l.page])).toEqual([
      ['Hello world', 3],
      ['Next', 3],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/extract-pdf.test.ts`
Expected: FAIL, because `../src/extract/pdf` doesn't exist yet.

- [ ] **Step 3: Implement the PDF extractor**

`packages/script/src/extract/pdf.ts`:

```ts
// In the browser (M2b) the app must set pdfjs GlobalWorkerOptions.workerSrc; Node runs pdf.js without a worker.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ScriptImportError } from '../errors';
import type { RawDoc, RawLine, RawSpan } from '../types';
import { spanShare } from './lines';

/** Items whose baselines are this close, in points, are one line. */
export const BASELINE_TOLERANCE = 2;
/** A gap of at least this × the font size between two items on a line is a space. */
export const SPACE_GAP = 0.2;
const CENTER_TOLERANCE = 0.03;
const CENTER_NARROWER = 0.05;

export interface PdfItem {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  italic: boolean;
  bold: boolean;
}

export function mapPdfError(err: unknown): ScriptImportError {
  const name = (err as { name?: unknown } | null)?.name;
  return new ScriptImportError(name === 'PasswordException' ? 'encrypted' : 'unreadable');
}

function buildLine(row: PdfItem[], page: number): RawLine {
  let text = '';
  const spans: RawSpan[] = [];
  row.forEach((it, i) => {
    if (i > 0) {
      const prev = row[i - 1];
      const gap = it.x - (prev.x + prev.width);
      if (gap >= SPACE_GAP * Math.max(prev.size, it.size) && !/\s$/.test(text) && !/^\s/.test(it.text)) text += ' ';
    }
    text += it.text;
    const t = it.text.trim();
    if (t) spans.push({ text: t, left: it.x, right: it.x + it.width, italic: it.italic, bold: it.bold });
  });
  return {
    page,
    text: text.trim(),
    spans,
    left: row[0].x,
    right: Math.max(...row.map((it) => it.x + it.width)),
    centered: false,
    italic: spanShare(spans, (s) => s.italic) > 0.5,
    bold: spanShare(spans, (s) => s.bold) > 0.5,
    size: Math.max(...row.map((it) => it.size)),
  };
}

export function groupItems(items: readonly PdfItem[], page: number): RawLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= BASELINE_TOLERANCE) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => buildLine(row.sort((a, b) => a.x - b.x), page));
}

/** A line is centred when its midpoint is within 3% of the page width of the text column's midpoint and it is at least 5% of the page width narrower than the column. */
export function markCentered(lines: RawLine[], pageWidth: number): void {
  if (!lines.length) return;
  const lefts = lines.map((l) => l.left).sort((a, b) => a - b);
  const rights = lines.map((l) => l.right).sort((a, b) => a - b);
  const colLeft = lefts[Math.floor(lefts.length * 0.1)];
  const colRight = rights[Math.min(rights.length - 1, Math.floor(rights.length * 0.9))];
  const mid = (colLeft + colRight) / 2;
  for (const l of lines) {
    l.centered =
      Math.abs((l.left + l.right) / 2 - mid) <= CENTER_TOLERANCE * pageWidth &&
      l.right - l.left <= colRight - colLeft - CENTER_NARROWER * pageWidth;
  }
}

interface FontStyle {
  italic: boolean;
  bold: boolean;
}

function fontStyle(objs: { get(id: string): unknown }, fontName: string, cache: Map<string, FontStyle>): FontStyle {
  const cached = cache.get(fontName);
  if (cached) return cached;
  let style: FontStyle = { italic: false, bold: false };
  try {
    const f = objs.get(fontName) as { italic?: boolean; bold?: boolean; black?: boolean; name?: string } | undefined;
    const name = f?.name ?? '';
    style = {
      italic: Boolean(f?.italic) || /italic|oblique/i.test(name),
      bold: Boolean(f?.bold || f?.black) || /bold|black|semibold|heavy/i.test(name),
    };
  } catch {
    // Font not resolved: treat as plain.
  }
  cache.set(fontName, style);
  return style;
}

export async function extractPdf(bytes: Uint8Array): Promise<RawDoc> {
  let pdf: Awaited<ReturnType<typeof getDocument>['promise']>;
  try {
    // pdf.js takes ownership of the buffer it is given, so hand it a copy.
    pdf = await getDocument({
      data: bytes.slice(),
      isEvalSupported: false,
      disableFontFace: true,
      fontExtraProperties: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    throw mapPdfError(err);
  }
  try {
    const lines: RawLine[] = [];
    let pageWidth = 612;
    const styles = new Map<string, FontStyle>();
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      if (p === 1) pageWidth = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      await page.getOperatorList(); // loads the fonts, so commonObjs can answer italic/bold
      const items: PdfItem[] = [];
      for (const it of content.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        items.push({
          text: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          size: Math.hypot(it.transform[0], it.transform[1]),
          ...fontStyle(page.commonObjs, it.fontName, styles),
        });
      }
      lines.push(...groupItems(items, p));
      page.cleanup();
    }
    if (lines.length === 0) throw new ScriptImportError('noTextLayer');
    markCentered(lines, pageWidth);
    return { source: 'pdf', pageWidth, pages: pdf.numPages, realPages: true, lines };
  } catch (err) {
    if (err instanceof ScriptImportError) throw err;
    throw mapPdfError(err);
  } finally {
    await pdf.destroy();
  }
}
```

Add to `packages/script/src/index.ts`:

```ts
export { extractPdf } from './extract/pdf';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/extract-pdf.test.ts && npm run typecheck && npm run lint`
Expected: 9 tests pass. If `tsc` rejects the pdf.js types (for example `it.transform` typed as `any[]`, or `commonObjs` not declared), narrow them with a local cast inside `extractPdf` and don't change behaviour. Typecheck and lint end clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): read PDFs with pdf.js into lines with spans, centring and font style

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Clean-up (`clean.ts`, `patterns.ts`)

**Files:**
- Create: `packages/script/src/patterns.ts`, `packages/script/src/clean.ts`
- Create: `packages/script/test/clean.test.ts`
- Modify: `packages/script/test/helpers.ts`, `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `RawDoc`, `RawLine`, `CleanDoc`, `CleanLine`, `SourceKind` (Task 1); `extractText` (Task 1).
- Produces:
  - `cleanDoc(raw: RawDoc): CleanDoc`
  - `normalizeText(s: string): string`
  - `isPageNumber(text: string): boolean`
  - the constants `EDGE_LINES = 3`, `HEADER_PAGE_SHARE = 0.4`, `HEADER_MIN_PAGES = 3`, `HEADER_INNER_MAX = 0.25`, `LINE_NUMBER_OUTSIDE = 24`
  - from `patterns.ts`: `isHeading(text: string): boolean`, `CAST_LIST_HEADER: RegExp`, `SCENE_BREAK: RegExp`
  - test helpers `line(text, opts?)`, `rawDoc(lines, opts?)` and `textDoc(text)`

- [ ] **Step 1: Write the patterns and the test helpers**

`packages/script/src/patterns.ts`:

```ts
const HEADINGS = [
  /^act\s+([ivxlc]+|\d+|one|two|three|four|five)\b/i,
  /^(first|second|third|fourth|fifth|last)\s+act\b/i,
  /^scene\b/i,
  /^(the\s+)?(prologue|epilogue)\b/i,
];
const HEADING_MAX_WORDS = 12;

/** Act and scene headings (spec §5.2). "ACT DROP" is not one. */
export function isHeading(text: string): boolean {
  const t = text.trim();
  return t.split(/\s+/).length <= HEADING_MAX_WORDS && HEADINGS.some((re) => re.test(t));
}

/** The line that opens a cast list (spec §5.1). */
export const CAST_LIST_HEADER =
  /^(dramatis person(ae|æ)|characters|cast( of characters)?|(the )?persons (in|of) the play|persons represented)\b/i;

/** A line made only of `*`, `#` or `~` marks: a scene break. */
export const SCENE_BREAK = /^[*#~](\s*[*#~])*$/;
```

Append to `packages/script/test/helpers.ts`:

```ts
import { cleanDoc } from '../src/clean';
import { extractText } from '../src/extract/text';
import type { CleanDoc, RawDoc, RawLine } from '../src/types';

export function line(text: string, opts: Partial<RawLine> = {}): RawLine {
  const left = opts.left ?? 72;
  const right = opts.right ?? left + text.length * 6;
  return {
    page: 1,
    text,
    spans: [{ text, left, right, italic: opts.italic ?? false, bold: opts.bold ?? false }],
    left,
    right,
    centered: false,
    italic: false,
    bold: false,
    size: 12,
    ...opts,
  };
}

export function rawDoc(lines: RawLine[], opts: Partial<RawDoc> = {}): RawDoc {
  return { source: 'pdf', pageWidth: 612, pages: Math.max(1, ...lines.map((l) => l.page)), realPages: true, lines, ...opts };
}

export function textDoc(text: string): CleanDoc {
  return cleanDoc(extractText(text));
}
```

Move the new `import` lines to the top of `helpers.ts`, next to its existing import.

- [ ] **Step 2: Write the failing tests**

`packages/script/test/clean.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cleanDoc, isPageNumber, normalizeText } from '../src/clean';
import { isHeading } from '../src/patterns';
import { line, rawDoc, textDoc } from './helpers';

describe('running headers and footers', () => {
  it('removes a title repeated at the top of pages but keeps a speaker name that also appears mid-page', () => {
    const lines = [];
    for (let p = 1; p <= 6; p++) {
      const page = ['The Sea-Gull', 'NINA', 'I am a sea-gull.', 'TREPLIEFF', 'No.', 'NINA', 'Yes.', 'TREPLIEFF', 'Go.', 'NINA', 'I go.', `- ${p} -`];
      for (const text of page) lines.push(line(text, { page: p }));
    }
    const doc = cleanDoc(rawDoc(lines));
    expect(doc.lines.filter((l) => l.text === 'The Sea-Gull')).toHaveLength(0);
    expect(doc.lines.filter((l) => l.text.startsWith('-'))).toHaveLength(0);
    expect(doc.lines.filter((l) => l.text === 'NINA')).toHaveLength(18);
  });

  it('in pasted text removes a repeated line only when its number changes ("SERVANT 2" stays)', () => {
    const doc = textDoc(
      ['The Seagull 12', 'SERVANT 2', 'Yes.', 'The Seagull 13', 'SERVANT 2', 'No.', 'The Seagull 14', 'SERVANT 2', 'Maybe.'].join('\n'),
    );
    expect(doc.lines.map((l) => l.text)).toEqual(['SERVANT 2', 'Yes.', 'SERVANT 2', 'No.', 'SERVANT 2', 'Maybe.']);
  });
});

describe('isPageNumber', () => {
  it('matches page-number lines only', () => {
    for (const t of ['12', '- 12 -', 'Page 3', 'page 14', 'iv', '— 7 —']) expect(isPageNumber(t)).toBe(true);
    for (const t of ['I', '1895 was a year', 'Page three', 'IV.']) expect(isPageNumber(t)).toBe(false);
  });
});

describe('line numbers', () => {
  it('removes PDF line numbers set outside the text column', () => {
    const lines = [];
    for (let i = 1; i <= 10; i++) {
      const text = `Verse line number ${'x'.repeat(40)} ${i}`;
      const l = line(text, { left: 72, right: 520 });
      if (i % 5 === 0) {
        l.spans = [
          { text, left: 72, right: 520, italic: false, bold: false },
          { text: String(i), left: 560, right: 572, italic: false, bold: false },
        ];
        l.text = `${text} ${i}`;
        l.right = 572;
      }
      lines.push(l);
    }
    const doc = cleanDoc(rawDoc(lines));
    expect(doc.lines[4].text).toBe(`Verse line number ${'x'.repeat(40)} 5`);
    expect(doc.lines[4].spans).toHaveLength(1);
    expect(doc.lines[4].right).toBe(520);
    expect(doc.lines[9].text.endsWith('10')).toBe(true);
    expect(doc.lines[9].spans).toHaveLength(1);
  });

  it('removes left line numbers in text, keeping the indent, and restarts at a scene heading', () => {
    const doc = textDoc(
      [
        '      One line.',
        '      Two line.',
        '  5   Three line.',
        '      Four line.',
        ' 10   Five line.',
        '  5   Not a line number, it went backwards.',
        'SCENE II',
        '  5   Six line.',
      ].join('\n'),
    );
    expect(doc.lines.map((l) => l.text)).toEqual([
      'One line.',
      'Two line.',
      'Three line.',
      'Four line.',
      'Five line.',
      '5 Not a line number, it went backwards.',
      'SCENE II',
      'Six line.',
    ]);
    expect(doc.lines[2].left).toBe(doc.lines[0].left);
    expect(doc.lines[4].left).toBe(doc.lines[0].left);
  });
});

describe('hyphenation', () => {
  it('rejoins a word split across lines and records both sources', () => {
    const doc = textDoc("I don't play accu-\nrately at all.");
    expect(doc.lines.map((l) => l.text)).toEqual(["I don't play accurately at all."]);
    expect(doc.lines[0].source.map((s) => s.line)).toEqual([0, 1]);
  });

  it('leaves dashes, doubled hyphens and capitalised continuations alone', () => {
    const doc = textDoc('Well-\nKnown\nwait--\nthen\nI—\nno');
    expect(doc.lines.map((l) => l.text)).toEqual(['Well-', 'Known', 'wait--', 'then', 'I—', 'no']);
  });
});

describe('normalizeText', () => {
  it('expands ligatures, straightens quotes and normalises spaces', () => {
    expect(normalizeText('ﬁne ﬂower')).toBe('fine flower');
    expect(normalizeText('“Hello” ‘there’')).toBe('"Hello" \'there\'');
    expect(normalizeText('soft­hyphen')).toBe('softhyphen');
    expect(normalizeText('non breaking   spaces\t ')).toBe('non breaking spaces');
  });

  it('drops lines left empty', () => {
    expect(textDoc('­\nHello').lines.map((l) => l.text)).toEqual(['Hello']);
  });
});

describe('isHeading', () => {
  it('matches act and scene headings, not ACT DROP or long lines', () => {
    for (const t of ['ACT I', 'Act 2', 'FIRST ACT', 'SCENE', 'SCENE II. A room.', 'Scene: a garden', 'THE PROLOGUE', 'Act One'])
      expect(isHeading(t)).toBe(true);
    for (const t of ['ACT DROP', 'Acting is hard', 'Scene of the crime, I said, and then I went home again to sleep it off'])
      expect(isHeading(t)).toBe(false);
  });
});
```

Note: `'Scene of the crime, …'` has 16 words, so it is not a heading. The line `'Scene of the crime, I say.'` (6 words) *is* heading-shaped. Task 7 tests how the tagger handles it inside dialogue.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/clean.test.ts`
Expected: FAIL, because `../src/clean` doesn't exist yet.

- [ ] **Step 4: Implement the clean-up**

`packages/script/src/clean.ts`:

```ts
import { TEXT_COLUMN } from './extract/text';
import { isHeading } from './patterns';
import type { CleanDoc, CleanLine, RawDoc, RawSpan, SourceKind } from './types';

/** Lines at the top and bottom of each page that may be running headers or footers. */
export const EDGE_LINES = 3;
/** A header must recur in the edge zone on at least this share of pages… */
export const HEADER_PAGE_SHARE = 0.4;
/** …and on at least this many pages. */
export const HEADER_MIN_PAGES = 3;
/** A header may appear outside the edge zone at most this many times per edge appearance (so speaker names survive). */
export const HEADER_INNER_MAX = 0.25;
/** A PDF line number sits further than this (points) outside the text column. */
export const LINE_NUMBER_OUTSIDE = 24;

const LIGATURES: Record<string, string> = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };

export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[­​]/g, '')
    .replace(/[  -   \t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAGE_NUMBER = /^(page\s+)?[-–—]?\s*\d{1,4}\s*[-–—]?$/i;
const ROMAN_PAGE = /^[-–—]?\s*[ivxl]{1,6}\s*[-–—]?$/;

export function isPageNumber(text: string): boolean {
  const t = text.trim();
  return PAGE_NUMBER.test(t) || ROMAN_PAGE.test(t);
}

const mask = (t: string): string => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

function removeRunningLines(lines: CleanLine[], raw: RawDoc): CleanLine[] {
  if (raw.realPages) {
    if (raw.pages < HEADER_MIN_PAGES) return lines;
    const byPage = new Map<number, number[]>();
    lines.forEach((l, i) => byPage.set(l.page, [...(byPage.get(l.page) ?? []), i]));
    const edge = new Set<number>();
    const edgePages = new Map<string, Set<number>>();
    const edgeCount = new Map<string, number>();
    const innerCount = new Map<string, number>();
    for (const [page, idxs] of byPage) {
      idxs.forEach((idx, k) => {
        const key = mask(lines[idx].text);
        if (k < EDGE_LINES || k >= idxs.length - EDGE_LINES) {
          edge.add(idx);
          edgePages.set(key, (edgePages.get(key) ?? new Set()).add(page));
          edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        } else {
          innerCount.set(key, (innerCount.get(key) ?? 0) + 1);
        }
      });
    }
    const minPages = Math.max(HEADER_MIN_PAGES, Math.ceil(HEADER_PAGE_SHARE * raw.pages));
    const drop = new Set(
      [...edgePages]
        .filter(([key, pages]) => pages.size >= minPages && (innerCount.get(key) ?? 0) <= HEADER_INNER_MAX * (edgeCount.get(key) ?? 0))
        .map(([key]) => key),
    );
    return lines.filter((l, i) => !(edge.has(i) && drop.has(mask(l.text))));
  }
  const digits = new Map<string, string[]>();
  for (const l of lines) {
    if (!/\d/.test(l.text)) continue;
    const key = mask(l.text);
    digits.set(key, [...(digits.get(key) ?? []), (l.text.match(/\d+/g) ?? []).join(',')]);
  }
  const drop = new Set([...digits].filter(([, ds]) => ds.length >= 3 && new Set(ds).size >= 2).map(([key]) => key));
  return lines.filter((l) => !drop.has(mask(l.text)));
}

const isNumberSpan = (s: RawSpan): boolean => /^\d{1,4}$/.test(s.text.trim());

function textColumn(lines: CleanLine[]): { left: number; right: number } {
  const lefts: number[] = [];
  const rights: number[] = [];
  for (const l of lines) {
    const body = l.spans.filter((s) => !isNumberSpan(s));
    if (!body.length) continue;
    lefts.push(Math.min(...body.map((s) => s.left)));
    rights.push(Math.max(...body.map((s) => s.right)));
  }
  lefts.sort((a, b) => a - b);
  rights.sort((a, b) => a - b);
  if (!lefts.length) return { left: 0, right: Number.POSITIVE_INFINITY };
  return { left: lefts[Math.floor(lefts.length * 0.1)], right: rights[Math.min(rights.length - 1, Math.floor(rights.length * 0.9))] };
}

const LEADING_NUMBER = /^(\d{1,4})(?:\t|\s{2,})(?=\S)/;
const TRAILING_NUMBER = /(?<=\S)(?:\t|\s{2,})(\d{1,4})$/;

function removeLineNumbers(lines: CleanLine[], source: SourceKind): CleanLine[] {
  const col = source === 'pdf' ? textColumn(lines) : null;
  let last = 0;
  const accept = (n: number): boolean => {
    if (n % 5 !== 0 || n <= last) return false;
    last = n;
    return true;
  };
  const out: CleanLine[] = [];
  for (const l of lines) {
    if (isHeading(l.text)) last = 0;
    if (col) {
      const idx = l.spans.findIndex(
        (s) => isNumberSpan(s) && (s.left > col.right + LINE_NUMBER_OUTSIDE || s.right < col.left - LINE_NUMBER_OUTSIDE),
      );
      if (idx >= 0 && accept(Number(l.spans[idx].text))) {
        const spans = l.spans.filter((_, k) => k !== idx);
        if (!spans.length) continue;
        const n = l.spans[idx].text.trim();
        const text = idx === l.spans.length - 1 ? l.text.replace(new RegExp(`\\s*${n}$`), '') : l.text.replace(new RegExp(`^${n}\\s*`), '');
        out.push({ ...l, spans, text, left: Math.min(...spans.map((s) => s.left)), right: Math.max(...spans.map((s) => s.right)) });
        continue;
      }
      out.push(l);
      continue;
    }
    const lead = LEADING_NUMBER.exec(l.text);
    if (lead && accept(Number(lead[1]))) {
      const text = l.text.slice(lead[0].length);
      const shift = source === 'text' ? lead[0].length * TEXT_COLUMN : 0;
      out.push({ ...l, text, left: l.left + shift, spans: [{ ...l.spans[0], text, left: l.left + shift }, ...l.spans.slice(1)] });
      continue;
    }
    const trail = TRAILING_NUMBER.exec(l.text);
    if (trail && accept(Number(trail[1]))) {
      const text = l.text.slice(0, trail.index);
      const spans = l.spans.length === 1 ? [{ ...l.spans[0], text }] : l.spans.filter((s) => !isNumberSpan(s));
      out.push({ ...l, text, spans });
      continue;
    }
    out.push(l);
  }
  return out;
}

function joinHyphenated(lines: CleanLine[]): CleanLine[] {
  const out: CleanLine[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && /\p{L}-$/u.test(prev.text) && !/--$/.test(prev.text) && /^\p{Ll}/u.test(l.text)) {
      const spans = prev.spans.map((s) => ({ ...s }));
      const tail = spans[spans.length - 1];
      if (tail) tail.text = tail.text.replace(/-$/, '');
      out[out.length - 1] = { ...prev, text: prev.text.slice(0, -1) + l.text, spans: [...spans, ...l.spans], source: [...prev.source, ...l.source] };
      continue;
    }
    out.push(l);
  }
  return out;
}

function normalizeLine(l: CleanLine): CleanLine {
  return {
    ...l,
    text: normalizeText(l.text),
    spans: l.spans.map((s) => ({ ...s, text: normalizeText(s.text) })).filter((s) => s.text.length > 0),
  };
}

/** Spec §4.2, rules in order: running lines, page numbers, line numbers, hyphenation, characters, empties. */
export function cleanDoc(raw: RawDoc): CleanDoc {
  let lines: CleanLine[] = raw.lines.map((l, i) => ({ ...l, spans: l.spans.map((s) => ({ ...s })), source: [{ page: l.page, line: i }] }));
  lines = removeRunningLines(lines, raw);
  lines = lines.filter((l) => !isPageNumber(l.text));
  lines = removeLineNumbers(lines, raw.source);
  lines = joinHyphenated(lines);
  lines = lines.map(normalizeLine).filter((l) => l.text.length > 0);
  return { source: raw.source, pageWidth: raw.pageWidth, pages: raw.pages, realPages: raw.realPages, lines };
}
```

Add to `packages/script/src/index.ts`:

```ts
export { cleanDoc, normalizeText } from './clean';
export { CAST_LIST_HEADER, SCENE_BREAK, isHeading } from './patterns';
```

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/clean.test.ts && npm run typecheck && npm run lint`
Expected: every test in the file passes. Typecheck and lint are clean.

If the "went backwards" case fails because the line number is accepted: `accept` must reject `n <= last`. The expected text `'5 Not a line number, …'` shows the number stays, and the three spaces collapse to one in step 5 of the clean-up.

- [ ] **Step 6: Commit**

```bash
git add packages/script
git commit -m "feat(script): clean-up of running lines, page and line numbers, hyphenation and characters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Cues, stop tokens and the cast (`cues.ts`, `characters.ts`, `weights.ts`)

**Files:**
- Create: `packages/script/src/weights.ts`, `packages/script/src/cues.ts`, `packages/script/src/characters.ts`
- Create: `packages/script/test/cues.test.ts`, `packages/script/test/characters.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `SpeakerConvention`, `Character` (Task 1); `isHeading`, `SCENE_BREAK` (Task 4).
- Produces:
  - `interface CueMatch { convention: SpeakerConvention; token: string; rest: string }`
  - `matchCue(text: string): CueMatch | null`
  - `normalizeCueToken(s: string): string`
  - `capsShare(s: string): number`
  - `isStopToken(s: string): boolean`
  - `interface Cast { characters: Character[]; resolve(token: string): { characterId: string; confidence: number } | null; ambiguous: Array<{ token: string; candidates: string[] }> }`
  - `buildCast(tokens: Iterable<string>, castList?: readonly string[]): Cast`
  - `inCastList(token: string, castList: readonly string[]): boolean`
  - `slugId(name: string): string`
  - from `weights.ts`: `STOP_TOKENS`, `STOP_FIRST_WORDS`, `EXACT_CONFIDENCE = 1`, `CAST_LIST_MERGE_CONFIDENCE = 0.95`, `PREFIX_MERGE_CONFIDENCE = 0.8`, `AMBIGUOUS_CONFIDENCE = 0.5`, `FLAG_BELOW = 0.8`, `MANY_FLAGGED_SHARE = 0.3`. Task 7 adds more to this file.

- [ ] **Step 1: Write the failing tests**

`packages/script/test/cues.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { capsShare, matchCue, normalizeCueToken } from '../src/cues';

describe('matchCue', () => {
  it.each([
    ['HAMLET', 'ownLine', 'HAMLET', ''],
    ['HAMLET.', 'ownLine', 'HAMLET', ''],
    ['LADY BRACKNELL', 'ownLine', 'LADY BRACKNELL', ''],
    ['HAMLET (aside)', 'ownLine', 'HAMLET', ''],
    ['HAMLET. To be, or not to be.', 'inlinePeriod', 'HAMLET', 'To be, or not to be.'],
    ['HAMLET. O God.', 'inlinePeriod', 'HAMLET', 'O God.'],
    ['MRS. ALVING. Come in.', 'inlinePeriod', 'MRS. ALVING', 'Come in.'],
    ['Nora: Hello, Torvald.', 'inlineColon', 'NORA', 'Hello, Torvald.'],
    ['NORA: Hello.', 'inlineColon', 'NORA', 'Hello.'],
    ['Ham. To be.', 'classicalAbbrev', 'HAM', 'To be.'],
  ])('reads %j as %s', (text, convention, token, rest) => {
    expect(matchCue(text)).toEqual({ convention, token, rest });
  });

  it('accepts accented, apostrophe and hyphenated names (review focus 2)', () => {
    expect(matchCue('JOSÉ')).toMatchObject({ convention: 'ownLine', token: 'JOSÉ' });
    expect(matchCue("O'BRIEN. Morning.")).toMatchObject({ convention: 'inlinePeriod', token: "O'BRIEN" });
    expect(matchCue('O’BRIEN')).toMatchObject({ convention: 'ownLine', token: "O'BRIEN" });
    expect(matchCue('MARY-ANNE: Hi.')).toMatchObject({ convention: 'inlineColon', token: 'MARY-ANNE' });
  });

  it.each(['Yes. I will.', 'Well. Go on.', 'ACT I', 'SCENE II. A room.', 'MR. Worthing is here.', 'To be, or not to be', 'I.', 'THE END', '* * *', 'ENTER HAMLET', 'Scene: a room', 'HAMLET. O GOD, O GOD, HOW WEARY', 'NO.'])(
    'does not read %j as a cue',
    (text) => {
      const m = matchCue(text);
      if (text === 'HAMLET. O GOD, O GOD, HOW WEARY') expect(m).toMatchObject({ convention: 'inlinePeriod', token: 'HAMLET' });
      else expect(m).toBeNull();
    },
  );
});

describe('normalizeCueToken', () => {
  it('uppercases, straightens apostrophes and strips trailing punctuation', () => {
    expect(normalizeCueToken(' Ham. ')).toBe('HAM');
    expect(normalizeCueToken('lady  bracknell:')).toBe('LADY BRACKNELL');
    expect(normalizeCueToken('O’Brien')).toBe("O'BRIEN");
  });
});

describe('capsShare', () => {
  it('is the share of letters that are capitals', () => {
    expect(capsShare('HAMLET')).toBe(1);
    expect(capsShare('Ham')).toBeCloseTo(1 / 3);
    expect(capsShare('123')).toBe(0);
  });
});
```

The `'HAMLET. O GOD, O GOD, HOW WEARY'` row is a deliberate exception inside the "not a cue" table. Its prefix is a real inline cue, so the test asserts the cue is `HAMLET`, not the whole shouted line.

`packages/script/test/characters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCast, inCastList, slugId } from '../src/characters';

describe('buildCast', () => {
  it('merges a unique prefix into the longer name', () => {
    const cast = buildCast(['HAMLET', 'HAM.', 'HORATIO']);
    expect(cast.characters).toEqual([
      { id: 'hamlet', name: 'HAMLET', aliases: ['HAM'] },
      { id: 'horatio', name: 'HORATIO', aliases: [] },
    ]);
    expect(cast.resolve('Ham.')).toEqual({ characterId: 'hamlet', confidence: 0.8 });
    expect(cast.resolve('HAMLET')).toEqual({ characterId: 'hamlet', confidence: 1 });
    expect(cast.resolve('OPHELIA')).toBeNull();
  });

  it('is more confident in a merge the cast list confirms', () => {
    expect(buildCast(['HAMLET', 'HAM'], ['HAMLET']).resolve('HAM')?.confidence).toBe(0.95);
  });

  it('merges a chain of prefixes into the longest name', () => {
    const cast = buildCast(['HAM', 'HAML', 'HAMLET']);
    expect(cast.characters).toEqual([{ id: 'hamlet', name: 'HAMLET', aliases: ['HAM', 'HAML'] }]);
  });

  it('keeps a prefix that fits two names as its own, low-confidence character', () => {
    const cast = buildCast(['LADY', 'LADY BRACKNELL', 'LADY MACBETH']);
    expect(cast.characters.map((c) => c.id)).toEqual(['lady', 'lady-bracknell', 'lady-macbeth']);
    expect(cast.resolve('LADY')).toEqual({ characterId: 'lady', confidence: 0.5 });
    expect(cast.ambiguous).toEqual([{ token: 'LADY', candidates: ['LADY BRACKNELL', 'LADY MACBETH'] }]);
  });

  it('does not merge prefixes shorter than three letters', () => {
    expect(buildCast(['HA', 'HAMLET']).characters.map((c) => c.id)).toEqual(['ha', 'hamlet']);
  });

  it('gives readable, unique ids to accented and punctuated names (review focus 2)', () => {
    const cast = buildCast(['JOSÉ', "O'BRIEN", 'MARY-ANNE', 'MRS. ALVING']);
    expect(cast.characters.map((c) => c.id)).toEqual(['jose', 'mary-anne', 'mrs-alving', 'o-brien']);
  });
});

describe('inCastList', () => {
  it('matches whole words of a cast-list name', () => {
    expect(inCastList('HELMER', ['TORVALD HELMER'])).toBe(true);
    expect(inCastList('HELM', ['TORVALD HELMER'])).toBe(false);
  });
});

describe('slugId', () => {
  it('lowercases, strips accents and joins words with hyphens', () => {
    expect(slugId('LADY BRACKNELL')).toBe('lady-bracknell');
    expect(slugId('JOSÉ')).toBe('jose');
    expect(slugId('!!!')).toBe('character');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/cues.test.ts packages/script/test/characters.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement the weights, cues and cast**

`packages/script/src/weights.ts`:

```ts
// Every hand-set scoring constant of the tagger (spec §5.2). Tuned in the measure-and-tune rounds (spec §6.5); never trained.

/** A unit is flagged for review when its tagConfidence is below this. */
export const FLAG_BELOW = 0.8;
/** The manyFlagged warning fires when more than this share of units is flagged. */
export const MANY_FLAGGED_SHARE = 0.3;

/** Alias confidences (spec §5.4). */
export const EXACT_CONFIDENCE = 1;
export const CAST_LIST_MERGE_CONFIDENCE = 0.95;
export const PREFIX_MERGE_CONFIDENCE = 0.8;
export const AMBIGUOUS_CONFIDENCE = 0.5;

/** Words that start lines but are never speaker names. */
export const STOP_TOKENS = new Set([
  'I', 'A', 'O', 'OH', 'AH', 'AY', 'AYE', 'NO', 'YES', 'WELL', 'WHY', 'WHAT', 'THEN', 'NOW', 'SO', 'COME', 'GO', 'HERE', 'THERE',
  'GOOD', 'SIR', 'MADAM', 'AND', 'BUT', 'THE', 'THIS', 'THAT', 'IT', 'HE', 'SHE', 'WE', 'YOU', 'THEY', 'MY', 'THY', 'HOW',
  'ALAS', 'PEACE', 'STAY', 'LOOK', 'SEE', 'HARK', 'FAREWELL', 'ADIEU', 'INDEED', 'TRUE', 'HA', 'TIS', "'TIS", 'NAY',
  'MR', 'MRS', 'MS', 'DR', 'ST', 'SCENE', 'ACT', 'NOTE', 'TIME', 'PLACE', 'SETTING', 'CURTAIN', 'END', 'THE END',
  'BLACKOUT', 'LIGHTS', 'PAUSE', 'SILENCE', 'EXIT', 'EXEUNT', 'ENTER', 'FINIS',
]);
/** A token whose first word is one of these is never a speaker name ("ENTER HAMLET"). */
export const STOP_FIRST_WORDS = new Set(['ENTER', 'EXIT', 'EXEUNT', 'ACT', 'SCENE', 'THE END']);
```

`packages/script/src/cues.ts`:

```ts
import { SCENE_BREAK, isHeading } from './patterns';
import type { SpeakerConvention } from './types';
import { STOP_FIRST_WORDS, STOP_TOKENS } from './weights';

export interface CueMatch {
  convention: SpeakerConvention;
  /** Normalized speaker token. */
  token: string;
  /** Dialogue after an inline cue; '' for an own-line cue. */
  rest: string;
}

const CAPS_WORD = "\\p{Lu}[\\p{Lu}'’-]*";
const ANY_WORD = "\\p{L}[\\p{L}'’-]*";
/** 1–4 all-capital words, an optional "." or ":", an optional parenthetical. */
const OWN_LINE = new RegExp(`^(${CAPS_WORD}(?:\\.?\\s+${CAPS_WORD}){0,3})\\s*[.:]?\\s*(\\([^)]*\\))?$`, 'u');
const INLINE_PERIOD = new RegExp(`^(${CAPS_WORD}(?:\\.?\\s+${CAPS_WORD}){0,3})\\.\\s+(\\S.*)$`, 'su');
const INLINE_COLON = new RegExp(`^(${ANY_WORD}(?:\\.?\\s+${ANY_WORD}){0,3}):\\s*(\\S.*)$`, 'su');
const CLASSICAL = /^(\p{Lu}\p{Ll}{1,5})\.\s+(\S.*)$/su;

export function normalizeCueToken(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.:]+$/, '')
    .trim();
}

export function capsShare(s: string): number {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / letters.length;
}

export function isStopToken(s: string): boolean {
  const t = normalizeCueToken(s);
  return STOP_TOKENS.has(t) || STOP_FIRST_WORDS.has(t.split(' ')[0]) || t.replace(/[^\p{L}]/gu, '').length < 2;
}

/** Spec §5.1: which speaker convention, if any, a line's text has. Recurrence is checked later, by the profile. */
export function matchCue(text: string): CueMatch | null {
  const t = text.trim();
  if (isHeading(t) || SCENE_BREAK.test(t)) return null;
  let m = OWN_LINE.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'ownLine', token: normalizeCueToken(m[1]), rest: '' };
  m = INLINE_PERIOD.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'inlinePeriod', token: normalizeCueToken(m[1]), rest: m[2] };
  m = INLINE_COLON.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'inlineColon', token: normalizeCueToken(m[1]), rest: m[2] };
  m = CLASSICAL.exec(t);
  if (m && !isStopToken(m[1])) return { convention: 'classicalAbbrev', token: normalizeCueToken(m[1]), rest: m[2] };
  return null;
}
```

`packages/script/src/characters.ts`:

```ts
import { normalizeCueToken } from './cues';
import type { Character } from './types';
import { AMBIGUOUS_CONFIDENCE, CAST_LIST_MERGE_CONFIDENCE, EXACT_CONFIDENCE, PREFIX_MERGE_CONFIDENCE } from './weights';

export interface Cast {
  characters: Character[];
  resolve(token: string): { characterId: string; confidence: number } | null;
  ambiguous: Array<{ token: string; candidates: string[] }>;
}

export function slugId(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'character';
}

/** True when the token's words appear, in order, inside a cast-list name ("HELMER" in "TORVALD HELMER"). */
export function inCastList(token: string, castList: readonly string[]): boolean {
  const t = token.split(' ');
  return castList.some((name) => {
    const w = name.split(' ');
    for (let i = 0; i + t.length <= w.length; i++) if (t.every((x, k) => w[i + k] === x)) return true;
    return false;
  });
}

const MIN_PREFIX_LETTERS = 3;

/** Spec §5.4: one character per distinct speaker token; a unique prefix (≥ 3 letters) merges into its longest extension. */
export function buildCast(tokens: Iterable<string>, castList: readonly string[] = []): Cast {
  const names = [...new Set([...tokens].map(normalizeCueToken).filter(Boolean))].sort();
  const mergedInto = new Map<string, { target: string; confidence: number }>();
  const ambiguous: Cast['ambiguous'] = [];
  for (const a of names) {
    if (a.replace(/[^\p{L}]/gu, '').length < MIN_PREFIX_LETTERS) continue;
    const longer = names.filter((b) => b !== a && b.startsWith(a));
    if (!longer.length) continue;
    const maximal = longer.filter((b) => !longer.some((c) => c !== b && c.startsWith(b)));
    if (maximal.length === 1) {
      mergedInto.set(a, {
        target: maximal[0],
        confidence: inCastList(maximal[0], castList) ? CAST_LIST_MERGE_CONFIDENCE : PREFIX_MERGE_CONFIDENCE,
      });
    } else {
      ambiguous.push({ token: a, candidates: maximal });
    }
  }
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const characters: Character[] = [];
  for (const name of names) {
    if (mergedInto.has(name)) continue;
    let id = slugId(name);
    for (let n = 2; used.has(id); n++) id = `${slugId(name)}-${n}`;
    used.add(id);
    ids.set(name, id);
    characters.push({ id, name, aliases: names.filter((a) => mergedInto.get(a)?.target === name) });
  }
  characters.sort((x, y) => x.id.localeCompare(y.id));
  const ambiguousTokens = new Set(ambiguous.map((a) => a.token));
  return {
    characters,
    ambiguous,
    resolve(token) {
      const t = normalizeCueToken(token);
      const merged = mergedInto.get(t);
      if (merged) return { characterId: ids.get(merged.target)!, confidence: merged.confidence };
      const id = ids.get(t);
      if (!id) return null;
      return { characterId: id, confidence: ambiguousTokens.has(t) ? AMBIGUOUS_CONFIDENCE : EXACT_CONFIDENCE };
    },
  };
}
```

Add to `packages/script/src/index.ts`:

```ts
export { buildCast, inCastList, slugId } from './characters';
export type { Cast } from './characters';
export { capsShare, isStopToken, matchCue, normalizeCueToken } from './cues';
export type { CueMatch } from './cues';
export { FLAG_BELOW, MANY_FLAGGED_SHARE } from './weights';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/cues.test.ts packages/script/test/characters.test.ts && npm run typecheck && npm run lint`
Expected: all pass, including `"O'BRIEN"` sorting as `o-brien`: ids sort with `localeCompare`, which puts `o-brien` after `mrs-alving`. Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): speaker-cue patterns and the cast with prefix aliases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Document profile (`profile.ts`)

**Files:**
- Create: `packages/script/src/profile.ts`
- Create: `packages/script/test/profile.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `CleanDoc`, `CleanLine`, `DocProfile`, `SpeakerConvention`; `matchCue`, `normalizeCueToken`, `CueMatch` (Task 5); `isHeading`, `CAST_LIST_HEADER` (Task 4); `TEXT_COLUMN`.
- Produces:
  - `profileDoc(doc: CleanDoc): DocProfile`
  - `clusterBands(values: number[], tol: number): number[]`
  - `nearestBand(bands: number[], left: number): number`
  - `bandTolerance(source: SourceKind): number`, which is 12 for pdf and docx and `TEXT_COLUMN` for text
  - `validCues(doc: CleanDoc): Array<CueMatch | null>`, the per-line cue matches, with an own-line match dropped when the next line is also own-line shaped
  - the constants `MIN_CUE_COUNT = 2`, `SECONDARY_SHARE = 0.15`, `CENTERED_CUE_SHARE = 0.6`

- [ ] **Step 1: Write the failing tests**

`packages/script/test/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cleanDoc } from '../src/clean';
import { clusterBands, profileDoc } from '../src/profile';
import type { RawLine } from '../src/types';
import { line, rawDoc, textDoc } from './helpers';

const centered = (text: string): RawLine => ({ ...line(text, { left: 280 }), centered: true });

describe('profileDoc', () => {
  it('reads a centred own-line layout with an italic direction band and a cast list', () => {
    const lines: RawLine[] = [
      centered('A PLAY'),
      line('CHARACTERS'),
      line('HAMLET, a prince'),
      line('HORATIO, his friend'),
      centered('ACT I'),
      centered('HAMLET'),
      line('To be, or not to be.'),
      centered('HORATIO'),
      line('My lord.'),
      line('(He sits.)', { left: 108, italic: true }),
      centered('HAMLET'),
      line('Then sit.'),
      centered('HORATIO'),
      line('I sit.'),
      centered('HAMLET'),
      line('Good.'),
    ];
    const p = profileDoc(cleanDoc(rawDoc(lines, { realPages: false })));
    expect(p.primary).toBe('ownLine');
    expect(p.secondary).toBeNull();
    expect(p.speakerBand).toBe('centered');
    expect(p.dialogueBand).toBe(72);
    expect(p.directionBand).toBe(108);
    expect(p.castList).toEqual(['HAMLET', 'HORATIO']);
    expect(p.cueTokens.get('HAMLET')).toBe(3);
    expect(p.cueTokens.get('HORATIO')).toBe(2);
    expect(p.cueTokens.has('A PLAY')).toBe(false);
    expect(p.frontMatterEnd).toBe(4);
    expect(p.directionMarks.italic).toBe(1);
    expect(p.directionMarks.parens).toBe(1);
  });

  it('keeps a secondary convention that covers at least 15% of speeches', () => {
    const p = profileDoc(
      textDoc(['Nora: Hi.', 'Helmer: Hello.', 'Nora: Bye.', 'Helmer: Go.', 'Nora: Fine.', 'Helmer: Yes.', 'NORA', 'Again.', 'HELMER', 'Again?'].join('\n')),
    );
    expect(p.primary).toBe('inlineColon');
    expect(p.secondary).toBe('ownLine');
  });

  it('reads classical abbreviations', () => {
    const p = profileDoc(textDoc(['Ham. To be.', 'Hor. My lord.', 'Ham. Speak.', 'Hor. I will.'].join('\n')));
    expect(p.primary).toBe('classicalAbbrev');
    expect([...p.cueTokens.keys()].sort()).toEqual(['HAM', 'HOR']);
  });

  it('finds no speakers in prose made of stop words', () => {
    const p = profileDoc(textDoc(['Yes. I will.', 'Yes. I will.', 'Well. Go on.', 'Well. Go on.'].join('\n')));
    expect(p.primary).toBeNull();
    expect(p.cueTokens.size).toBe(0);
  });

  it('ends front matter at the first run of three speeches when there is no heading', () => {
    const p = profileDoc(textDoc(['A DOLL’S HOUSE', 'by Henrik Ibsen', 'NORA. Hello.', 'HELMER. Hi.', 'NORA. Bye.', 'HELMER. Bye.'].join('\n')));
    expect(p.frontMatterEnd).toBe(2);
  });
});

describe('clusterBands', () => {
  it('merges left edges within the tolerance', () => {
    expect(clusterBands([73, 108, 72], 12)).toEqual([72.5, 108]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/profile.test.ts`
Expected: FAIL, because `../src/profile` doesn't exist yet.

- [ ] **Step 3: Implement the profile**

`packages/script/src/profile.ts`:

```ts
import { matchCue, normalizeCueToken, type CueMatch } from './cues';
import { TEXT_COLUMN } from './extract/text';
import { CAST_LIST_HEADER, isHeading } from './patterns';
import type { CleanDoc, CleanLine, DocProfile, SourceKind, SpeakerConvention } from './types';

/** A speaker token must appear at least this often in speaker position. */
export const MIN_CUE_COUNT = 2;
/** A second convention is kept when it covers at least this share of recurring speeches. */
export const SECONDARY_SHARE = 0.15;
/** Own-line cues are "centred" when at least this share of them is. */
export const CENTERED_CUE_SHARE = 0.6;
const CAST_LIST_MAX_LINES = 40;
const CAST_NAME_MAX_WORDS = 5;
const SPEECH_RUN_WINDOW = 40;
const SPEECH_LINES_SAMPLED = 30;

export function bandTolerance(source: SourceKind): number {
  return source === 'text' ? TEXT_COLUMN : 12;
}

export function clusterBands(values: number[], tol: number): number[] {
  const bands: Array<{ sum: number; n: number; last: number }> = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const b = bands[bands.length - 1];
    if (b && v - b.last <= tol) {
      b.sum += v;
      b.n++;
      b.last = v;
    } else bands.push({ sum: v, n: 1, last: v });
  }
  return bands.map((b) => b.sum / b.n);
}

export function nearestBand(bands: number[], left: number): number {
  let best = bands[0] ?? left;
  for (const b of bands) if (Math.abs(b - left) < Math.abs(best - left)) best = b;
  return best;
}

function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestN = 0;
  for (const [v, n] of [...counts].sort((a, b) => a[0] - b[0])) if (n > bestN) [best, bestN] = [v, n];
  return best;
}

/** Cue matches per line; an own-line match is dropped when the next line is also own-line shaped (title blocks, caps cast lists). */
export function validCues(doc: CleanDoc): Array<CueMatch | null> {
  const raw = doc.lines.map((l) => matchCue(l.text));
  return raw.map((m, i) => (m && m.convention === 'ownLine' && raw[i + 1]?.convention === 'ownLine' ? null : m));
}

function readCastList(lines: CleanLine[]): string[] {
  const start = lines.findIndex((l) => CAST_LIST_HEADER.test(l.text));
  if (start < 0) return [];
  const names: string[] = [];
  for (let i = start + 1; i < Math.min(lines.length, start + 1 + CAST_LIST_MAX_LINES); i++) {
    const t = lines[i].text;
    if (isHeading(t) || t.split(/\s+/).length > 12) break;
    const name = normalizeCueToken(t.split(/,|:| — | – /)[0].replace(/\.$/, ''));
    if (name && name.split(' ').length <= CAST_NAME_MAX_WORDS) names.push(name);
  }
  return names;
}

export function profileDoc(doc: CleanDoc): DocProfile {
  const lines = doc.lines;
  const bands = clusterBands(lines.filter((l) => !l.centered).map((l) => l.left), bandTolerance(doc.source));
  const band = (l: CleanLine): number => nearestBand(bands, l.left);
  const cues = validCues(doc);

  const counts = new Map<string, number>();
  for (const m of cues) if (m) counts.set(m.token, (counts.get(m.token) ?? 0) + 1);
  const cueTokens = new Map([...counts].filter(([, n]) => n >= MIN_CUE_COUNT));

  const convCount = new Map<SpeakerConvention, number>();
  for (const m of cues) if (m && cueTokens.has(m.token)) convCount.set(m.convention, (convCount.get(m.convention) ?? 0) + 1);
  const ranked = [...convCount].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((n, [, c]) => n + c, 0);
  const primary = ranked[0]?.[0] ?? null;
  const secondary = ranked[1] && ranked[1][1] / total >= SECONDARY_SHARE ? ranked[1][0] : null;

  const cueIdx = cues.flatMap((m, i) => (m && cueTokens.has(m.token) && m.convention === primary ? [i] : []));
  let speakerBand: DocProfile['speakerBand'] = null;
  if (cueIdx.length) {
    const centeredShare = cueIdx.filter((i) => lines[i].centered).length / cueIdx.length;
    speakerBand = primary === 'ownLine' && centeredShare >= CENTERED_CUE_SHARE ? 'centered' : mode(cueIdx.map((i) => band(lines[i])));
  }

  const cueSet = new Set(cues.flatMap((m, i) => (m && cueTokens.has(m.token) && m.convention === 'ownLine' ? [i] : [])));
  const speechLines: number[] = [];
  for (const i of cueIdx) {
    const from = primary === 'ownLine' ? i + 1 : i;
    for (let j = from; j < Math.min(lines.length, from + SPEECH_LINES_SAMPLED); j++) {
      if (j !== i && cues[j] && cueTokens.has(cues[j]!.token)) break;
      const l = lines[j];
      if (l.centered || l.italic || /^[([]/.test(l.text)) continue;
      speechLines.push(j);
    }
  }
  const dialogueBand = mode([...new Set(speechLines)].map((j) => band(lines[j])));

  const firstHeading = lines.findIndex((l) => isHeading(l.text));
  let firstRun = -1;
  for (let k = 0; k + 2 < cueIdx.length; k++) {
    if (cueIdx[k + 2] - cueIdx[k] <= SPEECH_RUN_WINDOW) {
      firstRun = cueIdx[k];
      break;
    }
  }
  const ends = [firstHeading, firstRun].filter((i) => i >= 0);
  const frontMatterEnd = ends.length ? Math.min(...ends) : 0;

  const directionLike = lines.filter((l, i) => {
    if (i < frontMatterEnd || cueSet.has(i)) return false;
    const offBand = !l.centered && band(l) !== dialogueBand && (speakerBand === 'centered' || band(l) !== speakerBand);
    return l.italic || /^[([]/.test(l.text) || offBand;
  });
  const share = (pick: (l: CleanLine) => boolean): number => (directionLike.length ? directionLike.filter(pick).length / directionLike.length : 0);
  const directionMarks = {
    italic: share((l) => l.italic),
    parens: share((l) => l.text.startsWith('(')),
    brackets: share((l) => l.text.startsWith('[')),
    ownBand: share((l) => !l.centered && band(l) !== dialogueBand),
  };
  const directionBand = mode(directionLike.filter((l) => !l.centered && band(l) !== dialogueBand).map(band));

  return {
    bands,
    speakerBand,
    dialogueBand,
    directionBand,
    primary,
    secondary,
    directionMarks,
    castList: readCastList(lines),
    cueTokens,
    frontMatterEnd,
  };
}
```

Add to `packages/script/src/index.ts`:

```ts
export { clusterBands, nearestBand, profileDoc } from './profile';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/profile.test.ts && npm run typecheck && npm run lint`
Expected: 6 tests pass.

In the first test:
- `frontMatterEnd` is the `ACT I` line (index 4).
- The only direction-like line is `(He sits.)`, so `italic` and `parens` are both 1.
- `dialogueBand` is the band at 72. Lines at left 72 and 72 cluster to exactly 72.

Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): document profile with bands, conventions, cast list and front matter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Line tagger (`decode.ts`, `tag.ts`, weights)

**Files:**
- Create: `packages/script/src/decode.ts`, `packages/script/src/tag.ts`
- Modify: `packages/script/src/weights.ts`, which gains the emission weights, `TRANSITIONS` and `START`
- Create: `packages/script/test/decode.test.ts`, `packages/script/test/tag.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `CleanDoc`, `DocProfile` (Task 1); `profileDoc`, `validCues`, `nearestBand` (Task 6); `CueMatch`, `capsShare` (Task 5); `inCastList` (Task 5); `isHeading`, `SCENE_BREAK` (Task 4).
- Produces:
  - `decode(start: number[], transitions: number[][], emissions: number[][]): { path: number[]; posterior: number[][] }`
  - `STATES = ['cue', 'cueInline', 'dialogue', 'dirIn', 'dirOut', 'heading', 'front'] as const`
  - `type LineState`
  - `type LineCategory = 'cue' | 'cueInline' | 'dialogue' | 'direction' | 'heading' | 'front'`
  - `CATEGORY: Record<LineState, LineCategory>`
  - `interface TaggedLine { state: LineState; confidence: number; cue: CueMatch | null }`
  - `tagLines(doc: CleanDoc, profile: DocProfile): TaggedLine[]`
  - `bracketBlocks(texts: readonly string[]): boolean[]`

- [ ] **Step 1: Write the failing decode tests**

`packages/script/test/decode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decode } from '../src/decode';

describe('decode', () => {
  it('finds the best path and never uses a forbidden transition', () => {
    const start = [0, 0];
    const transitions = [
      [0, 0],
      [Number.NEGATIVE_INFINITY, 0],
    ];
    const emissions = [
      [0, -1],
      [-5, 0],
      [0, -0.1],
    ];
    const { path, posterior } = decode(start, transitions, emissions);
    expect(path).toEqual([0, 1, 1]);
    for (const row of posterior) expect(row[0] + row[1]).toBeCloseTo(1, 10);
    expect(posterior[1][1]).toBeGreaterThan(0.9);
  });

  it('returns nothing for no lines', () => {
    expect(decode([0], [[0]], [])).toEqual({ path: [], posterior: [] });
  });
});
```

- [ ] **Step 2: Run them to verify they fail, then implement `decode.ts`**

Run: `npx vitest run packages/script/test/decode.test.ts`
Expected: FAIL, because `../src/decode` doesn't exist yet.

`packages/script/src/decode.ts`:

```ts
const NEG = Number.NEGATIVE_INFINITY;

function logSumExp(xs: readonly number[]): number {
  let m = NEG;
  for (const x of xs) if (x > m) m = x;
  if (m === NEG) return NEG;
  let sum = 0;
  for (const x of xs) sum += Math.exp(x - m);
  return m + Math.log(sum);
}

/**
 * Viterbi path and forward-backward posteriors for a first-order chain.
 * All inputs are log-scores; -Infinity forbids a start or a transition.
 */
export function decode(start: number[], transitions: number[][], emissions: number[][]): { path: number[]; posterior: number[][] } {
  const T = emissions.length;
  const S = start.length;
  if (T === 0) return { path: [], posterior: [] };

  const score: number[][] = [start.map((v, s) => v + emissions[0][s])];
  const back: number[][] = [start.map(() => -1)];
  for (let t = 1; t < T; t++) {
    const row: number[] = [];
    const from: number[] = [];
    for (let s = 0; s < S; s++) {
      let best = NEG;
      let arg = 0;
      for (let p = 0; p < S; p++) {
        const v = score[t - 1][p] + transitions[p][s];
        if (v > best) [best, arg] = [v, p];
      }
      row.push(best + emissions[t][s]);
      from.push(arg);
    }
    score.push(row);
    back.push(from);
  }
  const path = new Array<number>(T);
  let last = 0;
  for (let s = 1; s < S; s++) if (score[T - 1][s] > score[T - 1][last]) last = s;
  path[T - 1] = last;
  for (let t = T - 1; t > 0; t--) path[t - 1] = back[t][path[t]];

  const alpha: number[][] = [start.map((v, s) => v + emissions[0][s])];
  for (let t = 1; t < T; t++) {
    alpha.push(Array.from({ length: S }, (_, s) => logSumExp(alpha[t - 1].map((a, p) => a + transitions[p][s])) + emissions[t][s]));
  }
  const beta: number[][] = new Array(T);
  beta[T - 1] = new Array<number>(S).fill(0);
  for (let t = T - 2; t >= 0; t--) {
    beta[t] = Array.from({ length: S }, (_, s) => logSumExp(beta[t + 1].map((b, n) => transitions[s][n] + emissions[t + 1][n] + b)));
  }
  const posterior = alpha.map((a, t) => {
    const joint = a.map((v, s) => v + beta[t][s]);
    const z = logSumExp(joint);
    return joint.map((v) => (z === NEG ? 0 : Math.exp(v - z)));
  });
  return { path, posterior };
}
```

Run: `npx vitest run packages/script/test/decode.test.ts`
Expected: 2 tests pass.

- [ ] **Step 3: Add the emission and transition weights to `weights.ts`**

Append to `packages/script/src/weights.ts`:

```ts
/** Line-state emission log-scores (spec §5.2). "PerMark" terms are multiplied by the profile's direction-mark shares. */
export const EMISSION = {
  temperature: 1,
  base: { cue: -3, cueInline: -3, dialogue: 0, direction: -1, heading: -5, front: -2 },
  cue: { shape: 2, known: 3, inCast: 1, primary: 1.5, speakerBand: 1.5, bold: 0.5, nextCueShaped: -3, notShape: -12 },
  cueInline: { shape: 2, known: 3, inCast: 1, primary: 1.5, notShape: -12 },
  dialogue: { dialogueBand: 1, italic: 1, italicPerMark: 2.5, bracketBlock: 1, bracketPerMark: 3, offBandPerMark: 1, knownCueShape: -2 },
  direction: { italic: 1, italicPerMark: 2.5, bracketBlock: 1.5, bracketPerMark: 3, directionBand: 1, directionBandPerMark: 1.5 },
  heading: { pattern: 8, notPattern: -10 },
  front: { before: 4, after: -6 },
  sceneBreak: { direction: 6, other: -6 },
};

type State = 'cue' | 'cueInline' | 'dialogue' | 'dirIn' | 'dirOut' | 'heading' | 'front';
/** Transition log-scores; a missing entry is forbidden. dirIn: a direction inside a speech; dirOut: outside one. */
export const TRANSITIONS: Record<State, Partial<Record<State, number>>> = {
  cue: { dialogue: -0.1, dirIn: -1.5 },
  cueInline: { dialogue: -0.3, dirIn: -1.5, cue: -0.8, cueInline: -0.8, dirOut: -1.5, heading: -2.5 },
  dialogue: { dialogue: -0.3, cue: -0.8, cueInline: -0.8, dirIn: -1.5, dirOut: -1.5, heading: -2.5 },
  dirIn: { dialogue: -0.5, dirIn: -0.8, cue: -1, cueInline: -1, dirOut: -2, heading: -2.5 },
  dirOut: { dirOut: -0.5, cue: -0.5, cueInline: -0.5, heading: -1.5, dialogue: -5 },
  heading: { heading: -1, dirOut: -0.5, cue: -0.5, cueInline: -0.5, dialogue: -5 },
  front: { front: -0.1, heading: -1, dirOut: -2, cue: -2, cueInline: -2 },
};
export const START: Partial<Record<State, number>> = { front: 0, heading: -1, dirOut: -1, cue: -1, cueInline: -1, dialogue: -6 };
```

- [ ] **Step 4: Write the failing tagger tests**

`packages/script/test/tag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { profileDoc } from '../src/profile';
import { CATEGORY, bracketBlocks, tagLines } from '../src/tag';
import { textDoc } from './helpers';

function categories(text: string): string[] {
  const doc = textDoc(text);
  return tagLines(doc, profileDoc(doc)).map((t) => CATEGORY[t.state]);
}

describe('tagLines', () => {
  it('tags an own-line script with a stand-alone direction', () => {
    expect(
      categories(['HAMLET', 'To be, or not to be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go on.', '(He sits.)', 'HORATIO', 'I will.'].join('\n')),
    ).toEqual(['cue', 'dialogue', 'cue', 'dialogue', 'cue', 'dialogue', 'direction', 'cue', 'dialogue']);
  });

  it('tags inline cues', () => {
    expect(categories(['HAMLET. To be.', 'HORATIO. My lord.', 'HAMLET. Go on.', 'HORATIO. I will.'].join('\n'))).toEqual([
      'cueInline',
      'cueInline',
      'cueInline',
      'cueInline',
    ]);
  });

  it('keeps a long shouted line as dialogue', () => {
    const cats = categories(['HAMLET', 'Speak.', 'HORATIO', 'GET THEE TO A NUNNERY, GO, FAREWELL', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n'));
    expect(cats[3]).toBe('dialogue');
  });

  it('keeps a heading-shaped line inside a speech as dialogue', () => {
    const cats = categories(['HAMLET', 'Speak.', 'HORATIO', 'Scene of the crime, I say.', 'And so it is.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n'));
    expect(cats[3]).toBe('dialogue');
  });

  it('tags front matter, then a heading', () => {
    expect(
      categories(['THE TRAGEDY OF HAMLET', 'by William Shakespeare', 'ACT I', 'HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.'].join('\n')),
    ).toEqual(['front', 'front', 'heading', 'cue', 'dialogue', 'cue', 'dialogue', 'cue', 'dialogue']);
  });

  it('is less sure about an unknown one-word capital line than about a known cue', () => {
    const doc = textDoc(['HAMLET', 'Speak.', 'HORATIO', 'Yes.', 'STOP', 'Go.', 'HAMLET', 'Good.', 'HORATIO', 'Fine.'].join('\n'));
    const tagged = tagLines(doc, profileDoc(doc));
    expect(tagged[4].confidence).toBeLessThan(tagged[0].confidence);
    expect(tagged[0].confidence).toBeGreaterThan(0.9);
  });
});

describe('bracketBlocks', () => {
  it('marks bracketed blocks that start and end at line boundaries, across lines', () => {
    expect(bracketBlocks(['(He crosses to the window', 'and looks out.)', 'Hello.', '(aside) I will', '[Exit.]'])).toEqual([
      true,
      true,
      false,
      false,
      true,
    ]);
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run packages/script/test/tag.test.ts`
Expected: FAIL, because `../src/tag` doesn't exist yet.

- [ ] **Step 6: Implement the tagger**

`packages/script/src/tag.ts`:

```ts
import { inCastList } from './characters';
import type { CueMatch } from './cues';
import { decode } from './decode';
import { SCENE_BREAK, isHeading } from './patterns';
import { nearestBand, validCues } from './profile';
import type { CleanDoc, DocProfile } from './types';
import { EMISSION, START, TRANSITIONS } from './weights';

export const STATES = ['cue', 'cueInline', 'dialogue', 'dirIn', 'dirOut', 'heading', 'front'] as const;
export type LineState = (typeof STATES)[number];
export type LineCategory = 'cue' | 'cueInline' | 'dialogue' | 'direction' | 'heading' | 'front';
export const CATEGORY: Record<LineState, LineCategory> = {
  cue: 'cue',
  cueInline: 'cueInline',
  dialogue: 'dialogue',
  dirIn: 'direction',
  dirOut: 'direction',
  heading: 'heading',
  front: 'front',
};

export interface TaggedLine {
  state: LineState;
  /** Posterior of the chosen line category (dirIn + dirOut together). */
  confidence: number;
  cue: CueMatch | null;
}

const BRACKET_BLOCK_MAX_LINES = 12;

/** Lines that belong to a bracketed block opening at a line start and closing at a line end. */
export function bracketBlocks(texts: readonly string[]): boolean[] {
  const out = texts.map(() => false);
  for (let i = 0; i < texts.length; i++) {
    const open = texts[i][0];
    if (open !== '(' && open !== '[') continue;
    const close = open === '(' ? ')' : ']';
    let depth = 0;
    for (let j = i; j < Math.min(texts.length, i + BRACKET_BLOCK_MAX_LINES); j++) {
      for (const ch of texts[j]) {
        if (ch === open) depth++;
        else if (ch === close) depth--;
      }
      if (depth <= 0) {
        if (/[)\]][.,;:!?]?$/.test(texts[j].trim())) {
          for (let k = i; k <= j; k++) out[k] = true;
          i = j;
        }
        break;
      }
    }
  }
  return out;
}

interface Features {
  cue: CueMatch | null;
  knownCue: boolean;
  inCast: boolean;
  italic: boolean;
  bold: boolean;
  atSpeakerBand: boolean;
  atDialogueBand: boolean;
  atDirectionBand: boolean;
  bracketBlock: boolean;
  heading: boolean;
  beforeFront: boolean;
  nextCueShaped: boolean;
  sceneBreak: boolean;
}

function lineFeatures(doc: CleanDoc, profile: DocProfile): Features[] {
  const cues = validCues(doc);
  const shapes = doc.lines.map((l, i) => cues[i]?.convention === 'ownLine' || (cues[i] === null && /^\p{Lu}[\p{Lu}'’ .-]*$/u.test(l.text)));
  const blocks = bracketBlocks(doc.lines.map((l) => l.text));
  return doc.lines.map((l, i) => {
    const cue = cues[i];
    const band = nearestBand(profile.bands, l.left);
    return {
      cue,
      knownCue: cue !== null && profile.cueTokens.has(cue.token),
      inCast: cue !== null && inCastList(cue.token, profile.castList),
      italic: l.italic,
      bold: l.bold,
      atSpeakerBand: profile.speakerBand === 'centered' ? l.centered : profile.speakerBand !== null && !l.centered && band === profile.speakerBand,
      atDialogueBand: !l.centered && band === profile.dialogueBand,
      atDirectionBand: !l.centered && profile.directionBand !== null && profile.directionBand !== profile.dialogueBand && band === profile.directionBand,
      bracketBlock: blocks[i],
      heading: isHeading(l.text),
      beforeFront: i < profile.frontMatterEnd,
      nextCueShaped: shapes[i + 1] ?? false,
      sceneBreak: SCENE_BREAK.test(l.text),
    };
  });
}

function emissions(f: Features, profile: DocProfile): Record<LineState, number> {
  const W = EMISSION;
  const m = profile.directionMarks;
  const bracketMark = Math.max(m.parens, m.brackets);
  const usesConvention = (c: string) => profile.primary === c || profile.secondary === c;
  const own = f.cue?.convention === 'ownLine';
  const inline = f.cue !== null && !own;

  const cue = own
    ? W.base.cue +
      W.cue.shape +
      (f.knownCue ? W.cue.known : 0) +
      (f.inCast ? W.cue.inCast : 0) +
      (usesConvention('ownLine') ? W.cue.primary : 0) +
      (f.atSpeakerBand ? W.cue.speakerBand : 0) +
      (f.bold ? W.cue.bold : 0) +
      (f.nextCueShaped ? W.cue.nextCueShaped : 0)
    : W.base.cue + W.cue.notShape;
  const cueInline = inline
    ? W.base.cueInline +
      W.cueInline.shape +
      (f.knownCue ? W.cueInline.known : 0) +
      (f.inCast ? W.cueInline.inCast : 0) +
      (usesConvention(f.cue!.convention) ? W.cueInline.primary : 0)
    : W.base.cueInline + W.cueInline.notShape;
  const dialogue =
    W.base.dialogue +
    (f.atDialogueBand ? W.dialogue.dialogueBand : 0) -
    (f.italic ? W.dialogue.italic + W.dialogue.italicPerMark * m.italic : 0) -
    (f.bracketBlock ? W.dialogue.bracketBlock + W.dialogue.bracketPerMark * bracketMark : 0) -
    (f.atDirectionBand ? W.dialogue.offBandPerMark * m.ownBand : 0) +
    (own && f.knownCue ? W.dialogue.knownCueShape : 0);
  const direction =
    W.base.direction +
    (f.italic ? W.direction.italic + W.direction.italicPerMark * m.italic : 0) +
    (f.bracketBlock ? W.direction.bracketBlock + W.direction.bracketPerMark * bracketMark : 0) +
    (f.atDirectionBand ? W.direction.directionBand + W.direction.directionBandPerMark * m.ownBand : 0);
  const heading = W.base.heading + (f.heading ? W.heading.pattern : W.heading.notPattern);
  const front = W.base.front + (f.beforeFront ? W.front.before : W.front.after);

  const scores: Record<LineState, number> = { cue, cueInline, dialogue, dirIn: direction, dirOut: direction, heading, front };
  if (f.sceneBreak) {
    for (const s of STATES) scores[s] = s === 'dirIn' || s === 'dirOut' ? W.sceneBreak.direction : W.sceneBreak.other;
  }
  return scores;
}

/** Spec §5.2: emission scores per line, a fixed transition matrix, Viterbi for the states, forward-backward for confidence. */
export function tagLines(doc: CleanDoc, profile: DocProfile): TaggedLine[] {
  const NEG = Number.NEGATIVE_INFINITY;
  const features = lineFeatures(doc, profile);
  const emit = features.map((f) => {
    const e = emissions(f, profile);
    return STATES.map((s) => e[s] * EMISSION.temperature);
  });
  const start = STATES.map((s) => START[s] ?? NEG);
  const transitions = STATES.map((from) => STATES.map((to) => TRANSITIONS[from][to] ?? NEG));
  const { path, posterior } = decode(start, transitions, emit);
  return path.map((s, t) => {
    const state = STATES[s];
    const confidence = STATES.reduce((sum, other, k) => (CATEGORY[other] === CATEGORY[state] ? sum + posterior[t][k] : sum), 0);
    return { state, confidence: Math.min(1, confidence), cue: features[t].cue };
  });
}
```

Add to `packages/script/src/index.ts`:

```ts
export { CATEGORY, STATES, tagLines } from './tag';
export type { LineCategory, LineState, TaggedLine } from './tag';
```

- [ ] **Step 7: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/decode.test.ts packages/script/test/tag.test.ts && npm run typecheck && npm run lint`
Expected: all pass. If a tagging test fails only on a weight, adjust `EMISSION`, `TRANSITIONS` or `START` in `weights.ts` (Global Constraints) and re-run all of `npm test`. Record the change in the report. Typecheck and lint are clean.

- [ ] **Step 8: Commit**

```bash
git add packages/script
git commit -m "feat(script): seven-state line tagger with Viterbi and forward-backward confidence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Units and overlap marks (`units.ts`, `overlap.ts`)

**Files:**
- Create: `packages/script/src/units.ts`, `packages/script/src/overlap.ts`
- Create: `packages/script/test/units.test.ts`, `packages/script/test/overlap.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `CleanDoc`, `CleanLine`, `DocProfile`, `Unit`, `ImportWarning`, `SourceRef` (Task 1); `TaggedLine`, `CATEGORY` (Task 7); `buildCast`, `Cast` (Task 5); `SCENE_BREAK` (Task 4); `FLAG_BELOW`, `AMBIGUOUS_CONFIDENCE` (weights); `tokenize` from `@dasma/align`.
- Produces:
  - `buildUnits(doc: CleanDoc, tagged: TaggedLine[], profile: DocProfile): { units: Unit[]; cast: Cast; warnings: ImportWarning[] }`
  - `INLINE_ITALIC_MIN_WORDS = 3`
  - `applyOverlapMarks(units: Unit[]): Unit[]`

- [ ] **Step 1: Write the failing tests**

`packages/script/test/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cleanDoc } from '../src/clean';
import { profileDoc } from '../src/profile';
import { tagLines, type TaggedLine } from '../src/tag';
import type { CleanDoc, RawLine } from '../src/types';
import { buildUnits } from '../src/units';
import { line, rawDoc, textDoc } from './helpers';

function unitsOf(doc: CleanDoc) {
  const profile = profileDoc(doc);
  return buildUnits(doc, tagLines(doc, profile), profile);
}
const brief = (doc: CleanDoc) => unitsOf(doc).units.map((u) => [u.kind, u.characterId ?? null, u.text]);
const SCENE = ['HORATIO', 'My lord.', 'HAMLET', 'Speak.', 'HORATIO', 'I will.'];

describe('buildUnits', () => {
  it('splits a parenthetical out of a speech, keeping the speaker on both sides', () => {
    expect(brief(textDoc(['HAMLET', 'Go on. (He sits.) I will follow.', ...SCENE].join('\n'))).slice(0, 4)).toEqual([
      ['characterName', null, 'HAMLET'],
      ['dialogue', 'hamlet', 'Go on.'],
      ['direction', null, '(He sits.)'],
      ['dialogue', 'hamlet', 'I will follow.'],
    ]);
  });

  it('continues the speaker after a direction line inside a speech', () => {
    expect(brief(textDoc(['HAMLET', 'Go on.', '(He sits.)', 'I will follow.', ...SCENE].join('\n'))).slice(0, 4)).toEqual([
      ['characterName', null, 'HAMLET'],
      ['dialogue', 'hamlet', 'Go on.'],
      ['direction', null, '(He sits.)'],
      ['dialogue', 'hamlet', 'I will follow.'],
    ]);
  });

  it('strips inline cue prefixes', () => {
    expect(brief(textDoc(['HAMLET. Go on.', 'HORATIO. Yes.', 'HAMLET. Good.', 'HORATIO. Fine.'].join('\n')))).toEqual([
      ['dialogue', 'hamlet', 'Go on.'],
      ['dialogue', 'horatio', 'Yes.'],
      ['dialogue', 'hamlet', 'Good.'],
      ['dialogue', 'horatio', 'Fine.'],
    ]);
  });

  it('joins verse lines with a newline and numbers units in order with their sources', () => {
    const { units } = unitsOf(textDoc(['HAMLET', 'To be, or not to be,', 'that is the question.', ...SCENE].join('\n')));
    expect(units[1].text).toBe('To be, or not to be,\nthat is the question.');
    expect(units.map((u) => u.id).slice(0, 3)).toEqual(['u1', 'u2', 'u3']);
    expect(units[1].source.map((s) => s.line)).toEqual([1, 2]);
    expect(units.every((u) => u.cut === false)).toBe(true);
  });

  it('splits a long italic run out of dialogue but keeps short italic emphasis', () => {
    const speech = (spans: Array<[string, boolean]>): RawLine => {
      let x = 72;
      const parts = spans.map(([text, italic]) => {
        const s = { text, left: x, right: x + text.length * 6, italic, bold: false };
        x = s.right + 6;
        return s;
      });
      return { ...line(spans.map(([t]) => t).join(' ')), spans: parts };
    };
    const doc = cleanDoc(
      rawDoc(
        [
          line('HAMLET', { left: 200 }),
          speech([['I believe it', false], ['is', true], ['a very pleasant state.', false]]),
          line('HORATIO', { left: 200 }),
          speech([['Look, I said to you,', false], ['slowly crossing the room', true], ['he comes now, at last.', false]]),
          line('HAMLET', { left: 200 }),
          line('Good.'),
          line('HORATIO', { left: 200 }),
          line('Fine.'),
        ],
        { realPages: false },
      ),
    );
    const units = brief(doc);
    expect(units[1]).toEqual(['dialogue', 'hamlet', 'I believe it is a very pleasant state.']);
    expect(units.slice(3, 6)).toEqual([
      ['dialogue', 'horatio', 'Look, I said to you,'],
      ['direction', null, 'slowly crossing the room'],
      ['dialogue', 'horatio', 'he comes now, at last.'],
    ]);
  });

  it('gives dialogue without a cue no speaker and low confidence', () => {
    // The tagger rarely decodes cue-less dialogue, so this drives buildUnits with hand-set states.
    const doc = textDoc('Who is there?\nHAMLET\nMe.');
    const tagged: TaggedLine[] = [
      { state: 'dialogue', confidence: 0.9, cue: null },
      { state: 'cue', confidence: 0.95, cue: { convention: 'ownLine', token: 'HAMLET', rest: '' } },
      { state: 'dialogue', confidence: 0.9, cue: null },
    ];
    const { units } = buildUnits(doc, tagged, profileDoc(doc));
    expect(units[0]).toMatchObject({ kind: 'dialogue', text: 'Who is there?' });
    expect(units[0].characterId).toBeUndefined();
    expect(units[0].tagConfidence).toBeLessThanOrEqual(0.5);
    expect(units[2]).toMatchObject({ kind: 'dialogue', characterId: 'hamlet', text: 'Me.' });
  });

  it('flags speeches of an ambiguous alias and warns about it', () => {
    const { units, warnings } = unitsOf(
      textDoc(['LADY BRACKNELL', 'Good afternoon.', 'LADY MACBETH', 'Out, spot.', 'LADY', 'Hello.', 'LADY', 'Again.', 'LADY BRACKNELL', 'Indeed.', 'LADY MACBETH', 'Out.'].join('\n')),
    );
    const lady = units.filter((u) => u.kind === 'dialogue' && u.characterId === 'lady');
    expect(lady).toHaveLength(2);
    expect(lady.every((u) => u.tagConfidence <= 0.5)).toBe(true);
    expect(warnings).toContainEqual({ code: 'ambiguousAlias', token: 'LADY', candidates: ['LADY BRACKNELL', 'LADY MACBETH'] });
  });

  it('turns a line of stars into a scene break', () => {
    const kinds = unitsOf(textDoc(['HAMLET', 'Go.', 'HORATIO', 'Yes.', '* * *', 'HAMLET', 'Again.', 'HORATIO', 'No.'].join('\n'))).units.map((u) => u.kind);
    expect(kinds).toContain('sceneBreak');
  });
});
```

`packages/script/test/overlap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyOverlapMarks } from '../src/overlap';
import type { Unit } from '../src/types';

const unit = (id: string, kind: Unit['kind'], text: string): Unit => ({ id, kind, text, cut: false, tagConfidence: 1, source: [], characterId: kind === 'dialogue' ? 'x' : undefined });

describe('applyOverlapMarks', () => {
  it('turns a slash into overlap ranges on this line and the start of the next spoken line', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'I never said / that you were wrong.'), unit('u2', 'direction', '(Pause.)'), unit('u3', 'dialogue', 'Well, I did.')]);
    expect(out[0].text).toBe('I never said that you were wrong.');
    expect(out[0].overlapRanges).toEqual([[3, 7]]);
    expect(out[1].overlapRanges).toBeUndefined();
    expect(out[2].overlapRanges).toEqual([[0, 3]]);
  });

  it('ignores a slash inside a word such as "and/or"', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'Tea and/or coffee.'), unit('u2', 'dialogue', 'Tea.')]);
    expect(out[0].text).toBe('Tea and/or coffee.');
    expect(out[0].overlapRanges).toBeUndefined();
    expect(out[1].overlapRanges).toBeUndefined();
  });

  it('gives the next line at least one overlapped word when the slash ends a line', () => {
    const out = applyOverlapMarks([unit('u1', 'dialogue', 'I never said /'), unit('u2', 'dialogue', 'You did.')]);
    expect(out[0].text).toBe('I never said');
    expect(out[0].overlapRanges).toBeUndefined();
    expect(out[1].overlapRanges).toEqual([[0, 1]]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/script/test/units.test.ts packages/script/test/overlap.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement the units**

`packages/script/src/units.ts`:

```ts
import { buildCast, type Cast } from './characters';
import { SCENE_BREAK } from './patterns';
import { CATEGORY, type TaggedLine } from './tag';
import type { CleanDoc, CleanLine, DocProfile, ImportWarning, SourceRef, Unit, UnitKind } from './types';
import { AMBIGUOUS_CONFIDENCE } from './weights';

/** An italic run inside dialogue is a direction only from this many words; shorter runs are emphasis (spec §5.3). */
export const INLINE_ITALIC_MIN_WORDS = 3;

interface SpeechLine {
  text: string;
  italic: boolean[];
  source: SourceRef[];
  confidence: number;
}
interface Speaker {
  characterId?: string;
  /** min(cue line confidence, …) × alias confidence. */
  factor: number;
  cap: number;
}
type Draft = Omit<Unit, 'id'>;

/** Per-character italic mask of a line's text, from its spans. */
function italicMask(l: CleanLine): boolean[] {
  const mask = new Array<boolean>(l.text.length).fill(false);
  let cursor = 0;
  for (const s of l.spans) {
    const at = l.text.indexOf(s.text, cursor);
    if (at < 0) continue;
    if (s.italic) for (let k = at; k < at + s.text.length; k++) mask[k] = true;
    cursor = at + s.text.length;
  }
  return mask;
}

function speechLine(l: CleanLine, confidence: number, rest?: string): SpeechLine {
  const mask = italicMask(l);
  if (rest === undefined) return { text: l.text, italic: mask, source: l.source, confidence };
  const from = l.text.length - rest.length;
  return { text: rest, italic: mask.slice(from), source: l.source, confidence };
}

const hasWords = (s: string): boolean => /[\p{L}\p{N}]/u.test(s);
const tidy = (s: string): string =>
  s
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/^[\s.,;:—–-]+(?=\p{L})/u, '');

/** Splits one speech into dialogue and direction drafts (spec §5.3). */
function splitSpeech(lines: SpeechLine[], speaker: Speaker): Draft[] {
  const text = lines.map((l) => l.text).join('\n');
  const italic: boolean[] = [];
  const lineAt: number[] = [];
  lines.forEach((l, i) => {
    if (i > 0) {
      italic.push(false);
      lineAt.push(i);
    }
    for (let k = 0; k < l.text.length; k++) {
      italic.push(l.italic[k] ?? false);
      lineAt.push(i);
    }
  });

  const segments: Array<[number, number]> = [];
  for (const m of text.matchAll(/\([^()]*\)|\[[^[\]]*\]/g)) segments.push([m.index!, m.index! + m[0].length]);
  const inSegment = (k: number) => segments.some(([s, e]) => k >= s && k < e);
  const hasPlain = italic.some((it, k) => !it && !inSegment(k) && /\p{L}/u.test(text[k]));
  for (let k = 0; k < text.length; ) {
    if (!italic[k] || inSegment(k)) {
      k++;
      continue;
    }
    let e = k;
    while (e < text.length && (italic[e] || /\s/.test(text[e])) && !inSegment(e)) e++;
    while (e > k && /\s/.test(text[e - 1])) e--;
    const words = text.slice(k, e).trim().split(/\s+/).filter(Boolean).length;
    if (words >= INLINE_ITALIC_MIN_WORDS && hasPlain) segments.push([k, e]);
    k = Math.max(e, k + 1);
  }
  segments.sort((a, b) => a[0] - b[0]);

  const drafts: Draft[] = [];
  const piece = (kind: UnitKind, s: number, e: number): void => {
    const body = tidy(text.slice(s, e));
    if (!hasWords(body)) return;
    const touched = [...new Set(lineAt.slice(s, Math.max(s + 1, e)))];
    const confidence = Math.min(...touched.map((i) => lines[i].confidence));
    const source = touched.flatMap((i) => lines[i].source);
    if (kind === 'dialogue') {
      const tagConfidence = Math.min(Math.min(confidence, speaker.cap) * speaker.factor, speaker.characterId ? 1 : AMBIGUOUS_CONFIDENCE);
      drafts.push({ kind, ...(speaker.characterId ? { characterId: speaker.characterId } : {}), text: body, cut: false, tagConfidence, source });
    } else drafts.push({ kind, text: body, cut: false, tagConfidence: confidence, source });
  };
  let cursor = 0;
  for (const [s, e] of segments) {
    if (s < cursor) continue;
    piece('dialogue', cursor, s);
    piece('direction', s, e);
    cursor = e;
  }
  piece('dialogue', cursor, text.length);
  return drafts;
}

/** Spec §5.3: tagged lines → units with speakers, kinds, confidence, ids. */
export function buildUnits(doc: CleanDoc, tagged: TaggedLine[], profile: DocProfile): { units: Unit[]; cast: Cast; warnings: ImportWarning[] } {
  const tokens = tagged.flatMap((t) => ((t.state === 'cue' || t.state === 'cueInline') && t.cue ? [t.cue.token] : []));
  const cast = buildCast(tokens, profile.castList);
  const drafts: Draft[] = [];
  let speaker: Speaker | null = null;
  let speech: SpeechLine[] = [];
  let directions: CleanLine[] = [];
  let directionConf: number[] = [];

  const flushSpeech = (): void => {
    if (speech.length) drafts.push(...splitSpeech(speech, speaker ?? { factor: 1, cap: 1 }));
    speech = [];
  };
  const flushDirections = (): void => {
    if (directions.length) {
      drafts.push({
        kind: 'direction',
        text: directions.map((l) => l.text).join('\n'),
        cut: false,
        tagConfidence: Math.min(...directionConf),
        source: directions.flatMap((l) => l.source),
      });
    }
    directions = [];
    directionConf = [];
  };
  const flush = (): void => {
    flushSpeech();
    flushDirections();
  };
  const startSpeaker = (t: TaggedLine): Speaker => {
    const r = t.cue ? cast.resolve(t.cue.token) : null;
    return r ? { characterId: r.characterId, factor: r.confidence, cap: t.confidence } : { factor: 1, cap: Math.min(t.confidence, AMBIGUOUS_CONFIDENCE) };
  };

  doc.lines.forEach((l, i) => {
    const t = tagged[i];
    if (SCENE_BREAK.test(l.text)) {
      flush();
      drafts.push({ kind: 'sceneBreak', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
      return;
    }
    switch (CATEGORY[t.state]) {
      case 'front': {
        flush();
        speaker = null;
        const prev = drafts[drafts.length - 1];
        if (prev?.kind === 'frontMatter') {
          prev.text += `\n${l.text}`;
          prev.tagConfidence = Math.min(prev.tagConfidence, t.confidence);
          prev.source = [...prev.source, ...l.source];
        } else drafts.push({ kind: 'frontMatter', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
        break;
      }
      case 'heading':
        flush();
        speaker = null;
        drafts.push({ kind: 'heading', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
        break;
      case 'cue':
        flush();
        speaker = startSpeaker(t);
        drafts.push({ kind: 'characterName', text: l.text, cut: false, tagConfidence: t.confidence, source: l.source });
        break;
      case 'cueInline':
        flush();
        speaker = startSpeaker(t);
        speech.push(speechLine(l, t.confidence, t.cue?.rest));
        break;
      case 'dialogue':
        flushDirections();
        speech.push(speechLine(l, t.confidence));
        break;
      case 'direction':
        flushSpeech();
        directions.push(l);
        directionConf.push(t.confidence);
        break;
    }
  });
  flush();

  const units: Unit[] = drafts.map((d, k) => ({ id: `u${k + 1}`, ...d }));
  const warnings: ImportWarning[] = cast.ambiguous.map((a) => ({ code: 'ambiguousAlias', token: a.token, candidates: a.candidates }));
  return { units, cast, warnings };
}
```

`packages/script/src/overlap.ts`:

```ts
import { tokenize } from '@dasma/align';
import type { Unit } from './types';

/** A "/" standing alone or at a word edge marks where the next speaker comes in; "and/or" does not. */
const OVERLAP_MARK = /(?:^|\s)\/|\/(?=\s|$)/;

/** Spec §5.4: removes the first overlap "/" from each dialogue unit and records the overlap word ranges. */
export function applyOverlapMarks(units: Unit[]): Unit[] {
  const out = units.map((u) => ({ ...u, ...(u.overlapRanges ? { overlapRanges: [...u.overlapRanges] } : {}) }));
  for (let i = 0; i < out.length; i++) {
    const u = out[i];
    if (u.kind !== 'dialogue') continue;
    const m = OVERLAP_MARK.exec(u.text);
    if (!m) continue;
    const slash = m.index + m[0].indexOf('/');
    const before = u.text.slice(0, slash).trimEnd();
    const after = u.text.slice(slash + 1).trimStart();
    u.text = after ? `${before} ${after}` : before;
    const start = tokenize(before).length;
    const total = tokenize(u.text).length;
    if (total > start) u.overlapRanges = [...(u.overlapRanges ?? []), [start, total]];
    const next = out.slice(i + 1).find((x) => x.kind === 'dialogue');
    if (!next) continue;
    const k = Math.min(Math.max(1, total - start), tokenize(next.text).length);
    if (k > 0) next.overlapRanges = [[0, k], ...(next.overlapRanges ?? [])];
  }
  return out;
}
```

Add to `packages/script/src/index.ts`:

```ts
export { applyOverlapMarks } from './overlap';
export { INLINE_ITALIC_MIN_WORDS, buildUnits } from './units';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/units.test.ts packages/script/test/overlap.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all pass. A tagging failure that comes down to a weight is fixed in `weights.ts` (Global Constraints). Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): units from line states, inline directions and overlap marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: `importScript`, error sniffing and the engine adapter

**Files:**
- Create: `packages/script/src/import.ts`, `packages/script/src/align-adapter.ts`
- Create: `packages/script/test/import.test.ts`, `packages/script/test/align-adapter.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces:
  - `importScript(input: ImportInput, opts?: { title?: string }): Promise<ImportResult>`
  - `sniffUnsupported(bytes: Uint8Array): boolean`
  - `toAlignLines(script: Script): ScriptLineInput[]`
  - `UNKNOWN_CHARACTER = 'unknown'`
  - `UNTITLED = 'Untitled script'`

- [ ] **Step 1: Write the failing tests**

`packages/script/test/import.test.ts`:

```ts
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { importScript, sniffUnsupported } from '../src/import';

const PLAY = [
  'THE TRAGEDY OF HAMLET',
  'CHARACTERS',
  'HAMLET, a prince',
  'HORATIO, his friend',
  'ACT I',
  'HAMLET',
  'To be, or not to be.',
  'HORATIO',
  'My lord.',
  '(He sits.)',
  'HAMLET',
  'Then sit.',
  'HORATIO',
  'I sit.',
].join('\n');

const SPEECHES: Array<[string, string]> = [
  ['HAMLET', 'To be, or not to be, that is the question: whether tis nobler in the mind to suffer'],
  ['HORATIO', 'My lord, I came to see your father’s funeral, and stayed to see the wedding after it.'],
  ['HAMLET', 'I pray thee do not mock me, fellow student; I think it was to see my mother’s wedding.'],
  ['HORATIO', 'Indeed, my lord, it followed hard upon, so hard that the baked meats did serve them both.'],
];

const shape = (units: Array<{ kind: string; characterId?: string }>) => units.map((u) => [u.kind, u.characterId ?? null]);
const EXPECTED_SHAPE = [
  ['characterName', null],
  ['dialogue', 'hamlet'],
  ['characterName', null],
  ['dialogue', 'horatio'],
  ['characterName', null],
  ['dialogue', 'hamlet'],
  ['characterName', null],
  ['dialogue', 'horatio'],
  ['direction', null],
];

describe('importScript', () => {
  it('imports pasted text into a tagged script', async () => {
    const { script, warnings, pages } = await importScript({ kind: 'text', text: PLAY });
    expect(script.title).toBe('THE TRAGEDY OF HAMLET');
    expect(shape(script.units)).toEqual([
      ['frontMatter', null],
      ['heading', null],
      ['characterName', null],
      ['dialogue', 'hamlet'],
      ['characterName', null],
      ['dialogue', 'horatio'],
      ['direction', null],
      ['characterName', null],
      ['dialogue', 'hamlet'],
      ['characterName', null],
      ['dialogue', 'horatio'],
    ]);
    expect(script.characters.map((c) => c.id)).toEqual(['hamlet', 'horatio']);
    expect(warnings).toEqual([]);
    expect(pages).toBe(1);
  });

  it('keeps a pasted excerpt with no title or heading free of front matter (review focus 3)', async () => {
    const { script } = await importScript({
      kind: 'text',
      text: ['NORA. Hello, Torvald.', 'HELMER. Is that my lark?', 'NORA. It is.', 'HELMER. Come here.'].join('\n'),
    });
    expect(shape(script.units)).toEqual([
      ['dialogue', 'nora'],
      ['dialogue', 'helmer'],
      ['dialogue', 'nora'],
      ['dialogue', 'helmer'],
    ]);
    expect(script.title).toBe('Untitled script');
  });

  it('uses a given title', async () => {
    expect((await importScript({ kind: 'text', text: PLAY }, { title: 'Hamlet (rehearsal)' })).script.title).toBe('Hamlet (rehearsal)');
  });

  it('imports a PDF', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const regular = await doc.embedFont(StandardFonts.TimesRoman);
    const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let y = 720;
    for (const [who, says] of SPEECHES) {
      page.drawText(who, { x: (612 - bold.widthOfTextAtSize(who, 12)) / 2, y, size: 12, font: bold });
      page.drawText(says, { x: 72, y: y - 16, size: 11, font: regular });
      y -= 40;
    }
    page.drawText('He walks slowly to the window and looks out.', { x: 108, y, size: 11, font: italic });
    const { script } = await importScript({ kind: 'pdf', bytes: await doc.save() });
    expect(shape(script.units)).toEqual(EXPECTED_SHAPE);
  });

  it('imports a Word file', async () => {
    const children = SPEECHES.flatMap(([who, says]) => [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: who, bold: true })] }),
      new Paragraph(says),
    ]);
    children.push(new Paragraph({ indent: { left: 720 }, children: [new TextRun({ text: 'He walks slowly to the window and looks out.', italics: true })] }));
    const bytes = new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
    const { script } = await importScript({ kind: 'docx', bytes });
    expect(shape(script.units)).toEqual(EXPECTED_SHAPE);
  });

  it.each([
    ['blank text', { kind: 'text' as const, text: '   \n\n' }, 'empty'],
    ['only a soft hyphen', { kind: 'text' as const, text: ' ­ ' }, 'empty'],
    ['a legacy .doc', { kind: 'docx' as const, bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]) }, 'unsupportedFormat'],
    ['an RTF file', { kind: 'pdf' as const, bytes: new TextEncoder().encode('{\\rtf1 hello}') }, 'unsupportedFormat'],
    ['garbage as PDF', { kind: 'pdf' as const, bytes: new Uint8Array([1, 2, 3, 4]) }, 'unreadable'],
  ])('rejects %s', async (_, input, code) => {
    await expect(importScript(input)).rejects.toMatchObject({ code });
  });

  it('rejects a PDF with no text as scanned', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawRectangle({ x: 10, y: 10, width: 40, height: 40 });
    await expect(importScript({ kind: 'pdf', bytes: await doc.save() })).rejects.toMatchObject({ code: 'noTextLayer' });
  });

  it('warns when no speaker is found', async () => {
    const { warnings } = await importScript({ kind: 'text', text: 'It was a dark and stormy night.\nThe rain fell.\nNobody spoke.' });
    expect(warnings).toContainEqual({ code: 'noSpeakers' });
  });

  it('warns about mixed conventions', async () => {
    const text = ['Nora: Hi.', 'Helmer: Hello.', 'Nora: Bye.', 'Helmer: Go.', 'Nora: Fine.', 'Helmer: Yes.', 'NORA', 'Again.', 'HELMER', 'Again?'].join('\n');
    expect((await importScript({ kind: 'text', text })).warnings).toContainEqual({ code: 'mixedConventions', conventions: ['inlineColon', 'ownLine'] });
  });

  it('warns about an ambiguous alias and about many flagged units', async () => {
    // Both long names appear twice so they are known cues from the first line (no front matter); 8 of 24 units are LADY speeches.
    const text = ['LADY BRACKNELL', 'Good.', 'LADY MACBETH', 'Out.', 'LADY BRACKNELL', 'Indeed.', 'LADY MACBETH', 'Out, out.', ...Array.from({ length: 8 }, (_, i) => `LADY\nLine ${i}.`)].join('\n');
    const { warnings } = await importScript({ kind: 'text', text });
    expect(warnings).toContainEqual({ code: 'ambiguousAlias', token: 'LADY', candidates: ['LADY BRACKNELL', 'LADY MACBETH'] });
    expect(warnings.some((w) => w.code === 'manyFlagged')).toBe(true);
  });
});

describe('sniffUnsupported', () => {
  it('recognises legacy Word and RTF signatures', () => {
    expect(sniffUnsupported(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true);
    expect(sniffUnsupported(new TextEncoder().encode('{\\rtf1'))).toBe(true);
    expect(sniffUnsupported(new TextEncoder().encode('%PDF-1.7'))).toBe(false);
  });
});
```

`packages/script/test/align-adapter.test.ts`:

```ts
import { buildExpected } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { UNKNOWN_CHARACTER, toAlignLines } from '../src/align-adapter';
import type { Script } from '../src/types';

describe('toAlignLines', () => {
  it('passes dialogue units to the engine, with overlap zones and an unknown speaker', () => {
    const script: Script = {
      title: 'T',
      characters: [{ id: 'nora', name: 'NORA', aliases: [] }],
      units: [
        { id: 'u1', kind: 'characterName', text: 'NORA', cut: false, tagConfidence: 1, source: [] },
        { id: 'u2', kind: 'dialogue', characterId: 'nora', text: 'I never said that.', cut: false, overlapRanges: [[2, 4]], tagConfidence: 1, source: [] },
        { id: 'u3', kind: 'direction', text: '(Pause.)', cut: false, tagConfidence: 1, source: [] },
        { id: 'u4', kind: 'dialogue', text: 'Who speaks?', cut: true, tagConfidence: 0.4, source: [] },
      ],
    };
    const lines = toAlignLines(script);
    expect(lines).toEqual([
      { id: 'u2', characterId: 'nora', text: 'I never said that.', cut: false, overlapRanges: [[2, 4]] },
      { id: 'u4', characterId: UNKNOWN_CHARACTER, text: 'Who speaks?', cut: true },
    ]);
    expect(buildExpected(lines, { mode: 'word-perfect' }).map((w) => w.zone)).toEqual(['checked', 'checked', 'overlap', 'overlap']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/script/test/import.test.ts packages/script/test/align-adapter.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement**

`packages/script/src/import.ts`:

```ts
import { cleanDoc } from './clean';
import { ScriptImportError } from './errors';
import { extractDocx } from './extract/docx';
import { extractPdf } from './extract/pdf';
import { extractText } from './extract/text';
import { applyOverlapMarks } from './overlap';
import { profileDoc } from './profile';
import { tagLines } from './tag';
import type { ImportInput, ImportResult, ImportWarning, RawDoc } from './types';
import { buildUnits } from './units';
import { FLAG_BELOW, MANY_FLAGGED_SHARE } from './weights';

export const UNTITLED = 'Untitled script';
const OLE = [0xd0, 0xcf, 0x11, 0xe0];

/** Legacy .doc (OLE) and RTF files are refused with "save as .docx" (spec §4.1); .pages is caught by the docx reader. */
export function sniffUnsupported(bytes: Uint8Array): boolean {
  if (OLE.every((b, i) => bytes[i] === b)) return true;
  return String.fromCharCode(...bytes.subarray(0, 5)) === '{\\rtf';
}

async function extract(input: ImportInput): Promise<RawDoc> {
  if (input.kind === 'text') return extractText(input.text);
  if (sniffUnsupported(input.bytes)) throw new ScriptImportError('unsupportedFormat');
  return input.kind === 'pdf' ? extractPdf(input.bytes) : extractDocx(input.bytes);
}

/** Spec §3.2: bytes or text → tagged Script, with the profile, warnings and page count. */
export async function importScript(input: ImportInput, opts: { title?: string } = {}): Promise<ImportResult> {
  const doc = cleanDoc(await extract(input));
  if (doc.lines.length === 0) throw new ScriptImportError('empty');
  const profile = profileDoc(doc);
  const built = buildUnits(doc, tagLines(doc, profile), profile);
  const units = applyOverlapMarks(built.units);

  const warnings: ImportWarning[] = [];
  if (!units.some((u) => u.kind === 'dialogue' && u.characterId)) warnings.push({ code: 'noSpeakers' });
  if (profile.primary && profile.secondary) warnings.push({ code: 'mixedConventions', conventions: [profile.primary, profile.secondary] });
  warnings.push(...built.warnings);
  const flagged = units.filter((u) => u.tagConfidence < FLAG_BELOW).length;
  if (units.length && flagged / units.length > MANY_FLAGGED_SHARE) warnings.push({ code: 'manyFlagged', share: flagged / units.length });

  const title = opts.title ?? units.find((u) => u.kind === 'frontMatter')?.text.split('\n')[0] ?? UNTITLED;
  return { script: { title, characters: built.cast.characters, units }, profile, warnings, pages: doc.pages };
}
```

`packages/script/src/align-adapter.ts`:

```ts
import type { ScriptLineInput } from '@dasma/align';
import type { Script } from './types';

/** characterId given to a dialogue unit whose speaker was not resolved (such units are always flagged). */
export const UNKNOWN_CHARACTER = 'unknown';

/** Spec §9: dialogue units, in order, as the engine's script lines. */
export function toAlignLines(script: Script): ScriptLineInput[] {
  return script.units
    .filter((u) => u.kind === 'dialogue')
    .map((u) => ({
      id: u.id,
      characterId: u.characterId ?? UNKNOWN_CHARACTER,
      text: u.text,
      cut: u.cut,
      ...(u.overlapRanges ? { overlapRanges: u.overlapRanges } : {}),
    }));
}
```

Add to `packages/script/src/index.ts`:

```ts
export { UNKNOWN_CHARACTER, toAlignLines } from './align-adapter';
export { UNTITLED, importScript, sniffUnsupported } from './import';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/import.test.ts packages/script/test/align-adapter.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all pass. The first test expects `warnings` to be `[]`. If it fails only with `manyFlagged`, the confidences are too low: raise them in `weights.ts` (Global Constraints) and re-run `npm test`. Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): importScript with error sniffing, warnings and the engine adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `.dasma` read and write (`format.ts`)

**Files:**
- Create: `packages/script/src/format.ts`
- Create: `packages/script/test/format.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `Script`, `Unit`, `Character`, `UnitKind` (Task 1); `ScriptFormatError` (Task 1).
- Produces:
  - `writeDasma(script: Script, opts?: { cast?: Record<string, string[]>; now?: Date }): string`
  - `readDasma(text: string): { script: Script; cast?: Record<string, string[]>; exportedAt: string }`
  - the constants `DASMA_FORMAT = 'dasma-script'`, `DASMA_FORMAT_VERSION = 1`, `DASMA_MIME = 'application/vnd.dasma+json'`, `DASMA_EXTENSION = '.dasma'`

- [ ] **Step 1: Write the failing tests**

`packages/script/test/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readDasma, writeDasma } from '../src/format';
import type { Script } from '../src/types';
import { thrownCode } from './helpers';

const SCRIPT: Script = {
  title: 'Hamlet',
  characters: [{ id: 'hamlet', name: 'HAMLET', aliases: ['HAM'] }],
  units: [
    { id: 'u1', kind: 'heading', text: 'ACT I', cut: false, tagConfidence: 0.99, source: [{ page: 1, line: 0 }] },
    { id: 'u2', kind: 'dialogue', characterId: 'hamlet', text: 'To be.', cut: true, overlapRanges: [[0, 1]], tagConfidence: 0.7, source: [{ page: 1, line: 2 }] },
  ],
};
const NOW = new Date('2026-10-11T00:00:00Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validFile = (): any => JSON.parse(writeDasma(SCRIPT, { now: NOW }));

describe('writeDasma / readDasma', () => {
  it('round-trips a script', () => {
    expect(readDasma(writeDasma(SCRIPT, { now: NOW }))).toEqual({ script: SCRIPT, exportedAt: '2026-10-11T00:00:00.000Z' });
  });

  it('writes the header, and the cast only when asked', () => {
    const plain = validFile();
    expect([plain.format, plain.formatVersion, 'cast' in plain]).toEqual(['dasma-script', 1, false]);
    const withCast = writeDasma(SCRIPT, { now: NOW, cast: { hamlet: ['Sam Lee'] } });
    expect(readDasma(withCast).cast).toEqual({ hamlet: ['Sam Lee'] });
  });

  it('rejects text that is not JSON, not a DASMA file, or from a newer version', () => {
    expect(thrownCode(() => readDasma('not json'))).toBe('notJson');
    expect(thrownCode(() => readDasma('{"format":"other"}'))).toBe('notDasma');
    expect(thrownCode(() => readDasma(JSON.stringify({ ...validFile(), formatVersion: 2 })))).toBe('newerVersion');
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it.each<[string, (f: any) => void]>([
    ['formatVersion', (f) => (f.formatVersion = 'one')],
    ['title', (f) => (f.title = 7)],
    ['characters[0].aliases', (f) => (f.characters[0].aliases = 'HAM')],
    ['characters[1].id', (f) => f.characters.push({ id: 'hamlet', name: 'X', aliases: [] })],
    ['units[1].kind', (f) => (f.units[1].kind = 'song')],
    ['units[1].characterId', (f) => (f.units[1].characterId = 'ophelia')],
    ['units[1].id', (f) => (f.units[1].id = 'u1')],
    ['units[1].overlapRanges', (f) => (f.units[1].overlapRanges = [[2, 1]])],
    ['units[1].cut', (f) => (f.units[1].cut = 'yes')],
    ['units[0].tagConfidence', (f) => (f.units[0].tagConfidence = 1.5)],
    ['units[0].source', (f) => (f.units[0].source = [{ page: 0, line: 0 }])],
    ['cast.ophelia', (f) => (f.cast = { ophelia: ['Ann'] })],
  ])('rejects a damaged %s', (path, damage) => {
    const f = validFile();
    damage(f);
    try {
      readDasma(JSON.stringify(f));
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ reason: 'invalid', path });
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/script/test/format.test.ts`
Expected: FAIL, because `../src/format` doesn't exist yet.

- [ ] **Step 3: Implement**

`packages/script/src/format.ts`:

```ts
import { ScriptFormatError } from './errors';
import type { Character, Script, SourceRef, Unit, UnitKind } from './types';

export const DASMA_FORMAT = 'dasma-script';
export const DASMA_FORMAT_VERSION = 1;
export const DASMA_MIME = 'application/vnd.dasma+json';
export const DASMA_EXTENSION = '.dasma';

const KINDS: readonly UnitKind[] = ['dialogue', 'direction', 'characterName', 'heading', 'sceneBreak', 'frontMatter'];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
function fail(path: string): never {
  throw new ScriptFormatError('invalid', path);
}

export function writeDasma(script: Script, opts: { cast?: Record<string, string[]>; now?: Date } = {}): string {
  const file = {
    format: DASMA_FORMAT,
    formatVersion: DASMA_FORMAT_VERSION,
    title: script.title,
    characters: script.characters,
    units: script.units,
    ...(opts.cast ? { cast: opts.cast } : {}),
    exportedAt: (opts.now ?? new Date()).toISOString(),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function readCharacter(v: unknown, path: string): Character {
  if (!isObj(v)) fail(path);
  if (typeof v.id !== 'string' || v.id === '') fail(`${path}.id`);
  if (typeof v.name !== 'string') fail(`${path}.name`);
  if (!isStrings(v.aliases)) fail(`${path}.aliases`);
  return { id: v.id, name: v.name, aliases: [...v.aliases] };
}

function readRanges(v: unknown, path: string): Array<[number, number]> {
  if (!Array.isArray(v)) fail(path);
  let end = 0;
  return v.map((r) => {
    if (!Array.isArray(r) || r.length !== 2 || !isInt(r[0]) || !isInt(r[1]) || r[0] < end || r[1] <= r[0]) fail(path);
    end = r[1];
    return [r[0], r[1]] as [number, number];
  });
}

function readSource(v: unknown, path: string): SourceRef[] {
  if (!Array.isArray(v)) fail(path);
  return v.map((s) => {
    if (!isObj(s) || !isInt(s.page) || s.page < 1 || !isInt(s.line) || s.line < 0) fail(path);
    return { page: s.page, line: s.line };
  });
}

function readUnit(v: unknown, path: string, characterIds: Set<string>): Unit {
  if (!isObj(v)) fail(path);
  if (typeof v.id !== 'string' || v.id === '') fail(`${path}.id`);
  if (!KINDS.includes(v.kind as UnitKind)) fail(`${path}.kind`);
  if (v.characterId !== undefined && (typeof v.characterId !== 'string' || !characterIds.has(v.characterId))) fail(`${path}.characterId`);
  if (typeof v.text !== 'string') fail(`${path}.text`);
  if (typeof v.cut !== 'boolean') fail(`${path}.cut`);
  const overlapRanges = v.overlapRanges === undefined ? undefined : readRanges(v.overlapRanges, `${path}.overlapRanges`);
  if (typeof v.tagConfidence !== 'number' || !(v.tagConfidence >= 0 && v.tagConfidence <= 1)) fail(`${path}.tagConfidence`);
  const source = readSource(v.source, `${path}.source`);
  return {
    id: v.id,
    kind: v.kind as UnitKind,
    ...(v.characterId !== undefined ? { characterId: v.characterId as string } : {}),
    text: v.text,
    cut: v.cut,
    ...(overlapRanges ? { overlapRanges } : {}),
    tagConfidence: v.tagConfidence,
    source,
  };
}

/** Spec §8.1: validates by hand and returns only known fields. */
export function readDasma(text: string): { script: Script; cast?: Record<string, string[]>; exportedAt: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScriptFormatError('notJson');
  }
  if (!isObj(data) || data.format !== DASMA_FORMAT) throw new ScriptFormatError('notDasma');
  if (!isInt(data.formatVersion) || data.formatVersion < 1) fail('formatVersion');
  if (data.formatVersion > DASMA_FORMAT_VERSION) throw new ScriptFormatError('newerVersion');
  if (typeof data.title !== 'string') fail('title');
  if (typeof data.exportedAt !== 'string') fail('exportedAt');
  if (!Array.isArray(data.characters)) fail('characters');
  const characters = data.characters.map((c: unknown, i: number) => readCharacter(c, `characters[${i}]`));
  const characterIds = new Set<string>();
  characters.forEach((c, i) => {
    if (characterIds.has(c.id)) fail(`characters[${i}].id`);
    characterIds.add(c.id);
  });
  if (!Array.isArray(data.units)) fail('units');
  const unitIds = new Set<string>();
  const units = data.units.map((u: unknown, i: number) => {
    const unit = readUnit(u, `units[${i}]`, characterIds);
    if (unitIds.has(unit.id)) fail(`units[${i}].id`);
    unitIds.add(unit.id);
    return unit;
  });
  let cast: Record<string, string[]> | undefined;
  if (data.cast !== undefined) {
    if (!isObj(data.cast)) fail('cast');
    cast = {};
    for (const [id, actors] of Object.entries(data.cast)) {
      if (!characterIds.has(id) || !isStrings(actors)) fail(`cast.${id}`);
      cast[id] = [...actors];
    }
  }
  return { script: { title: data.title, characters, units }, ...(cast ? { cast } : {}), exportedAt: data.exportedAt };
}
```

Add to `packages/script/src/index.ts`:

```ts
export { DASMA_EXTENSION, DASMA_FORMAT, DASMA_FORMAT_VERSION, DASMA_MIME, readDasma, writeDasma } from './format';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/format.test.ts && npm run typecheck && npm run lint`
Expected: all pass. Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): .dasma read and write with hand-written validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Re-import diff and carry-over (`diff.ts`)

**Files:**
- Create: `packages/script/src/diff.ts`
- Create: `packages/script/test/diff.test.ts`
- Modify: `packages/script/src/index.ts`

**Interfaces:**
- Consumes: `Script`, `Unit` (Task 1); `FLAG_BELOW` (Task 5); `tokenize` and `normalizeToken` from `@dasma/align`.
- Produces:
  - `interface ScriptDiff { unchanged: Array<{ oldId: string; newId: string }>; changed: Array<{ oldId: string; newId: string; similarity: number }>; added: string[]; removed: string[] }`
  - `diffScripts(old: Script, next: Script): ScriptDiff`
  - `carryOver(old: Script, next: Script, diff: ScriptDiff): Script`
  - `similarity(a: string, b: string): number`
  - `SAME_UNIT_SIMILARITY = 0.6`

- [ ] **Step 1: Write the failing tests**

`packages/script/test/diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { carryOver, diffScripts, similarity } from '../src/diff';
import type { Script, Unit } from '../src/types';
import { FLAG_BELOW } from '../src/weights';

const u = (id: string, kind: Unit['kind'], text: string, extra: Partial<Unit> = {}): Unit => ({
  id,
  kind,
  text,
  cut: false,
  tagConfidence: 0.9,
  source: [],
  ...(kind === 'dialogue' ? { characterId: 'nora' } : {}),
  ...extra,
});
const script = (units: Unit[], characters = [{ id: 'nora', name: 'NORA', aliases: [] }]): Script => ({ title: 'T', characters, units });

describe('diffScripts', () => {
  it('finds unchanged, changed, added and removed units', () => {
    const old = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'To be, or not to be, that is the question.'),
      u('u3', 'dialogue', 'Get thee to a nunnery.'),
      u('u4', 'dialogue', 'Words, words, words.'),
    ]);
    const next = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'To be, or not to be: that is the question!'),
      u('u3', 'dialogue', 'Get thee to a nunnery, go.'),
      u('u4', 'dialogue', 'Something new entirely.'),
    ]);
    const d = diffScripts(old, next);
    expect(d.unchanged).toEqual([
      { oldId: 'u1', newId: 'u1' },
      { oldId: 'u2', newId: 'u2' },
    ]);
    expect(d.changed).toEqual([{ oldId: 'u3', newId: 'u3', similarity: 5 / 6 }]);
    expect(d.added).toEqual(['u4']);
    expect(d.removed).toEqual(['u4']);
  });

  it('pairs only units of the same spoken class', () => {
    const d = diffScripts(script([u('u1', 'dialogue', 'Exit.')]), script([u('u1', 'direction', 'Exit.')]));
    expect([d.unchanged, d.added, d.removed]).toEqual([[], ['u1'], ['u1']]);
  });

  it('keeps one match when two lines swap places', () => {
    const old = script([u('a', 'dialogue', 'First line here.'), u('b', 'dialogue', 'Second line here too.'), u('c', 'dialogue', 'Third and last one.')]);
    const next = script([u('a', 'dialogue', 'First line here.'), u('c', 'dialogue', 'Third and last one.'), u('b', 'dialogue', 'Second line here too.')]);
    const d = diffScripts(old, next);
    expect(d.unchanged).toHaveLength(2);
    expect(d.added).toHaveLength(1);
    expect(d.removed).toHaveLength(1);
  });
});

describe('carryOver', () => {
  it('keeps the user’s corrections on unchanged units and flags changed ones', () => {
    const old = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'To be, or not to be.', { characterId: 'helmer', cut: true, tagConfidence: 1 }),
      u('u3', 'dialogue', 'Get thee to a nunnery.', { cut: true }),
      u('u4', 'dialogue', 'Words, words, words.'),
    ], [{ id: 'nora', name: 'NORA', aliases: [] }, { id: 'helmer', name: 'HELMER', aliases: [] }]);
    const next = script(
      [u('u1', 'heading', 'ACT I'), u('u2', 'dialogue', 'To be, or not to be.'), u('u3', 'dialogue', 'Get thee to a nunnery, go.'), u('u4', 'dialogue', 'Words, words, words.'), u('u5', 'dialogue', 'A new line.')],
      [{ id: 'nora', name: 'NORA', aliases: [] }, { id: 'rank', name: 'RANK', aliases: [] }],
    );
    const merged = carryOver(old, next, diffScripts(old, next));
    const byId = new Map(merged.units.map((x) => [x.id, x]));
    expect(byId.get('u2')).toMatchObject({ characterId: 'helmer', cut: true, tagConfidence: 1 });
    expect(byId.get('u3')).toMatchObject({ cut: true, text: 'Get thee to a nunnery, go.' });
    expect(byId.get('u3')!.tagConfidence).toBeLessThan(FLAG_BELOW);
    expect(merged.units.map((x) => x.id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5']);
    expect(merged.characters.map((c) => c.id)).toEqual(['nora', 'helmer', 'rank']);
  });

  it('keeps ids and cuts when a scene is inserted mid-script (review focus 5)', () => {
    const old = script([
      u('u1', 'heading', 'ACT I'),
      u('u2', 'dialogue', 'Hello there, Torvald.'),
      u('u3', 'dialogue', 'Is that my little lark?', { cut: true }),
      u('u4', 'heading', 'ACT II'),
      u('u5', 'dialogue', 'The Christmas tree is stripped.'),
    ]);
    const next = script([
      u('n1', 'heading', 'ACT I'),
      u('n2', 'dialogue', 'Hello there, Torvald.'),
      u('n3', 'dialogue', 'Is that my little lark?'),
      u('n4', 'heading', 'SCENE 2'),
      u('n5', 'dialogue', 'A brand new line here.'),
      u('n6', 'dialogue', 'Another brand new speech.'),
      u('n7', 'heading', 'ACT II'),
      u('n8', 'dialogue', 'The Christmas tree is stripped.'),
    ]);
    const merged = carryOver(old, next, diffScripts(old, next));
    expect(merged.units.map((x) => x.id)).toEqual(['u1', 'u2', 'u3', 'u6', 'u7', 'u8', 'u4', 'u5']);
    expect(merged.units[2].cut).toBe(true);
  });
});

describe('similarity', () => {
  it('is token-set Jaccard after the engine’s normalisation', () => {
    expect(similarity('To be, or not.', 'to BE or not!')).toBe(1);
    expect(similarity('a b', 'c d')).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run packages/script/test/diff.test.ts`
Expected: FAIL, because `../src/diff` doesn't exist yet.

- [ ] **Step 3: Implement**

`packages/script/src/diff.ts`:

```ts
import { normalizeToken, tokenize } from '@dasma/align';
import type { Script, Unit } from './types';
import { FLAG_BELOW } from './weights';

/** Two units are the same unit (possibly changed) at or above this token-set similarity (spec §8.2). */
export const SAME_UNIT_SIMILARITY = 0.6;

export interface ScriptDiff {
  unchanged: Array<{ oldId: string; newId: string }>;
  changed: Array<{ oldId: string; newId: string; similarity: number }>;
  added: string[];
  removed: string[];
}

function normWords(text: string): string[] {
  const raw = tokenize(text);
  return raw.flatMap((t, i) => normalizeToken(t, raw[i + 1]));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function similarity(a: string, b: string): number {
  return jaccard(new Set(normWords(a)), new Set(normWords(b)));
}

const spoken = (u: Unit): boolean => u.kind === 'dialogue';

/** Order-preserving best match (Needleman–Wunsch, gap cost 0, a match scores its similarity). */
export function diffScripts(old: Script, next: Script): ScriptDiff {
  const a = old.units;
  const b = next.units;
  const aw = a.map((u) => normWords(u.text));
  const bw = b.map((u) => normWords(u.text));
  const as = aw.map((w) => new Set(w));
  const bs = bw.map((w) => new Set(w));
  const sim = (i: number, j: number): number => {
    if (spoken(a[i]) !== spoken(b[j])) return -1;
    if (aw[i].length === 0 && bw[j].length === 0) return a[i].text.trim() === b[j].text.trim() ? 1 : -1;
    return jaccard(as[i], bs[j]);
  };
  const n = a.length;
  const m = b.length;
  const W = m + 1;
  const score = new Float64Array((n + 1) * W);
  const simAt = new Float64Array(n * m);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sim(i - 1, j - 1);
      simAt[(i - 1) * m + (j - 1)] = s;
      let best = Math.max(score[(i - 1) * W + j], score[i * W + j - 1]);
      if (s >= SAME_UNIT_SIMILARITY) best = Math.max(best, score[(i - 1) * W + j - 1] + s);
      score[i * W + j] = best;
    }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const s = simAt[(i - 1) * m + (j - 1)];
    if (s >= SAME_UNIT_SIMILARITY && score[i * W + j] === score[(i - 1) * W + j - 1] + s) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (score[i * W + j] === score[(i - 1) * W + j]) i--;
    else j--;
  }
  pairs.reverse();
  const matchedA = new Set(pairs.map(([i]) => i));
  const matchedB = new Set(pairs.map(([, j]) => j));
  const diff: ScriptDiff = { unchanged: [], changed: [], added: [], removed: [] };
  for (const [i, j] of pairs) {
    const same = aw[i].join(' ') === bw[j].join(' ') && (aw[i].length > 0 || a[i].text.trim() === b[j].text.trim());
    if (same) diff.unchanged.push({ oldId: a[i].id, newId: b[j].id });
    else diff.changed.push({ oldId: a[i].id, newId: b[j].id, similarity: simAt[i * m + j] });
  }
  diff.added = b.filter((_, j) => !matchedB.has(j)).map((u) => u.id);
  diff.removed = a.filter((_, i) => !matchedA.has(i)).map((u) => u.id);
  return diff;
}

/** Spec §8.2: the new script with old ids for matched units; unchanged units keep the user's tags, changed units keep cut and are flagged. */
export function carryOver(old: Script, next: Script, diff: ScriptDiff): Script {
  const oldById = new Map(old.units.map((u) => [u.id, u]));
  const match = new Map<string, { oldId: string; unchanged: boolean }>();
  for (const p of diff.unchanged) match.set(p.newId, { oldId: p.oldId, unchanged: true });
  for (const p of diff.changed) match.set(p.newId, { oldId: p.oldId, unchanged: false });
  let maxN = 0;
  for (const u of old.units) maxN = Math.max(maxN, Number(/^u(\d+)$/.exec(u.id)?.[1] ?? 0));
  const units = next.units.map((u): Unit => {
    const mt = match.get(u.id);
    if (!mt) return { ...u, id: `u${++maxN}` };
    const prev = oldById.get(mt.oldId)!;
    if (mt.unchanged) {
      const { characterId, overlapRanges, ...rest } = u;
      void characterId;
      void overlapRanges;
      return {
        ...rest,
        id: prev.id,
        kind: prev.kind,
        ...(prev.characterId !== undefined ? { characterId: prev.characterId } : {}),
        cut: prev.cut,
        ...(prev.overlapRanges ? { overlapRanges: prev.overlapRanges } : {}),
        tagConfidence: prev.tagConfidence,
      };
    }
    return { ...u, id: prev.id, cut: prev.cut, tagConfidence: Math.min(u.tagConfidence, FLAG_BELOW - 0.01) };
  });
  const characters = [...old.characters, ...next.characters.filter((c) => !old.characters.some((o) => o.id === c.id))];
  return { title: next.title, characters, units };
}
```

Add to `packages/script/src/index.ts`:

```ts
export { SAME_UNIT_SIMILARITY, carryOver, diffScripts, similarity } from './diff';
export type { ScriptDiff } from './diff';
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run packages/script/test/diff.test.ts && npm test && npm run typecheck && npm run lint`
Expected: all pass. Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add packages/script
git commit -m "feat(script): re-import diff and carry-over of user corrections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Source plays from Project Gutenberg

**Files:**
- Modify: `harness/package.json` (dependencies), `harness/src/paths.ts`, `harness/src/cli.ts`, `.gitignore`
- Create: `harness/src/corpus/source-play.ts`, `harness/src/corpus/convert-gutenberg.ts`
- Create: `harness/test/corpus/convert-gutenberg.test.ts`
- Create (generated, committed): `harness/corpus/plays/{earnest,dolls-house,hamlet,romeo,seagull}.json`

**Interfaces:**
- Consumes: `slugId`, `Character` from `@dasma/script`.
- Produces:
  - `SourcePlay { id: string; title: string; source: string; cast: Character[]; units: SourceUnit[] }`
  - `SourceUnit { kind: 'frontMatter' | 'heading' | 'direction' | 'dialogue'; characterId?: string; text: string }`
  - `PLAY_IDS`
  - `loadPlay(id: string): SourcePlay`
  - `PlayConfig`, `PLAY_CONFIGS`
  - `convertGutenberg(text: string, cfg: PlayConfig): SourcePlay`
  - `normalizeDirections(s: string): string`
  - `unencodable(text: string): string[]`
  - the paths `PLAYS_DIR`, `CORPUS_OUT_DIR`, `LOCAL_DIR`, `DUMP_DIR`, `SCRIPT_EVAL_DIR`
  - the CLI command `convert-plays --from <dir>`

In a dialogue `text`, verse lines are joined with `\n`, inline directions appear as `[...]`, and emphasis appears as `_word_`. Direction text is plain.

- [ ] **Step 1: Add the harness dependencies, paths and ignore rule**

In `harness/package.json`, set:

```json
  "dependencies": {
    "@dasma/align": "*",
    "@dasma/asr": "*",
    "@dasma/script": "*"
  },
  "devDependencies": {
    "diff": "9.0.0",
    "docx": "9.7.1",
    "pdf-lib": "1.17.1"
  }
```

Append to `harness/src/paths.ts`:

```ts
export const PLAYS_DIR = join(HARNESS_ROOT, 'corpus', 'plays');
export const CORPUS_OUT_DIR = join(OUT_DIR, 'corpus');
export const LOCAL_DIR = join(HARNESS_ROOT, 'local');
export const DUMP_DIR = join(OUT_DIR, 'dump');
export const SCRIPT_EVAL_DIR = join(OUT_DIR, 'script-eval');
```

Append to `.gitignore`:

```
harness/local/
```

Run: `npm install`
Expected: installs `diff@9.0.0` and links `@dasma/script` into the harness.

- [ ] **Step 2: Write the failing converter tests**

`harness/test/corpus/convert-gutenberg.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { convertGutenberg, normalizeDirections, unencodable, type PlayConfig } from '../../src/corpus/convert-gutenberg';

const wrap = (body: string[]) =>
  ['Title: Mini', '*** START OF THE PROJECT GUTENBERG EBOOK MINI ***', ...body, '*** END OF THE PROJECT GUTENBERG EBOOK MINI ***', 'licence'].join('\n');

const OWN: PlayConfig = {
  id: 'mini',
  gutenbergId: 0,
  title: ['MINI'],
  source: 'test',
  cueStyle: 'ownLine',
  verse: true,
  bodyStart: /^ACT I$/,
  bodyStartOccurrence: 1,
  frontStart: /^PERSONS$/,
  frontEnd: null,
  castExceptions: [],
};

describe('convertGutenberg', () => {
  it('reads own-line cues, verse, inline directions and emphasis; drops the contents list', () => {
    const play = convertGutenberg(
      wrap([
        '', 'MINI', '', 'Contents', ' ACT I', '', 'PERSONS', 'HAMLET, a prince', 'HORATIO, his friend', '',
        'ACT I', '', 'SCENE I. A platform.', '', 'Enter Hamlet.', '',
        'HAMLET.', 'To be, _or_ not to be,', '[_Aside._] that is the question.', '',
        'HORATIO.', 'My lord.', '', '[_Exit._]', '',
      ]),
      OWN,
    );
    expect(play.cast).toEqual([
      { id: 'hamlet', name: 'HAMLET', aliases: [] },
      { id: 'horatio', name: 'HORATIO', aliases: [] },
    ]);
    expect(play.units).toEqual([
      { kind: 'frontMatter', text: 'MINI' },
      { kind: 'frontMatter', text: 'PERSONS' },
      { kind: 'frontMatter', text: 'HAMLET, a prince' },
      { kind: 'frontMatter', text: 'HORATIO, his friend' },
      { kind: 'heading', text: 'ACT I' },
      { kind: 'heading', text: 'SCENE I. A platform.' },
      { kind: 'direction', text: 'Enter Hamlet.' },
      { kind: 'dialogue', characterId: 'hamlet', text: 'To be, _or_ not to be,\n[Aside.] that is the question.' },
      { kind: 'dialogue', characterId: 'horatio', text: 'My lord.' },
      { kind: 'direction', text: 'Exit.' },
    ]);
  });

  it('reads inline cues in prose', () => {
    const play = convertGutenberg(
      wrap(['CHARACTERS', 'PETER SORIN, her brother', '', 'ACT I', '', 'SORIN leaning on a cane comes in.', '', 'SORIN. For some reason, my boy,', 'country life does not suit me. [Laughing]', '']),
      { ...OWN, cueStyle: 'inline', verse: false, frontStart: /^CHARACTERS$/ },
    );
    expect(play.units.slice(-2)).toEqual([
      { kind: 'direction', text: 'SORIN leaning on a cane comes in.' },
      { kind: 'dialogue', characterId: 'sorin', text: 'For some reason, my boy, country life does not suit me. [Laughing]' },
    ]);
  });

  it('fails on a speaker missing from the cast list unless excepted', () => {
    const text = wrap(['PERSONS', 'HAMLET, a prince', '', 'ACT I', '', 'GHOST.', 'Remember me.', '']);
    expect(() => convertGutenberg(text, OWN)).toThrow(/GHOST/);
    expect(convertGutenberg(text, { ...OWN, castExceptions: ['GHOST'] }).cast.map((c) => c.id)).toEqual(['ghost']);
  });
});

describe('normalizeDirections', () => {
  it('turns Gutenberg direction forms into plain brackets and keeps emphasis', () => {
    expect(normalizeDirections('_[putting her hands over his mouth]_. Oh! I _do_.')).toBe('[putting her hands over his mouth]. Oh! I _do_.');
    expect(normalizeDirections('[_Exit._] Go.')).toBe('[Exit.] Go.');
  });
});

describe('unencodable', () => {
  it('lists characters outside WinAnsi', () => {
    expect(unencodable('Personæ — “fine” ’tis')).toEqual([]);
    expect(unencodable('Ōsaka ā')).toEqual(['Ō', 'ā']);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run harness/test/corpus/convert-gutenberg.test.ts`
Expected: FAIL, because the module doesn't exist yet.

- [ ] **Step 4: Implement the source-play types and the converter**

`harness/src/corpus/source-play.ts`:

```ts
import type { Character } from '@dasma/script';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYS_DIR } from '../paths';

export type SourceKind = 'frontMatter' | 'heading' | 'direction' | 'dialogue';

/** One unit of a source play. Dialogue text: verse lines joined by \n, inline directions as [...], emphasis as _word_. */
export interface SourceUnit {
  kind: SourceKind;
  characterId?: string;
  text: string;
}

export interface SourcePlay {
  id: string;
  title: string;
  source: string;
  cast: Character[];
  units: SourceUnit[];
}

export const PLAY_IDS = ['earnest', 'dolls-house', 'hamlet', 'romeo', 'seagull'] as const;

export function loadPlay(id: string): SourcePlay {
  if (!(PLAY_IDS as readonly string[]).includes(id)) throw new Error(`Unknown play "${id}". Known: ${PLAY_IDS.join(', ')}`);
  return JSON.parse(readFileSync(join(PLAYS_DIR, `${id}.json`), 'utf8')) as SourcePlay;
}
```

`harness/src/corpus/convert-gutenberg.ts`:

```ts
import { slugId, type Character } from '@dasma/script';
import type { SourcePlay, SourceUnit } from './source-play';

export interface PlayConfig {
  id: string;
  gutenbergId: number;
  /** Title-page lines, emitted as the first front-matter units. */
  title: string[];
  source: string;
  cueStyle: 'ownLine' | 'inline';
  /** Join a speech's lines with \n (verse) rather than a space (hard-wrapped prose). */
  verse: boolean;
  /** Matched against untrimmed lines, so an indented contents entry doesn't count. */
  bodyStart: RegExp;
  bodyStartOccurrence: number;
  /** Matched against trimmed lines before the body: the cast list's first line… */
  frontStart: RegExp;
  /** …and the line after it (null: up to the body). */
  frontEnd: RegExp | null;
  /** Speakers allowed although no word of theirs is in the cast list. */
  castExceptions: string[];
}

const pd = (what: string, id: number) => `${what}. Project Gutenberg eBook #${id}, header and licence removed. Public domain in the US.`;

export const PLAY_CONFIGS: PlayConfig[] = [
  {
    id: 'earnest',
    gutenbergId: 844,
    title: ['THE IMPORTANCE OF BEING EARNEST', 'A Trivial Comedy for Serious People', 'by Oscar Wilde'],
    source: pd('Oscar Wilde, The Importance of Being Earnest (1895)', 844),
    cueStyle: 'ownLine',
    verse: false,
    bodyStart: /^FIRST ACT$/,
    bodyStartOccurrence: 1,
    frontStart: /^THE PERSONS IN THE PLAY$/,
    frontEnd: /^THE SCENES OF THE PLAY$/,
    castExceptions: ['JACK'],
  },
  {
    id: 'dolls-house',
    gutenbergId: 2542,
    title: ["A DOLL'S HOUSE", 'by Henrik Ibsen', 'translated by R. Farquharson Sharp'],
    source: pd("Henrik Ibsen, A Doll's House, tr. R. Farquharson Sharp (1910)", 2542),
    cueStyle: 'ownLine',
    verse: false,
    bodyStart: /^ACT I$/,
    bodyStartOccurrence: 1,
    frontStart: /^DRAMATIS PERSONAE$/,
    frontEnd: /^A DOLL’S HOUSE$/,
    castExceptions: ['SERVANT'],
  },
  {
    id: 'hamlet',
    gutenbergId: 1524,
    title: ['THE TRAGEDY OF HAMLET, PRINCE OF DENMARK', 'by William Shakespeare'],
    source: pd('William Shakespeare, Hamlet', 1524),
    cueStyle: 'ownLine',
    verse: true,
    bodyStart: /^ACT I$/,
    bodyStartOccurrence: 1,
    frontStart: /^Dramatis Person/,
    frontEnd: null,
    castExceptions: ['BOTH', 'ALL', 'PROLOGUE', 'LUCIANUS', 'DANES'],
  },
  {
    id: 'romeo',
    gutenbergId: 1513,
    title: ['THE TRAGEDY OF ROMEO AND JULIET', 'by William Shakespeare'],
    source: pd('William Shakespeare, Romeo and Juliet', 1513),
    cueStyle: 'ownLine',
    verse: true,
    bodyStart: /^(THE PROLOGUE|ACT I)$/,
    bodyStartOccurrence: 2,
    frontStart: /^Dramatis Person/,
    frontEnd: null,
    castExceptions: [],
  },
  {
    id: 'seagull',
    gutenbergId: 1754,
    title: ['THE SEA-GULL', 'by Anton Chekhov'],
    source: pd('Anton Chekhov, The Sea-Gull, English translation published before 1931', 1754),
    cueStyle: 'inline',
    verse: false,
    bodyStart: /^ACT I$/,
    bodyStartOccurrence: 1,
    frontStart: /^CHARACTERS$/,
    frontEnd: /^THE SEA-GULL$/,
    castExceptions: ['ARKADINA'],
  },
];

const HEADING = /^(ACT [IVX]+\.?|SCENE\b.*|Scene [IVX]+\..*|(FIRST|SECOND|THIRD|FOURTH|FIFTH) ACT|(THE )?PROLOGUE\.?|EPILOGUE\.?)$/;
const OWN_CUE = /^([A-Z][A-Z’'-]*(?: [A-Z][A-Z’'-]*)*)\.$/;
const INLINE_CUE = /^([A-Z][A-Z’'-]+(?: [A-Z][A-Z’'-]+)*)\. (.*)$/s;
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Gutenberg's `_[...]_` and `[_..._]` become `[...]`; `_word_` emphasis outside brackets stays. */
export function normalizeDirections(s: string): string {
  return s
    .replace(/_\[([^\]]*)\]_?/g, '[$1]')
    .replace(/\[_([^\]]*?)_\]/g, '[$1]')
    .replace(/\[([^\]]*)\]/g, (_, x: string) => `[${x.replace(/_/g, '')}]`);
}

/** Characters the standard PDF fonts (WinAnsi) cannot draw. */
export function unencodable(text: string): string[] {
  return [
    ...new Set(
      [...text].filter((c) => {
        const n = c.codePointAt(0)!;
        return !(n === 10 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || WINANSI_EXTRA.includes(c));
      }),
    ),
  ];
}

export function convertGutenberg(text: string, cfg: PlayConfig): SourcePlay {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.startsWith('*** START')) + 1;
  const end = lines.findIndex((l) => l.startsWith('*** END'));
  if (start === 0 || end < 0) throw new Error(`${cfg.id}: Gutenberg START/END markers not found`);
  let seen = 0;
  let body = -1;
  for (let i = start; i < end; i++) {
    if (cfg.bodyStart.test(lines[i]) && ++seen === cfg.bodyStartOccurrence) {
      body = i;
      break;
    }
  }
  if (body < 0) throw new Error(`${cfg.id}: body start not found`);
  const pre = lines.slice(start, body).map((l) => l.trim());
  const frontFrom = pre.findIndex((l) => cfg.frontStart.test(l));
  if (frontFrom < 0) throw new Error(`${cfg.id}: cast list not found`);
  const frontTo = cfg.frontEnd ? pre.findIndex((l, i) => i > frontFrom && cfg.frontEnd!.test(l)) : -1;
  const front = pre.slice(frontFrom, frontTo < 0 ? pre.length : frontTo).filter(Boolean);

  const units: SourceUnit[] = [...cfg.title, ...front].map((t) => ({ kind: 'frontMatter' as const, text: t }));
  const speakers = new Map<string, number>();
  const speech = (speaker: string, said: string): void => {
    speakers.set(speaker, (speakers.get(speaker) ?? 0) + 1);
    units.push({ kind: 'dialogue', characterId: speaker, text: normalizeDirections(said) });
  };
  const paras = lines
    .slice(body, end)
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
  for (const para of paras) {
    const first = para[0];
    if (para.length === 1 && HEADING.test(first)) {
      units.push({ kind: 'heading', text: first });
      continue;
    }
    if (cfg.cueStyle === 'ownLine' && para.length > 1) {
      const m = OWN_CUE.exec(first);
      if (m) {
        speech(m[1], para.slice(1).join(cfg.verse ? '\n' : ' '));
        continue;
      }
    }
    if (cfg.cueStyle === 'inline') {
      const m = INLINE_CUE.exec(para.join(' '));
      if (m) {
        speech(m[1], m[2]);
        continue;
      }
    }
    units.push({ kind: 'direction', text: normalizeDirections(para.join(' ')).replace(/^\[(.*)\]\.?$/s, '$1').replace(/_/g, '') });
  }

  const castText = front.join(' ').toUpperCase();
  const missing = [...speakers.keys()].filter(
    (sp) => !cfg.castExceptions.includes(sp) && !sp.split(' ').some((w) => w.length > 2 && castText.includes(w)),
  );
  if (missing.length) throw new Error(`${cfg.id}: speakers not in the cast list: ${missing.join(', ')}`);
  const bad = unencodable(units.map((u) => u.text).join('\n'));
  if (bad.length) throw new Error(`${cfg.id}: characters the standard PDF fonts cannot encode: ${bad.join(' ')}`);

  const ids = new Map<string, string>();
  const cast: Character[] = [];
  for (const sp of speakers.keys()) {
    let id = slugId(sp);
    for (let n = 2; [...ids.values()].includes(id); n++) id = `${slugId(sp)}-${n}`;
    ids.set(sp, id);
    cast.push({ id, name: sp.replace(/’/g, "'"), aliases: [] });
  }
  return {
    id: cfg.id,
    title: cfg.title[0],
    source: cfg.source,
    cast,
    units: units.map((u) => (u.kind === 'dialogue' ? { ...u, characterId: ids.get(u.characterId!)! } : u)),
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run harness/test/corpus/convert-gutenberg.test.ts`
Expected: 5 tests pass.

- [ ] **Step 6: Add the `convert-plays` command**

In `harness/src/cli.ts`, add these imports:

```ts
import { PLAY_CONFIGS, convertGutenberg } from './corpus/convert-gutenberg';
```

Also add `PLAYS_DIR` to the existing `./paths` import. Then add this function:

```ts
function runConvertPlays(args: string[]): void {
  const { values } = parseArgs({ args, options: { from: { type: 'string' } } });
  if (!values.from) throw new Error('convert-plays needs --from <dir with pg<id>.txt files>');
  mkdirSync(PLAYS_DIR, { recursive: true });
  for (const cfg of PLAY_CONFIGS) {
    const play = convertGutenberg(readFileSync(join(fromCwd(values.from), `pg${cfg.gutenbergId}.txt`), 'utf8'), cfg);
    writeFileSync(join(PLAYS_DIR, `${cfg.id}.json`), `${JSON.stringify(play, null, 2)}\n`);
    const count = (k: string) => play.units.filter((u) => u.kind === k).length;
    console.log(`${cfg.id}: ${play.cast.length} speakers, ${count('dialogue')} speeches, ${count('direction')} directions, ${count('heading')} headings, ${count('frontMatter')} front-matter lines`);
  }
}
```

Add `case 'convert-plays': return runConvertPlays(args);` to `main`'s switch. Add this line to `USAGE`, after the `baseline` line:

```
  convert-plays --from <dir>                  One-off: convert downloaded Gutenberg texts (pg<id>.txt) into harness/corpus/plays
```

- [ ] **Step 7: Download the texts and generate the plays**

This is the plan's only network step. The texts go in the git-ignored `harness/out`.

```bash
mkdir -p harness/out/gutenberg
for id in 844 2542 1524 1513 1754; do curl -sSfL -o harness/out/gutenberg/pg$id.txt https://www.gutenberg.org/cache/epub/$id/pg$id.txt; done
npm run harness -- convert-plays --from harness/out/gutenberg
```

Expected output, one line per play. Each count should be within about 3% of the figure given here; a check of these exact files on 2026-10-11 gave these numbers:

| Play | Speeches | Directions | Headings |
|---|---|---|---|
| earnest | 877 | 59 | 6 |
| dolls-house | 1292 | 18 | 3 |
| hamlet | 1121 | 255 | 25 |
| romeo | 838 | 215 | 30 |
| seagull | 627 | 79 | 4 |

If a play throws "speakers not in the cast list" or "characters … cannot encode", Gutenberg has changed the text since then. Add the named speaker to that play's `castExceptions`, or map the character to its nearest WinAnsi equivalent inside `convertGutenberg`. Record the change in the task report.

Spot-check one play by hand: `node -e "const p=require('./harness/corpus/plays/hamlet.json');console.log(p.units.slice(30,40))"`.
Expected: dialogue units with `characterId`, verse joined with `\n`, and directions without brackets.

- [ ] **Step 8: Typecheck, lint and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean.

```bash
git add harness/package.json harness/src/paths.ts harness/src/cli.ts harness/src/corpus harness/test/corpus harness/corpus/plays .gitignore package-lock.json
git commit -m "feat(harness): five public-domain source plays converted from Project Gutenberg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Corpus model, styles, excerpts, paragraphs and text renderers

**Files:**
- Create: `harness/src/corpus/types.ts`, `harness/src/corpus/manifest.ts`, `harness/src/corpus/styles.ts`, `harness/src/corpus/excerpt.ts`, `harness/src/corpus/paras.ts`, `harness/src/corpus/write-text.ts`
- Create: `harness/test/corpus/corpus-model.test.ts`, `harness/test/helpers/mini-play.ts`

**Interfaces:**
- Consumes: `SourcePlay`, `SourceUnit` (Task 12); `Rng`, `mulberry32` (`harness/src/rng.ts`); `normalizeCueToken`, `estimatedPages`, `Character`, `UnitKind`, `extractText`, `cleanDoc` from `@dasma/script`.
- Produces:
  - **Types**
    - `type Family = 'licensed' | 'word' | 'classical'`
    - `type Variant = '1' | '2' | '3' | 'p'`
    - `type DocFormat = 'pdf' | 'docx' | 'text'`
    - `DocSpec { family; play; variant; seed }`
    - `TruthUnit { kind: UnitKind; characterId?: string; text: string; page: number }`
    - `TruthFile { docId; family; play; variant; seed; format; pages; cast: Character[]; units: TruthUnit[] }`
    - `Run { text; italic?; bold? }`
    - `Para { runs; kind: 'front'|'heading'|'direction'|'cue'|'speech'; truth: number[]; align: 'left'|'center'; indent: number; gapBefore: boolean; numbered: boolean }`
    - `DrawnLine { page; x; text; para: number }`, where `para` is -1 for a header, footer or line number
  - **Functions**
    - `docId(spec: DocSpec): string`
    - `FAMILIES`, `FAMILY_PLAYS`, `VARIANT_FORMAT`, `TUNE_SEEDS`, `HELDOUT_SEEDS`
    - `corpusDocs(set: 'tune' | 'heldout', families?: Family[]): DocSpec[]`
    - `StyleSpec`, `STYLES`
    - `EXCERPT_LINES`, `selectExcerpt(play, rng): SourceUnit[]`
    - `buildParas(play, units, style, rng): { paras: Para[]; truth: DraftTruth[]; cast: Character[] }`
    - `abbreviation(name, cast): string | null`
    - `titleCase(s): string`
    - `TextLayout { text: string; pages: number; paraPage: number[] }`
    - `textFromDrawn(drawn, margin, ligatures, paraCount): TextLayout`
    - `textFromParas(paras): TextLayout`
    - `classicalText(paras): TextLayout`

- [ ] **Step 1: Write the types, manifest and styles**

`harness/src/corpus/types.ts`:

```ts
import type { Character, UnitKind } from '@dasma/script';

export type Family = 'licensed' | 'word' | 'classical';
export type Variant = '1' | '2' | '3' | 'p';
export type DocFormat = 'pdf' | 'docx' | 'text';

export interface DocSpec {
  family: Family;
  play: string;
  variant: Variant;
  seed: number;
}

export interface TruthUnit {
  kind: UnitKind;
  characterId?: string;
  text: string;
  /** Page the unit starts on. */
  page: number;
}

export interface TruthFile {
  docId: string;
  family: Family | 'local';
  play: string;
  variant: Variant | 'local';
  seed: number;
  format: DocFormat;
  pages: number;
  /** The play's cast, with every abbreviation the renderer used as an alias. */
  cast: Character[];
  units: TruthUnit[];
}

export interface Run {
  text: string;
  italic?: boolean;
  bold?: boolean;
}

export interface Para {
  runs: Run[];
  kind: 'front' | 'heading' | 'direction' | 'cue' | 'speech';
  /** Truth units that have text in this paragraph, in order. */
  truth: number[];
  align: 'left' | 'center';
  /** Points. */
  indent: number;
  gapBefore: boolean;
  /** Counts toward line numbers (speech lines). */
  numbered: boolean;
}

/** One drawn line of a PDF page (for the pasted-text variants). */
export interface DrawnLine {
  page: number;
  x: number;
  text: string;
  /** Paragraph index; -1 for a header, footer or line number. */
  para: number;
}

export function docId(s: DocSpec): string {
  return `${s.family}-${s.play}-v${s.variant}-s${s.seed}`;
}
```

`harness/src/corpus/manifest.ts`:

```ts
import type { DocFormat, DocSpec, Family, Variant } from './types';

export const FAMILIES: readonly Family[] = ['licensed', 'word', 'classical'];
export const FAMILY_PLAYS: Record<Family, { tune: string[]; heldout: string[] }> = {
  licensed: { tune: ['earnest', 'dolls-house'], heldout: ['seagull'] },
  word: { tune: ['earnest', 'dolls-house'], heldout: ['seagull'] },
  classical: { tune: ['hamlet'], heldout: ['romeo'] },
};
export const VARIANT_FORMAT: Record<Family, Record<Variant, DocFormat>> = {
  licensed: { '1': 'pdf', '2': 'pdf', '3': 'pdf', p: 'text' },
  word: { '1': 'docx', '2': 'docx', '3': 'docx', p: 'text' },
  classical: { '1': 'pdf', '2': 'pdf', '3': 'text', p: 'text' },
};
export const TUNE_SEEDS = [1, 2, 3];
export const HELDOUT_SEEDS = [11, 12, 13];
const TUNE_VARIANTS: Variant[] = ['1', '2', 'p'];

/** Spec §6.3. Tuning: variants 1, 2, p of the tuning plays. Held out: variant 3 of every play, and every variant of the held-out plays. */
export function corpusDocs(set: 'tune' | 'heldout', families: readonly Family[] = FAMILIES): DocSpec[] {
  const out: DocSpec[] = [];
  for (const family of families) {
    const { tune, heldout } = FAMILY_PLAYS[family];
    if (set === 'tune') {
      for (const play of tune) for (const variant of TUNE_VARIANTS) for (const seed of TUNE_SEEDS) out.push({ family, play, variant, seed });
    } else {
      for (const play of [...tune, ...heldout]) for (const seed of HELDOUT_SEEDS) out.push({ family, play, variant: '3', seed });
      for (const play of heldout) for (const variant of TUNE_VARIANTS) for (const seed of HELDOUT_SEEDS) out.push({ family, play, variant, seed });
    }
  }
  return out;
}
```

`harness/src/corpus/styles.ts`:

```ts
import type { Family } from './types';

export type CueMode = 'ownCentered' | 'ownLeft' | 'ownIndented' | 'inlinePeriod' | 'inlineColon' | 'classicalAbbrev';

export interface StyleSpec {
  /** 'mixed' (word 3): mostly inlineColon in mixed case, some ownLeft. */
  cue: CueMode | 'mixed';
  cueBold: boolean;
  /** Abbreviate one-word names after their first full cue (classical 2) or always (classicalAbbrev). */
  abbreviate: boolean;
  direction: { italic: boolean; wrap: 'parens' | 'brackets' | 'none'; indent: number };
  inline: { italic: boolean; wrap: 'parens' | 'brackets' };
  speechIndent: number;
  header: boolean;
  footer: 'number' | 'dashed' | null;
  lineNumbers: 'right' | 'left' | null;
  hyphenate: boolean;
  shout: boolean;
  tabs: boolean;
}

const BASE: StyleSpec = {
  cue: 'ownCentered',
  cueBold: false,
  abbreviate: false,
  direction: { italic: false, wrap: 'parens', indent: 0 },
  inline: { italic: false, wrap: 'parens' },
  speechIndent: 0,
  header: false,
  footer: null,
  lineNumbers: null,
  hyphenate: false,
  shout: false,
  tabs: false,
};

/** Spec §6.2. Variant p reuses variant 1's style. */
export const STYLES: Record<Family, Record<'1' | '2' | '3', StyleSpec>> = {
  licensed: {
    '1': { ...BASE, cue: 'ownCentered', direction: { italic: true, wrap: 'parens', indent: 36 }, inline: { italic: true, wrap: 'parens' }, header: true, footer: 'number' },
    '2': { ...BASE, cue: 'ownIndented', direction: { italic: true, wrap: 'none', indent: 72 }, inline: { italic: true, wrap: 'parens' }, footer: 'dashed' },
    '3': { ...BASE, cue: 'inlinePeriod', direction: { italic: false, wrap: 'brackets', indent: 0 }, inline: { italic: false, wrap: 'brackets' }, footer: 'number', hyphenate: true },
  },
  word: {
    '1': { ...BASE, cue: 'inlineColon', cueBold: true },
    '2': { ...BASE, cue: 'ownCentered', cueBold: true, direction: { italic: true, wrap: 'none', indent: 36 }, inline: { italic: true, wrap: 'parens' } },
    '3': { ...BASE, cue: 'mixed', shout: true, tabs: true },
  },
  classical: {
    '1': { ...BASE, cue: 'inlinePeriod', direction: { italic: false, wrap: 'brackets', indent: 0 }, inline: { italic: false, wrap: 'brackets' } },
    '2': { ...BASE, cue: 'ownLeft', abbreviate: true, direction: { italic: true, wrap: 'none', indent: 36 }, inline: { italic: true, wrap: 'brackets' }, lineNumbers: 'right' },
    '3': { ...BASE, cue: 'classicalAbbrev', abbreviate: true, direction: { italic: false, wrap: 'brackets', indent: 48 }, inline: { italic: false, wrap: 'brackets' }, lineNumbers: 'left' },
  },
};
```

- [ ] **Step 2: Write the fixture play and the failing tests**

`harness/test/helpers/mini-play.ts`:

```ts
import type { SourcePlay } from '../../src/corpus/source-play';

export const MINI_PLAY: SourcePlay = {
  id: 'mini',
  title: 'MINI',
  source: 'test fixture',
  cast: [
    { id: 'hamlet', name: 'HAMLET', aliases: [] },
    { id: 'horatio', name: 'HORATIO', aliases: [] },
    { id: 'first-clown', name: 'FIRST CLOWN', aliases: [] },
  ],
  units: [
    { kind: 'frontMatter', text: 'MINI' },
    { kind: 'frontMatter', text: 'PERSONS' },
    { kind: 'heading', text: 'ACT I' },
    { kind: 'direction', text: 'Enter Hamlet and Horatio.' },
    { kind: 'dialogue', characterId: 'hamlet', text: 'To be, _or_ not to be,\n[Aside.] that is the question.' },
    { kind: 'dialogue', characterId: 'horatio', text: 'My lord, I came to see your father’s funeral.' },
    { kind: 'dialogue', characterId: 'first-clown', text: '[Digging.] A pit of clay for to be made.' },
    { kind: 'heading', text: 'SCENE II. A room.' },
    { kind: 'dialogue', characterId: 'hamlet', text: 'Words, words, words.' },
    { kind: 'dialogue', characterId: 'horatio', text: 'Indeed, my lord.' },
  ],
};
```

`harness/test/corpus/corpus-model.test.ts`:

```ts
import { cleanDoc, extractText } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { selectExcerpt } from '../../src/corpus/excerpt';
import { corpusDocs } from '../../src/corpus/manifest';
import { abbreviation, buildParas, titleCase } from '../../src/corpus/paras';
import { STYLES } from '../../src/corpus/styles';
import { classicalText, textFromParas } from '../../src/corpus/write-text';
import { mulberry32 } from '../../src/rng';
import { MINI_PLAY } from '../helpers/mini-play';

const runs = (p: { runs: Array<{ text: string }> }) => p.runs.map((r) => r.text).join('');

describe('corpusDocs', () => {
  it('has 45 tuning and 51 held-out documents, with no overlap', () => {
    const tune = corpusDocs('tune');
    const held = corpusDocs('heldout');
    expect([tune.length, held.length]).toEqual([45, 51]);
    const key = (d: { family: string; play: string; variant: string; seed: number }) => `${d.family}/${d.play}/${d.variant}/${d.seed}`;
    const tuneKeys = new Set(tune.map(key));
    expect(held.some((d) => tuneKeys.has(key(d)))).toBe(false);
    expect(tune.some((d) => d.variant === '3' || d.play === 'seagull' || d.play === 'romeo')).toBe(false);
  });
});

describe('selectExcerpt', () => {
  it('keeps the front matter, starts at a heading and is deterministic', () => {
    const a = selectExcerpt(MINI_PLAY, mulberry32(5));
    expect(a.slice(0, 2).map((u) => u.kind)).toEqual(['frontMatter', 'frontMatter']);
    expect(a[2].kind).toBe('heading');
    expect(selectExcerpt(MINI_PLAY, mulberry32(5))).toEqual(a);
  });
});

describe('buildParas', () => {
  it('lays out licensed 1: centred cues, inline directions split in the truth, emphasis italic', () => {
    const { paras, truth } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.licensed['1'], mulberry32(1));
    const cue = paras.find((p) => p.kind === 'cue')!;
    expect([runs(cue), cue.align]).toEqual(['HAMLET', 'center']);
    const speech = paras.filter((p) => p.kind === 'speech');
    expect(runs(speech[0])).toBe('To be, or not to be,');
    expect(speech[0].runs.find((r) => r.text === 'or')?.italic).toBe(true);
    expect(runs(speech[1])).toBe('(Aside.) that is the question.');
    expect(truth.filter((t) => t.kind !== 'frontMatter' && t.kind !== 'heading').slice(0, 5)).toEqual([
      { kind: 'direction', text: '(Enter Hamlet and Horatio.)' },
      { kind: 'characterName', text: 'HAMLET' },
      { kind: 'dialogue', characterId: 'hamlet', text: 'To be, or not to be,' },
      { kind: 'direction', text: '(Aside.)' },
      { kind: 'dialogue', characterId: 'hamlet', text: 'that is the question.' },
    ]);
  });

  it('lays out classical 3: abbreviated inline cues, recorded as aliases', () => {
    const { paras, cast } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.classical['3'], mulberry32(1));
    const firsts = paras.filter((p) => p.kind === 'speech').map((p) => runs(p).split(' ')[0]);
    expect(firsts).toContain('Ham.');
    expect(firsts).toContain('Hor.');
    expect(firsts).toContain('FIRST');
    expect(cast.find((c) => c.id === 'hamlet')!.aliases).toEqual(['HAM']);
    expect(cast.find((c) => c.id === 'first-clown')!.aliases).toEqual([]);
  });

  it('puts a direction that opens a speech between the cue and the dialogue', () => {
    const { truth } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.licensed['1'], mulberry32(1));
    const clown = truth.findIndex((t) => t.kind === 'characterName' && t.text === 'FIRST CLOWN');
    expect(truth.slice(clown, clown + 3)).toEqual([
      { kind: 'characterName', text: 'FIRST CLOWN' },
      { kind: 'direction', text: '(Digging.)' },
      { kind: 'dialogue', characterId: 'first-clown', text: 'A pit of clay for to be made.' },
    ]);
  });
});

describe('abbreviation and titleCase', () => {
  it('finds the shortest unique prefix of a one-word name', () => {
    expect(abbreviation('HAMLET', MINI_PLAY.cast)).toBe('HAM');
    expect(abbreviation('HORATIO', [...MINI_PLAY.cast, { id: 'x', name: 'HORTENSIO', aliases: [] }])).toBe('HORA');
    expect(abbreviation('FIRST CLOWN', MINI_PLAY.cast)).toBeNull();
    expect(titleCase("LADY O'BRIEN-SMITH")).toBe("Lady O'Brien-Smith");
  });
});

describe('text renderers', () => {
  it('numbers classical lines every 5, and clean-up removes the numbers without moving the text', () => {
    // Spelled-out numbers: clean-up drops repeated lines whose only difference is a changing number.
    const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    const many = { ...MINI_PLAY, units: [...MINI_PLAY.units.slice(0, 4), ...WORDS.map((w, i) => ({ kind: 'dialogue' as const, characterId: i % 2 ? 'horatio' : 'hamlet', text: `This is line ${w} of the scene.` }))] };
    const { paras } = buildParas(many, many.units, STYLES.classical['3'], mulberry32(1));
    const layout = classicalText(paras);
    expect(layout.text).toMatch(/^ {2}5 {3}/m);
    expect(layout.text).toMatch(/^ 10 {3}/m);
    const doc = cleanDoc(extractText(layout.text));
    const speech = doc.lines.filter((l) => /is line/.test(l.text));
    expect(speech).toHaveLength(12);
    expect(new Set(speech.map((l) => l.left)).size).toBe(1);
    expect(speech.every((l) => !/^\d/.test(l.text))).toBe(true);
  });

  it('writes word p as one line per paragraph and maps paragraphs to pages', () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.word['1'], mulberry32(1));
    const layout = textFromParas(paras);
    expect(layout.text).toContain('HAMLET: To be, or not to be,');
    expect(layout.pages).toBe(1);
    expect(layout.paraPage.every((p) => p === 1)).toBe(true);
  });
});
```

The first `buildParas` test fixes one contract: a verse line that starts with an inline direction (`[Aside.] that is …`) becomes its own paragraph. Its runs are the wrapped direction, a space, and the dialogue.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run harness/test/corpus/corpus-model.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 4: Implement the excerpt, paragraphs and text renderers**

`harness/src/corpus/excerpt.ts`:

```ts
import type { Rng } from '../rng';
import type { SourcePlay, SourceUnit } from './source-play';

/** About 15 pages of 46 page lines. */
export const EXCERPT_LINES = 15 * 46;
const EST_CHARS_PER_LINE = 65;

const estLines = (u: SourceUnit): number =>
  u.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / EST_CHARS_PER_LINE)), 0) + 1;

/** Front matter, then body units from a seeded heading until about 15 pages (spec §6.2). */
export function selectExcerpt(play: SourcePlay, rng: Rng): SourceUnit[] {
  const front = play.units.filter((u) => u.kind === 'frontMatter');
  const body = play.units.filter((u) => u.kind !== 'frontMatter');
  const remaining = new Array<number>(body.length + 1).fill(0);
  for (let i = body.length - 1; i >= 0; i--) remaining[i] = remaining[i + 1] + estLines(body[i]);
  let starts = body.flatMap((u, i) => (u.kind === 'heading' && remaining[i] >= EXCERPT_LINES ? [i] : []));
  if (!starts.length) starts = body.flatMap((u, i) => (u.kind === 'heading' ? [i] : [])).slice(0, 1);
  const start = starts.length ? starts[Math.floor(rng() * starts.length)] : 0;
  const out: SourceUnit[] = [];
  let used = 0;
  for (let i = start; i < body.length && used < EXCERPT_LINES; i++) {
    out.push(body[i]);
    used += estLines(body[i]);
  }
  return [...front, ...out];
}
```

`harness/src/corpus/paras.ts`:

```ts
import { normalizeCueToken, type Character } from '@dasma/script';
import type { Rng } from '../rng';
import type { SourcePlay, SourceUnit } from './source-play';
import type { CueMode, StyleSpec } from './styles';
import type { Para, Run, TruthUnit } from './types';

export type DraftTruth = Omit<TruthUnit, 'page'>;
export interface BuiltParas {
  paras: Para[];
  truth: DraftTruth[];
  cast: Character[];
}

/** word 3: chance a speech is shouted, has its cue on its own line, or starts with a tab. */
export const SHOUT_RATE = 0.06;
export const OWN_LINE_RATE = 0.2;
export const TAB_RATE = 0.3;
/** Indent of an indented own-line cue (licensed 2), points. */
export const CUE_INDENT = 108;

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Shortest prefix (3–6 letters) of a one-word name that starts no other cast name; null for multi-word names. */
export function abbreviation(name: string, cast: readonly Character[]): string | null {
  if (/\s/.test(name)) return null;
  for (let len = 3; len <= 6 && len < name.length; len++) {
    const p = name.slice(0, len);
    if (!cast.some((c) => c.name !== name && c.name.startsWith(p))) return p;
  }
  return null;
}

const wrapText = (t: string, wrap: 'parens' | 'brackets' | 'none'): string => (wrap === 'parens' ? `(${t})` : wrap === 'brackets' ? `[${t}]` : t);
const plain = (t: string): string => t.replace(/_/g, '').replace(/\s+/g, ' ').trim();
const hasWords = (t: string): boolean => /[\p{L}\p{N}]/u.test(t);

function emphasisRuns(text: string): Run[] {
  return text
    .split(/(_[^_]+_)/)
    .filter(Boolean)
    .map((part) => (/^_[^_]+_$/.test(part) ? { text: part.slice(1, -1), italic: true } : { text: part }));
}

export function buildParas(play: SourcePlay, units: readonly SourceUnit[], style: StyleSpec, rng: Rng): BuiltParas {
  const paras: Para[] = [];
  const truth: DraftTruth[] = [];
  const castById = new Map(play.cast.map((c) => [c.id, c]));
  const aliases = new Map(play.cast.map((c) => [c.id, new Set<string>()]));
  const seen = new Set<string>();
  const addTruth = (t: DraftTruth): number => truth.push(t) - 1;
  const para = (runs: Run[], kind: Para['kind'], truthIdx: number[], opts: Partial<Para> = {}): void => {
    paras.push({ runs, kind, truth: truthIdx, align: 'left', indent: 0, gapBefore: false, numbered: false, ...opts });
  };

  const cueText = (id: string, mode: CueMode): string => {
    const c = castById.get(id)!;
    const ab = style.abbreviate ? abbreviation(c.name, play.cast) : null;
    let form = c.name;
    if (mode === 'classicalAbbrev') form = ab ? titleCase(ab) : c.name;
    else if (ab && seen.has(id)) form = ab;
    else if (mode === 'inlineColon' && style.cue === 'mixed') form = titleCase(c.name);
    seen.add(id);
    if (normalizeCueToken(form) !== normalizeCueToken(c.name)) aliases.get(id)!.add(normalizeCueToken(form));
    return form;
  };

  const speech = (u: SourceUnit): void => {
    const id = u.characterId!;
    const mode: CueMode = style.cue === 'mixed' ? (rng() < OWN_LINE_RATE ? 'ownLeft' : 'inlineColon') : style.cue;
    const shout = style.shout && rng() < SHOUT_RATE;
    const tab = style.tabs && rng() < TAB_RATE;
    const cue = cueText(id, mode);
    const own = mode === 'ownCentered' || mode === 'ownLeft' || mode === 'ownIndented';
    if (own) {
      para([{ text: cue.toUpperCase(), bold: style.cueBold }], 'cue', [addTruth({ kind: 'characterName', text: cue.toUpperCase() })], {
        align: mode === 'ownCentered' ? 'center' : 'left',
        indent: mode === 'ownIndented' ? CUE_INDENT : 0,
        gapBefore: true,
      });
    }

    // Truth pieces, in order: dialogue text between inline directions, and the directions.
    const pieces: Array<{ kind: 'dialogue' | 'direction'; raw: string; truth: number }> = [];
    let last = 0;
    // Newlines at a piece's edges are kept so a verse line that starts with a direction starts a new paragraph.
    const textPiece = (raw: string): void => {
      let t = raw.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/^ +| +$/g, '').replace(/^[.,;:] */, '');
      if (shout) t = t.toUpperCase();
      const truthText = t
        .split('\n')
        .map((l) => plain(l))
        .filter(Boolean)
        .join('\n');
      if (!hasWords(truthText)) return;
      pieces.push({ kind: 'dialogue', raw: t, truth: addTruth({ kind: 'dialogue', characterId: id, text: truthText }) });
    };
    for (const m of u.text.matchAll(/\[([^\]]*)\]/g)) {
      textPiece(u.text.slice(last, m.index));
      const d = wrapText(m[1].trim(), style.inline.wrap);
      pieces.push({ kind: 'direction', raw: d, truth: addTruth({ kind: 'direction', text: d }) });
      last = m.index! + m[0].length;
    }
    textPiece(u.text.slice(last));

    // Rendered lines: verse lines start new paragraphs; directions stay inline.
    const lines: Array<{ runs: Run[]; truth: number[] }> = [{ runs: [], truth: [] }];
    const current = () => lines[lines.length - 1];
    const push = (run: Run, t: number, separate: boolean): void => {
      const c = current();
      const prev = c.runs[c.runs.length - 1];
      if (separate && prev && !/\s$/.test(prev.text) && !/^\s/.test(run.text)) c.runs.push({ text: ' ' });
      c.runs.push(run);
      if (!c.truth.includes(t)) c.truth.push(t);
    };
    if (!own) {
      const prefix = mode === 'inlineColon' ? `${cue}: ` : mode === 'classicalAbbrev' && !/\s/.test(cue) ? `${cue}. ` : `${cue.toUpperCase()}. `;
      current().runs.push({ text: prefix, bold: style.cueBold });
    }
    for (const p of pieces) {
      if (p.kind === 'direction') {
        push({ text: p.raw, italic: style.inline.italic }, p.truth, true);
        continue;
      }
      p.raw.split('\n').forEach((lineRaw, k) => {
        if (k > 0) lines.push({ runs: [], truth: [] });
        emphasisRuns(lineRaw).forEach((r, j) => push(r, p.truth, j === 0));
      });
    }
    lines.forEach((l, k) => {
      if (!l.runs.some((r) => r.text.trim())) return;
      const runs = tab && k === 0 ? [{ ...l.runs[0], text: `\t${l.runs[0].text}` }, ...l.runs.slice(1)] : l.runs;
      para(runs, 'speech', l.truth, { indent: style.speechIndent, gapBefore: !own && k === 0, numbered: true });
    });
  };

  let frontIndex = 0;
  for (const u of units) {
    if (u.kind === 'frontMatter') {
      const t = plain(u.text);
      para([{ text: t, bold: frontIndex === 0 }], 'front', [addTruth({ kind: 'frontMatter', text: t })], { align: frontIndex === 0 ? 'center' : 'left' });
      frontIndex++;
    } else if (u.kind === 'heading') {
      para([{ text: u.text, bold: true }], 'heading', [addTruth({ kind: 'heading', text: u.text })], { align: 'center', gapBefore: true });
    } else if (u.kind === 'direction') {
      const t = wrapText(plain(u.text), style.direction.wrap);
      para([{ text: t, italic: style.direction.italic }], 'direction', [addTruth({ kind: 'direction', text: t })], {
        indent: style.direction.indent,
        gapBefore: true,
      });
    } else speech(u);
  }
  const cast = play.cast.map((c) => ({ ...c, aliases: [...aliases.get(c.id)!].sort() }));
  return { paras, truth, cast };
}
```

`harness/src/corpus/write-text.ts`:

```ts
import { estimatedPages } from '@dasma/script';
import type { DrawnLine, Para } from './types';

export interface TextLayout {
  text: string;
  pages: number;
  /** Page each paragraph starts on (same estimate the text extractor makes). */
  paraPage: number[];
}

/** Width of the left line-number column in classical 3, in characters. */
export const NUMBER_WIDTH = 6;
const COLUMN = 6;
const CENTER_PAD = 20;
const runsText = (p: Para): string => p.runs.map((r) => r.text).join('');

function layout(lines: Array<{ text: string; para: number }>, paraCount: number): TextLayout {
  const body = lines.filter((l) => l.text.trim());
  const pages = estimatedPages(body.map((l) => l.text.replace(/\t/g, '    ').trim()));
  const paraPage = new Array<number>(paraCount).fill(0);
  body.forEach((l, i) => {
    if (l.para >= 0 && paraPage[l.para] === 0) paraPage[l.para] = pages[i];
  });
  return { text: `${lines.map((l) => l.text).join('\n')}\n`, pages: pages.length ? pages[pages.length - 1] : 0, paraPage };
}

/** A PDF's drawn lines as copy-pasted text (variant p): indentation as spaces, headers and footers kept. */
export function textFromDrawn(drawn: readonly DrawnLine[], margin: number, ligatures: boolean, paraCount: number): TextLayout {
  const lines = drawn.map((d) => {
    let t = d.text;
    if (ligatures && d.para >= 0) t = t.replace(/fi/g, 'ﬁ').replace(/fl/g, 'ﬂ');
    return { text: ' '.repeat(Math.max(0, Math.round((d.x - margin) / COLUMN))) + t, para: d.para };
  });
  return layout(lines, paraCount);
}

/** A Word file's paragraphs as pasted text (word p): one line per paragraph, no indentation, a blank line before gaps. */
export function textFromParas(paras: readonly Para[]): TextLayout {
  const lines: Array<{ text: string; para: number }> = [];
  paras.forEach((p, i) => {
    if (p.gapBefore) lines.push({ text: '', para: -1 });
    lines.push({ text: runsText(p), para: i });
  });
  return layout(lines, paras.length);
}

/** Classical 3: pasted text with a 6-character left line-number column, every 5 speech lines, restarting at headings. */
export function classicalText(paras: readonly Para[]): TextLayout {
  const lines: Array<{ text: string; para: number }> = [];
  let n = 0;
  paras.forEach((p, i) => {
    if (p.kind === 'heading') n = 0;
    if (p.gapBefore) lines.push({ text: '', para: -1 });
    let prefix = ' '.repeat(NUMBER_WIDTH);
    if (p.numbered) {
      n++;
      if (n % 5 === 0) prefix = `${String(n).padStart(3)}   `;
    }
    const indent = ' '.repeat(Math.round(p.indent / COLUMN));
    const body = p.align === 'center' ? ' '.repeat(CENTER_PAD) + runsText(p) : runsText(p);
    lines.push({ text: prefix + indent + body, para: i });
  });
  return layout(lines, paras.length);
}
```

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `npx vitest run harness/test/corpus/corpus-model.test.ts && npm run typecheck && npm run lint`
Expected: all pass. Typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add harness/src/corpus harness/test/corpus harness/test/helpers/mini-play.ts
git commit -m "feat(harness): corpus manifest, layout styles, excerpts, paragraphs and text renderers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 14: PDF renderer (`write-pdf.ts`)

**Files:**
- Create: `harness/src/corpus/write-pdf.ts`
- Create: `harness/test/corpus/write-pdf.test.ts`

**Interfaces:**
- Consumes: `Para`, `Run`, `DrawnLine` (Task 13); `StyleSpec`, `STYLES` (Task 13); `buildParas` (Task 13); `extractPdf`, `cleanDoc` from `@dasma/script`.
- Produces:
  - `type PdfFontFamily = 'Times' | 'Helvetica' | 'Courier'`
  - `PdfLook { font: PdfFontFamily; size: number; margin: number }`
  - `PdfLayout { bytes: Uint8Array; pages: number; paraPage: number[]; drawn: DrawnLine[] }`
  - `writePdf(paras, style, look, title): Promise<PdfLayout>`
  - the constants `PAGE_W = 612`, `PAGE_H = 792`, `LINE_NUMBER_GAP = 30`

- [ ] **Step 1: Write the failing tests**

`harness/test/corpus/write-pdf.test.ts`:

```ts
import { cleanDoc, extractPdf } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { buildParas } from '../../src/corpus/paras';
import { STYLES } from '../../src/corpus/styles';
import type { Para } from '../../src/corpus/types';
import { LINE_NUMBER_GAP, PAGE_W, writePdf } from '../../src/corpus/write-pdf';
import { mulberry32 } from '../../src/rng';
import { MINI_PLAY } from '../helpers/mini-play';

const LOOK = { font: 'Times' as const, size: 12, margin: 72 };
const speech = (text: string): Para => ({ runs: [{ text }], kind: 'speech', truth: [], align: 'left', indent: 0, gapBefore: false, numbered: true });

describe('writePdf', () => {
  it('draws the header, paragraphs and footer that pdf.js reads back', async () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.licensed['1'], mulberry32(1));
    const pdf = await writePdf(paras, STYLES.licensed['1'], LOOK, 'MINI PLAY');
    const doc = await extractPdf(pdf.bytes);
    expect(pdf.pages).toBe(1);
    expect(doc.lines[0].text).toBe('MINI PLAY');
    expect(doc.lines[doc.lines.length - 1].text).toBe('1');
    // The fixture's lines are short, so the column is narrow; centring is checked on a full document in Task 15.
    const cue = doc.lines.find((l) => l.text === 'HAMLET')!;
    expect(cue.left).toBeGreaterThan(250);
    expect(doc.lines.some((l) => l.text === '(Enter Hamlet and Horatio.)' && l.italic)).toBe(true);
    expect(pdf.paraPage.every((p) => p === 1)).toBe(true);
  });

  it('is deterministic', async () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.licensed['1'], mulberry32(1));
    const a = await writePdf(paras, STYLES.licensed['1'], LOOK, 'MINI');
    const b = await writePdf(paras, STYLES.licensed['1'], LOOK, 'MINI');
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  it('hyphenates long words at the wrap, and clean-up rejoins them', async () => {
    const pdf = await writePdf([speech(Array(40).fill('incomprehensibilities').join(' '))], STYLES.licensed['3'], { ...LOOK, margin: 90 }, 'T');
    expect(pdf.drawn.some((d) => d.text.endsWith('-'))).toBe(true);
    const clean = cleanDoc(await extractPdf(pdf.bytes));
    const joined = clean.lines.map((l) => l.text).join(' ');
    expect(joined.match(/incomprehensibilities/g)).toHaveLength(40);
  });

  it('numbers every fifth line in the right margin, and clean-up removes the numbers', async () => {
    const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    const pdf = await writePdf(WORDS.map((w) => speech(`This is verse line ${w} of the scene.`)), STYLES.classical['2'], LOOK, 'T');
    const numbers = pdf.drawn.filter((d) => d.para === -1).map((d) => [d.text, d.x]);
    expect(numbers).toEqual([
      ['5', PAGE_W - LOOK.margin + LINE_NUMBER_GAP],
      ['10', PAGE_W - LOOK.margin + LINE_NUMBER_GAP],
    ]);
    const clean = cleanDoc(await extractPdf(pdf.bytes));
    expect(clean.lines.every((l) => l.text.endsWith('scene.'))).toBe(true);
  });

  it('flows onto new pages and records each paragraph’s page', async () => {
    const pdf = await writePdf(Array.from({ length: 120 }, (_, i) => speech(`Paragraph ${i}.`)), STYLES.word['1'], LOOK, 'T');
    expect(pdf.pages).toBeGreaterThan(1);
    expect(pdf.paraPage[0]).toBe(1);
    expect(pdf.paraPage[119]).toBe(pdf.pages);
    expect(pdf.paraPage.every((p, i) => i === 0 || p >= pdf.paraPage[i - 1])).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run harness/test/corpus/write-pdf.test.ts`
Expected: FAIL, because `../../src/corpus/write-pdf` doesn't exist yet.

- [ ] **Step 3: Implement**

`harness/src/corpus/write-pdf.ts`:

```ts
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { StyleSpec } from './styles';
import type { DrawnLine, Para, Run } from './types';

export type PdfFontFamily = 'Times' | 'Helvetica' | 'Courier';
export interface PdfLook {
  font: PdfFontFamily;
  size: number;
  /** Points, all four sides. */
  margin: number;
}
export interface PdfLayout {
  bytes: Uint8Array;
  pages: number;
  paraPage: number[];
  drawn: DrawnLine[];
}

export const PAGE_W = 612;
export const PAGE_H = 792;
/** Right-margin line numbers sit this far right of the text column. */
export const LINE_NUMBER_GAP = 30;
const LINE_HEIGHT = 1.3;
const PARA_GAP = 0.5;
const HYPHEN_MIN_LETTERS = 8;

const FONT_SETS: Record<PdfFontFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanBoldItalic],
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBold, StandardFonts.HelveticaBoldOblique],
  Courier: [StandardFonts.Courier, StandardFonts.CourierOblique, StandardFonts.CourierBold, StandardFonts.CourierBoldOblique],
};

interface Word {
  text: string;
  font: PDFFont;
}

function segments(line: Word[]): Word[] {
  const out: Word[] = [];
  line.forEach((word, k) => {
    const text = k < line.length - 1 ? `${word.text} ` : word.text;
    const last = out[out.length - 1];
    if (last && last.font === word.font) last.text += text;
    else out.push({ text, font: word.font });
  });
  return out;
}

export async function writePdf(paras: readonly Para[], style: StyleSpec, look: PdfLook, title: string): Promise<PdfLayout> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const [regular, italic, bold, boldItalic] = await Promise.all(FONT_SETS[look.font].map((f) => doc.embedFont(f)));
  const fontOf = (r: Run): PDFFont => (r.bold ? (r.italic ? boldItalic : bold) : r.italic ? italic : regular);
  const width = PAGE_W - 2 * look.margin;
  const lh = look.size * LINE_HEIGHT;
  const widthOf = (w: Word): number => w.font.widthOfTextAtSize(w.text, look.size);
  const space = (f: PDFFont): number => f.widthOfTextAtSize(' ', look.size);

  const drawn: DrawnLine[] = [];
  const paraPage = new Array<number>(paras.length).fill(0);
  let page!: PDFPage;
  let pageNo = 0;
  let y = 0;
  let lineInScene = 0;
  const put = (text: string, x: number, yy: number, font: PDFFont, para: number): void => {
    page.drawText(text, { x, y: yy, size: look.size, font });
    drawn.push({ page: pageNo, x, text, para });
  };
  const footer = (): void => {
    if (!style.footer) return;
    const t = style.footer === 'dashed' ? `- ${pageNo} -` : String(pageNo);
    put(t, (PAGE_W - regular.widthOfTextAtSize(t, look.size)) / 2, look.margin / 2, regular, -1);
  };
  const newPage = (): void => {
    if (pageNo > 0) footer();
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    y = PAGE_H - look.margin;
    if (style.header) put(title, look.margin, PAGE_H - look.margin / 2, italic, -1);
  };

  const hyphenate = (word: Word, room: number): [Word, Word] | null => {
    const m = /^([a-z]+)[,.;:!?]?$/.exec(word.text);
    if (!m || m[1].length < HYPHEN_MIN_LETTERS) return null;
    for (let k = m[1].length - 3; k >= 3; k--) {
      const head = { text: `${word.text.slice(0, k)}-`, font: word.font };
      if (widthOf(head) <= room) return [head, { text: word.text.slice(k), font: word.font }];
    }
    return null;
  };
  const wrap = (p: Para): Word[][] => {
    const avail = width - p.indent;
    const words = p.runs.flatMap((r) => r.text.replace(/\t/g, ' ').split(/\s+/).filter(Boolean).map((text) => ({ text, font: fontOf(r) })));
    const lines: Word[][] = [];
    let cur: Word[] = [];
    let curW = 0;
    for (const word of words) {
      const add = (cur.length ? space(word.font) : 0) + widthOf(word);
      if (!cur.length || curW + add <= avail) {
        cur.push(word);
        curW += add;
        continue;
      }
      const split = style.hyphenate ? hyphenate(word, avail - curW - space(word.font)) : null;
      if (split) {
        cur.push(split[0]);
        lines.push(cur);
        cur = [split[1]];
        curW = widthOf(split[1]);
        continue;
      }
      lines.push(cur);
      cur = [word];
      curW = widthOf(word);
    }
    if (cur.length) lines.push(cur);
    return lines;
  };

  newPage();
  paras.forEach((p, i) => {
    if (p.kind === 'heading') lineInScene = 0;
    if (p.gapBefore && y < PAGE_H - look.margin) y -= lh * PARA_GAP;
    for (const line of wrap(p)) {
      if (y - lh < look.margin) newPage();
      y -= lh;
      if (!paraPage[i]) paraPage[i] = pageNo;
      const segs = segments(line);
      const lineW = segs.reduce((n, s) => n + widthOf(s), 0);
      const x0 = p.align === 'center' ? look.margin + (width - lineW) / 2 : look.margin + p.indent;
      let x = x0;
      for (const s of segs) {
        page.drawText(s.text, { x, y, size: look.size, font: s.font });
        x += widthOf(s);
      }
      drawn.push({ page: pageNo, x: x0, text: segs.map((s) => s.text).join('').trimEnd(), para: i });
      if (style.lineNumbers === 'right' && p.numbered && ++lineInScene % 5 === 0) {
        put(String(lineInScene), PAGE_W - look.margin + LINE_NUMBER_GAP, y, regular, -1);
      }
    }
  });
  footer();
  return { bytes: await doc.save(), pages: pageNo, paraPage, drawn };
}
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `npx vitest run harness/test/corpus/write-pdf.test.ts && npm run typecheck && npm run lint`
Expected: 5 tests pass. If the determinism test fails, pdf-lib is writing a timestamp or ID. Pin it after `create` with `doc.setCreationDate(new Date(0)); doc.setModificationDate(new Date(0));` and re-run. Typecheck and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add harness/src/corpus/write-pdf.ts harness/test/corpus/write-pdf.test.ts
git commit -m "feat(harness): PDF renderer with headers, footers, hyphenation and line numbers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Word renderer, `renderDocument` and `build-corpus`

**Files:**
- Create: `harness/src/corpus/write-docx.ts`, `harness/src/corpus/render.ts`
- Modify: `harness/src/corpus/manifest.ts` (adds `parseFamilies`), `harness/src/cli.ts`
- Create: `harness/test/corpus/render.test.ts`

**Interfaces:**
- Consumes: Tasks 12–14; `mulberry32`, `hashSeed` and `pick` from `harness/src/rng.ts`; `extractDocx` and `estimatedPages` from `@dasma/script`.
- Produces:
  - `type DocxFont = 'Times New Roman' | 'Arial' | 'Courier New'`
  - `DocxLook { font: DocxFont; size: number; margin: number }`
  - `writeDocx(paras, look): Promise<Uint8Array>`
  - `docxParaPages(paras): { pages: number; paraPage: number[] }`
  - `RenderedDoc { spec: DocSpec; format: DocFormat; bytes?: Uint8Array; text?: string; truth: TruthFile }`
  - `renderDocument(spec: DocSpec, play?: SourcePlay): Promise<RenderedDoc>`
  - `parseFamilies(raw: string): Family[]`
  - the CLI command `build-corpus [--set tune|heldout|all] [--families a,b]`

- [ ] **Step 1: Write the failing tests**

Determinism means the same truth and the same bytes for PDF and text. A docx zip carries timestamps, so for Word files the test compares `word/document.xml`, which holds all the content. This is the plan's reading of spec §10's "same bytes".

`harness/test/corpus/render.test.ts`:

```ts
import { extractDocx, extractPdf } from '@dasma/script';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseFamilies } from '../../src/corpus/manifest';
import { buildParas } from '../../src/corpus/paras';
import { renderDocument } from '../../src/corpus/render';
import { STYLES } from '../../src/corpus/styles';
import type { DocSpec } from '../../src/corpus/types';
import { docxParaPages, writeDocx } from '../../src/corpus/write-docx';
import { mulberry32 } from '../../src/rng';
import { MINI_PLAY } from '../helpers/mini-play';

describe('writeDocx', () => {
  it('writes paragraphs that extractDocx reads back, with matching estimated pages', async () => {
    const { paras } = buildParas(MINI_PLAY, MINI_PLAY.units, STYLES.word['2'], mulberry32(1));
    const doc = extractDocx(await writeDocx(paras, { font: 'Arial', size: 11, margin: 72 }));
    expect(doc.lines.map((l) => l.text)).toEqual(paras.map((p) => p.runs.map((r) => r.text).join('').trim()));
    expect(doc.lines.find((l) => l.text === 'HAMLET')).toMatchObject({ centered: true, bold: true });
    expect(doc.lines.find((l) => l.text === 'Enter Hamlet and Horatio.')).toMatchObject({ italic: true, left: 36 });
    const { paraPage } = docxParaPages(paras);
    expect(doc.lines.map((l) => l.page)).toEqual(paraPage);
  });
});

const SAMPLES: DocSpec[] = [
  { family: 'licensed', play: 'earnest', variant: '1', seed: 1 },
  { family: 'licensed', play: 'earnest', variant: 'p', seed: 1 },
  { family: 'word', play: 'dolls-house', variant: '3', seed: 11 },
  { family: 'classical', play: 'hamlet', variant: '3', seed: 11 },
];

describe('renderDocument', () => {
  it.each(SAMPLES)('renders $family $play v$variant s$seed with consistent truth', async (spec) => {
    const doc = await renderDocument(spec);
    const { truth } = doc;
    expect(truth.docId).toBe(`${spec.family}-${spec.play}-v${spec.variant}-s${spec.seed}`);
    expect(truth.pages).toBeGreaterThanOrEqual(8);
    expect(truth.units.length).toBeGreaterThan(100);
    expect(truth.units.every((u) => u.page >= 1 && u.page <= truth.pages)).toBe(true);
    const ids = new Set(truth.cast.map((c) => c.id));
    expect(truth.units.filter((u) => u.kind === 'dialogue').every((u) => ids.has(u.characterId!))).toBe(true);
    expect(truth.units.some((u) => /_|\[/.test(u.kind === 'dialogue' ? u.text : ''))).toBe(false);

    const again = await renderDocument(spec);
    expect(again.truth).toEqual(truth);
    if (doc.format === 'docx') {
      expect(strFromU8(unzipSync(again.bytes!)['word/document.xml'])).toBe(strFromU8(unzipSync(doc.bytes!)['word/document.xml']));
    } else if (doc.format === 'pdf') {
      expect(Buffer.from(again.bytes!).equals(Buffer.from(doc.bytes!))).toBe(true);
    } else expect(again.text).toBe(doc.text);
  });

  it('draws licensed 1 cues that pdf.js reads as centred', async () => {
    const doc = await renderDocument({ family: 'licensed', play: 'earnest', variant: '1', seed: 1 });
    const names = new Set(doc.truth.cast.map((c) => c.name));
    const cues = (await extractPdf(doc.bytes!)).lines.filter((l) => names.has(l.text));
    expect(cues.length).toBeGreaterThan(20);
    expect(cues.filter((l) => l.centered).length / cues.length).toBeGreaterThan(0.9);
  });

  it('writes ligatures into the licensed pasted text', async () => {
    const doc = await renderDocument({ family: 'licensed', play: 'earnest', variant: 'p', seed: 1 });
    expect(doc.format).toBe('text');
    expect(doc.text).toMatch(/[ﬁﬂ]/);
  });
});

describe('parseFamilies', () => {
  it('accepts known families and rejects others', () => {
    expect(parseFamilies('word,classical')).toEqual(['word', 'classical']);
    expect(() => parseFamilies('word,poetry')).toThrow(/poetry/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run harness/test/corpus/render.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement the Word renderer, `renderDocument` and `parseFamilies`**

`harness/src/corpus/write-docx.ts`:

```ts
import { estimatedPages } from '@dasma/script';
import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';
import type { Para } from './types';

export type DocxFont = 'Times New Roman' | 'Arial' | 'Courier New';
export interface DocxLook {
  font: DocxFont;
  size: number;
  margin: number;
}
const TWIPS = 20;

export async function writeDocx(paras: readonly Para[], look: DocxLook): Promise<Uint8Array> {
  const doc = new Document({
    styles: { default: { document: { run: { font: look.font, size: look.size * 2 } } } },
    sections: [
      {
        properties: { page: { margin: { top: look.margin * TWIPS, bottom: look.margin * TWIPS, left: look.margin * TWIPS, right: look.margin * TWIPS } } },
        children: paras.map(
          (p) =>
            new Paragraph({
              alignment: p.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
              ...(p.indent ? { indent: { left: p.indent * TWIPS } } : {}),
              ...(p.gapBefore ? { spacing: { before: 120 } } : {}),
              children: p.runs.map((r) => new TextRun({ text: r.text, italics: r.italic ?? false, bold: r.bold ?? false })),
            }),
        ),
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

/** Pages per paragraph exactly as extractDocx estimates them for a file without page breaks. */
export function docxParaPages(paras: readonly Para[]): { pages: number; paraPage: number[] } {
  const texts = paras.map((p) => p.runs.map((r) => r.text).join('').replace(/^[\t ]+/, '').replace(/[\t ]+$/, ''));
  const paraPage = estimatedPages(texts);
  return { pages: paraPage.length ? paraPage[paraPage.length - 1] : 0, paraPage };
}
```

Append to `harness/src/corpus/manifest.ts`:

```ts
export function parseFamilies(raw: string): Family[] {
  const out = raw.split(',').map((f) => f.trim()).filter(Boolean);
  for (const f of out) if (!(FAMILIES as readonly string[]).includes(f)) throw new Error(`Unknown family "${f}". Known: ${FAMILIES.join(', ')}`);
  return out as Family[];
}
```

`harness/src/corpus/render.ts`:

```ts
import { hashSeed, mulberry32, pick } from '../rng';
import { selectExcerpt } from './excerpt';
import { VARIANT_FORMAT } from './manifest';
import { buildParas } from './paras';
import { loadPlay, type SourcePlay } from './source-play';
import { STYLES } from './styles';
import { docId, type DocFormat, type DocSpec, type TruthFile } from './types';
import { docxParaPages, writeDocx, type DocxFont } from './write-docx';
import { writePdf, type PdfFontFamily } from './write-pdf';
import { classicalText, textFromDrawn, textFromParas } from './write-text';

export interface RenderedDoc {
  spec: DocSpec;
  format: DocFormat;
  bytes?: Uint8Array;
  text?: string;
  truth: TruthFile;
}

const PDF_FONTS: PdfFontFamily[] = ['Times', 'Helvetica', 'Courier'];
const DOCX_FONTS: DocxFont[] = ['Times New Roman', 'Arial', 'Courier New'];
const SIZES = [10, 11, 12];
const MARGINS = [54, 72, 90];

/** Spec §6.2: one deterministic document and its truth, from (family, play, variant, seed). */
export async function renderDocument(spec: DocSpec, play: SourcePlay = loadPlay(spec.play)): Promise<RenderedDoc> {
  const rng = mulberry32(hashSeed(docId(spec)));
  const style = STYLES[spec.family][spec.variant === 'p' ? '1' : spec.variant];
  const { paras, truth: draft, cast } = buildParas(play, selectExcerpt(play, rng), style, rng);
  const format = VARIANT_FORMAT[spec.family][spec.variant];
  const size = pick(SIZES, rng);
  const margin = pick(MARGINS, rng);

  let bytes: Uint8Array | undefined;
  let text: string | undefined;
  let pages: number;
  let paraPage: number[];
  if (spec.family === 'word' && spec.variant !== 'p') {
    bytes = await writeDocx(paras, { font: pick(DOCX_FONTS, rng), size, margin });
    ({ pages, paraPage } = docxParaPages(paras));
  } else if (spec.family === 'word') {
    ({ text, pages, paraPage } = textFromParas(paras));
  } else if (spec.family === 'classical' && spec.variant === '3') {
    ({ text, pages, paraPage } = classicalText(paras));
  } else {
    const pdf = await writePdf(paras, style, { font: pick(PDF_FONTS, rng), size, margin }, play.title);
    if (format === 'pdf') ({ bytes, pages, paraPage } = pdf);
    else ({ text, pages, paraPage } = textFromDrawn(pdf.drawn, margin, spec.family === 'licensed', paras.length));
  }

  const unitPage = new Array<number>(draft.length).fill(0);
  paras.forEach((p, i) => {
    for (const t of p.truth) if (!unitPage[t]) unitPage[t] = paraPage[i] || 1;
  });
  const truth: TruthFile = {
    docId: docId(spec),
    family: spec.family,
    play: spec.play,
    variant: spec.variant,
    seed: spec.seed,
    format,
    pages: Math.max(1, pages),
    cast,
    units: draft.map((t, k) => ({ ...t, page: Math.min(Math.max(1, unitPage[k] || 1), Math.max(1, pages)) })),
  };
  return { spec, format, ...(bytes ? { bytes } : {}), ...(text !== undefined ? { text } : {}), truth };
}
```

- [ ] **Step 4: Add the `build-corpus` command**

In `harness/src/cli.ts`, import `renderDocument` from `./corpus/render`, and `FAMILIES`, `corpusDocs` and `parseFamilies` from `./corpus/manifest`. Add `CORPUS_OUT_DIR` to the `./paths` import. Then add this function:

```ts
async function runBuildCorpus(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { set: { type: 'string', default: 'all' }, families: { type: 'string', default: FAMILIES.join(',') } },
  });
  if (!['tune', 'heldout', 'all'].includes(values.set)) throw new Error(`--set must be tune, heldout or all, got "${values.set}"`);
  const families = parseFamilies(values.families);
  const sets = values.set === 'all' ? (['tune', 'heldout'] as const) : ([values.set] as Array<'tune' | 'heldout'>);
  let n = 0;
  for (const set of sets) {
    for (const spec of corpusDocs(set, families)) {
      const doc = await renderDocument(spec);
      const dir = join(CORPUS_OUT_DIR, spec.family);
      mkdirSync(dir, { recursive: true });
      const ext = doc.format === 'text' ? 'txt' : doc.format;
      writeFileSync(join(dir, `${doc.truth.docId}.${ext}`), doc.bytes ?? doc.text ?? '');
      writeFileSync(join(dir, `${doc.truth.docId}.truth.json`), `${JSON.stringify(doc.truth, null, 2)}\n`);
      n++;
    }
  }
  console.log(`Wrote ${n} documents and their truth files to ${CORPUS_OUT_DIR}`);
}
```

Add `case 'build-corpus': return runBuildCorpus(args);` to the switch. Add this line to `USAGE`:

```
  build-corpus [--set tune|heldout|all] [--families licensed,word,classical]
                                              Render the synthetic script corpus and its truth into harness/out/corpus
```

- [ ] **Step 5: Run tests, try the command, typecheck and lint**

Run: `npx vitest run harness/test/corpus/render.test.ts && npm run harness -- build-corpus --set tune && npm run typecheck && npm run lint`
Expected: the tests pass. The command prints "Wrote 45 documents …". Typecheck and lint are clean.

Open one PDF from `harness/out/corpus/licensed/` and check by eye that it looks like an acting edition.

- [ ] **Step 6: Commit**

```bash
git add harness/src/corpus harness/src/cli.ts harness/test/corpus/render.test.ts
git commit -m "feat(harness): Word renderer, deterministic document rendering and build-corpus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: Scoring and the report (`score.ts`, `report.ts`)

**Files:**
- Create: `harness/src/script-eval/score.ts`, `harness/src/script-eval/report.ts`
- Create: `harness/test/script-eval/score.test.ts`, `harness/test/script-eval/report.test.ts`

**Interfaces:**
- Consumes: `TruthFile`, `TruthUnit` (Task 13); `Script`, `Unit`, `Character`, `FLAG_BELOW`, `normalizeCueToken`, `toAlignLines` from `@dasma/script`; `tokenize` and `normalizeToken` from `@dasma/align`; `diffArrays` from `diff`.
- Produces:
  - `type FixKind = 'missedSpeech' | 'inventedSpeech' | 'wrongSpeaker' | 'missedHeading' | 'inventedHeading' | 'split' | 'merge'`
  - `Fix { kind; page; flagged; truthUnit?; predictedUnit? }`
  - `DocScore { docId; family; pages; fixes: Fix[]; fixesByPage: number[]; spokenUnits; speakerRight; falseFlags; spokenWords; textErrors }`
  - `scoreDocument(truth: TruthFile, script: Script): DocScore`
  - `alignWords(a, b): Array<[number, number]>`
  - `wordErrors(a, b): number`
  - `resolveCast(predicted: Character[], truth: Character[]): Map<string, string>`
  - `words(text): string[]`
  - `SCRIPT_GATE`
  - `FamilyMetrics { family; docs; pages; errors; fixesPerPage; worstPageFixes; speakerAccuracy; flaggedShare; falseFlagsPerPage; textAccuracy }`
  - `familyMetrics(scores): FamilyMetrics[]`
  - `gateFailures(m): string[]`
  - `formatScriptReport(title, metrics, scores, verbose): string`

- [ ] **Step 1: Write the failing scoring tests**

`harness/test/script-eval/score.test.ts`:

```ts
import type { Script, Unit } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import type { TruthFile, TruthUnit } from '../../src/corpus/types';
import { alignWords, resolveCast, scoreDocument, wordErrors } from '../../src/script-eval/score';

const CAST = [
  { id: 'hamlet', name: 'HAMLET', aliases: ['HAM'] },
  { id: 'horatio', name: 'HORATIO', aliases: [] },
];
const truthOf = (units: TruthUnit[], pages = 2): TruthFile => ({ docId: 'd', family: 'licensed', play: 'p', variant: '1', seed: 1, format: 'pdf', pages, cast: CAST, units });
const T: TruthUnit[] = [
  { kind: 'heading', text: 'ACT I', page: 1 },
  { kind: 'characterName', text: 'HAMLET', page: 1 },
  { kind: 'dialogue', characterId: 'hamlet', text: 'To be or not to be', page: 1 },
  { kind: 'direction', text: '(He sits.)', page: 1 },
  { kind: 'characterName', text: 'HORATIO', page: 2 },
  { kind: 'dialogue', characterId: 'horatio', text: 'My lord I come', page: 2 },
];
let n = 0;
const pu = (kind: Unit['kind'], text: string, page = 1, opts: Partial<Unit> = {}): Unit => ({
  id: `u${++n}`,
  kind,
  text,
  cut: false,
  tagConfidence: 0.95,
  source: [{ page, line: 0 }],
  ...opts,
});
const PRED_CAST = [
  { id: 'hamlet', name: 'HAMLET', aliases: [] },
  { id: 'horatio', name: 'HORATIO', aliases: [] },
];
const scriptOf = (units: Unit[], characters = PRED_CAST): Script => ({ title: 't', characters, units });
const perfect = (): Unit[] => [
  pu('heading', 'ACT I'),
  pu('characterName', 'HAMLET'),
  pu('dialogue', 'To be or not to be', 1, { characterId: 'hamlet' }),
  pu('direction', '(He sits.)'),
  pu('characterName', 'HORATIO', 2),
  pu('dialogue', 'My lord I come', 2, { characterId: 'horatio' }),
];
const kinds = (s: { fixes: Array<{ kind: string }> }) => s.fixes.map((f) => f.kind).sort();

describe('scoreDocument', () => {
  it('scores a perfect import as no fixes', () => {
    const s = scoreDocument(truthOf(T), scriptOf(perfect()));
    expect(s).toMatchObject({ fixes: [], fixesByPage: [0, 0], spokenUnits: 2, speakerRight: 2, falseFlags: 0, spokenWords: 10, textErrors: 0 });
  });

  it('counts a wrong speaker on its page, flagged or not', () => {
    const units = perfect();
    units[5] = { ...units[5], characterId: 'hamlet' };
    const s = scoreDocument(truthOf(T), scriptOf(units));
    expect(s.fixes).toEqual([{ kind: 'wrongSpeaker', page: 2, flagged: false, truthUnit: 5, predictedUnit: 5 }]);
    expect([s.speakerRight, s.fixesByPage]).toEqual([1, [0, 1]]);
    units[5] = { ...units[5], tagConfidence: 0.5 };
    const flagged = scoreDocument(truthOf(T), scriptOf(units));
    expect(flagged.fixes[0].flagged).toBe(true);
    expect(flagged.falseFlags).toBe(0);
  });

  it('counts a flagged unit that needs no fix as a false flag', () => {
    const units = perfect();
    units[3] = { ...units[3], tagConfidence: 0.5 };
    expect(scoreDocument(truthOf(T), scriptOf(units))).toMatchObject({ fixes: [], falseFlags: 1 });
  });

  it('needs a split when an inline direction was read as speech', () => {
    const truth = truthOf([
      { kind: 'characterName', text: 'HAMLET', page: 1 },
      { kind: 'dialogue', characterId: 'hamlet', text: 'To be or not to be', page: 1 },
      { kind: 'direction', text: '(aside)', page: 1 },
      { kind: 'dialogue', characterId: 'hamlet', text: 'that is the question', page: 1 },
    ]);
    const s = scoreDocument(truth, scriptOf([pu('characterName', 'HAMLET'), pu('dialogue', 'To be or not to be (aside) that is the question', 1, { characterId: 'hamlet' })]));
    expect(kinds(s)).toEqual(['split']);
    expect(s.textErrors).toBe(1);
  });

  it('needs a merge when one speech was cut in two', () => {
    const truth = truthOf([
      { kind: 'characterName', text: 'HAMLET', page: 1 },
      { kind: 'dialogue', characterId: 'hamlet', text: 'To be or not to be that is the question', page: 1 },
    ]);
    const s = scoreDocument(
      truth,
      scriptOf([pu('characterName', 'HAMLET'), pu('dialogue', 'To be or not to be', 1, { characterId: 'hamlet' }), pu('dialogue', 'that is the question', 1, { characterId: 'hamlet' })]),
    );
    expect(s.fixes.map((f) => [f.kind, f.predictedUnit])).toEqual([['merge', 2]]);
  });

  it('counts a missed speech, owned by the unit that holds its words', () => {
    const units = perfect();
    units[5] = { ...units[5], kind: 'direction', characterId: undefined };
    const s = scoreDocument(truthOf(T), scriptOf(units));
    expect(s.fixes).toEqual([{ kind: 'missedSpeech', page: 2, flagged: false, truthUnit: 5, predictedUnit: 5 }]);
    expect([s.speakerRight, s.textErrors]).toEqual([1, 4]);
  });

  it('counts an invented heading and the speech it swallowed', () => {
    const truth = truthOf([
      { kind: 'characterName', text: 'HORATIO', page: 1 },
      { kind: 'dialogue', characterId: 'horatio', text: 'Scene of the crime I say', page: 1 },
    ]);
    const s = scoreDocument(truth, scriptOf([pu('characterName', 'HORATIO'), pu('heading', 'Scene of the crime I say')]));
    expect(kinds(s)).toEqual(['inventedHeading', 'missedSpeech']);
  });

  it('counts a missed heading read as speech, and the invented speech', () => {
    const units = perfect();
    units[0] = { ...units[0], kind: 'dialogue' };
    const s = scoreDocument(truthOf(T), scriptOf(units));
    expect(kinds(s)).toEqual(['inventedSpeech', 'missedHeading']);
    expect(s.textErrors).toBe(2);
  });

  it('resolves predicted characters through truth aliases', () => {
    const units = perfect();
    units[2] = { ...units[2], characterId: 'ham' };
    const s = scoreDocument(truthOf(T), scriptOf(units, [{ id: 'ham', name: 'HAM', aliases: [] }, PRED_CAST[1]]));
    expect(s.fixes).toEqual([]);
  });
});

describe('helpers', () => {
  it('resolveCast maps by name or alias', () => {
    expect([...resolveCast([{ id: 'x', name: 'Ham.', aliases: [] }, { id: 'y', name: 'NOBODY', aliases: [] }], CAST)]).toEqual([['x', 'hamlet']]);
  });

  it('wordErrors counts each run of differences as its larger side', () => {
    expect(wordErrors(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
    expect(wordErrors(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    expect(wordErrors(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(wordErrors(['a', 'b', 'c'], ['a', 'b', 'c', 'd', 'e'])).toBe(2);
  });

  it('alignWords pairs the common words in order', () => {
    expect(alignWords(['a', 'b', 'c'], ['a', 'c'])).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail, then implement `score.ts`**

Run: `npx vitest run harness/test/script-eval/score.test.ts`
Expected: FAIL, because the module doesn't exist yet.

`harness/src/script-eval/score.ts`:

```ts
import { normalizeToken, tokenize } from '@dasma/align';
import { FLAG_BELOW, normalizeCueToken, toAlignLines, type Character, type Script } from '@dasma/script';
import { diffArrays } from 'diff';
import type { TruthFile } from '../corpus/types';

export type FixKind = 'missedSpeech' | 'inventedSpeech' | 'wrongSpeaker' | 'missedHeading' | 'inventedHeading' | 'split' | 'merge';

export interface Fix {
  kind: FixKind;
  page: number;
  /** The owner (the predicted unit the user would click) is flagged. */
  flagged: boolean;
  truthUnit?: number;
  predictedUnit?: number;
}

export interface DocScore {
  docId: string;
  family: string;
  pages: number;
  fixes: Fix[];
  fixesByPage: number[];
  spokenUnits: number;
  speakerRight: number;
  falseFlags: number;
  spokenWords: number;
  textErrors: number;
}

export function words(text: string): string[] {
  const raw = tokenize(text);
  return raw.flatMap((t, i) => normalizeToken(t, raw[i + 1]));
}

/** Pairs [aIndex, bIndex] of words an order-preserving diff keeps in common. */
export function alignWords(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  for (const part of diffArrays([...a], [...b])) {
    const n = part.count ?? part.value.length;
    if (part.added) j += n;
    else if (part.removed) i += n;
    else {
      for (let k = 0; k < n; k++) pairs.push([i + k, j + k]);
      i += n;
      j += n;
    }
  }
  return pairs;
}

/** Spec §6.4 text accuracy: each run of differences counts max(words removed, words added). */
export function wordErrors(a: readonly string[], b: readonly string[]): number {
  let errors = 0;
  let removed = 0;
  let added = 0;
  for (const part of diffArrays([...a], [...b])) {
    const n = part.count ?? part.value.length;
    if (part.added) added += n;
    else if (part.removed) removed += n;
    else {
      errors += Math.max(removed, added);
      removed = 0;
      added = 0;
    }
  }
  return errors + Math.max(removed, added);
}

/** Predicted character id → truth character id, by name or alias. */
export function resolveCast(predicted: readonly Character[], truth: readonly Character[]): Map<string, string> {
  const byForm = new Map<string, string>();
  for (const c of truth) for (const f of [c.name, ...c.aliases]) byForm.set(normalizeCueToken(f), c.id);
  const out = new Map<string, string>();
  for (const c of predicted) {
    const id = [c.name, ...c.aliases].map((f) => byForm.get(normalizeCueToken(f))).find((x) => x !== undefined);
    if (id) out.set(c.id, id);
  }
  return out;
}

interface Stream {
  words: string[];
  unit: number[];
}
function stream(units: ReadonlyArray<{ text: string }>): Stream {
  const s: Stream = { words: [], unit: [] };
  units.forEach((u, i) => {
    for (const w of words(u.text)) {
      s.words.push(w);
      s.unit.push(i);
    }
  });
  return s;
}
const inc = (m: Map<number, number>, k: number): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};
/** A unit counts toward a split or merge with at least 2 aligned words, or 1 when it has at most 2 words. */
const enough = (count: number, size: number): boolean => count >= (size <= 2 ? 1 : 2);
function sumWhere(m: Map<number, number>, keep: (k: number) => boolean): number {
  let s = 0;
  for (const [k, c] of m) if (keep(k)) s += c;
  return s;
}
function mainOf(m: Map<number, number>, keep: (k: number) => boolean): number | undefined {
  let best: number | undefined;
  let bestCount = 0;
  for (const [k, c] of m) if (keep(k) && (c > bestCount || (c === bestCount && best !== undefined && k < best))) [best, bestCount] = [k, c];
  return best;
}

/** Spec §6.4: fixes, speaker accuracy, flags and text accuracy for one document. */
export function scoreDocument(truth: TruthFile, script: Script): DocScore {
  const T = truth.units;
  const P = script.units;
  const ts = stream(T);
  const ps = stream(P);
  const land = T.map(() => new Map<number, number>());
  const from = P.map(() => new Map<number, number>());
  for (const [a, b] of alignWords(ts.words, ps.words)) {
    inc(land[ts.unit[a]], ps.unit[b]);
    inc(from[ps.unit[b]], ts.unit[a]);
  }
  const tSize = T.map(() => 0);
  for (const k of ts.unit) tSize[k]++;
  const pSize = P.map(() => 0);
  for (const k of ps.unit) pSize[k]++;
  const spokenT = (k: number) => T[k].kind === 'dialogue';
  const spokenP = (k: number) => P[k].kind === 'dialogue';
  const headingT = (k: number) => T[k].kind === 'heading';
  const headingP = (k: number) => P[k].kind === 'heading';
  const any = () => true;
  const castMap = resolveCast(script.characters, truth.cast);

  const fixes: Fix[] = [];
  const owners = new Set<number>();
  const add = (kind: FixKind, owner: number | undefined, truthUnit?: number): void => {
    if (owner !== undefined) owners.add(owner);
    const page = owner !== undefined ? (P[owner].source[0]?.page ?? 1) : truthUnit !== undefined ? T[truthUnit].page : 1;
    fixes.push({
      kind,
      page,
      flagged: owner !== undefined && P[owner].tagConfidence < FLAG_BELOW,
      ...(truthUnit !== undefined ? { truthUnit } : {}),
      ...(owner !== undefined ? { predictedUnit: owner } : {}),
    });
  };

  let spokenUnits = 0;
  let speakerRight = 0;
  T.forEach((t, k) => {
    const n = tSize[k];
    if (n === 0) return;
    if (t.kind === 'dialogue') {
      spokenUnits++;
      if (sumWhere(land[k], spokenP) < n / 2) {
        add('missedSpeech', mainOf(land[k], any), k);
        return;
      }
      const m = mainOf(land[k], spokenP)!;
      const predicted = P[m].characterId;
      if (predicted !== undefined && castMap.get(predicted) === t.characterId) speakerRight++;
      else add('wrongSpeaker', m, k);
      const parts = [...land[k]]
        .filter(([p, c]) => spokenP(p) && enough(c, pSize[p]))
        .map(([p]) => p)
        .sort((a, b) => a - b);
      for (const p of parts.slice(1)) add('merge', p, k);
    } else if (t.kind === 'heading' && sumWhere(land[k], headingP) < n / 2) {
      add('missedHeading', mainOf(land[k], any), k);
    }
  });
  P.forEach((p, k) => {
    const n = pSize[k];
    if (n === 0) return;
    if (p.kind === 'dialogue') {
      if (sumWhere(from[k], spokenT) < n / 2) {
        add('inventedSpeech', k);
        return;
      }
      const parts = [...from[k]].filter(([t, c]) => spokenT(t) && enough(c, tSize[t])).length;
      for (let i = 1; i < parts; i++) add('split', k);
    } else if (p.kind === 'heading' && sumWhere(from[k], headingT) < n / 2) {
      add('inventedHeading', k);
    }
  });

  const pages = Math.max(1, truth.pages);
  const fixesByPage = new Array<number>(pages).fill(0);
  for (const f of fixes) fixesByPage[Math.min(pages, Math.max(1, f.page)) - 1]++;
  const falseFlags = P.filter((u, k) => u.tagConfidence < FLAG_BELOW && !owners.has(k)).length;
  const truthSpoken = T.filter((u) => u.kind === 'dialogue').flatMap((u) => words(u.text));
  const predSpoken = toAlignLines(script)
    .filter((l) => !l.cut)
    .flatMap((l) => words(l.text));
  return {
    docId: truth.docId,
    family: truth.family,
    pages,
    fixes,
    fixesByPage,
    spokenUnits,
    speakerRight,
    falseFlags,
    spokenWords: truthSpoken.length,
    textErrors: wordErrors(truthSpoken, predSpoken),
  };
}
```

Run: `npx vitest run harness/test/script-eval/score.test.ts`
Expected: 12 tests pass.

- [ ] **Step 3: Write the failing report tests**

`harness/test/script-eval/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { familyMetrics, formatScriptReport, gateFailures } from '../../src/script-eval/report';
import type { DocScore, Fix } from '../../src/script-eval/score';

const fixes = (flagged: boolean[]): Fix[] => flagged.map((f) => ({ kind: 'split', page: 1, flagged: f }));
const A: DocScore = { docId: 'licensed-a', family: 'licensed', pages: 10, fixes: fixes([true, true, true, true, false]), fixesByPage: [3, 1, 1, 0, 0, 0, 0, 0, 0, 0], spokenUnits: 100, speakerRight: 99, falseFlags: 4, spokenWords: 1000, textErrors: 3 };
const B: DocScore = { docId: 'licensed-b', family: 'licensed', pages: 10, fixes: fixes([true, true, true]), fixesByPage: [0, 0, 1, 2, 0, 0, 0, 0, 0, 0], spokenUnits: 100, speakerRight: 98, falseFlags: 6, spokenWords: 1000, textErrors: 2 };

describe('familyMetrics', () => {
  it('pools documents per family', () => {
    const [m] = familyMetrics([A, B]);
    expect(m).toMatchObject({ family: 'licensed', docs: 2, pages: 20, errors: 8, worstPageFixes: 3 });
    expect(m.fixesPerPage).toBeCloseTo(0.4);
    expect(m.speakerAccuracy).toBeCloseTo(0.985);
    expect(m.flaggedShare).toBeCloseTo(0.875);
    expect(m.falseFlagsPerPage).toBeCloseTo(0.5);
    expect(m.textAccuracy).toBeCloseTo(0.9975);
  });
});

describe('gateFailures', () => {
  it('names each target a family misses', () => {
    const failures = gateFailures(familyMetrics([A, B])[0]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/flaggedShare/);
  });
});

describe('formatScriptReport', () => {
  it('writes a family table with the verdict and, when verbose, one row per document', () => {
    const md = formatScriptReport('script-eval — tune', familyMetrics([A, B]), [A, B], true);
    expect(md).toContain('| licensed |');
    expect(md).toContain('FAIL');
    expect(md).toContain('licensed-a');
    expect(formatScriptReport('t', familyMetrics([A, B]), [A, B], false)).not.toContain('licensed-a');
  });
});
```

- [ ] **Step 4: Run them to verify they fail, then implement `report.ts`**

Run: `npx vitest run harness/test/script-eval/report.test.ts`
Expected: FAIL, because the module doesn't exist yet.

`harness/src/script-eval/report.ts`:

```ts
import type { DocScore, FixKind } from './score';

/** Spec §1, per family on the held-out set. Never loosened. */
export const SCRIPT_GATE = {
  fixesPerPage: 1,
  worstPageFixes: 4,
  speakerAccuracy: 0.98,
  flaggedShare: 0.9,
  falseFlagsPerPage: 2,
  textAccuracy: 0.995,
} as const;

export interface FamilyMetrics {
  family: string;
  docs: number;
  pages: number;
  errors: number;
  fixesPerPage: number;
  worstPageFixes: number;
  speakerAccuracy: number;
  flaggedShare: number;
  falseFlagsPerPage: number;
  textAccuracy: number;
}

export function familyMetrics(scores: readonly DocScore[]): FamilyMetrics[] {
  return [...new Set(scores.map((s) => s.family))].map((family) => {
    const xs = scores.filter((s) => s.family === family);
    const sum = (f: (s: DocScore) => number) => xs.reduce((n, s) => n + f(s), 0);
    const pages = sum((s) => s.pages);
    const errors = sum((s) => s.fixes.length);
    const flagged = sum((s) => s.fixes.filter((f) => f.flagged).length);
    const spoken = sum((s) => s.spokenUnits);
    const spokenWords = sum((s) => s.spokenWords);
    return {
      family,
      docs: xs.length,
      pages,
      errors,
      fixesPerPage: pages ? errors / pages : 0,
      worstPageFixes: Math.max(0, ...xs.flatMap((s) => s.fixesByPage)),
      speakerAccuracy: spoken ? sum((s) => s.speakerRight) / spoken : 1,
      flaggedShare: errors ? flagged / errors : 1,
      falseFlagsPerPage: pages ? sum((s) => s.falseFlags) / pages : 0,
      textAccuracy: spokenWords ? 1 - sum((s) => s.textErrors) / spokenWords : 1,
    };
  });
}

export function gateFailures(m: FamilyMetrics): string[] {
  const g = SCRIPT_GATE;
  const out: string[] = [];
  if (m.fixesPerPage > g.fixesPerPage) out.push(`fixesPerPage ${m.fixesPerPage.toFixed(2)} > ${g.fixesPerPage}`);
  if (m.worstPageFixes > g.worstPageFixes) out.push(`worstPageFixes ${m.worstPageFixes} > ${g.worstPageFixes}`);
  if (m.speakerAccuracy < g.speakerAccuracy) out.push(`speakerAccuracy ${m.speakerAccuracy.toFixed(3)} < ${g.speakerAccuracy}`);
  if (m.flaggedShare < g.flaggedShare) out.push(`flaggedShare ${m.flaggedShare.toFixed(3)} < ${g.flaggedShare}`);
  if (m.falseFlagsPerPage > g.falseFlagsPerPage) out.push(`falseFlagsPerPage ${m.falseFlagsPerPage.toFixed(2)} > ${g.falseFlagsPerPage}`);
  if (m.textAccuracy < g.textAccuracy) out.push(`textAccuracy ${m.textAccuracy.toFixed(4)} < ${g.textAccuracy}`);
  return out;
}

const KINDS: FixKind[] = ['missedSpeech', 'inventedSpeech', 'wrongSpeaker', 'missedHeading', 'inventedHeading', 'split', 'merge'];
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function formatScriptReport(title: string, metrics: readonly FamilyMetrics[], scores: readonly DocScore[], verbose: boolean): string {
  const lines = [
    `# ${title}`,
    '',
    '| Family | Docs | Pages | Fixes/page (≤ 1) | Worst page (≤ 4) | Speaker acc. (≥ 98%) | Flagged share (≥ 90%) | False flags/page (≤ 2) | Text acc. (≥ 99.5%) | Gate |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const m of metrics) {
    const failures = gateFailures(m);
    lines.push(
      `| ${m.family} | ${m.docs} | ${m.pages} | ${m.fixesPerPage.toFixed(2)} | ${m.worstPageFixes} | ${pct(m.speakerAccuracy)} | ${pct(m.flaggedShare)} | ${m.falseFlagsPerPage.toFixed(2)} | ${pct(m.textAccuracy, 2)} | ${failures.length ? `FAIL: ${failures.join('; ')}` : 'PASS'} |`,
    );
  }
  lines.push('', '## Fixes by kind', '', `| Family | ${KINDS.join(' | ')} |`, `|---|${KINDS.map(() => '---').join('|')}|`);
  for (const m of metrics) {
    const fs = scores.filter((s) => s.family === m.family).flatMap((s) => s.fixes);
    lines.push(`| ${m.family} | ${KINDS.map((k) => fs.filter((f) => f.kind === k).length).join(' | ')} |`);
  }
  if (verbose) {
    lines.push('', '## Documents', '', '| Document | Pages | Fixes | Flagged | False flags | Speaker | Text errors |', '|---|---|---|---|---|---|---|');
    for (const s of scores) {
      lines.push(
        `| ${s.docId} | ${s.pages} | ${s.fixes.length} | ${s.fixes.filter((f) => f.flagged).length} | ${s.falseFlags} | ${s.speakerRight}/${s.spokenUnits} | ${s.textErrors}/${s.spokenWords} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `npx vitest run harness/test/script-eval && npm run typecheck && npm run lint`
Expected: all pass. Typecheck and lint are clean.

- [ ] **Step 6: Commit**

```bash
git add harness/src/script-eval harness/test/script-eval
git commit -m "feat(harness): word-aligned script scoring and the per-family gate report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: `script-eval` and `script-dump` commands

**Files:**
- Create: `harness/src/script-eval/evaluate-scripts.ts`, `harness/src/script-eval/dump.ts`
- Modify: `harness/src/cli.ts`
- Create: `harness/test/script-eval/evaluate-scripts.test.ts`, `harness/test/script-eval/dump.test.ts`

**Interfaces:**
- Consumes: `renderDocument` (Task 15); `corpusDocs`, `parseFamilies`, `FAMILIES` (Tasks 13 and 15); `scoreDocument`, `familyMetrics`, `gateFailures`, `formatScriptReport` (Task 16); `importScript`, `ImportInput`, `ImportResult`, `FLAG_BELOW` from `@dasma/script`; the paths `LOCAL_DIR`, `DUMP_DIR` and `SCRIPT_EVAL_DIR` (Task 12).
- Produces:
  - `inputFor(format: DocFormat, data: Uint8Array | string): ImportInput`
  - `evaluateScripts(specs, onDoc?): Promise<DocScore[]>`
  - `LocalDoc { name; input; truth }`
  - `loadLocalDocs(dir): { docs: LocalDoc[]; skipped: string[] }`
  - `evaluateLocal(docs): Promise<DocScore[]>`
  - `renderDumpHtml(result: ImportResult, fileName: string): string`
  - the CLI commands `script-eval [--set tune|heldout|local] [--families …] [--gate] [--verbose] [--out <dir>]` and `script-dump <file> [--out <dir>]`

- [ ] **Step 1: Write the failing tests**

`harness/test/script-eval/dump.test.ts`:

```ts
import type { ImportResult } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { renderDumpHtml } from '../../src/script-eval/dump';

const RESULT: ImportResult = {
  script: {
    title: 'T<1>',
    characters: [{ id: 'hamlet', name: 'HAMLET', aliases: [] }],
    units: [
      { id: 'u1', kind: 'dialogue', characterId: 'hamlet', text: '<b>hi</b>\nthere', cut: false, tagConfidence: 0.5, source: [] },
      { id: 'u2', kind: 'direction', text: '(He sits.)', cut: false, tagConfidence: 0.95, source: [] },
    ],
  },
  profile: {
    bands: [72],
    speakerBand: 'centered',
    dialogueBand: 72,
    directionBand: null,
    primary: 'ownLine',
    secondary: null,
    directionMarks: { italic: 0, parens: 1, brackets: 0, ownBand: 0 },
    castList: [],
    cueTokens: new Map([['HAMLET', 3]]),
    frontMatterEnd: 0,
  },
  warnings: [{ code: 'noSpeakers' }],
  pages: 1,
};

describe('renderDumpHtml', () => {
  it('escapes text, highlights flagged units and lists warnings and cue tokens', () => {
    const html = renderDumpHtml(RESULT, 'a&b.pdf');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;<br>there');
    expect(html).toContain('T&lt;1&gt;');
    expect(html).toContain('a&amp;b.pdf');
    expect(html).toContain('class="flagged dialogue"');
    expect(html).toContain('class=" direction"');
    expect(html).toContain('noSpeakers');
    expect(html).toContain('HAMLET (3)');
    expect(html).not.toContain('<b>hi');
  });
});
```

`harness/test/script-eval/evaluate-scripts.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateLocal, evaluateScripts, loadLocalDocs } from '../../src/script-eval/evaluate-scripts';

describe('loadLocalDocs and evaluateLocal', () => {
  it('pairs local scripts with their truth files, skips the rest, and scores them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dasma-local-'));
    writeFileSync(join(dir, 'scene.txt'), ['HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n'));
    const cast = [
      { id: 'hamlet', name: 'HAMLET', aliases: [] },
      { id: 'horatio', name: 'HORATIO', aliases: [] },
    ];
    const units = [
      ['hamlet', 'To be.'],
      ['horatio', 'My lord.'],
      ['hamlet', 'Go.'],
      ['horatio', 'Yes.'],
    ].flatMap(([id, text]) => [
      { kind: 'characterName', text: id.toUpperCase(), page: 1 },
      { kind: 'dialogue', characterId: id, text, page: 1 },
    ]);
    writeFileSync(join(dir, 'scene.truth.json'), JSON.stringify({ pages: 1, cast, units }));
    writeFileSync(join(dir, 'other.txt'), 'No truth for this one.');
    const { docs, skipped } = loadLocalDocs(dir);
    expect(docs.map((d) => d.name)).toEqual(['scene']);
    expect(skipped).toEqual(['other.txt']);
    const [score] = await evaluateLocal(docs);
    expect(score).toMatchObject({ docId: 'scene', family: 'local', fixes: [], speakerRight: 4 });
  });

  it('returns nothing for a missing folder', () => {
    expect(loadLocalDocs(join(tmpdir(), 'dasma-no-such-folder-xyz'))).toEqual({ docs: [], skipped: [] });
  });
});

describe('evaluateScripts', () => {
  it('renders, imports and scores a corpus document', async () => {
    const [score] = await evaluateScripts([{ family: 'licensed', play: 'earnest', variant: '1', seed: 1 }]);
    expect(score.docId).toBe('licensed-earnest-v1-s1');
    expect(score.family).toBe('licensed');
    expect(score.pages).toBeGreaterThanOrEqual(8);
    expect(score.spokenUnits).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run harness/test/script-eval/dump.test.ts harness/test/script-eval/evaluate-scripts.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement**

`harness/src/script-eval/evaluate-scripts.ts`:

```ts
import { importScript, type ImportInput } from '@dasma/script';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { renderDocument } from '../corpus/render';
import type { DocFormat, DocSpec, TruthFile } from '../corpus/types';
import { scoreDocument, type DocScore } from './score';

export function inputFor(format: DocFormat, data: Uint8Array | string): ImportInput {
  if (format === 'text') return { kind: 'text', text: typeof data === 'string' ? data : new TextDecoder().decode(data) };
  return { kind: format, bytes: typeof data === 'string' ? new TextEncoder().encode(data) : data };
}

export async function evaluateScripts(specs: readonly DocSpec[], onDoc?: (s: DocScore) => void): Promise<DocScore[]> {
  const scores: DocScore[] = [];
  for (const spec of specs) {
    const doc = await renderDocument(spec);
    const { script } = await importScript(inputFor(doc.format, doc.bytes ?? doc.text ?? ''));
    const score = scoreDocument(doc.truth, script);
    onDoc?.(score);
    scores.push(score);
  }
  return scores;
}

export interface LocalDoc {
  name: string;
  input: ImportInput;
  truth: TruthFile;
}

const LOCAL_FORMATS: Record<string, DocFormat> = { '.pdf': 'pdf', '.docx': 'docx', '.txt': 'text' };

/** harness/local/<name>.{pdf,docx,txt}, each with a hand-written <name>.truth.json holding { pages, cast, units } (spec §6.6). */
export function loadLocalDocs(dir: string): { docs: LocalDoc[]; skipped: string[] } {
  const docs: LocalDoc[] = [];
  const skipped: string[] = [];
  if (!existsSync(dir)) return { docs, skipped };
  for (const file of readdirSync(dir).sort()) {
    const ext = extname(file).toLowerCase();
    const format = LOCAL_FORMATS[ext];
    if (!format) continue;
    const name = file.slice(0, -ext.length);
    const truthPath = join(dir, `${name}.truth.json`);
    if (!existsSync(truthPath)) {
      skipped.push(file);
      continue;
    }
    const t = JSON.parse(readFileSync(truthPath, 'utf8')) as Pick<TruthFile, 'pages' | 'cast' | 'units'>;
    const data = readFileSync(join(dir, file));
    docs.push({
      name,
      input: inputFor(format, format === 'text' ? data.toString('utf8') : new Uint8Array(data)),
      truth: { docId: name, family: 'local', play: name, variant: 'local', seed: 0, format, pages: t.pages, cast: t.cast, units: t.units },
    });
  }
  return { docs, skipped };
}

export async function evaluateLocal(docs: readonly LocalDoc[]): Promise<DocScore[]> {
  const scores: DocScore[] = [];
  for (const d of docs) scores.push(scoreDocument(d.truth, (await importScript(d.input)).script));
  return scores;
}
```

`harness/src/script-eval/dump.ts`:

```ts
import { FLAG_BELOW, type ImportResult } from '@dasma/script';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A local, self-contained HTML view of one import, for eyeballing real scripts (spec §6.6). */
export function renderDumpHtml(result: ImportResult, fileName: string): string {
  const { script, profile, warnings, pages } = result;
  const names = new Map(script.characters.map((c) => [c.id, c.name]));
  const flagged = script.units.filter((u) => u.tagConfidence < FLAG_BELOW).length;
  const tokens = [...profile.cueTokens]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t, n]) => `${esc(t)} (${n})`)
    .join(', ');
  const rows = script.units
    .map((u) => {
      const cls = `${u.tagConfidence < FLAG_BELOW ? 'flagged' : ''} ${u.kind}`;
      const who = u.characterId ? (names.get(u.characterId) ?? u.characterId) : '';
      return `<tr class="${cls}"><td>${esc(u.id)}</td><td>${u.kind}</td><td>${esc(who)}</td><td>${u.tagConfidence.toFixed(2)}</td><td>${esc(u.text).replace(/\n/g, '<br>')}</td></tr>`;
    })
    .join('\n');
  const warningList = warnings.length ? `<ul>${warnings.map((w) => `<li>${esc(JSON.stringify(w))}</li>`).join('')}</ul>` : '<p>No warnings.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fileName)} — DASMA import</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#111;background:#fff}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}
tr.flagged{background:#fff3cd}tr.characterName td:nth-child(5),tr.heading td:nth-child(5){font-weight:600}
tr.direction td:nth-child(5){font-style:italic;color:#555}.meta{color:#555}
</style></head><body>
<h1>${esc(script.title)}</h1>
<p class="meta">${esc(fileName)} · ${pages} pages · ${script.units.length} units · ${flagged} flagged (confidence below ${FLAG_BELOW}) · ${script.characters.length} characters</p>
<p class="meta">Speakers: ${profile.primary ?? 'none found'}${profile.secondary ? ` + ${profile.secondary}` : ''} · cue tokens: ${tokens || 'none'}</p>
${warningList}
<table><thead><tr><th>Id</th><th>Kind</th><th>Speaker</th><th>Conf.</th><th>Text</th></tr></thead><tbody>
${rows}
</tbody></table>
</body></html>
`;
}
```

- [ ] **Step 4: Add the two commands to the CLI**

In `harness/src/cli.ts`, add the imports for `importScript` and `ImportInput` (from `@dasma/script`), `evaluateLocal`, `evaluateScripts`, `loadLocalDocs`, `renderDumpHtml`, `familyMetrics`, `formatScriptReport`, `gateFailures` and the `DocScore` type, and add `basename` and `extname` to the `node:path` import. Add `DUMP_DIR`, `LOCAL_DIR` and `SCRIPT_EVAL_DIR` to the `./paths` import. Then add these two functions:

```ts
async function runScriptEval(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      set: { type: 'string', default: 'heldout' },
      families: { type: 'string', default: FAMILIES.join(',') },
      gate: { type: 'boolean', default: false },
      verbose: { type: 'boolean', default: false },
      out: { type: 'string' },
    },
  });
  let scores: DocScore[];
  if (values.set === 'local') {
    const { docs, skipped } = loadLocalDocs(LOCAL_DIR);
    for (const s of skipped) console.log(`skipped ${s}: no matching .truth.json`);
    if (!docs.length) console.log(`No local scripts with truth files in ${LOCAL_DIR}`);
    scores = await evaluateLocal(docs);
  } else if (values.set === 'tune' || values.set === 'heldout') {
    scores = await evaluateScripts(corpusDocs(values.set, parseFamilies(values.families)), (s) =>
      console.log(`${s.docId}: ${s.fixes.length} fixes on ${s.pages} pages, ${s.speakerRight}/${s.spokenUnits} speakers, ${s.textErrors} text errors`),
    );
  } else throw new Error(`--set must be tune, heldout or local, got "${values.set}"`);
  const metrics = familyMetrics(scores);
  const md = formatScriptReport(`script-eval — ${values.set}`, metrics, scores, values.verbose);
  const out = values.out ? fromCwd(values.out) : join(SCRIPT_EVAL_DIR, `${values.set}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.md'), md);
  writeFileSync(join(out, 'scores.json'), `${JSON.stringify({ metrics, scores }, null, 2)}\n`);
  console.log(`\n${md}\nWrote ${out}`);
  if (values.gate) {
    const failing = metrics.filter((m) => gateFailures(m).length > 0);
    console.log(failing.length ? 'SCRIPT GATE FAIL' : 'SCRIPT GATE PASS');
    if (failing.length) process.exitCode = 1;
  }
}

async function runScriptDump(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: 'string' } } });
  const file = positionals[0];
  if (!file) throw new Error('script-dump needs a file: npm run harness -- script-dump <script.pdf|.docx|.txt>');
  const path = fromCwd(file);
  const ext = extname(path).toLowerCase();
  const input: ImportInput =
    ext === '.pdf'
      ? { kind: 'pdf', bytes: new Uint8Array(readFileSync(path)) }
      : ['.txt', '.text', '.md', '.fountain'].includes(ext)
        ? { kind: 'text', text: readFileSync(path, 'utf8') }
        : { kind: 'docx', bytes: new Uint8Array(readFileSync(path)) };
  const result = await importScript(input);
  const outDir = values.out ? fromCwd(values.out) : DUMP_DIR;
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${basename(path, extname(path))}.html`);
  writeFileSync(outFile, renderDumpHtml(result, basename(path)));
  const flagged = result.script.units.filter((u) => u.tagConfidence < FLAG_BELOW).length;
  console.log(`${result.script.units.length} units, ${flagged} flagged, ${result.warnings.length} warnings. Wrote ${outFile}`);
}
```

Add `FLAG_BELOW` to the `@dasma/script` import. Add `case 'script-eval': return runScriptEval(args);` and `case 'script-dump': return runScriptDump(args);` to the switch. Add these lines to `USAGE`:

```
  script-eval [--set tune|heldout|local] [--families a,b] [--gate] [--verbose] [--out <dir>]
                                              Import the script corpus (or harness/local) and score it; --gate exits 1 on a missed target
  script-dump <file> [--out <dir>]            Import one PDF, Word or text script and write an HTML view of its tags to harness/out/dump
```

- [ ] **Step 5: Run tests, try both commands, typecheck and lint**

Run: `npx vitest run harness/test/script-eval && npm test && npm run typecheck && npm run lint`
Expected: all pass.

Then run: `npm run harness -- script-eval --set tune --families classical`
Expected: it prints one line per document, then a markdown report with a `classical` row. Whether that row passes doesn't matter yet; Task 18 tunes.

Then run: `npm run harness -- script-dump harness/out/corpus/classical/classical-hamlet-v1-s1.pdf`
Expected: "… units, … flagged, … warnings. Wrote …/harness/out/dump/classical-hamlet-v1-s1.html". Run `build-corpus` first if the file is missing.

- [ ] **Step 6: Commit**

```bash
git add harness/src/script-eval harness/src/cli.ts harness/test/script-eval
git commit -m "feat(harness): script-eval with gate and local scripts, and the script-dump HTML view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Measure-and-tune round 1

This task is judgement work, not transcription. Its deliverables are tuned constants, a results document, and a held-out verdict.

**Files:**
- Modify: `packages/script/src/weights.ts`. The clean-up constants in `packages/script/src/clean.ts` and the profile constants in `packages/script/src/profile.ts` may also change.
- Create: `docs/script-import-results.md`

**Rules (spec §6.5, Global Constraints):**
- **Change constants only.** These are the values in `weights.ts` (`EMISSION`, `TRANSITIONS`, `START`, `FLAG_BELOW`, the alias confidences, `STOP_TOKENS`, `STOP_FIRST_WORDS`), the exported thresholds in `clean.ts`, and the exported constants in `profile.ts`. A shortfall that needs a new rule is written up as a named shortfall in the results, not built here.
- Tune on the tuning set only. Before the round-1 held-out run (Step 5), don't run `--set heldout`, and don't read or `script-dump` any held-out document (variant 3, `seagull`, `romeo`).
- Each tuning change keeps `npm test` green. If a unit test fails because of a constant change, either the change is wrong or the test pinned a weight rather than a behaviour. Decide which, and record the decision in the commit message.
- Stop tuning when every family passes every target on the tuning set, or after 8 measure-and-change cycles, whichever comes first.

- [ ] **Step 1: Baseline**

Run:

```bash
npm run harness -- build-corpus --set tune
npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round1-tune-baseline
```

Expected: a report with three family rows. Copy the family table into `docs/script-import-results.md` under "Round 1 — tuning baseline".

- [ ] **Step 2: Find the biggest fix kinds**

In `harness/out/script-eval/round1-tune-baseline/scores.json`, count `fixes[].kind` per family. The report's "Fixes by kind" table already has the counts. For the two largest kinds in the worst family, find documents and units using `truthUnit` and `predictedUnit`. Open those documents with `npm run harness -- script-dump harness/out/corpus/<family>/<docId>.<ext>`. Write down one sentence per cause, for example: "licensed 2 directions (italic, no parens, indented) tagged dialogue because `directionBandPerMark` is too weak".

- [ ] **Step 3: Tune**

Change one constant group per cycle, then re-run `npm run harness -- script-eval --set tune` (with `--families` for speed while iterating) and `npm test`. Commit each kept change:

```bash
git add packages/script/src
git commit -m "tune(script): <constant change> — tune fixes/page <family> <before>→<after>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Revert any change that makes another family worse on a gated target unless it is a net win, and say so in the commit.

- [ ] **Step 4: Freeze and record**

Run: `npm run harness -- script-eval --set tune --verbose --out harness/out/script-eval/round1-tune-final`

Add a "Round 1 — tuning, final" table to the results doc, and list every constant changed (old value → new value).

- [ ] **Step 5: Held-out measurement (once)**

Run:

```bash
npm run harness -- build-corpus --set heldout
npm run harness -- script-eval --set heldout --gate --verbose --out harness/out/script-eval/round1-heldout
```

Expected: `SCRIPT GATE PASS` or `SCRIPT GATE FAIL`. Add a "Round 1 — held-out" table to the results doc, with the gate line and the fixes-by-kind table. Where the held-out result is worse than tuning by more than 0.3 fixes/page, name the document style that caused it, for example "word 3 shouted lines".

- [ ] **Step 6: Commit the results**

```bash
git add docs/script-import-results.md
git commit -m "docs: M2a script-import round 1 results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If the held-out gate passed, Task 19 skips its tuning steps (Steps 1–3) and goes straight to Step 4.

---

### Task 19: Round 2 (if needed), the GO/NO-GO verdict and the spec updates

**Files:**
- Modify: `packages/script/src/weights.ts`, `clean.ts` and `profile.ts` (round 2, constants only)
- Modify: `docs/script-import-results.md`, `docs/superpowers/specs/2026-10-10-dasma-design.md`, `README.md`

- [ ] **Step 1: Round 2 tuning (only if round 1 held-out failed)**

Use the same rules as Task 18. The one difference is that you may use round 1's held-out *family-level* numbers and fix-kind counts to choose what to work on. Still don't open or dump individual held-out documents, and still tune on the tuning set. Make one further tuning cycle of at most 8 measure-and-change loops, then freeze.

- [ ] **Step 2: Round 2 held-out measurement**

Run: `npm run harness -- script-eval --set heldout --gate --verbose --out harness/out/script-eval/round2-heldout`
Add "Round 2 — tuning, final" and "Round 2 — held-out" sections to the results doc.

- [ ] **Step 3: Commit round 2**

```bash
git add packages/script/src docs/script-import-results.md
git commit -m "tune(script): round 2 and held-out results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Write the verdict**

At the top of `docs/script-import-results.md`, add a "Summary" section:
- **Verdict.** GO if every family passes every target on the last held-out run; otherwise NO-GO.
- **The final held-out table.**
- **For a NO-GO, each shortfall by name** (family, target, measured value), with the options:
  - (a) accept the named shortfall and let the M2b correction screen carry it;
  - (b) a targeted rule change, named, such as a recurring-header rule for pasted text;
  - (c) more layout variety in the corpus, if a failure looks like a renderer artefact rather than a tagger fault;
  - (d) real scripts scored locally with `--set local` before deciding.
- **What M2b's screen must carry.** These are the fix kinds still common on held-out documents.

- [ ] **Step 5: Update the MVP spec (spec §7)**

In `docs/superpowers/specs/2026-10-10-dasma-design.md`:

- **§4.1 table, `script` row:** change "Depends on" to `pdfjs-dist, fflate`, replacing mammoth.
- **§5 Script bullet:** set the unit kinds to `'dialogue' | 'direction' | 'characterName' | 'heading' | 'sceneBreak' | 'frontMatter'`, replace `overlap: boolean` with `overlapRanges?: [number, number][]` and add `source: {page, line}[]`.
- **§5 `.dasma` paragraph:** append "Units use the M2a shape (script-import spec §7); there is no earlier version to migrate."
- **§6:** after the heading, add "Implemented by `packages/script`; the import rules are in [`2026-10-11-script-import-design.md`](2026-10-11-script-import-design.md)." In item 4 (tag-correction screen), add "edit a unit's text".
- **§11 M2 row (or bullet):** note "M2a (script engine) done — see `docs/script-import-results.md`; M2b (screens) next."

- [ ] **Step 6: Update the README**

In `README.md`, add a row to the layout table:

```
| `packages/script` | Script import: PDF, Word and pasted text into tagged scripts; `.dasma` files; re-import diff |
```

Then add `npm run harness -- script-eval --set heldout --gate` and `npm run harness -- script-dump <file>` to "Getting started", after the evaluate example. Use the same formatting as the lines around them.

- [ ] **Step 7: Final checks and commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

```bash
git add docs README.md
git commit -m "docs: M2a verdict, MVP spec data-model updates and README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
