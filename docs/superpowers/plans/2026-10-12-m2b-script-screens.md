# M2b Script Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser screens that let a director prepare a production offline: library, import (PDF/Word/paste, several files), the tag-correction screen, cast list, cuts and overlaps, `.dasma` export/import, re-import review, and IndexedDB persistence.

**Architecture:** All correction logic is pure functions in `@dasma/script` (`applyEdit(script, op)` and helpers), tested in Node. `apps/web` is a React 19 app organised by screen: a Dexie repository (`src/db`), an import Web Worker (`src/import`), a 40-line hash router, and screens that call the pure functions. Every keyboard shortcut is declared once as an action that renders a button and binds a key, so a touch layout can come later.

**Tech Stack:** TypeScript (strict), React 19, Vite 8, Dexie 4, Vitest 5 (projects: `node` and `web`/jsdom), Testing Library, fake-indexeddb, fast-check.

**Spec:** [`docs/superpowers/specs/2026-10-12-script-screens-design.md`](../specs/2026-10-12-script-screens-design.md) (cited "spec §n"). It refers to the MVP spec and the M2a spec; read spec §1–§10 before starting any task.

## Global Constraints

- Node ≥ 24; TypeScript strict; `npx eslint .` clean; `npm run typecheck` clean; `npx vitest run` green before every commit.
- `packages/script/src` stays free of Node and browser APIs: no `node:*` imports; no `window`, `document`, `navigator`, `process`, `Buffer` (enforced by the existing ESLint rules). Only `extract/pdf.ts` and `extract/docx.ts` read files.
- The app makes **no network calls** (no remote fetch, fonts, CDNs or analytics). Everything is bundled.
- Chrome and Edge are supported; Safari and Firefox are best effort and are **not blocked** (D20).
- **Every keyboard shortcut has a visible button that calls the same handler.** No hover-only controls. No drag interactions (the file drop zone is optional; the "Choose files" button does the same). Use `onClick`/pointer events, never mouse-only events.
- `.dasma` stays at `formatVersion: 1`. No change to the `.dasma` format or to the `Unit`/`Script` types.
- Licensed scripts and answer keys are never committed. Answer keys belong in `harness/local/` (git-ignored).
- User-facing strings quoted in the spec are copied verbatim.
- New dependencies, pinned exactly: `dexie` 4.4.6, `pdfjs-dist` 6.3.289 (already used by `@dasma/script`), and dev-only `fake-indexeddb` 6.2.5, `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.7, `jsdom` 30.1.2. No other new dependencies.
- Commits use the repo-local git identity (already configured) and end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (a subagent may name its own model instead).
- Test file convention in `apps/web/test/`: `*.test.ts` runs in the `node` project, `*.test.tsx` runs in the `web` (jsdom) project.

## Spec clarifications (rulings made while planning)

These resolve points the spec leaves open. Each is cheap to reverse.

1. **`splitAlias` takes the speeches to move.** The op is `{ type: 'splitAlias', characterId, alias, newId, unitIds }`. The screen computes `unitIds` with `aliasSpeeches(script, hints, characterId, alias)`, so `applyEdit` stays a pure function of the script. Inline cues (`NAME. text`) leave no `characterName` unit behind, so `UnitHint` gains an optional `cue` (the normalised cue token that started the unit's speech).
2. **Pruning removes only characters an edit emptied.** After each op, a character that had dialogue before the op and has none after is removed, unless its id is a cast key. Characters that never had dialogue are left alone.
3. **`newCharacter` takes its id from the caller** (`uniqueCharacterId(script, name)`), so the following `speechBy` in the same `batch` can reference it.
4. **The import picker also accepts `.txt`** (as text). The local scorer accepts `.txt` scripts, so this makes the answer-key loop work for plain-text scripts.
5. **The answer key is named after the source file's stem** (`hamlet.pdf` → `hamlet.truth.json`), because `script-eval --set local` pairs `<stem>.<ext>` with `<stem>.truth.json`. The button is disabled, with a reason, when the live version came from more than one file or from a `.dasma` file.
6. **A `.dasma` update that carries a cast list replaces the production's cast**, for the same reason the spec takes its script as is: the director's file is authoritative. A file re-import keeps the production's cast.
7. **Opening a `.dasma` as a new production lands on the production page** (an actor checks the script and cast); creating from an import lands on Fix tags.
8. **The "Include cast list" checkbox starts unticked** (actor names are personal data).
9. **The two-tab check runs on save**, as the spec says; a tab that only reads never warns.

## Review Focus

1. **Typing in a text field fires shortcuts** (typing "dh" in Edit text or the picker filter retags units). Expected: shortcuts are ignored in text fields, except `Esc` and `Cmd/Ctrl+Enter`. Pinned in Tasks 16 (picker) and 17 (Edit text).
2. **Enter on a focused button runs the action twice** (the browser's click plus our shortcut). Expected: one action, one undo step. Pinned in Task 15.
3. **Exporting an answer key for a multi-file or `.dasma` production** pairs truth with the wrong file. Expected: the button is disabled with "Only for a script imported from a single file." Pinned in Task 13.
4. **The selection points at units that no longer exist** (after Remove, Undo or Redo). Expected: no crash; vanished ids drop out of the selection and actions that need a selection are disabled. Pinned in Task 15.
5. **Titles with characters that are illegal in file names** ("Romeo/Juliet: Act 1") break downloads. Expected: `Romeo-Juliet- Act 1.dasma`. Pinned in Task 13.

## File structure

**`packages/script`** (pure, Node-tested):

| File | Responsibility |
|---|---|
| `src/words.ts` | `wordSpans(text)`: character spans of `tokenize` words |
| `src/units.ts`, `src/import.ts`, `src/types.ts` (modify) | `UnitHint` and `ImportResult.unitHints` |
| `src/overlap.ts` (modify) | export `normaliseRanges` |
| `src/edit/ops.ts` | `EditOp` union, `EditError` |
| `src/edit/util.ts` | shared helpers (lookup, confirm, alias cleaning) |
| `src/edit/ids.ts` | `maxUnitNumber`, `nextUnitId`, `uniqueCharacterId` |
| `src/edit/unit-ops.ts` | confirm, setKind, editText, remove, setCut, scene breaks |
| `src/edit/speaker-ops.ts` | speechBy, setName, newCharacter, moveSpeeches, character ops, `speechReach`, `aliasSpeeches` |
| `src/edit/word-ops.ts` | split, join, setCutWords, setOverlap |
| `src/edit/apply.ts` | `applyEdit` dispatcher, `pruneCharacters` |
| `src/edit/check.ts` | `checkQueue` |
| `src/edit/similar.ts` | `similarUnits` |
| `src/edit/append.ts` | `appendScripts` |
| `src/answer-key.ts` | `toAnswerKey` |

**`apps/web`**:

| File | Responsibility |
|---|---|
| `src/router.ts` | hash routes |
| `src/ui/shortcuts.ts`, `src/ui/Button.tsx` | key matching, `useShortcuts`, buttons with key hints |
| `src/styles.css` | plain styles |
| `src/db/schema.ts`, `src/db/repo.ts` | Dexie schema and repository |
| `src/import/run.ts`, `src/import/protocol.ts`, `src/import/import.worker.ts`, `src/import/importer.ts` | import pipeline, worker protocol, worker, client |
| `src/services.tsx` | `Services` context (repo, importer, download, persist, pending re-imports) |
| `src/storage.ts`, `src/browser.ts`, `src/download.ts`, `src/files.ts` | persistence request, browser check, downloads, file-name helpers |
| `src/App.tsx`, `src/main.tsx` | shell and wiring |
| `src/screens/Library.tsx`, `ImportScreen.tsx`, `Production.tsx`, `ReimportReview.tsx`, `OpenDasma.tsx`, `NotFound.tsx`, `warnings.ts`, `reimport.ts` | screens and their pure helpers |
| `src/fix/useScriptEditor.ts` | editor state, undo, saving |
| `src/fix/actions.ts` | the one list of Fix tags actions |
| `src/fix/FixTags.tsx`, `ScriptView.tsx`, `CheckList.tsx`, `FixPanel.tsx`, `FixHeader.tsx`, `CharacterPicker.tsx`, `CharacterList.tsx`, `ShortcutSheet.tsx` | the Fix tags screen |

---

## Part A — `@dasma/script`

### Task 1: Word spans and import hints

**Files:**
- Create: `packages/script/src/words.ts`
- Modify: `packages/script/src/types.ts`, `packages/script/src/units.ts`, `packages/script/src/import.ts`, `packages/script/src/index.ts`, `harness/test/script-eval/dump.test.ts`
- Test: `packages/script/test/words.test.ts`, `packages/script/test/hints.test.ts`

**Interfaces:**
- Produces: `wordSpans(text: string): Array<[number, number]>`; `interface UnitHint { band: number | null; italic: boolean; cue?: string }`; `ImportResult.unitHints: Record<string, UnitHint>` (keyed by unit id).

- [ ] **Step 1: Write the failing tests**

`packages/script/test/words.test.ts`:

```ts
import { tokenize } from '@dasma/align';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { wordSpans } from '../src/words';

const words = (text: string): string[] => wordSpans(text).map(([s, e]) => text.slice(s, e));

describe('wordSpans', () => {
  it('gives the character span of each tokenize word', () => {
    const text = 'Well—no,  I  said--it ’tis well-known.';
    expect(words(text)).toEqual(['Well', 'no,', 'I', 'said', 'it', '’tis', 'well-known.']);
  });

  it('splits exactly where tokenize splits', () => {
    const unit = fc.constantFrom('a', 'b', ' ', '\n', '\t', '-', '—', '’', '.');
    fc.assert(
      fc.property(fc.string({ unit }), (text) => {
        expect(words(text).map((w) => w.replace(/[‘’ʼ`´]/g, "'"))).toEqual(tokenize(text));
      }),
    );
  });
});
```

`packages/script/test/hints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { importScript } from '../src/import';

describe('importScript unitHints', () => {
  it('gives every unit a hint, and each speech the cue that started it', async () => {
    const text = ['ACT I', 'HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n');
    const result = await importScript({ kind: 'text', text });
    for (const u of result.script.units) {
      expect(result.unitHints[u.id]).toBeDefined();
      if (u.kind === 'dialogue' && u.characterId) {
        const c = result.script.characters.find((x) => x.id === u.characterId)!;
        expect([c.name, ...c.aliases]).toContain(result.unitHints[u.id].cue);
      }
      if (u.kind === 'characterName') expect(result.unitHints[u.id].cue).toBe(u.text.toUpperCase());
    }
  });

  it('records inline cues too', async () => {
    const text = ['HAMLET. To be.', 'HORATIO. My lord.', 'HAMLET. Go.', 'HORATIO. Yes.'].join('\n');
    const result = await importScript({ kind: 'text', text });
    const spoken = result.script.units.filter((u) => u.kind === 'dialogue');
    expect(spoken.length).toBeGreaterThan(0);
    for (const u of spoken) expect(['HAMLET', 'HORATIO']).toContain(result.unitHints[u.id].cue);
  });

  it('puts lines with different indents on different bands', async () => {
    const text = ['HAMLET', 'To be.', '          (He sits.)', 'HORATIO', 'My lord.', '          (He stands.)'].join('\n');
    const result = await importScript({ kind: 'text', text });
    const said = result.script.units.find((u) => u.text === 'To be.')!;
    const sits = result.script.units.find((u) => u.text.includes('He sits'))!;
    expect(result.unitHints[said.id].band).not.toBe(result.unitHints[sits.id].band);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/words.test.ts packages/script/test/hints.test.ts`
Expected: FAIL — `../src/words` does not exist; `unitHints` is undefined.

- [ ] **Step 3: Write `words.ts`**

```ts
/** Separators exactly as `tokenize` (@dasma/align) splits: whitespace, Unicode dashes, and runs of two or more hyphens. */
const SEPARATORS = /(?:\s|[‐-―−]|--+)+/gu;

/** Character spans [start, end) of each `tokenize` word, so word k of a unit is `text.slice(...wordSpans(text)[k])`. */
export function wordSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (const m of text.matchAll(SEPARATORS)) {
    if (m.index > start) spans.push([start, m.index]);
    start = m.index + m[0].length;
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans;
}
```

- [ ] **Step 4: Add `UnitHint` to `types.ts`**

Add before `ImportResult`, and add the field to `ImportResult`:

```ts
/** Layout facts about a unit's first line, kept beside a script version (not in `Script` or `.dasma`). */
export interface UnitHint {
  /** Indent band (`nearestBand`) of the unit's first line; null when it is centred. */
  band: number | null;
  italic: boolean;
  /** The normalised cue token that started this unit's speech, or the token of a characterName unit. */
  cue?: string;
}

export interface ImportResult {
  script: Script;
  profile: DocProfile;
  warnings: ImportWarning[];
  pages: number;
  /** Keyed by unit id. */
  unitHints: Record<string, UnitHint>;
}
```

- [ ] **Step 5: Record cue tokens in `units.ts`**

Change the `Speaker` and `Draft` types and the places that create drafts:

```ts
interface Speaker {
  characterId?: string;
  /** min(cue line confidence, …) × alias confidence. */
  factor: number;
  cap: number;
  /** Normalised cue token, for `UnitHint.cue`. */
  token?: string;
}
type Draft = Omit<Unit, 'id'> & { cue?: string };
```

In `splitSpeech`, the dialogue draft gains the cue:

```ts
      drafts.push({
        kind,
        ...(speaker.characterId ? { characterId: speaker.characterId } : {}),
        text: body,
        cut: false,
        tagConfidence,
        source,
        ...(speaker.token ? { cue: speaker.token } : {}),
      });
```

In `buildUnits`, `startSpeaker` records the token, and the `cue` case records it on the name unit:

```ts
  const startSpeaker = (t: TaggedLine): Speaker => {
    const token = t.cue ? normalizeCueToken(t.cue.token) : undefined;
    const r = t.cue ? cast.resolve(t.cue.token) : null;
    return r
      ? { characterId: r.characterId, factor: r.confidence, cap: t.confidence, token }
      : { factor: 1, cap: Math.min(t.confidence, AMBIGUOUS_CONFIDENCE), token };
  };
```

```ts
      case 'cue':
        flush();
        speaker = startSpeaker(t);
        drafts.push({
          kind: 'characterName',
          text: l.text,
          cut: false,
          tagConfidence: t.confidence,
          source: l.source,
          ...(speaker.token ? { cue: speaker.token } : {}),
        });
        break;
```

Replace the end of `buildUnits` so the cue leaves the unit and is returned separately:

```ts
  const units: Unit[] = [];
  const cues: Record<string, string> = {};
  drafts.forEach(({ cue, ...d }, k) => {
    const id = `u${k + 1}`;
    units.push({ id, ...d });
    if (cue) cues[id] = cue;
  });
  const warnings: ImportWarning[] = cast.ambiguous.map((a) => ({ code: 'ambiguousAlias', token: a.token, candidates: a.candidates }));
  return { units, cast, warnings, cues };
}
```

Update the return type to `{ units: Unit[]; cast: Cast; warnings: ImportWarning[]; cues: Record<string, string> }` and add `import { normalizeCueToken } from './cues';`.

- [ ] **Step 6: Build the hints in `import.ts`**

Add imports `nearestBand` from `./profile`, and `CleanLine`, `UnitHint` from `./types`. Before the `return`:

```ts
  const lineAt = new Map<string, CleanLine>();
  for (const l of doc.lines) for (const s of l.source) lineAt.set(`${s.page}:${s.line}`, l);
  const unitHints: Record<string, UnitHint> = {};
  for (const u of units) {
    const first = u.source[0];
    const l = first ? lineAt.get(`${first.page}:${first.line}`) : undefined;
    const cue = built.cues[u.id];
    unitHints[u.id] = {
      band: l && !l.centered ? nearestBand(profile.bands, l.left) : null,
      italic: l?.italic ?? false,
      ...(cue ? { cue } : {}),
    };
  }
```

and return `{ script: …, profile, warnings, pages: doc.pages, unitHints }`.

- [ ] **Step 7: Export and fix the harness fixture**

In `packages/script/src/index.ts` add `export { wordSpans } from './words';` (`UnitHint` is already covered by `export * from './types'`).

In `harness/test/script-eval/dump.test.ts`, add `unitHints: {},` to the `RESULT` literal (after `pages`).

- [ ] **Step 8: Run all tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: all pass. The M2a tests and `script-eval` behaviour are unchanged (no tag changed).

- [ ] **Step 9: Commit**

```bash
git add packages/script harness/test/script-eval/dump.test.ts
git commit -m "feat(script): word spans and per-unit import hints (band, italic, cue)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Edit core and unit operations

**Files:**
- Create: `packages/script/src/edit/ops.ts`, `src/edit/util.ts`, `src/edit/ids.ts`, `src/edit/unit-ops.ts`, `src/edit/apply.ts`
- Modify: `packages/script/src/index.ts`
- Test: `packages/script/test/edit/fixture.ts`, `packages/script/test/edit/unit-ops.test.ts`

**Interfaces:**
- Produces:
  - `type EditOp` (full union below; Tasks 3–4 implement the rest), `class EditError extends Error`.
  - `applyEdit(script: Script, op: EditOp, opts?: EditOptions): Script`; `interface EditOptions { keep?: readonly string[] }`.
  - `pruneCharacters(script: Script, keep: readonly string[]): Script`.
  - `maxUnitNumber(script)`, `nextUnitId(script): string`, `uniqueCharacterId(script, name): string`.
  - `SCENE_BREAK_TEXT = '* * *'`.
  - Test fixture `scene()` and `unit(id, kind, text, extra?)` in `test/edit/fixture.ts`.

- [ ] **Step 1: Write the fixture**

`packages/script/test/edit/fixture.ts`:

```ts
import type { Script, Unit, UnitKind } from '../../src/types';

export function unit(id: string, kind: UnitKind, text: string, extra: Partial<Unit> = {}): Unit {
  return { id, kind, text, cut: false, tagConfidence: 0.5, source: [{ page: 1, line: Number(id.slice(1)) }], ...extra };
}

/** Earnest, with the kinds of mistakes M2a makes on real scripts: a heading guess, a fake character "OKAY". */
export function scene(): Script {
  return {
    title: 'Earnest',
    characters: [
      { id: 'algernon', name: 'ALGERNON', aliases: ['ALGY'] },
      { id: 'lane', name: 'LANE', aliases: [] },
      { id: 'okay', name: 'OKAY', aliases: [] },
    ],
    units: [
      unit('u1', 'heading', "Morning-room in Algernon's flat"),
      unit('u2', 'direction', 'Lane is arranging afternoon tea on the table.', { tagConfidence: 0.95 }),
      unit('u3', 'characterName', 'ALGERNON', { tagConfidence: 0.95 }),
      unit('u4', 'dialogue', 'Did you hear what I was playing, Lane?', { characterId: 'algernon', tagConfidence: 0.95 }),
      unit('u5', 'characterName', 'LANE', { tagConfidence: 0.95 }),
      unit('u6', 'dialogue', "I didn't think it polite to listen, sir.", { characterId: 'lane', tagConfidence: 0.95 }),
      unit('u7', 'characterName', 'OKAY.', { tagConfidence: 0.4 }),
      unit('u8', 'dialogue', "I'm sorry for that, for your sake.", { characterId: 'okay', tagConfidence: 0.6 }),
      unit('u9', 'characterName', 'ALGERNON', { tagConfidence: 0.95 }),
      unit('u10', 'dialogue', "I don't play accurately.", { characterId: 'algernon', tagConfidence: 0.95 }),
    ],
  };
}

export const ids = (s: Script): string[] => s.units.map((u) => u.id);
export const byId = (s: Script, id: string): Unit => s.units.find((u) => u.id === id)!;
```

- [ ] **Step 2: Write the failing tests**

`packages/script/test/edit/unit-ops.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEdit, pruneCharacters } from '../../src/edit/apply';
import { nextUnitId, uniqueCharacterId } from '../../src/edit/ids';
import { EditError } from '../../src/edit/ops';
import { byId, ids, scene } from './fixture';

describe('confirm', () => {
  it('sets confidence to 1 on the listed units only, reusing the others', () => {
    const s = scene();
    const next = applyEdit(s, { type: 'confirm', unitIds: ['u1'] });
    expect(byId(next, 'u1').tagConfidence).toBe(1);
    expect(next.units[1]).toBe(s.units[1]);
    expect(s.units[0].tagConfidence).toBe(0.5);
  });

  it('refuses unknown ids and empty selections', () => {
    expect(() => applyEdit(scene(), { type: 'confirm', unitIds: ['nope'] })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'confirm', unitIds: [] })).toThrow(EditError);
  });
});

describe('setKind', () => {
  it('turns a heading guess into front matter', () => {
    const next = applyEdit(scene(), { type: 'setKind', unitIds: ['u1'], kind: 'frontMatter' });
    expect(byId(next, 'u1')).toMatchObject({ kind: 'frontMatter', tagConfidence: 1 });
  });

  it('drops the speaker and overlap when a speech becomes a direction, pruning the emptied character', () => {
    const s = scene();
    s.units[7] = { ...s.units[7], overlapRanges: [[0, 2]] };
    const next = applyEdit(s, { type: 'setKind', unitIds: ['u8'], kind: 'direction' });
    expect(byId(next, 'u8').characterId).toBeUndefined();
    expect(byId(next, 'u8').overlapRanges).toBeUndefined();
    expect(next.characters.map((c) => c.id)).toEqual(['algernon', 'lane']);
  });

  it('keeps an emptied character that is in the cast list', () => {
    const next = applyEdit(scene(), { type: 'setKind', unitIds: ['u8'], kind: 'direction' }, { keep: ['okay'] });
    expect(next.characters.map((c) => c.id)).toContain('okay');
  });
});

describe('editText', () => {
  it('replaces and trims the text and clears overlap marks', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], overlapRanges: [[1, 3]] };
    const next = applyEdit(s, { type: 'editText', unitId: 'u4', text: '  Did you hear me?  ' });
    expect(byId(next, 'u4')).toMatchObject({ text: 'Did you hear me?', tagConfidence: 1 });
    expect(byId(next, 'u4').overlapRanges).toBeUndefined();
  });

  it('refuses empty text', () => {
    expect(() => applyEdit(scene(), { type: 'editText', unitId: 'u4', text: '   ' })).toThrow(/Remove/);
  });
});

describe('remove, setCut and scene breaks', () => {
  it('removes units but never the last one', () => {
    expect(ids(applyEdit(scene(), { type: 'remove', unitIds: ['u1', 'u2'] }))[0]).toBe('u3');
    expect(() => applyEdit(scene(), { type: 'remove', unitIds: ids(scene()) })).toThrow(/at least one/);
  });

  it('cuts and uncuts whole units', () => {
    const cut = applyEdit(scene(), { type: 'setCut', unitIds: ['u4', 'u6'], cut: true });
    expect([byId(cut, 'u4').cut, byId(cut, 'u6').cut, byId(cut, 'u8').cut]).toEqual([true, true, false]);
    expect(byId(applyEdit(cut, { type: 'setCut', unitIds: ['u4'], cut: false }), 'u4').cut).toBe(false);
  });

  it('inserts a scene break before a unit with the next free id and removes it again', () => {
    const s = scene();
    expect(nextUnitId(s)).toBe('u11');
    const next = applyEdit(s, { type: 'insertSceneBreak', beforeUnitId: 'u5' });
    expect(next.units[4]).toEqual({ id: 'u11', kind: 'sceneBreak', text: '* * *', cut: false, tagConfidence: 1, source: [{ page: 1, line: 5 }] });
    expect(ids(applyEdit(next, { type: 'removeSceneBreak', unitId: 'u11' }))).toEqual(ids(s));
    expect(() => applyEdit(s, { type: 'removeSceneBreak', unitId: 'u4' })).toThrow(EditError);
  });
});

describe('batch', () => {
  it('applies every op or none', () => {
    const s = scene();
    const both = applyEdit(s, { type: 'batch', ops: [{ type: 'confirm', unitIds: ['u1'] }, { type: 'confirm', unitIds: ['u7'] }] });
    expect([byId(both, 'u1').tagConfidence, byId(both, 'u7').tagConfidence]).toEqual([1, 1]);
    expect(() => applyEdit(s, { type: 'batch', ops: [{ type: 'confirm', unitIds: ['u1'] }, { type: 'confirm', unitIds: ['x'] }] })).toThrow(EditError);
    expect(byId(s, 'u1').tagConfidence).toBe(0.5);
  });
});

describe('ids and pruning', () => {
  it('makes unique character ids', () => {
    expect(uniqueCharacterId(scene(), 'Lady Bracknell')).toBe('lady-bracknell');
    expect(uniqueCharacterId(scene(), 'Lane')).toBe('lane-2');
  });

  it('pruneCharacters drops characters without dialogue unless kept', () => {
    const s = { ...scene(), characters: [...scene().characters, { id: 'jack', name: 'JACK', aliases: [] }] };
    expect(pruneCharacters(s, []).characters.map((c) => c.id)).toEqual(['algernon', 'lane', 'okay']);
    expect(pruneCharacters(s, ['jack']).characters.map((c) => c.id)).toContain('jack');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/edit/unit-ops.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `ops.ts`**

```ts
import type { UnitKind } from '../types';

/** One correction on the tag-correction screen (spec §6.2). Every op sets tagConfidence 1 on the units it touches. */
export type EditOp =
  | { type: 'confirm'; unitIds: string[] }
  | { type: 'setKind'; unitIds: string[]; kind: Extract<UnitKind, 'direction' | 'heading' | 'frontMatter'> }
  | { type: 'speechBy'; unitIds: string[]; characterId: string }
  | { type: 'newCharacter'; id: string; name: string }
  | { type: 'setName'; unitId: string; characterId: string }
  | { type: 'editText'; unitId: string; text: string }
  | { type: 'split'; unitId: string; atWord: number }
  | { type: 'join'; unitId: string }
  | { type: 'remove'; unitIds: string[] }
  | { type: 'setCut'; unitIds: string[]; cut: boolean }
  | { type: 'setCutWords'; unitId: string; from: number; to: number; cut: boolean }
  | { type: 'setOverlap'; unitId: string; from: number; to: number; on: boolean }
  | { type: 'insertSceneBreak'; beforeUnitId: string }
  | { type: 'removeSceneBreak'; unitId: string }
  | { type: 'renameCharacter'; characterId: string; name: string }
  | { type: 'editAliases'; characterId: string; aliases: string[] }
  | { type: 'mergeCharacters'; fromId: string; intoId: string }
  | { type: 'splitAlias'; characterId: string; alias: string; newId: string; unitIds: string[] }
  | { type: 'moveSpeeches'; unitIds: string[]; characterId: string }
  | { type: 'batch'; ops: EditOp[] };

/** An op that does not apply to this script; the script is unchanged and the message is shown to the user. */
export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}
```

- [ ] **Step 5: Write `util.ts` and `ids.ts`**

`packages/script/src/edit/util.ts`:

```ts
import type { Character, Script, Unit, UnitKind } from '../types';
import { EditError } from './ops';

export function indexOfUnit(script: Script, id: string): number {
  const i = script.units.findIndex((u) => u.id === id);
  if (i < 0) throw new EditError(`There is no unit ${id}.`);
  return i;
}

export function requireUnits(script: Script, unitIds: readonly string[]): Set<string> {
  if (unitIds.length === 0) throw new EditError('Select at least one unit.');
  for (const id of unitIds) indexOfUnit(script, id);
  return new Set(unitIds);
}

export function requireCharacter(script: Script, id: string): Character {
  const c = script.characters.find((x) => x.id === id);
  if (!c) throw new EditError(`There is no character ${id}.`);
  return c;
}

export const withUnits = (script: Script, units: Unit[]): Script => ({ ...script, units });

export function replaceUnit(script: Script, i: number, unit: Unit): Script {
  const units = script.units.slice();
  units[i] = unit;
  return withUnits(script, units);
}

export const confirmed = (u: Unit): Unit => (u.tagConfidence === 1 ? u : { ...u, tagConfidence: 1 });

/** The unit as a non-speech kind: no speaker, no overlap marks, confirmed. */
export function asKind(u: Unit, kind: UnitKind): Unit {
  const { characterId, overlapRanges, ...rest } = u;
  void characterId;
  void overlapRanges;
  return { ...rest, kind, tagConfidence: 1 };
}

/** The unit with these overlap ranges, or without the field when there are none. */
export function withRanges(u: Unit, ranges: Array<[number, number]>): Unit {
  const { overlapRanges, ...rest } = u;
  void overlapRanges;
  return ranges.length ? { ...rest, overlapRanges: ranges } : rest;
}

/** Trimmed, de-duplicated (case-insensitive) aliases, without the character's own name. */
export function cleanAliases(aliases: readonly string[], name: string): string[] {
  const seen = new Set([name.trim().toUpperCase()]);
  const out: string[] = [];
  for (const a of aliases) {
    const t = a.trim();
    const key = t.toUpperCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
```

`packages/script/src/edit/ids.ts`:

```ts
import { slugId } from '../characters';
import type { Script } from '../types';

/** The highest n among unit ids of the form `u<n>` (the importer's and carryOver's pattern). */
export function maxUnitNumber(script: Script): number {
  let n = 0;
  for (const u of script.units) n = Math.max(n, Number(/^u(\d+)$/.exec(u.id)?.[1] ?? 0));
  return n;
}

export const nextUnitId = (script: Script): string => `u${maxUnitNumber(script) + 1}`;

/** `slugId(name)`, made unique with -2, -3 … among the script's characters. */
export function uniqueCharacterId(script: Script, name: string): string {
  const base = slugId(name);
  const used = new Set(script.characters.map((c) => c.id));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}
```

- [ ] **Step 6: Write `unit-ops.ts`**

```ts
import type { Script, Unit } from '../types';
import { nextUnitId } from './ids';
import { EditError, type EditOp } from './ops';
import { asKind, confirmed, indexOfUnit, replaceUnit, requireUnits, withRanges, withUnits } from './util';

export const SCENE_BREAK_TEXT = '* * *';

export function confirm(script: Script, unitIds: readonly string[]): Script {
  const ids = requireUnits(script, unitIds);
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? confirmed(u) : u)));
}

export function setKind(script: Script, unitIds: readonly string[], kind: Extract<EditOp, { type: 'setKind' }>['kind']): Script {
  const ids = requireUnits(script, unitIds);
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? asKind(u, kind) : u)));
}

export function editText(script: Script, unitId: string, text: string): Script {
  const i = indexOfUnit(script, unitId);
  const t = text.trim();
  if (!t) throw new EditError('A unit needs some text; use Remove to delete it.');
  return replaceUnit(script, i, withRanges({ ...script.units[i], text: t, tagConfidence: 1 }, []));
}

export function remove(script: Script, unitIds: readonly string[]): Script {
  const ids = requireUnits(script, unitIds);
  if (ids.size >= script.units.length) throw new EditError('A script needs at least one unit.');
  return withUnits(script, script.units.filter((u) => !ids.has(u.id)));
}

export function setCut(script: Script, unitIds: readonly string[], cut: boolean): Script {
  const ids = requireUnits(script, unitIds);
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? { ...u, cut, tagConfidence: 1 } : u)));
}

export function insertSceneBreak(script: Script, beforeUnitId: string): Script {
  const i = indexOfUnit(script, beforeUnitId);
  const unit: Unit = {
    id: nextUnitId(script),
    kind: 'sceneBreak',
    text: SCENE_BREAK_TEXT,
    cut: false,
    tagConfidence: 1,
    source: script.units[i].source.slice(0, 1),
  };
  const units = script.units.slice();
  units.splice(i, 0, unit);
  return withUnits(script, units);
}

export function removeSceneBreak(script: Script, unitId: string): Script {
  const i = indexOfUnit(script, unitId);
  if (script.units[i].kind !== 'sceneBreak') throw new EditError('That unit is not a scene break.');
  return remove(script, [unitId]);
}
```

- [ ] **Step 7: Write `apply.ts`**

```ts
import type { Script } from '../types';
import { EditError, type EditOp } from './ops';
import { confirm, editText, insertSceneBreak, remove, removeSceneBreak, setCut, setKind } from './unit-ops';

export interface EditOptions {
  /** Character ids never pruned: the production's cast-list keys. */
  keep?: readonly string[];
}

function dialogueCounts(script: Script): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of script.units) if (u.kind === 'dialogue' && u.characterId) counts.set(u.characterId, (counts.get(u.characterId) ?? 0) + 1);
  return counts;
}

/** Removes characters with no dialogue, unless their id is in `keep`. */
export function pruneCharacters(script: Script, keep: readonly string[]): Script {
  const has = dialogueCounts(script);
  const characters = script.characters.filter((c) => has.has(c.id) || keep.includes(c.id));
  return characters.length === script.characters.length ? script : { ...script, characters };
}

/** Removes only the characters this edit emptied (they had dialogue before and have none after). */
function pruneEmptied(before: Script, after: Script, keep: readonly string[]): Script {
  if (after === before) return after;
  const had = dialogueCounts(before);
  const has = dialogueCounts(after);
  const characters = after.characters.filter((c) => !(had.has(c.id) && !has.has(c.id) && !keep.includes(c.id)));
  return characters.length === after.characters.length ? after : { ...after, characters };
}

function applyOne(script: Script, op: Exclude<EditOp, { type: 'batch' }>): Script {
  switch (op.type) {
    case 'confirm':
      return confirm(script, op.unitIds);
    case 'setKind':
      return setKind(script, op.unitIds, op.kind);
    case 'editText':
      return editText(script, op.unitId, op.text);
    case 'remove':
      return remove(script, op.unitIds);
    case 'setCut':
      return setCut(script, op.unitIds, op.cut);
    case 'insertSceneBreak':
      return insertSceneBreak(script, op.beforeUnitId);
    case 'removeSceneBreak':
      return removeSceneBreak(script, op.unitId);
    default:
      // Transitional until Tasks 3 and 4 add the remaining ops; Task 4 replaces this with an exhaustive check.
      throw new EditError(`${op.type} is not available yet.`);
  }
}

/** Spec §6.2: applies one op (a batch is one undo step) and returns a new script; throws EditError, leaving `script` unchanged. */
export function applyEdit(script: Script, op: EditOp, opts: EditOptions = {}): Script {
  if (op.type === 'batch') return op.ops.reduce((s, o) => applyEdit(s, o, opts), script);
  return pruneEmptied(script, applyOne(script, op), opts.keep ?? []);
}
```

- [ ] **Step 8: Export from `index.ts`**

```ts
export { EditError } from './edit/ops';
export type { EditOp } from './edit/ops';
export { applyEdit, pruneCharacters } from './edit/apply';
export type { EditOptions } from './edit/apply';
export { maxUnitNumber, nextUnitId, uniqueCharacterId } from './edit/ids';
export { SCENE_BREAK_TEXT } from './edit/unit-ops';
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run packages/script && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/script
git commit -m "feat(script): edit operations core (confirm, kinds, text, remove, cuts, scene breaks)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Speaker and character operations

**Files:**
- Create: `packages/script/src/edit/speaker-ops.ts`
- Modify: `packages/script/src/edit/apply.ts`, `packages/script/src/index.ts`
- Test: `packages/script/test/edit/speaker-ops.test.ts`

**Interfaces:**
- Consumes: Task 2's `util.ts`, `ids.ts`, `EditOp`, `applyEdit`; `normalizeCueToken` from `../cues`; `UnitHint` (Task 1).
- Produces: `speechReach(units: readonly Unit[], i: number): number[]`; `aliasSpeeches(script: Script, hints: Readonly<Record<string, UnitHint>>, characterId: string, alias: string): string[]`; ops `speechBy`, `newCharacter`, `setName`, `moveSpeeches`, `renameCharacter`, `editAliases`, `mergeCharacters`, `splitAlias` live in `applyEdit`.

- [ ] **Step 1: Write the failing tests**

`packages/script/test/edit/speaker-ops.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../src/edit/apply';
import { uniqueCharacterId } from '../../src/edit/ids';
import { EditError } from '../../src/edit/ops';
import { aliasSpeeches, speechReach } from '../../src/edit/speaker-ops';
import type { Script } from '../../src/types';
import { byId, scene, unit } from './fixture';

const charIds = (s: Script): string[] => s.characters.map((c) => c.id);

describe('speechReach', () => {
  it('is the dialogue after a unit up to the next name, heading or scene break', () => {
    expect(speechReach(scene().units, 6)).toEqual([7]);
    expect(speechReach(scene().units, 0)).toEqual([]);
  });
});

describe('speechBy', () => {
  it('turns a missed speech into dialogue by the chosen character', () => {
    const next = applyEdit(scene(), { type: 'speechBy', unitIds: ['u2'], characterId: 'lane' });
    expect(byId(next, 'u2')).toMatchObject({ kind: 'dialogue', characterId: 'lane', tagConfidence: 1 });
  });

  it('on a fake name ("OKAY.") reassigns the speech that followed and prunes the fake character', () => {
    const next = applyEdit(scene(), { type: 'speechBy', unitIds: ['u7'], characterId: 'lane' });
    expect(byId(next, 'u7')).toMatchObject({ kind: 'dialogue', characterId: 'lane', text: 'OKAY.' });
    expect(byId(next, 'u8')).toMatchObject({ characterId: 'lane', tagConfidence: 1 });
    expect(charIds(next)).toEqual(['algernon', 'lane']);
  });

  it('refuses an unknown character', () => {
    expect(() => applyEdit(scene(), { type: 'speechBy', unitIds: ['u2'], characterId: 'jack' })).toThrow(EditError);
  });
});

describe('newCharacter', () => {
  it('adds a character that a batched speechBy can use', () => {
    const s = scene();
    const id = uniqueCharacterId(s, 'Lady Bracknell');
    const next = applyEdit(s, {
      type: 'batch',
      ops: [
        { type: 'newCharacter', id, name: ' Lady Bracknell ' },
        { type: 'speechBy', unitIds: ['u2'], characterId: id },
      ],
    });
    expect(next.characters.find((c) => c.id === id)).toEqual({ id: 'lady-bracknell', name: 'Lady Bracknell', aliases: [] });
    expect(byId(next, 'u2').characterId).toBe('lady-bracknell');
  });

  it('refuses a used id or an empty name', () => {
    expect(() => applyEdit(scene(), { type: 'newCharacter', id: 'lane', name: 'Lane' })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'newCharacter', id: 'x', name: '  ' })).toThrow(EditError);
  });
});

describe('setName', () => {
  it('makes a unit a character name and gives the following speech to that character', () => {
    const next = applyEdit(scene(), { type: 'setName', unitId: 'u7', characterId: 'algernon' });
    expect(byId(next, 'u7')).toMatchObject({ kind: 'characterName', tagConfidence: 1 });
    expect(byId(next, 'u7').characterId).toBeUndefined();
    expect(byId(next, 'u8').characterId).toBe('algernon');
    expect(charIds(next)).toEqual(['algernon', 'lane']);
  });
});

describe('moveSpeeches', () => {
  it('reassigns selected speeches and refuses non-speech units', () => {
    expect(byId(applyEdit(scene(), { type: 'moveSpeeches', unitIds: ['u10'], characterId: 'lane' }), 'u10').characterId).toBe('lane');
    expect(() => applyEdit(scene(), { type: 'moveSpeeches', unitIds: ['u9'], characterId: 'lane' })).toThrow(EditError);
  });
});

describe('character edits', () => {
  it('renames without changing the id', () => {
    const next = applyEdit(scene(), { type: 'renameCharacter', characterId: 'okay', name: 'Mrs Okay' });
    expect(next.characters.find((c) => c.id === 'okay')!.name).toBe('Mrs Okay');
    expect(() => applyEdit(scene(), { type: 'renameCharacter', characterId: 'okay', name: ' ' })).toThrow(EditError);
  });

  it('cleans aliases: trimmed, de-duplicated, never the name itself', () => {
    const next = applyEdit(scene(), { type: 'editAliases', characterId: 'algernon', aliases: ['algy', ' ALGY ', '', 'Algernon', 'MONCRIEFF'] });
    expect(next.characters.find((c) => c.id === 'algernon')!.aliases).toEqual(['algy', 'MONCRIEFF']);
  });

  it('merges one character into another', () => {
    const next = applyEdit(scene(), { type: 'mergeCharacters', fromId: 'okay', intoId: 'lane' });
    expect(byId(next, 'u8').characterId).toBe('lane');
    expect(next.characters.find((c) => c.id === 'lane')!.aliases).toEqual(['OKAY']);
    expect(charIds(next)).toEqual(['algernon', 'lane']);
    expect(() => applyEdit(scene(), { type: 'mergeCharacters', fromId: 'lane', intoId: 'lane' })).toThrow(EditError);
  });
});

describe('splitAlias', () => {
  const capulets = (): Script => ({
    title: 'R&J',
    characters: [{ id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: ['CAPULET'] }],
    units: [
      unit('u1', 'characterName', 'CAPULET.'),
      unit('u2', 'dialogue', 'Welcome, gentlemen!', { characterId: 'capulet-s-cousin' }),
      unit('u3', 'characterName', "CAPULET'S COUSIN."),
      unit('u4', 'dialogue', "By'r lady, thirty years.", { characterId: 'capulet-s-cousin' }),
    ],
  });

  it('finds the speeches cued by an alias through name units', () => {
    expect(aliasSpeeches(capulets(), {}, 'capulet-s-cousin', 'CAPULET')).toEqual(['u2']);
  });

  it('finds inline-cued speeches through hints (MAX → MAXINE)', () => {
    const s: Script = {
      title: 'T',
      characters: [{ id: 'maxine', name: 'MAXINE', aliases: ['MAX'] }],
      units: [unit('u1', 'dialogue', 'Hi.', { characterId: 'maxine' }), unit('u2', 'dialogue', 'Bye.', { characterId: 'maxine' })],
    };
    const hints = { u1: { band: 72, italic: false, cue: 'MAX' }, u2: { band: 72, italic: false, cue: 'MAXINE' } };
    expect(aliasSpeeches(s, hints, 'maxine', 'max')).toEqual(['u1']);
  });

  it('splits an alias out into its own character with its speeches', () => {
    const s = capulets();
    const newId = uniqueCharacterId(s, 'CAPULET');
    const next = applyEdit(s, { type: 'splitAlias', characterId: 'capulet-s-cousin', alias: 'capulet', newId, unitIds: ['u2'] });
    expect(next.characters).toEqual([
      { id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: [] },
      { id: 'capulet', name: 'CAPULET', aliases: [] },
    ]);
    expect(byId(next, 'u2').characterId).toBe('capulet');
    expect(byId(next, 'u4').characterId).toBe('capulet-s-cousin');
  });

  it('refuses an alias the character does not have', () => {
    expect(() => applyEdit(capulets(), { type: 'splitAlias', characterId: 'capulet-s-cousin', alias: 'TYBALT', newId: 'tybalt', unitIds: [] })).toThrow(EditError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/edit/speaker-ops.test.ts`
Expected: FAIL — `speaker-ops` not found / ops "not available yet".

- [ ] **Step 3: Write `speaker-ops.ts`**

```ts
import { normalizeCueToken } from '../cues';
import type { Script, Unit, UnitHint, UnitKind } from '../types';
import { EditError } from './ops';
import { asKind, cleanAliases, indexOfUnit, requireCharacter, requireUnits, withUnits } from './util';

const SPEECH_ENDS: ReadonlySet<UnitKind> = new Set(['characterName', 'heading', 'sceneBreak', 'frontMatter']);

/** Indices of the dialogue units after unit i, up to the next name, heading, scene break or front matter. */
export function speechReach(units: readonly Unit[], i: number): number[] {
  const out: number[] = [];
  for (let k = i + 1; k < units.length; k++) {
    if (SPEECH_ENDS.has(units[k].kind)) break;
    if (units[k].kind === 'dialogue') out.push(k);
  }
  return out;
}

const speak = (u: Unit, characterId: string): Unit => ({ ...u, kind: 'dialogue', characterId, tagConfidence: 1 });

export function speechBy(script: Script, unitIds: readonly string[], characterId: string): Script {
  requireCharacter(script, characterId);
  requireUnits(script, unitIds);
  const units = script.units.slice();
  for (const id of unitIds) {
    const i = units.findIndex((u) => u.id === id);
    if (units[i].kind === 'characterName') for (const k of speechReach(units, i)) units[k] = speak(units[k], characterId);
    units[i] = speak(units[i], characterId);
  }
  return withUnits(script, units);
}

export function newCharacter(script: Script, id: string, name: string): Script {
  const n = name.trim();
  if (!n) throw new EditError('A character needs a name.');
  if (!id || script.characters.some((c) => c.id === id)) throw new EditError(`The character id ${id} is already used.`);
  return { ...script, characters: [...script.characters, { id, name: n, aliases: [] }] };
}

export function setName(script: Script, unitId: string, characterId: string): Script {
  requireCharacter(script, characterId);
  const i = indexOfUnit(script, unitId);
  const units = script.units.slice();
  units[i] = asKind(units[i], 'characterName');
  for (const k of speechReach(units, i)) units[k] = speak(units[k], characterId);
  return withUnits(script, units);
}

export function moveSpeeches(script: Script, unitIds: readonly string[], characterId: string): Script {
  requireCharacter(script, characterId);
  const ids = requireUnits(script, unitIds);
  if (script.units.some((u) => ids.has(u.id) && u.kind !== 'dialogue')) throw new EditError('Only speeches can be moved to a character.');
  return withUnits(script, script.units.map((u) => (ids.has(u.id) ? speak(u, characterId) : u)));
}

export function renameCharacter(script: Script, characterId: string, name: string): Script {
  requireCharacter(script, characterId);
  const n = name.trim();
  if (!n) throw new EditError('A character needs a name.');
  return { ...script, characters: script.characters.map((c) => (c.id === characterId ? { ...c, name: n, aliases: cleanAliases(c.aliases, n) } : c)) };
}

export function editAliases(script: Script, characterId: string, aliases: readonly string[]): Script {
  const c = requireCharacter(script, characterId);
  return { ...script, characters: script.characters.map((x) => (x.id === characterId ? { ...x, aliases: cleanAliases(aliases, c.name) } : x)) };
}

export function mergeCharacters(script: Script, fromId: string, intoId: string): Script {
  if (fromId === intoId) throw new EditError('Pick a different character to merge into.');
  const from = requireCharacter(script, fromId);
  const into = requireCharacter(script, intoId);
  const aliases = cleanAliases([...into.aliases, from.name, ...from.aliases], into.name);
  return {
    ...script,
    characters: script.characters.filter((c) => c.id !== fromId).map((c) => (c.id === intoId ? { ...c, aliases } : c)),
    units: script.units.map((u) => (u.kind === 'dialogue' && u.characterId === fromId ? speak(u, intoId) : u)),
  };
}

export function splitAlias(script: Script, characterId: string, alias: string, newId: string, unitIds: readonly string[]): Script {
  const c = requireCharacter(script, characterId);
  const match = c.aliases.find((a) => a.toUpperCase() === alias.trim().toUpperCase());
  if (!match) throw new EditError(`${alias} is not an alias of ${c.name}.`);
  if (script.characters.some((x) => x.id === newId)) throw new EditError(`The character id ${newId} is already used.`);
  const ids = new Set(unitIds);
  for (const id of ids) {
    const u = script.units[indexOfUnit(script, id)];
    if (u.kind !== 'dialogue' || u.characterId !== characterId) throw new EditError(`Unit ${id} is not a speech by ${c.name}.`);
  }
  const characters = script.characters.flatMap((x) =>
    x.id === characterId ? [{ ...x, aliases: x.aliases.filter((a) => a !== match) }, { id: newId, name: match, aliases: [] }] : [x],
  );
  return { ...script, characters, units: script.units.map((u) => (ids.has(u.id) ? speak(u, newId) : u)) };
}

/** Speeches by `characterId` that were cued by `alias`: through a name unit, or (inline cues) through the import hints. */
export function aliasSpeeches(script: Script, hints: Readonly<Record<string, UnitHint>>, characterId: string, alias: string): string[] {
  const token = normalizeCueToken(alias);
  const found = new Set<string>();
  script.units.forEach((u, i) => {
    if (u.kind === 'dialogue' && u.characterId === characterId && hints[u.id]?.cue === token) found.add(u.id);
    if (u.kind === 'characterName' && normalizeCueToken(u.text) === token) {
      for (const k of speechReach(script.units, i)) if (script.units[k].characterId === characterId) found.add(script.units[k].id);
    }
  });
  return script.units.filter((u) => found.has(u.id)).map((u) => u.id);
}
```

- [ ] **Step 4: Add the cases to `applyOne` in `apply.ts`**

Import the functions and add, above `default`:

```ts
    case 'speechBy':
      return speechBy(script, op.unitIds, op.characterId);
    case 'newCharacter':
      return newCharacter(script, op.id, op.name);
    case 'setName':
      return setName(script, op.unitId, op.characterId);
    case 'moveSpeeches':
      return moveSpeeches(script, op.unitIds, op.characterId);
    case 'renameCharacter':
      return renameCharacter(script, op.characterId, op.name);
    case 'editAliases':
      return editAliases(script, op.characterId, op.aliases);
    case 'mergeCharacters':
      return mergeCharacters(script, op.fromId, op.intoId);
    case 'splitAlias':
      return splitAlias(script, op.characterId, op.alias, op.newId, op.unitIds);
```

- [ ] **Step 5: Export from `index.ts`**

```ts
export { aliasSpeeches, speechReach } from './edit/speaker-ops';
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run packages/script && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/script
git commit -m "feat(script): speaker and character edit operations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Word operations (split, join, partial cuts, overlap)

**Files:**
- Create: `packages/script/src/edit/word-ops.ts`
- Modify: `packages/script/src/overlap.ts` (export `normaliseRanges`), `packages/script/src/edit/apply.ts`
- Test: `packages/script/test/edit/word-ops.test.ts`

**Interfaces:**
- Consumes: `wordSpans` (Task 1), Task 2 helpers, `setCut` from `unit-ops.ts`.
- Produces: ops `split`, `join`, `setCutWords`, `setOverlap` in `applyEdit`; `normaliseRanges(ranges)` exported from `overlap.ts` (not from the package index).

- [ ] **Step 1: Write the failing tests**

`packages/script/test/edit/word-ops.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../src/edit/apply';
import { EditError } from '../../src/edit/ops';
import { byId, ids, scene } from './fixture';

describe('split', () => {
  it('splits before a word; the second piece gets the next id and keeps kind, speaker and source', () => {
    const next = applyEdit(scene(), { type: 'split', unitId: 'u4', atWord: 3 });
    expect(ids(next).slice(3, 5)).toEqual(['u4', 'u11']);
    expect(byId(next, 'u4')).toMatchObject({ text: 'Did you hear', characterId: 'algernon', tagConfidence: 1 });
    expect(byId(next, 'u11')).toMatchObject({ text: 'what I was playing, Lane?', characterId: 'algernon', kind: 'dialogue', source: [{ page: 1, line: 4 }] });
  });

  it('divides overlap ranges between the pieces', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], overlapRanges: [[1, 4]] };
    const next = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 2 });
    expect(byId(next, 'u4').overlapRanges).toEqual([[1, 2]]);
    expect(byId(next, 'u11').overlapRanges).toEqual([[0, 2]]);
  });

  it('refuses a split at the first word or past the last', () => {
    expect(() => applyEdit(scene(), { type: 'split', unitId: 'u4', atWord: 0 })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'split', unitId: 'u4', atWord: 8 })).toThrow(EditError);
  });
});

describe('join', () => {
  it('undoes a split, restoring text and overlap ranges', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], overlapRanges: [[1, 4]] };
    const split = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 2 });
    const joined = applyEdit(split, { type: 'join', unitId: 'u11' });
    expect(byId(joined, 'u4')).toMatchObject({ text: s.units[3].text, overlapRanges: [[1, 4]] });
    expect(byId(joined, 'u4').source).toEqual([{ page: 1, line: 4 }, { page: 1, line: 4 }]);
    expect(ids(joined)).toEqual(ids(s));
  });

  it('keeps the first unit’s kind and speaker', () => {
    const next = applyEdit(scene(), { type: 'join', unitId: 'u8' });
    expect(byId(next, 'u7')).toMatchObject({ kind: 'characterName', text: "OKAY. I'm sorry for that, for your sake." });
    expect(byId(next, 'u7').characterId).toBeUndefined();
  });

  it('refuses the first unit', () => {
    expect(() => applyEdit(scene(), { type: 'join', unitId: 'u1' })).toThrow(EditError);
  });
});

describe('setCutWords', () => {
  it('cuts words in the middle of a speech by splitting around them', () => {
    const next = applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 2, to: 4, cut: true });
    const piece = next.units.slice(3, 6).map((u) => [u.text, u.cut]);
    expect(piece).toEqual([
      ['Did you', false],
      ['hear what', true],
      ['I was playing, Lane?', false],
    ]);
  });

  it('cuts the start of a speech with one split, and a whole speech with none', () => {
    const start = applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 0, to: 2, cut: true });
    expect(start.units.slice(3, 5).map((u) => [u.text, u.cut])).toEqual([
      ['Did you', true],
      ['hear what I was playing, Lane?', false],
    ]);
    const whole = applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 0, to: 8, cut: true });
    expect(ids(whole)).toEqual(ids(scene()));
    expect(byId(whole, 'u4').cut).toBe(true);
  });

  it('refuses an empty or out-of-range selection', () => {
    expect(() => applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 3, to: 3, cut: true })).toThrow(EditError);
    expect(() => applyEdit(scene(), { type: 'setCutWords', unitId: 'u4', from: 0, to: 9, cut: true })).toThrow(EditError);
  });
});

describe('setOverlap', () => {
  it('adds, merges and removes overlap ranges on speech', () => {
    const on = applyEdit(scene(), { type: 'setOverlap', unitId: 'u4', from: 1, to: 3, on: true });
    const more = applyEdit(on, { type: 'setOverlap', unitId: 'u4', from: 3, to: 5, on: true });
    expect(byId(more, 'u4').overlapRanges).toEqual([[1, 5]]);
    const less = applyEdit(more, { type: 'setOverlap', unitId: 'u4', from: 2, to: 4, on: false });
    expect(byId(less, 'u4').overlapRanges).toEqual([
      [1, 2],
      [4, 5],
    ]);
    const none = applyEdit(less, { type: 'setOverlap', unitId: 'u4', from: 0, to: 8, on: false });
    expect(byId(none, 'u4').overlapRanges).toBeUndefined();
  });

  it('refuses non-speech units', () => {
    expect(() => applyEdit(scene(), { type: 'setOverlap', unitId: 'u2', from: 0, to: 1, on: true })).toThrow(/speech/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/edit/word-ops.test.ts`
Expected: FAIL — ops "not available yet".

- [ ] **Step 3: Export `normaliseRanges` from `overlap.ts`**

Rename the private `normalise` to an exported `normaliseRanges` (and update its one call site in `applyOverlapMarks`):

```ts
/** Sorts ranges and merges those that overlap or touch, so they are strictly increasing. */
export function normaliseRanges(ranges: Array<[number, number]>): Array<[number, number]> {
```

- [ ] **Step 4: Write `word-ops.ts`**

```ts
import { normaliseRanges } from '../overlap';
import type { Script } from '../types';
import { wordSpans } from '../words';
import { nextUnitId } from './ids';
import { EditError } from './ops';
import { setCut } from './unit-ops';
import { indexOfUnit, replaceUnit, withRanges, withUnits } from './util';

type Range = [number, number];

function checkRange(from: number, to: number, count: number, message: string): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > count) throw new EditError(message);
}

export function split(script: Script, unitId: string, atWord: number): Script {
  const i = indexOfUnit(script, unitId);
  const u = script.units[i];
  const spans = wordSpans(u.text);
  if (!Number.isInteger(atWord) || atWord < 1 || atWord >= spans.length) throw new EditError('Pick a word after the first one to split before.');
  const at = spans[atWord][0];
  const first: Range[] = [];
  const second: Range[] = [];
  for (const [a, b] of u.overlapRanges ?? []) {
    if (a < atWord) first.push([a, Math.min(b, atWord)]);
    if (b > atWord) second.push([Math.max(a, atWord) - atWord, b - atWord]);
  }
  const units = script.units.slice();
  units.splice(
    i,
    1,
    withRanges({ ...u, text: u.text.slice(0, at).trimEnd(), tagConfidence: 1 }, first),
    withRanges({ ...u, id: nextUnitId(script), text: u.text.slice(at), source: [...u.source], tagConfidence: 1 }, second),
  );
  return withUnits(script, units);
}

export function join(script: Script, unitId: string): Script {
  const i = indexOfUnit(script, unitId);
  if (i === 0) throw new EditError('There is nothing before this unit to join it to.');
  const prev = script.units[i - 1];
  const u = script.units[i];
  const offset = wordSpans(prev.text).length;
  const ranges =
    prev.kind === 'dialogue' ? normaliseRanges([...(prev.overlapRanges ?? []), ...(u.overlapRanges ?? []).map(([a, b]): Range => [a + offset, b + offset])]) : [];
  const joined = withRanges({ ...prev, text: `${prev.text} ${u.text}`, source: [...prev.source, ...u.source], tagConfidence: 1 }, ranges);
  const units = script.units.slice();
  units.splice(i - 1, 2, joined);
  return withUnits(script, units);
}

export function setCutWords(script: Script, unitId: string, from: number, to: number, cut: boolean): Script {
  const count = wordSpans(script.units[indexOfUnit(script, unitId)].text).length;
  checkRange(from, to, count, 'Select the words to cut.');
  if (from === 0 && to === count) return setCut(script, [unitId], cut);
  let s = to < count ? split(script, unitId, to) : script;
  let target = unitId;
  if (from > 0) {
    s = split(s, unitId, from);
    target = s.units[indexOfUnit(s, unitId) + 1].id;
  }
  return setCut(s, [target], cut);
}

function subtract(ranges: readonly Range[], from: number, to: number): Range[] {
  const out: Range[] = [];
  for (const [a, b] of ranges) {
    if (b <= from || a >= to) out.push([a, b]);
    else {
      if (a < from) out.push([a, from]);
      if (b > to) out.push([to, b]);
    }
  }
  return out;
}

export function setOverlap(script: Script, unitId: string, from: number, to: number, on: boolean): Script {
  const i = indexOfUnit(script, unitId);
  const u = script.units[i];
  if (u.kind !== 'dialogue') throw new EditError('Overlap can only be marked on speech.');
  checkRange(from, to, wordSpans(u.text).length, 'Select the overlapping words.');
  const current = u.overlapRanges ?? [];
  const ranges = on ? normaliseRanges([...current, [from, to]]) : subtract(current, from, to);
  return replaceUnit(script, i, withRanges({ ...u, tagConfidence: 1 }, ranges));
}
```

- [ ] **Step 5: Finish the dispatcher in `apply.ts`**

Import `join, setCutWords, setOverlap, split` from `./word-ops`, add the four cases, and replace the transitional `default` with an exhaustive check (remove the now-unused `EditError` import if ESLint flags it):

```ts
    case 'split':
      return split(script, op.unitId, op.atWord);
    case 'join':
      return join(script, op.unitId);
    case 'setCutWords':
      return setCutWords(script, op.unitId, op.from, op.to, op.cut);
    case 'setOverlap':
      return setOverlap(script, op.unitId, op.from, op.to, op.on);
    default: {
      const never: never = op;
      return never;
    }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run packages/script && npm run typecheck && npx eslint .`
Expected: PASS (including the existing overlap tests).

- [ ] **Step 7: Commit**

```bash
git add packages/script
git commit -m "feat(script): split, join, partial cuts and overlap marks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Check queue, similar units and appending scripts

**Files:**
- Create: `packages/script/src/edit/check.ts`, `src/edit/similar.ts`, `src/edit/append.ts`
- Modify: `packages/script/src/index.ts`
- Test: `packages/script/test/edit/check.test.ts`

**Interfaces:**
- Consumes: `speechReach` (Task 3), `maxUnitNumber`, `cleanAliases` (Task 2), `FLAG_BELOW`, `normalizeCueToken`.
- Produces:
  - `type CheckReason = 'newCharacter' | 'noSpeaker' | 'heading' | 'unsure'`; `interface CheckItem { unitId: string; kind: UnitKind; reason: CheckReason }`; `checkQueue(script: Script): CheckItem[]`.
  - `similarUnits(script: Script, hints: Readonly<Record<string, UnitHint>>, unitId: string): string[]`.
  - `appendScripts(a: Script, b: Script, pageOffset: number): Script` (units of `b` keep their order after `a`'s, so `b.units[k]` becomes `result.units[a.units.length + k]`).

- [ ] **Step 1: Write the failing tests**

`packages/script/test/edit/check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../src/edit/apply';
import { appendScripts } from '../../src/edit/append';
import { checkQueue } from '../../src/edit/check';
import { similarUnits } from '../../src/edit/similar';
import type { Script, UnitHint } from '../../src/types';
import { scene, unit } from './fixture';

describe('checkQueue', () => {
  it('lists unsure units in script order with a reason', () => {
    expect(checkQueue(scene())).toEqual([
      { unitId: 'u1', kind: 'heading', reason: 'heading' },
      { unitId: 'u7', kind: 'characterName', reason: 'newCharacter' },
      { unitId: 'u8', kind: 'dialogue', reason: 'newCharacter' },
    ]);
  });

  it('flags a speech without a speaker, and drops items once confirmed', () => {
    const s = scene();
    s.units[9] = { ...s.units[9], characterId: undefined, tagConfidence: 0.3 };
    expect(checkQueue(s).find((q) => q.unitId === 'u10')?.reason).toBe('noSpeaker');
    const fixed = applyEdit(s, { type: 'confirm', unitIds: ['u1', 'u7', 'u8', 'u10'] });
    expect(checkQueue(fixed)).toEqual([]);
  });

  it('calls other unsure units "unsure"', () => {
    const s = scene();
    s.units[1] = { ...s.units[1], tagConfidence: 0.5 };
    expect(checkQueue(s)[1]).toEqual({ unitId: 'u2', kind: 'direction', reason: 'unsure' });
  });
});

describe('similarUnits', () => {
  // word-3: missed speeches all sat on one leading-tab band and were read as directions.
  const tabbed = (): Script => ({
    title: 'T',
    characters: [],
    units: [
      unit('u1', 'direction', 'I told you so.'),
      unit('u2', 'direction', 'You never did.'),
      unit('u3', 'direction', '(She exits.)'),
      unit('u4', 'direction', 'Yes I did.'),
    ],
  });
  const hints: Record<string, UnitHint> = {
    u1: { band: 36, italic: false },
    u2: { band: 36, italic: false },
    u3: { band: 72, italic: true },
    u4: { band: 36, italic: false },
  };

  it('finds the other unsure units with the same reason, kind and band', () => {
    expect(similarUnits(tabbed(), hints, 'u1')).toEqual(['u2', 'u4']);
  });

  it('ignores bands when hints are missing (.dasma imports)', () => {
    expect(similarUnits(tabbed(), {}, 'u1')).toEqual(['u2', 'u3', 'u4']);
  });

  it('groups the unsure name units of a fake character', () => {
    const s = scene();
    s.units.push(unit('u11', 'characterName', 'Okay.', { tagConfidence: 0.4 }), unit('u12', 'dialogue', 'Fine.', { characterId: 'lane', tagConfidence: 0.95 }));
    expect(similarUnits(s, {}, 'u7')).toEqual([]);
    const two: Script = { ...s, units: s.units.map((u) => (u.id === 'u12' ? { ...u, characterId: 'okay', tagConfidence: 0.5 } : u)) };
    expect(similarUnits(two, {}, 'u7')).toEqual(['u11']);
  });

  it('returns nothing for a unit that is not in the queue', () => {
    expect(similarUnits(scene(), {}, 'u4')).toEqual([]);
  });

  it('lets split pieces inherit the hint of the unit they came from (spec §4)', () => {
    const s = tabbed();
    s.units.push({ ...s.units[3], id: 'u5', text: 'Again.' }); // the second piece of a split shares u4's source
    s.units.push(unit('u6', 'direction', 'Later.', { source: [{ page: 2, line: 1 }] }));
    expect(similarUnits(s, hints, 'u1')).toEqual(['u2', 'u4', 'u5', 'u6']);
    expect(similarUnits(s, { ...hints, u6: { band: 72, italic: true } }, 'u1')).toEqual(['u2', 'u4', 'u5']);
  });
});

describe('appendScripts', () => {
  it('renumbers the second script’s units, shifts its pages and merges characters', () => {
    const b: Script = {
      title: 'Act 2',
      characters: [
        { id: 'lane', name: 'LANE', aliases: ['L'] },
        { id: 'jack', name: 'JACK', aliases: [] },
      ],
      units: [unit('u1', 'characterName', 'JACK'), unit('u2', 'dialogue', 'Hello.', { characterId: 'jack' })],
    };
    const joined = appendScripts(scene(), b, 3);
    expect(joined.title).toBe('Earnest');
    expect(joined.units.slice(10).map((u) => [u.id, u.source[0].page])).toEqual([
      ['u11', 4],
      ['u12', 4],
    ]);
    expect(joined.characters.map((c) => [c.id, c.aliases])).toEqual([
      ['algernon', ['ALGY']],
      ['lane', ['L']],
      ['okay', []],
      ['jack', []],
    ]);
  });
});
```

In the last `similarUnits` case `okay` gains a second speech, so no unit is `newCharacter`; the two `OKAY` name units are then similar through the shared reason (`unsure`) and kind.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/script/test/edit/check.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `check.ts`**

```ts
import type { Script, Unit, UnitKind } from '../types';
import { FLAG_BELOW } from '../weights';
import { speechReach } from './speaker-ops';

export type CheckReason = 'newCharacter' | 'noSpeaker' | 'heading' | 'unsure';

export interface CheckItem {
  unitId: string;
  kind: UnitKind;
  reason: CheckReason;
}

/** Speeches per character: a speech starts at a dialogue unit whose character differs from the speech before it. */
export function speechCounts(script: Script): Map<string, number> {
  const counts = new Map<string, number>();
  let current: string | null = null;
  for (const u of script.units) {
    if (u.kind === 'characterName' || u.kind === 'heading' || u.kind === 'sceneBreak' || u.kind === 'frontMatter') current = null;
    if (u.kind !== 'dialogue' || !u.characterId) continue;
    if (u.characterId !== current) counts.set(u.characterId, (counts.get(u.characterId) ?? 0) + 1);
    current = u.characterId;
  }
  return counts;
}

/** The character a dialogue unit belongs to, or the one a name unit cues. */
export function speakerOf(units: readonly Unit[], i: number): string | undefined {
  const u = units[i];
  if (u.kind === 'dialogue') return u.characterId;
  if (u.kind === 'characterName') {
    const reach = speechReach(units, i);
    return reach.length ? units[reach[0]].characterId : undefined;
  }
  return undefined;
}

/** Spec §6.1: every unit below FLAG_BELOW, in script order, with the reason shown in the "To check" list. */
export function checkQueue(script: Script): CheckItem[] {
  const counts = speechCounts(script);
  const out: CheckItem[] = [];
  script.units.forEach((u, i) => {
    if (u.tagConfidence >= FLAG_BELOW) return;
    const who = speakerOf(script.units, i);
    let reason: CheckReason = 'unsure';
    if (u.kind === 'dialogue' && !u.characterId) reason = 'noSpeaker';
    else if ((u.kind === 'dialogue' || u.kind === 'characterName') && who && counts.get(who) === 1) reason = 'newCharacter';
    else if (u.kind === 'heading') reason = 'heading';
    out.push({ unitId: u.id, kind: u.kind, reason });
  });
  return out;
}
```

- [ ] **Step 4: Write `similar.ts`**

```ts
import { normalizeCueToken } from '../cues';
import type { Script, Unit, UnitHint } from '../types';
import { checkQueue, speakerOf } from './check';

function nameKey(script: Script, i: number): string | undefined {
  const u = script.units[i];
  if (u.kind === 'characterName') return normalizeCueToken(u.text);
  const who = speakerOf(script.units, i);
  const name = script.characters.find((c) => c.id === who)?.name;
  return name === undefined ? undefined : normalizeCueToken(name);
}

const sameFirstSource = (a: Unit, b: Unit): boolean =>
  !!a.source[0] && !!b.source[0] && a.source[0].page === b.source[0].page && a.source[0].line === b.source[0].line;

/** Spec §4 "hints follow ids": a unit without its own hint (a split piece) takes the hint of the unit before it when both start on the same source line. */
export function effectiveHints(script: Script, hints: Readonly<Record<string, UnitHint>>): Map<string, UnitHint> {
  const out = new Map<string, UnitHint>();
  script.units.forEach((u, i) => {
    const prev = script.units[i - 1];
    const h = hints[u.id] ?? (prev && sameFirstSource(prev, u) ? out.get(prev.id) : undefined);
    if (h) out.set(u.id, h);
  });
  return out;
}

/** Spec §6.4: the other unsure units "like this one" — same reason and kind, same band and italic when both have hints. */
export function similarUnits(script: Script, rawHints: Readonly<Record<string, UnitHint>>, unitId: string): string[] {
  const queue = checkQueue(script);
  const self = queue.find((q) => q.unitId === unitId);
  if (!self) return [];
  const index = new Map(script.units.map((u, i) => [u.id, i]));
  const hints = effectiveHints(script, rawHints);
  const h = hints.get(unitId);
  const key = self.reason === 'newCharacter' ? nameKey(script, index.get(unitId)!) : undefined;
  return queue
    .filter((q) => q.unitId !== unitId && q.reason === self.reason && q.kind === self.kind)
    .filter((q) => {
      const o = hints.get(q.unitId);
      return !h || !o || (o.band === h.band && o.italic === h.italic);
    })
    .filter((q) => self.reason !== 'newCharacter' || nameKey(script, index.get(q.unitId)!) === key)
    .map((q) => q.unitId);
}
```

- [ ] **Step 5: Write `append.ts`**

```ts
import type { Script } from '../types';
import { maxUnitNumber } from './ids';
import { cleanAliases } from './util';

/** Spec §5.2: `b` after `a`. b's unit ids are renumbered above a's, its pages shifted; same-id characters merge. */
export function appendScripts(a: Script, b: Script, pageOffset: number): Script {
  let n = maxUnitNumber(a);
  const tail = b.units.map((u) => ({ ...u, id: `u${++n}`, source: u.source.map((s) => ({ page: s.page + pageOffset, line: s.line })) }));
  const characters = a.characters.map((c) => {
    const other = b.characters.find((x) => x.id === c.id);
    return other ? { ...c, aliases: cleanAliases([...c.aliases, ...other.aliases], c.name) } : c;
  });
  for (const c of b.characters) if (!a.characters.some((x) => x.id === c.id)) characters.push(c);
  return { title: a.title, characters, units: [...a.units, ...tail] };
}
```

- [ ] **Step 6: Export from `index.ts`**

```ts
export { checkQueue, speechCounts } from './edit/check';
export type { CheckItem, CheckReason } from './edit/check';
export { effectiveHints, similarUnits } from './edit/similar';
export { appendScripts } from './edit/append';
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run packages/script && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/script
git commit -m "feat(script): check queue, similar units and appending imports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Answer key shared by the browser and the harness

**Files:**
- Create: `packages/script/src/answer-key.ts`
- Modify: `packages/script/src/index.ts`, `harness/src/script-eval/truth-draft.ts`
- Test: `packages/script/test/answer-key.test.ts` (and the existing `harness/test/script-eval/truth-draft.test.ts` must still pass unchanged)

**Interfaces:**
- Produces: `interface AnswerKeyUnit { kind: UnitKind; characterId?: string; text: string; page: number }`; `interface AnswerKey { pages: number; cast: Character[]; units: AnswerKeyUnit[] }`; `toAnswerKey(script: Script, pages: number): AnswerKey`.

- [ ] **Step 1: Write the failing test**

`packages/script/test/answer-key.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toAnswerKey } from '../src/answer-key';
import { scene, unit } from './edit/fixture';

describe('toAnswerKey', () => {
  it('lists every unit in order with its first source page, and the cast', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], cut: true, source: [{ page: 2, line: 9 }] };
    s.units.push(unit('u11', 'direction', 'Exit.', { source: [] }));
    const key = toAnswerKey(s, 0);
    expect(key.pages).toBe(1);
    expect(key.cast).toEqual(s.characters);
    expect(key.cast[0]).not.toBe(s.characters[0]);
    expect(key.units[3]).toEqual({ kind: 'dialogue', characterId: 'algernon', text: 'Did you hear what I was playing, Lane?', page: 2 });
    expect(key.units[0]).toEqual({ kind: 'heading', text: "Morning-room in Algernon's flat", page: 1 });
    expect(key.units[10].page).toBe(1);
    expect(key.units).toHaveLength(11);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/script/test/answer-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `answer-key.ts`**

```ts
import type { Character, Script, UnitKind } from './types';

export interface AnswerKeyUnit {
  kind: UnitKind;
  characterId?: string;
  text: string;
  page: number;
}

/** The `<name>.truth.json` shape `script-eval --set local` reads. Cuts are not part of import truth. */
export interface AnswerKey {
  pages: number;
  cast: Character[];
  units: AnswerKeyUnit[];
}

export function toAnswerKey(script: Script, pages: number): AnswerKey {
  return {
    pages: Math.max(1, pages),
    cast: script.characters.map((c) => ({ id: c.id, name: c.name, aliases: [...c.aliases] })),
    units: script.units.map((u) => ({
      kind: u.kind,
      ...(u.characterId !== undefined ? { characterId: u.characterId } : {}),
      text: u.text,
      page: Math.max(1, u.source[0]?.page ?? 1),
    })),
  };
}
```

Export it: `export { toAnswerKey } from './answer-key';` and `export type { AnswerKey, AnswerKeyUnit } from './answer-key';`.

- [ ] **Step 4: Rebuild `draftTruth` on it**

Replace the body of `harness/src/script-eval/truth-draft.ts`'s types and `draftTruth` (keep `writeDraftTruth` as is):

```ts
import { FLAG_BELOW, toAnswerKey, type AnswerKey, type AnswerKeyUnit, type ImportResult } from '@dasma/script';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface DraftTruthUnit extends AnswerKeyUnit {
  /** The importer was unsure of this unit (tagConfidence below FLAG_BELOW): check it first. */
  check?: true;
}

/** A local answer key (`<name>.truth.json`, the shape `script-eval --set local` reads) with `check` marks. */
export interface DraftTruth extends AnswerKey {
  units: DraftTruthUnit[];
}

/** The importer's own tags as a starting answer key for a real script; the user corrects it by hand. */
export function draftTruth(result: ImportResult): DraftTruth {
  const key = toAnswerKey(result.script, result.pages);
  return {
    ...key,
    units: key.units.map((u, i) => (result.script.units[i].tagConfidence < FLAG_BELOW ? { ...u, check: true as const } : u)),
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS, including all four `truth-draft.test.ts` tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/script harness/src/script-eval/truth-draft.ts
git commit -m "feat(script): toAnswerKey, shared by the harness draft and the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Property test and the M2a "must carry" fixes

**Files:**
- Test: `packages/script/test/edit/edit.property.test.ts`, `packages/script/test/edit/must-carry.test.ts`

**Interfaces:**
- Consumes: everything exported in Tasks 1–6 through `../../src/index`.

- [ ] **Step 1: Write the property test**

`packages/script/test/edit/edit.property.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyEdit, EditError, readDasma, uniqueCharacterId, wordSpans, writeDasma, type EditOp, type Script } from '../../src/index';

const WORDS = ['to', 'be', 'or', 'not', 'well—no', '’tis', 'lord.', 'sir,'];
const KINDS = ['dialogue', 'direction', 'characterName', 'heading', 'sceneBreak', 'frontMatter'] as const;

const scriptArb = fc
  .array(
    fc.record({
      kind: fc.constantFrom(...KINDS),
      words: fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 6 }),
      who: fc.constantFrom('a', 'b', undefined),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map(
    (us): Script => ({
      title: 'T',
      characters: [
        { id: 'a', name: 'A', aliases: ['AA'] },
        { id: 'b', name: 'B', aliases: [] },
      ],
      units: us.map((u, k) => ({
        id: `u${k + 1}`,
        kind: u.kind,
        text: u.words.join(' '),
        cut: false,
        tagConfidence: 0.5,
        source: [{ page: 1, line: k }],
        ...(u.kind === 'dialogue' && u.who ? { characterId: u.who } : {}),
      })),
    }),
  );

const seedArb = fc.record({ type: fc.nat({ max: 17 }), a: fc.nat(), b: fc.nat(), c: fc.nat(), flag: fc.boolean() });
type Seed = { type: number; a: number; b: number; c: number; flag: boolean };

function toOp(s: Script, x: Seed): EditOp {
  const u = s.units[x.a % s.units.length];
  const n = wordSpans(u.text).length;
  const from = x.b % Math.max(1, n);
  const to = from + 1 + (x.c % Math.max(1, n - from));
  const char = s.characters[x.c % Math.max(1, s.characters.length)]?.id ?? 'a';
  const other = s.characters[(x.c + 1) % Math.max(1, s.characters.length)]?.id ?? 'b';
  switch (x.type) {
    case 0:
      return { type: 'confirm', unitIds: [u.id] };
    case 1:
      return { type: 'setKind', unitIds: [u.id], kind: (['direction', 'heading', 'frontMatter'] as const)[x.b % 3] };
    case 2:
      return { type: 'speechBy', unitIds: [u.id], characterId: char };
    case 3:
      return { type: 'setName', unitId: u.id, characterId: char };
    case 4:
      return { type: 'editText', unitId: u.id, text: x.flag ? 'new words here' : '' };
    case 5:
      return { type: 'split', unitId: u.id, atWord: x.b % (n + 1) };
    case 6:
      return { type: 'join', unitId: u.id };
    case 7:
      return { type: 'remove', unitIds: [u.id] };
    case 8:
      return { type: 'setCut', unitIds: [u.id], cut: x.flag };
    case 9:
      return { type: 'setCutWords', unitId: u.id, from, to, cut: x.flag };
    case 10:
      return { type: 'setOverlap', unitId: u.id, from, to, on: x.flag };
    case 11:
      return { type: 'insertSceneBreak', beforeUnitId: u.id };
    case 12:
      return { type: 'removeSceneBreak', unitId: u.id };
    case 13:
      return { type: 'renameCharacter', characterId: char, name: x.flag ? 'NEW NAME' : '' };
    case 14:
      return { type: 'editAliases', characterId: char, aliases: ['X', 'x', ' '] };
    case 15:
      return { type: 'mergeCharacters', fromId: char, intoId: other };
    case 16: {
      const id = uniqueCharacterId(s, 'Extra');
      return { type: 'batch', ops: [{ type: 'newCharacter', id, name: 'Extra' }, { type: 'speechBy', unitIds: [u.id], characterId: id }] };
    }
    default:
      return { type: 'moveSpeeches', unitIds: [u.id], characterId: char };
  }
}

function expectValid(s: Script): void {
  expect(s.units.length).toBeGreaterThan(0);
  expect(new Set(s.units.map((u) => u.id)).size).toBe(s.units.length);
  const chars = new Set(s.characters.map((c) => c.id));
  expect(chars.size).toBe(s.characters.length);
  for (const u of s.units) {
    expect(u.text.trim()).not.toBe('');
    if (u.characterId !== undefined) {
      expect(u.kind).toBe('dialogue');
      expect(chars.has(u.characterId)).toBe(true);
    }
    if (u.overlapRanges) {
      expect(u.kind).toBe('dialogue');
      expect(u.overlapRanges.length).toBeGreaterThan(0);
      const n = wordSpans(u.text).length;
      let end = 0;
      for (const [a, b] of u.overlapRanges) {
        expect(a).toBeGreaterThanOrEqual(end);
        expect(b).toBeGreaterThan(a);
        expect(b).toBeLessThanOrEqual(n);
        end = b;
      }
    }
  }
  expect(readDasma(writeDasma(s)).script).toEqual(s);
}

describe('applyEdit (property)', () => {
  it('always yields a valid script that round-trips through .dasma, and never mutates its input', () => {
    fc.assert(
      fc.property(scriptArb, fc.array(seedArb, { maxLength: 25 }), (start, seeds) => {
        let s = start;
        for (const x of seeds) {
          const prev = s;
          const before = JSON.stringify(prev);
          try {
            s = applyEdit(prev, toOp(prev, x));
          } catch (err) {
            if (!(err instanceof EditError)) throw err;
          }
          expect(JSON.stringify(prev)).toBe(before);
          expectValid(s);
        }
      }),
      { numRuns: 300 },
    );
  });
});
```

- [ ] **Step 2: Write the must-carry acceptance test**

`packages/script/test/edit/must-carry.test.ts` — one single-op fix per mistake listed in `docs/script-import-results.md` ("What M2b's screen must carry"):

```ts
import { describe, expect, it } from 'vitest';
import { aliasSpeeches, applyEdit, uniqueCharacterId, type Script } from '../../src/index';
import { byId, scene, unit } from './fixture';

describe('each M2a mistake is fixed by one action', () => {
  it('missedSpeech: a speech read as a direction', () => {
    expect(byId(applyEdit(scene(), { type: 'speechBy', unitIds: ['u2'], characterId: 'lane' }), 'u2')).toMatchObject({ kind: 'dialogue', characterId: 'lane' });
  });

  it('inventedCharacter (risk I2): "OKAY." read as a speaker', () => {
    const next = applyEdit(scene(), { type: 'speechBy', unitIds: ['u7'], characterId: 'lane' });
    expect(next.characters.map((c) => c.id)).not.toContain('okay');
  });

  it('wrongSpeaker: CAPULET silently merged into CAPULET’S COUSIN', () => {
    const s: Script = {
      title: 'R&J',
      characters: [{ id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: ['CAPULET'] }],
      units: [unit('u1', 'characterName', 'CAPULET.'), unit('u2', 'dialogue', 'Welcome!', { characterId: 'capulet-s-cousin' })],
    };
    const unitIds = aliasSpeeches(s, {}, 'capulet-s-cousin', 'CAPULET');
    const next = applyEdit(s, { type: 'splitAlias', characterId: 'capulet-s-cousin', alias: 'CAPULET', newId: uniqueCharacterId(s, 'CAPULET'), unitIds });
    expect(byId(next, 'u2').characterId).toBe('capulet');
  });

  it('inventedHeading: a title page line read as a heading', () => {
    expect(byId(applyEdit(scene(), { type: 'setKind', unitIds: ['u1'], kind: 'frontMatter' }), 'u1').kind).toBe('frontMatter');
  });

  it('merge: two speeches run together', () => {
    const s = scene();
    s.units[3] = { ...s.units[3], text: 'Did you hear what I was playing, Lane? LANE I did.' };
    const next = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 8 });
    expect(next.units[4].text).toBe('LANE I did.');
  });

  it('split: one speech cut in two', () => {
    const s = scene();
    const split = applyEdit(s, { type: 'split', unitId: 'u4', atWord: 3 });
    expect(byId(applyEdit(split, { type: 'join', unitId: 'u11' }), 'u4').text).toBe(s.units[3].text);
  });

  it('inventedSpeech and bad text: junk removed, a misread word corrected', () => {
    expect(applyEdit(scene(), { type: 'remove', unitIds: ['u2'] }).units).toHaveLength(9);
    expect(byId(applyEdit(scene(), { type: 'editText', unitId: 'u10', text: "I don't play accurately—" }), 'u10').text).toBe("I don't play accurately—");
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run packages/script/test/edit && npm run typecheck && npx eslint .`
Expected: PASS. If the property test finds a counter-example, fix the op it names in `src/edit/*` (not the test), add the shrunk example as a regular test in that op's test file, and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/script
git commit -m "test(script): edit property test and the M2a must-carry fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Part B — `apps/web`

### Task 8: Web scaffold — dependencies, test projects, router, shortcuts, buttons

**Files:**
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`, `vitest.config.ts`, root `package.json` (devDependency `@vitejs/plugin-react`)
- Create: `apps/web/src/router.ts`, `apps/web/src/ui/shortcuts.ts`, `apps/web/src/ui/Button.tsx`, `apps/web/src/styles.css`, `apps/web/test/setup.ts`, `apps/web/test/pdfjs-stub.ts`
- Test: `apps/web/test/router.test.ts`, `apps/web/test/ui/shortcuts.test.tsx`, `apps/web/test/smoke.test.tsx`

**Interfaces:**
- Produces:
  - `type Route = { name: 'library' } | { name: 'new' } | { name: 'production' | 'import' | 'fix' | 'reimport'; id: string } | { name: 'notFound' }`; `parseHash(hash: string): Route`; `href(route: AppRoute): string`; `navigate(route: AppRoute): void`; `useRoute(): Route` where `type AppRoute = Exclude<Route, { name: 'notFound' }>`.
  - `matchesShortcut(e, spec: string): boolean`; `shortcutLabel(spec: string): string`; `isTypingTarget(target: EventTarget | null): boolean`; `interface ShortcutBinding { keys: string[]; run(): void; enabled?: boolean; allowInFields?: boolean }`; `useShortcuts(bindings: ShortcutBinding[], active?: boolean): void`.
  - `Button` (`ButtonHTMLAttributes` plus `shortcut?: string`, `variant?: 'primary' | 'plain' | 'danger'`).
  - Shortcut spec strings: a key value (`'j'`, `'J'`, `'Enter'`, `'ArrowDown'`, `'?'`, `'/'`, `'Delete'`), optionally prefixed `mod+` (Cmd on Mac, Ctrl elsewhere) and `shift+` (only with `mod`).

- [ ] **Step 1: Add dependencies and test projects**

`apps/web/package.json` — dependencies and devDependencies become:

```json
  "dependencies": {
    "@dasma/script": "*",
    "dexie": "4.4.6",
    "pdfjs-dist": "6.3.289",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.2",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.2",
    "vite": "^8.3.4"
  }
```

Add `"@vitejs/plugin-react": "^6.1.2"` to the root `package.json` devDependencies (the root `vitest.config.ts` imports it). Then run `npm install`.

`apps/web/tsconfig.json`: change `"include": ["src"]` to `"include": ["src", "test"]`.

Replace `vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pdfjsStub = fileURLToPath(new URL('./apps/web/test/pdfjs-stub.ts', import.meta.url));

export default defineConfig({
  test: {
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts', 'harness/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        // jsdom tests never read PDFs; the stub lets @dasma/script load without pdf.js's browser canvas APIs.
        resolve: { alias: { 'pdfjs-dist/legacy/build/pdf.mjs': pdfjsStub } },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/test/**/*.test.tsx'],
          setupFiles: ['apps/web/test/setup.ts'],
        },
      },
    ],
  },
});
```

`apps/web/test/setup.ts`:

```ts
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

`apps/web/test/pdfjs-stub.ts`:

```ts
// Stands in for pdfjs-dist in jsdom tests (see vitest.config.ts); PDF import is covered by Node tests and the browser spike.
export const GlobalWorkerOptions: { workerSrc?: string } = {};
export function getDocument(): never {
  throw new Error('pdf.js is stubbed in jsdom tests');
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { href, parseHash } from '../src/router';

describe('router', () => {
  it('parses every route', () => {
    expect(parseHash('')).toEqual({ name: 'library' });
    expect(parseHash('#/')).toEqual({ name: 'library' });
    expect(parseHash('#/new')).toEqual({ name: 'new' });
    expect(parseHash('#/p/abc')).toEqual({ name: 'production', id: 'abc' });
    expect(parseHash('#/p/abc/fix')).toEqual({ name: 'fix', id: 'abc' });
    expect(parseHash('#/p/abc/import')).toEqual({ name: 'import', id: 'abc' });
    expect(parseHash('#/p/abc/reimport')).toEqual({ name: 'reimport', id: 'abc' });
    expect(parseHash('#/p/abc/zzz')).toEqual({ name: 'notFound' });
    expect(parseHash('#/elsewhere')).toEqual({ name: 'notFound' });
  });

  it('builds hrefs that parse back', () => {
    for (const r of [{ name: 'library' }, { name: 'new' }, { name: 'production', id: 'a b' }, { name: 'fix', id: 'x' }] as const) {
      expect(parseHash(href(r))).toEqual(r);
    }
  });
});
```

`apps/web/test/ui/shortcuts.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { matchesShortcut, useShortcuts } from '../../src/ui/shortcuts';

function Harness({ log }: { log: string[] }) {
  useShortcuts([
    { keys: ['j'], run: () => log.push('j') },
    { keys: ['J'], run: () => log.push('J') },
    { keys: ['mod+z'], run: () => log.push('undo') },
    { keys: ['mod+shift+z'], run: () => log.push('redo') },
    { keys: ['Escape'], run: () => log.push('esc'), allowInFields: true },
    { keys: ['Enter'], run: () => log.push('enter') },
    { keys: ['d'], run: () => log.push('d'), enabled: false },
  ]);
  return (
    <>
      <input aria-label="field" />
      <input type="checkbox" aria-label="box" />
      <button type="button">Btn</button>
    </>
  );
}

describe('matchesShortcut', () => {
  const ev = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });
  it('matches keys, case and modifiers', () => {
    expect(matchesShortcut(ev('j'), 'j')).toBe(true);
    expect(matchesShortcut(ev('J', { shiftKey: true }), 'j')).toBe(false);
    expect(matchesShortcut(ev('J', { shiftKey: true }), 'J')).toBe(true);
    expect(matchesShortcut(ev('z', { metaKey: true }), 'mod+z')).toBe(true);
    expect(matchesShortcut(ev('z', { ctrlKey: true }), 'mod+z')).toBe(true);
    expect(matchesShortcut(ev('Z', { metaKey: true, shiftKey: true }), 'mod+shift+z')).toBe(true);
    expect(matchesShortcut(ev('z', { metaKey: true, shiftKey: true }), 'mod+z')).toBe(false);
    expect(matchesShortcut(ev('j', { metaKey: true }), 'j')).toBe(false);
    expect(matchesShortcut(ev('?', { shiftKey: true }), '?')).toBe(true);
  });
});

describe('useShortcuts', () => {
  it('runs bindings from the page, ignores text fields and disabled bindings', async () => {
    const log: string[] = [];
    render(<Harness log={log} />);
    const user = userEvent.setup();
    await user.keyboard('jJd');
    await user.keyboard('{Meta>}z{/Meta}{Control>}z{/Control}{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(log).toEqual(['j', 'J', 'undo', 'undo', 'redo']);
    await user.click(screen.getByLabelText('field'));
    await user.keyboard('j{Escape}');
    expect(log.slice(5)).toEqual(['esc']);
    await user.click(screen.getByLabelText('box'));
    await user.keyboard('j');
    expect(log.slice(6)).toEqual(['j']);
  });

  it('leaves Enter on a focused button to the browser', async () => {
    const log: string[] = [];
    render(<Harness log={log} />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Btn' }).focus();
    await user.keyboard('{Enter}');
    expect(log).toEqual([]);
  });
});
```

`apps/web/test/smoke.test.tsx`:

```tsx
import { importScript } from '@dasma/script';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/ui/Button';

describe('web test project', () => {
  it('runs @dasma/script in jsdom with pdf.js stubbed', async () => {
    const r = await importScript({ kind: 'text', text: 'HAMLET\nTo be.\nHORATIO\nMy lord.\nHAMLET\nGo.\nHORATIO\nYes.' });
    expect(r.script.characters.map((c) => c.id)).toEqual(['hamlet', 'horatio']);
  });

  it('renders a button with its shortcut hint', () => {
    render(<Button shortcut="d">Direction</Button>);
    const b = screen.getByRole('button', { name: /Direction/ });
    expect(b.textContent).toBe('Directiond');
    expect(b.querySelector('kbd')?.textContent).toBe('d');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web`
Expected: FAIL — `../src/router`, `../src/ui/*` not found. (If the `web` project fails to start at all, check the `projects` config against Vitest 5's docs before going on; both projects must be listed in the run summary.)

- [ ] **Step 4: Write `router.ts`**

```ts
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'new' }
  | { name: 'production'; id: string }
  | { name: 'import'; id: string }
  | { name: 'fix'; id: string }
  | { name: 'reimport'; id: string }
  | { name: 'notFound' };

export type AppRoute = Exclude<Route, { name: 'notFound' }>;

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/') return { name: 'library' };
  if (path === '/new') return { name: 'new' };
  const m = /^\/p\/([^/]+)(?:\/(import|fix|reimport))?$/.exec(path);
  if (!m) return { name: 'notFound' };
  const id = decodeURIComponent(m[1]);
  return m[2] ? { name: m[2] as 'import' | 'fix' | 'reimport', id } : { name: 'production', id };
}

export function href(route: AppRoute): string {
  switch (route.name) {
    case 'library':
      return '#/';
    case 'new':
      return '#/new';
    case 'production':
      return `#/p/${encodeURIComponent(route.id)}`;
    default:
      return `#/p/${encodeURIComponent(route.id)}/${route.name}`;
  }
}

export function navigate(route: AppRoute): void {
  window.location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
```

- [ ] **Step 5: Write `ui/shortcuts.ts`**

```ts
import { useEffect, useLayoutEffect, useRef } from 'react';

type KeyInfo = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** `spec` is a key value ('j', 'J', 'Enter', '?'), optionally prefixed 'mod+' (Cmd/Ctrl) and 'shift+' (only with mod). */
export function matchesShortcut(e: KeyInfo, spec: string): boolean {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const mod = parts.includes('mod');
  if (mod !== (e.metaKey || e.ctrlKey) || e.altKey) return false;
  if (mod) return e.key.toLowerCase() === key.toLowerCase() && e.shiftKey === parts.includes('shift');
  return e.key === key;
}

const KEY_LABELS: Record<string, string> = { ArrowDown: '↓', ArrowUp: '↑', Enter: '↵', Escape: 'Esc', Delete: 'Del', Backspace: '⌫' };

export function shortcutLabel(spec: string): string {
  const parts = spec.split('+');
  const key = parts.pop()!;
  const k = KEY_LABELS[key] ?? (parts.length ? key.toUpperCase() : key);
  const mods = parts.map((p) => (p === 'mod' ? (IS_MAC ? '⌘' : 'Ctrl') : IS_MAC ? '⇧' : 'Shift'));
  return IS_MAC ? [...mods, k].join('') : [...mods, k].join('+');
}

const NOT_TYPING = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color']);

/** True for elements that take typed text, where single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !NOT_TYPING.has((el as HTMLInputElement).type);
}

export interface ShortcutBinding {
  keys: string[];
  run(): void;
  enabled?: boolean;
  /** Also fire while a text field has focus (Esc, Cmd/Ctrl+Enter). */
  allowInFields?: boolean;
}

/** Binds keys on the window. Enter and Space on a focused button or link are left to the browser's own click. */
export function useShortcuts(bindings: ShortcutBinding[], active = true): void {
  const ref = useRef(bindings);
  useLayoutEffect(() => {
    ref.current = bindings;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.key === 'Enter' || e.key === ' ') && (tag === 'BUTTON' || tag === 'A')) return;
      const typing = isTypingTarget(e.target);
      for (const b of ref.current) {
        if (b.enabled === false || (typing && !b.allowInFields)) continue;
        if (b.keys.some((k) => matchesShortcut(e, k))) {
          e.preventDefault();
          b.run();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
```

- [ ] **Step 6: Write `ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react';
import { shortcutLabel } from './shortcuts';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The key that runs the same handler; shown as a hint inside the button. */
  shortcut?: string;
  variant?: 'primary' | 'plain' | 'danger';
}

export function Button({ shortcut, variant = 'plain', className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
      {shortcut && <kbd className="kbd">{shortcutLabel(shortcut)}</kbd>}
    </button>
  );
}
```

- [ ] **Step 7: Write `styles.css`**

```css
:root {
  --bg: #f7f7f8;
  --panel: #ffffff;
  --text: #1d1d1f;
  --muted: #6e6e73;
  --line: #d2d2d7;
  --accent: #0a66c2;
  --warn: #c77700;
  --warn-bg: #fff4e0;
  --error: #c62828;
  --sel: #e3f0fd;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--text);
  background: var(--bg);
}
body { margin: 0; }
.page { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
.btn { font: inherit; font-size: 14px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--text); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-danger { border-color: var(--error); color: var(--error); }
.btn[aria-pressed='true'] { background: var(--sel); border-color: var(--accent); }
.kbd { font: 11px ui-monospace, monospace; color: var(--muted); }
.btn-primary .kbd { color: #dce9f7; }
.field { display: flex; flex-direction: column; gap: 4px; margin: 12px 0; font-size: 14px; }
.field input, .paste, .panel textarea, .picker input { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; }
.paste { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.banner, .notice { background: var(--warn-bg); border: 1px solid var(--warn); border-radius: 6px; padding: 8px 12px; margin: 12px 0; }
.notice { margin: 0; border-radius: 0; border-width: 0 0 1px; font-size: 13px; }
.alert { color: var(--error); }
.cards { list-style: none; padding: 0; display: grid; gap: 8px; }
.cards li { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap; }
.cards a { font-weight: 600; font-size: 16px; }
.muted { color: var(--muted); font-size: 13px; }
.dropzone { border: 2px dashed var(--line); border-radius: 8px; padding: 16px; margin: 12px 0; }
.file-list li { margin: 4px 0; }
.tabs { display: flex; gap: 8px; margin: 12px 0; }
table.grid { border-collapse: collapse; width: 100%; font-size: 14px; }
table.grid td, table.grid th { border-bottom: 1px solid var(--line); padding: 6px; text-align: left; vertical-align: top; }

/* Fix tags */
.fix { display: flex; flex-direction: column; height: 100vh; }
.fix-header { display: flex; gap: 12px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--line); background: var(--panel); flex-wrap: wrap; }
.fix-header .grow { flex: 1; }
.fix-cols { flex: 1; display: grid; grid-template-columns: 260px 1fr 300px; min-height: 0; }
.fix-left, .fix-right { overflow: auto; padding: 12px; background: var(--panel); border-right: 1px solid var(--line); }
.fix-right { border-right: 0; border-left: 1px solid var(--line); }
.script { overflow: auto; padding: 16px 24px; font-family: Georgia, serif; font-size: 15px; line-height: 1.5; }
.unit { padding: 2px 8px; border-left: 3px solid transparent; border-radius: 3px; margin: 1px 0; white-space: pre-wrap; content-visibility: auto; contain-intrinsic-size: auto 1.6em; cursor: pointer; }
.unit-characterName { font-weight: bold; letter-spacing: 0.04em; margin-top: 8px; }
.unit-direction { font-style: italic; color: var(--muted); }
.unit-heading { font-weight: bold; text-transform: uppercase; text-align: center; border-top: 1px solid var(--line); margin-top: 12px; }
.unit-sceneBreak { text-align: center; color: var(--muted); border-top: 1px dashed var(--line); }
.unit-frontMatter { color: var(--muted); font-size: 13px; }
.unit.flag { border-left-color: var(--warn); background: var(--warn-bg); }
.unit.sel { outline: 2px solid var(--accent); background: var(--sel); }
.unit.cut { text-decoration: line-through; opacity: 0.5; }
.unit.hl { box-shadow: inset 3px 0 0 var(--accent); }
.speaker { font: 11px system-ui, sans-serif; color: var(--accent); margin-right: 8px; text-transform: uppercase; }
.w.ov { text-decoration: underline wavy var(--accent); }
.w.wsel { background: #b9d7f5; }
.qitem { display: block; width: 100%; text-align: left; font: inherit; font-size: 13px; padding: 4px 6px; border: 0; border-radius: 4px; background: none; cursor: pointer; }
.qitem[aria-current='true'] { background: var(--sel); }
.qitem .reason { color: var(--warn); font-weight: 600; margin-right: 6px; }
.panel h2, .fix-left h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 12px 0 6px; }
.panel .buttons { display: flex; flex-wrap: wrap; gap: 4px; }
.panel textarea { width: 100%; box-sizing: border-box; min-height: 120px; }
.picker ul { list-style: none; padding: 0; max-height: 280px; overflow: auto; }
.chip { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 9px; background: var(--bg); color: var(--muted); margin: 0 4px 2px 0; }
.char-row { padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.sheet { position: fixed; inset: 10% 20%; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px 24px; overflow: auto; box-shadow: 0 8px 32px rgb(0 0 0 / 0.2); }
.save-error { color: var(--error); font-weight: 600; }
.title-input { font: inherit; font-size: 28px; font-weight: 700; border: 1px solid transparent; border-radius: 6px; background: none; width: 100%; padding: 2px 4px; }
.title-input:focus { border-color: var(--line); background: var(--panel); }
```

Import it in `src/main.tsx` (`import './styles.css';` as the first line).

- [ ] **Step 8: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS; the run summary lists both the `node` and `web` projects. `npm run build -w apps/web` still succeeds.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts apps/web
git commit -m "feat(web): test projects, hash router, keyboard shortcuts and buttons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: IndexedDB schema and repository

**Files:**
- Create: `apps/web/src/db/schema.ts`, `apps/web/src/db/repo.ts`, `apps/web/test/fixtures.ts`
- Test: `apps/web/test/db/repo.test.ts`

**Interfaces:**
- Consumes: `checkQueue`, `Script`, `UnitHint`, `ImportWarning` from `@dasma/script`.
- Produces:
  - `type ImportedFrom = { kind: 'pdf' | 'docx' | 'text' | 'dasma'; names: string[] }`; `interface ProductionRow`, `interface ScriptVersionRow`, `interface MetaRow` (spec §4); `type DasmaDb`; `openDb(name?: string): DasmaDb`.
  - `class Repo` with `open()`, `listProductions(): Promise<ProductionSummary[]>`, `getProduction(id)`, `createProduction({ title, origin, cast?, version })`, `updateProduction(id, patch)`, `deleteProduction(id)`, `getLiveVersion(productionId)`, `listVersions(productionId)` (ascending), `saveScript(versionId, script, expectedRev): Promise<number>`, `addVersion(productionId, version)`, `getMeta<T>(key)`, `setMeta(key, value)`.
  - `type NewVersion = Pick<ScriptVersionRow, 'script' | 'pages' | 'unitHints' | 'importedFrom' | 'warnings'>`; `interface ProductionSummary { production: ProductionRow; version: number; toCheck: number }`.
  - `class RevConflictError`, `class StorageUnavailableError` (messages below are user-facing).
  - Test helpers: `SAMPLE_TEXT`, `sampleScript()`, `seedProduction(repo, opts?)`, `testDbName()`.

- [ ] **Step 1: Write the test fixtures**

`apps/web/test/fixtures.ts`:

```ts
import type { Script, Unit, UnitKind } from '@dasma/script';
import type { Repo } from '../src/db/repo';
import type { ImportedFrom } from '../src/db/schema';

export const SAMPLE_TEXT = ['ACT I', 'HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n');

export const testDbName = (): string => `test-${crypto.randomUUID()}`;

function unit(id: string, kind: UnitKind, text: string, extra: Partial<Unit> = {}): Unit {
  return { id, kind, text, cut: false, tagConfidence: 0.95, source: [{ page: 1, line: Number(id.slice(1)) }], ...extra };
}

/** Earnest with three unsure units: a heading guess (u1), a fake character "OKAY" (u7, u8). */
export function sampleScript(): Script {
  return {
    title: 'Earnest',
    characters: [
      { id: 'algernon', name: 'ALGERNON', aliases: ['ALGY'] },
      { id: 'lane', name: 'LANE', aliases: [] },
      { id: 'okay', name: 'OKAY', aliases: [] },
    ],
    units: [
      unit('u1', 'heading', "Morning-room in Algernon's flat", { tagConfidence: 0.5 }),
      unit('u2', 'direction', 'Lane is arranging afternoon tea on the table.'),
      unit('u3', 'characterName', 'ALGERNON'),
      unit('u4', 'dialogue', 'Did you hear what I was playing, Lane?', { characterId: 'algernon' }),
      unit('u5', 'characterName', 'LANE'),
      unit('u6', 'dialogue', "I didn't think it polite to listen, sir.", { characterId: 'lane' }),
      unit('u7', 'characterName', 'OKAY.', { tagConfidence: 0.4 }),
      unit('u8', 'dialogue', "I'm sorry for that, for your sake.", { characterId: 'okay', tagConfidence: 0.6 }),
      unit('u9', 'characterName', 'ALGERNON'),
      unit('u10', 'dialogue', "I don't play accurately.", { characterId: 'algernon' }),
    ],
  };
}

export async function seedProduction(
  repo: Repo,
  opts: { title?: string; script?: Script; names?: string[]; kind?: ImportedFrom['kind']; cast?: Record<string, string[]> } = {},
) {
  return repo.createProduction({
    title: opts.title ?? 'Earnest',
    origin: 'created',
    cast: opts.cast,
    version: { script: opts.script ?? sampleScript(), pages: 1, unitHints: {}, importedFrom: { kind: opts.kind ?? 'text', names: opts.names ?? ['earnest.txt'] }, warnings: [] },
  });
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/db/repo.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { RevConflictError, Repo, StorageUnavailableError } from '../../src/db/repo';
import { openDb, type DasmaDb } from '../../src/db/schema';
import { sampleScript, seedProduction, testDbName } from '../fixtures';

describe('Repo', () => {
  let clock: number;
  let repo: Repo;
  beforeEach(() => {
    clock = 1000;
    repo = new Repo(openDb(testDbName()), () => ++clock);
  });

  it('creates a production with version 1 and lists it with its check count', async () => {
    const { production, version } = await seedProduction(repo);
    expect(version).toMatchObject({ productionId: production.id, version: 1, rev: 0 });
    expect(await repo.listProductions()).toEqual([{ production, version: 1, toCheck: 3 }]);
  });

  it('lists the most recently edited production first', async () => {
    const a = await seedProduction(repo, { title: 'A' });
    await seedProduction(repo, { title: 'B' });
    await repo.updateProduction(a.production.id, { title: 'A2' });
    expect((await repo.listProductions()).map((p) => p.production.title)).toEqual(['A2', 'B']);
  });

  it('adds versions; the highest is live and older ones are kept', async () => {
    const { production } = await seedProduction(repo);
    const v2 = await repo.addVersion(production.id, { script: sampleScript(), pages: 2, unitHints: {}, importedFrom: { kind: 'pdf', names: ['e.pdf'] }, warnings: [] });
    expect(v2).toMatchObject({ version: 2, rev: 0, pages: 2 });
    expect((await repo.getLiveVersion(production.id))!.id).toBe(v2.id);
    expect((await repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
  });

  it('saves with a rev check and refuses a stale rev', async () => {
    const { version } = await seedProduction(repo);
    const edited = { ...sampleScript(), title: 'Edited' };
    expect(await repo.saveScript(version.id, edited, 0)).toBe(1);
    expect((await repo.getLiveVersion(version.productionId))!.script.title).toBe('Edited');
    await expect(repo.saveScript(version.id, sampleScript(), 0)).rejects.toBeInstanceOf(RevConflictError);
    expect((await repo.getLiveVersion(version.productionId))!).toMatchObject({ rev: 1, script: { title: 'Edited' } });
  });

  it('deletes a production with all its versions', async () => {
    const { production } = await seedProduction(repo);
    await repo.addVersion(production.id, { script: sampleScript(), pages: 1, unitHints: {}, importedFrom: { kind: 'text', names: ['x'] }, warnings: [] });
    await repo.deleteProduction(production.id);
    expect(await repo.getProduction(production.id)).toBeUndefined();
    expect(await repo.listVersions(production.id)).toEqual([]);
  });

  it('stores meta values', async () => {
    expect(await repo.getMeta('persist')).toBeUndefined();
    await repo.setMeta('persist', 'denied');
    expect(await repo.getMeta<string>('persist')).toBe('denied');
  });

  it('reports blocked storage', async () => {
    const blocked = new Repo({ open: () => Promise.reject(new Error('blocked')) } as unknown as DasmaDb);
    await expect(blocked.open()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/db`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `schema.ts`**

```ts
import type { ImportWarning, Script, UnitHint } from '@dasma/script';
import Dexie, { type EntityTable } from 'dexie';

export type ImportedFrom = { kind: 'pdf' | 'docx' | 'text' | 'dasma'; names: string[] };

export interface ProductionRow {
  id: string;
  title: string;
  /** characterId → actor names (the .dasma shape). */
  cast: Record<string, string[]>;
  origin: 'created' | 'dasma';
  createdAt: number;
  updatedAt: number;
}

export interface ScriptVersionRow {
  id: string;
  productionId: string;
  /** 1, 2, 3 …; the highest is live. */
  version: number;
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  importedFrom: ImportedFrom;
  warnings: ImportWarning[];
  /** Save counter for the two-tab check. */
  rev: number;
  createdAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export type DasmaDb = Dexie & {
  productions: EntityTable<ProductionRow, 'id'>;
  scripts: EntityTable<ScriptVersionRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

export function openDb(name = 'dasma'): DasmaDb {
  const db = new Dexie(name) as DasmaDb;
  db.version(1).stores({
    productions: 'id, updatedAt',
    scripts: 'id, productionId, [productionId+version]',
    meta: 'key',
  });
  return db;
}
```

- [ ] **Step 5: Write `repo.ts`**

```ts
import { checkQueue, type Script } from '@dasma/script';
import Dexie from 'dexie';
import type { DasmaDb, ProductionRow, ScriptVersionRow } from './schema';

export class RevConflictError extends Error {
  constructor() {
    super('This script was changed in another tab. Reload to continue.');
    this.name = 'RevConflictError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("This browser is blocking storage, so DASMA can't keep your scripts. Use a normal Chrome or Edge window.", options);
    this.name = 'StorageUnavailableError';
  }
}

export type NewVersion = Pick<ScriptVersionRow, 'script' | 'pages' | 'unitHints' | 'importedFrom' | 'warnings'>;

export interface ProductionSummary {
  production: ProductionRow;
  version: number;
  toCheck: number;
}

/** Spec §4. Screens use this, never Dexie directly. */
export class Repo {
  constructor(
    private readonly db: DasmaDb,
    private readonly now: () => number = Date.now,
  ) {}

  async open(): Promise<void> {
    try {
      await this.db.open();
    } catch (err) {
      throw new StorageUnavailableError({ cause: err });
    }
  }

  async listProductions(): Promise<ProductionSummary[]> {
    const productions = await this.db.productions.orderBy('updatedAt').reverse().toArray();
    return Promise.all(
      productions.map(async (production) => {
        const live = await this.getLiveVersion(production.id);
        return { production, version: live?.version ?? 0, toCheck: live ? checkQueue(live.script).length : 0 };
      }),
    );
  }

  getProduction(id: string): Promise<ProductionRow | undefined> {
    return this.db.productions.get(id);
  }

  async createProduction(input: {
    title: string;
    origin: ProductionRow['origin'];
    cast?: Record<string, string[]>;
    version: NewVersion;
  }): Promise<{ production: ProductionRow; version: ScriptVersionRow }> {
    const t = this.now();
    const production: ProductionRow = { id: crypto.randomUUID(), title: input.title, cast: input.cast ?? {}, origin: input.origin, createdAt: t, updatedAt: t };
    const version: ScriptVersionRow = { id: crypto.randomUUID(), productionId: production.id, version: 1, ...input.version, rev: 0, createdAt: t };
    await this.db.transaction('rw', this.db.productions, this.db.scripts, async () => {
      await this.db.productions.add(production);
      await this.db.scripts.add(version);
    });
    return { production, version };
  }

  async updateProduction(id: string, patch: Partial<Pick<ProductionRow, 'title' | 'cast'>>): Promise<ProductionRow> {
    const current = await this.db.productions.get(id);
    if (!current) throw new Error(`There is no production ${id}.`);
    const next = { ...current, ...patch, updatedAt: this.now() };
    await this.db.productions.put(next);
    return next;
  }

  async deleteProduction(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.productions, this.db.scripts, async () => {
      await this.db.scripts.where('productionId').equals(id).delete();
      await this.db.productions.delete(id);
    });
  }

  getLiveVersion(productionId: string): Promise<ScriptVersionRow | undefined> {
    return this.db.scripts.where('[productionId+version]').between([productionId, Dexie.minKey], [productionId, Dexie.maxKey]).last();
  }

  listVersions(productionId: string): Promise<ScriptVersionRow[]> {
    return this.db.scripts.where('productionId').equals(productionId).sortBy('version');
  }

  /** Writes only if the stored rev is `expectedRev`; returns the new rev. */
  async saveScript(versionId: string, script: Script, expectedRev: number): Promise<number> {
    return this.db.transaction('rw', this.db.scripts, this.db.productions, async () => {
      const row = await this.db.scripts.get(versionId);
      if (!row || row.rev !== expectedRev) throw new RevConflictError();
      const rev = expectedRev + 1;
      await this.db.scripts.update(versionId, { script, rev });
      await this.db.productions.update(row.productionId, { updatedAt: this.now() });
      return rev;
    });
  }

  async addVersion(productionId: string, v: NewVersion): Promise<ScriptVersionRow> {
    return this.db.transaction('rw', this.db.scripts, this.db.productions, async () => {
      const live = await this.getLiveVersion(productionId);
      const t = this.now();
      const row: ScriptVersionRow = { id: crypto.randomUUID(), productionId, version: (live?.version ?? 0) + 1, ...v, rev: 0, createdAt: t };
      await this.db.scripts.add(row);
      await this.db.productions.update(productionId, { updatedAt: t });
      return row;
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run apps/web && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): IndexedDB schema and repository with the two-tab rev check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Import pipeline, worker and the pdf.js spike

**Files:**
- Create: `apps/web/src/import/run.ts`, `apps/web/src/import/protocol.ts`, `apps/web/src/import/import.worker.ts`, `apps/web/src/import/importer.ts`
- Temporary (never committed): `apps/web/spike.html`, `apps/web/src/spike.ts`
- Test: `apps/web/test/import/import.test.ts`

**Interfaces:**
- Consumes: `importScript`, `appendScripts`, `readDasma`, `ScriptImportError`, `ScriptFormatError` from `@dasma/script`; `ImportedFrom` (Task 9).
- Produces:
  - `type FileKind = 'pdf' | 'docx' | 'text'`; `interface ImportSource { name: string; kind: FileKind; bytes?: Uint8Array; text?: string }`; `interface ImportOutcome { script; pages; unitHints; warnings; importedFrom }` (exactly the fields of `NewVersion`); `kindOfFile(name): FileKind | null`; `runImport(sources, title, onProgress?): Promise<ImportOutcome>`.
  - `interface Importer { importFiles(sources, title, onProgress?): Promise<ImportOutcome>; readDasma(text): Promise<DasmaContents> }`; `type DasmaContents = ReturnType<typeof readDasma>`; `class WorkerImporter implements Importer`; `class WorkerCrashError`; `STALL_MS = 60_000`.
  - `handleRequest(req, post)`, `toWorkerError(err)`, `fromWorkerError(e)` in `protocol.ts`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/import/import.test.ts`:

```ts
import { ScriptFormatError, ScriptImportError } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { WorkerCrashError, WorkerImporter } from '../../src/import/importer';
import { handleRequest, type WorkerRequest, type WorkerResponse } from '../../src/import/protocol';
import { kindOfFile, runImport } from '../../src/import/run';
import { SAMPLE_TEXT } from '../fixtures';

const text = (name: string, t = SAMPLE_TEXT) => ({ name, kind: 'text' as const, text: t });

describe('runImport', () => {
  it('imports one source with hints for every unit', async () => {
    const r = await runImport([text('scene.txt')], 'Hamlet');
    expect(r.importedFrom).toEqual({ kind: 'text', names: ['scene.txt'] });
    expect(r.script.title).toBe('Hamlet');
    for (const u of r.script.units) expect(r.unitHints[u.id]).toBeDefined();
  });

  it('appends several sources in order', async () => {
    const one = await runImport([text('a.txt')], 'T');
    const both = await runImport([text('a.txt'), text('b.txt')], 'T', () => {});
    expect(both.importedFrom.names).toEqual(['a.txt', 'b.txt']);
    expect(both.script.units).toHaveLength(one.script.units.length * 2);
    expect(new Set(both.script.units.map((u) => u.id)).size).toBe(both.script.units.length);
    expect(both.pages).toBe(one.pages * 2);
    for (const u of both.script.units) expect(both.unitHints[u.id]).toBeDefined();
    expect(both.script.characters.map((c) => c.id)).toEqual(one.script.characters.map((c) => c.id));
  });

  it('reports progress per file and refuses no sources', async () => {
    const seen: string[] = [];
    await runImport([text('a.txt'), text('b.txt')], 'T', (m) => seen.push(m));
    expect(seen).toEqual(['Reading file 1 of 2…', 'Reading file 2 of 2…']);
    await expect(runImport([], 'T')).rejects.toBeInstanceOf(ScriptImportError);
  });

  it('knows file kinds by extension', () => {
    expect([kindOfFile('a.PDF'), kindOfFile('b.docx'), kindOfFile('c.txt'), kindOfFile('d.rtf'), kindOfFile('noext')]).toEqual(['pdf', 'docx', 'text', null, null]);
  });
});

describe('handleRequest', () => {
  it('posts progress then the outcome', async () => {
    const posted: WorkerResponse[] = [];
    await handleRequest({ id: 7, type: 'import', sources: [text('a.txt')], title: 'T' }, (r) => posted.push(r));
    expect(posted.map((r) => r.type)).toEqual(['progress', 'done']);
    expect(posted.every((r) => r.id === 7)).toBe(true);
  });

  it('posts typed errors', async () => {
    const posted: WorkerResponse[] = [];
    await handleRequest({ id: 1, type: 'readDasma', text: 'not json' }, (r) => posted.push(r));
    await handleRequest({ id: 2, type: 'import', sources: [text('a.txt', '   ')], title: 'T' }, (r) => posted.push(r));
    expect(posted.filter((r) => r.type === 'error').map((r) => (r.type === 'error' ? r.error : null))).toEqual([
      { kind: 'format', reason: 'notJson' },
      { kind: 'import', code: 'empty' },
    ]);
  });
});

class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private readonly silent = false) {}
  postMessage(req: WorkerRequest): void {
    if (this.silent) return;
    void handleRequest(req, (r) => this.onmessage?.({ data: r } as MessageEvent<WorkerResponse>));
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerImporter', () => {
  it('returns the worker’s outcome and forwards progress', async () => {
    const seen: string[] = [];
    const importer = new WorkerImporter(() => new FakeWorker());
    const r = await importer.importFiles([text('a.txt')], 'T', (m) => seen.push(m));
    expect(r).toEqual(await runImport([text('a.txt')], 'T'));
    expect(seen).toEqual(['Reading a.txt…']);
  });

  it('rebuilds typed errors', async () => {
    const importer = new WorkerImporter(() => new FakeWorker());
    await expect(importer.readDasma('{}')).rejects.toBeInstanceOf(ScriptFormatError);
  });

  it('treats a silent worker as crashed, terminates it, and starts a new one next time', async () => {
    const workers: FakeWorker[] = [];
    const importer = new WorkerImporter(() => {
      const w = new FakeWorker(workers.length === 0);
      workers.push(w);
      return w;
    }, 20);
    await expect(importer.importFiles([text('a.txt')], 'T')).rejects.toBeInstanceOf(WorkerCrashError);
    expect(workers[0].terminated).toBe(true);
    await expect(importer.importFiles([text('a.txt')], 'T')).resolves.toBeDefined();
    expect(workers).toHaveLength(2);
  });

  it('rejects pending calls when the worker errors', async () => {
    const box: { worker?: FakeWorker } = {};
    const importer = new WorkerImporter(() => (box.worker = new FakeWorker(true)));
    const p = importer.importFiles([text('a.txt')], 'T');
    box.worker!.onerror?.({} as ErrorEvent);
    await expect(p).rejects.toBeInstanceOf(WorkerCrashError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/import`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `run.ts`**

```ts
import { appendScripts, importScript, ScriptImportError, type ImportInput, type ImportWarning, type Script, type UnitHint } from '@dasma/script';
import type { ImportedFrom } from '../db/schema';

export type FileKind = 'pdf' | 'docx' | 'text';

export interface ImportSource {
  name: string;
  kind: FileKind;
  bytes?: Uint8Array;
  text?: string;
}

/** Exactly the fields of a new script version. */
export interface ImportOutcome {
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  warnings: ImportWarning[];
  importedFrom: ImportedFrom;
}

export function kindOfFile(name: string): FileKind | null {
  const ext = /\.([^.]+)$/.exec(name.toLowerCase())?.[1];
  return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'txt' ? 'text' : null;
}

const inputOf = (s: ImportSource): ImportInput => (s.kind === 'text' ? { kind: 'text', text: s.text ?? '' } : { kind: s.kind, bytes: s.bytes ?? new Uint8Array() });

function mergeWarnings(a: ImportWarning[], b: ImportWarning[]): ImportWarning[] {
  const seen = new Set(a.map((w) => JSON.stringify(w)));
  return [...a, ...b.filter((w) => !seen.has(JSON.stringify(w)))];
}

/** Spec §5.2: imports each source, then joins them in order with appendScripts. */
export async function runImport(sources: ImportSource[], title: string, onProgress: (message: string) => void = () => {}): Promise<ImportOutcome> {
  if (sources.length === 0) throw new ScriptImportError('empty');
  let out: ImportOutcome | null = null;
  for (const [k, src] of sources.entries()) {
    onProgress(sources.length > 1 ? `Reading file ${k + 1} of ${sources.length}…` : `Reading ${src.name}…`);
    const r = await importScript(inputOf(src), { title });
    if (!out) {
      out = { script: r.script, pages: r.pages, unitHints: r.unitHints, warnings: r.warnings, importedFrom: { kind: src.kind, names: [src.name] } };
      continue;
    }
    const before = out.script.units.length;
    const script = appendScripts(out.script, r.script, out.pages);
    const unitHints = { ...out.unitHints };
    r.script.units.forEach((u, i) => {
      const hint = r.unitHints[u.id];
      if (hint) unitHints[script.units[before + i].id] = hint;
    });
    out = {
      script,
      pages: out.pages + r.pages,
      unitHints,
      warnings: mergeWarnings(out.warnings, r.warnings),
      importedFrom: { kind: out.importedFrom.kind, names: [...out.importedFrom.names, src.name] },
    };
  }
  return out!;
}
```

- [ ] **Step 4: Write `protocol.ts`**

```ts
import { readDasma, ScriptFormatError, ScriptImportError, type FormatErrorReason, type ImportErrorCode } from '@dasma/script';
import { runImport, type ImportSource } from './run';

export type WorkerCall = { type: 'import'; sources: ImportSource[]; title: string } | { type: 'readDasma'; text: string };
export type WorkerRequest = WorkerCall & { id: number };

export type WorkerError =
  | { kind: 'import'; code: ImportErrorCode }
  | { kind: 'format'; reason: FormatErrorReason; path?: string }
  | { kind: 'other'; message: string };

export type WorkerResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; error: WorkerError };

export function toWorkerError(err: unknown): WorkerError {
  if (err instanceof ScriptImportError) return { kind: 'import', code: err.code };
  if (err instanceof ScriptFormatError) return { kind: 'format', reason: err.reason, ...(err.path ? { path: err.path } : {}) };
  return { kind: 'other', message: err instanceof Error ? err.message : String(err) };
}

export function fromWorkerError(e: WorkerError): Error {
  if (e.kind === 'import') return new ScriptImportError(e.code);
  if (e.kind === 'format') return new ScriptFormatError(e.reason, e.path);
  return new Error(e.message);
}

export async function handleRequest(req: WorkerRequest, post: (r: WorkerResponse) => void): Promise<void> {
  try {
    const result =
      req.type === 'import' ? await runImport(req.sources, req.title, (message) => post({ id: req.id, type: 'progress', message })) : readDasma(req.text);
    post({ id: req.id, type: 'done', result });
  } catch (err) {
    post({ id: req.id, type: 'error', error: toWorkerError(err) });
  }
}
```

- [ ] **Step 5: Write `import.worker.ts`**

```ts
// The import worker: pdf.js, docx parsing and tagging run here, off the main thread (spec §3.2).
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { handleRequest, type WorkerRequest, type WorkerResponse } from './protocol';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};
scope.onmessage = (e) => {
  void handleRequest(e.data, (r) => scope.postMessage(r));
};
```

- [ ] **Step 6: Write `importer.ts`**

```ts
import type { readDasma } from '@dasma/script';
import { fromWorkerError, type WorkerCall, type WorkerRequest, type WorkerResponse } from './protocol';
import type { ImportOutcome, ImportSource } from './run';

export type DasmaContents = ReturnType<typeof readDasma>;

export interface Importer {
  importFiles(sources: ImportSource[], title: string, onProgress?: (message: string) => void): Promise<ImportOutcome>;
  readDasma(text: string): Promise<DasmaContents>;
}

export class WorkerCrashError extends Error {
  constructor() {
    super('Import stopped unexpectedly. Try again, or paste the text.');
    this.name = 'WorkerCrashError';
  }
}

/** A worker that sends nothing for this long is treated as crashed (spec §9). */
export const STALL_MS = 60_000;

export interface WorkerLike {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  onProgress?: (message: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

const createImportWorker = (): WorkerLike => new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export class WorkerImporter implements Importer {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly create: () => WorkerLike = createImportWorker,
    private readonly stallMs = STALL_MS,
  ) {}

  importFiles(sources: ImportSource[], title: string, onProgress?: (message: string) => void): Promise<ImportOutcome> {
    return this.call({ type: 'import', sources, title }, onProgress) as Promise<ImportOutcome>;
  }

  readDasma(text: string): Promise<DasmaContents> {
    return this.call({ type: 'readDasma', text }) as Promise<DasmaContents>;
  }

  private ensure(): WorkerLike {
    if (this.worker) return this.worker;
    const w = this.create();
    w.onmessage = (e) => this.receive(e.data);
    w.onerror = () => this.crash();
    this.worker = w;
    return w;
  }

  private call(call: WorkerCall, onProgress?: (message: string) => void): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress, timer: setTimeout(() => this.crash(), this.stallMs) });
      this.ensure().postMessage({ ...call, id });
    });
  }

  private receive(r: WorkerResponse): void {
    const p = this.pending.get(r.id);
    if (!p) return;
    clearTimeout(p.timer);
    if (r.type === 'progress') {
      p.onProgress?.(r.message);
      p.timer = setTimeout(() => this.crash(), this.stallMs);
      return;
    }
    this.pending.delete(r.id);
    if (r.type === 'done') p.resolve(r.result);
    else p.reject(fromWorkerError(r.error));
  }

  private crash(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new WorkerCrashError());
    }
    this.pending.clear();
  }
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run apps/web && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 8: Spike — prove PDF import in a real browser worker**

This step needs a browser. If you cannot open one, leave the two spike files uncommitted, skip to Step 10, and report `DONE_WITH_CONCERNS: spike not run` — the controller runs Steps 8–9.

Create `apps/web/spike.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>Import spike</title></head>
  <body>
    <pre id="out">running…</pre>
    <script type="module" src="/src/spike.ts"></script>
  </body>
</html>
```

Create `apps/web/src/spike.ts`:

```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { WorkerImporter } from './import/importer';

const out = document.getElementById('out')!;

async function main(): Promise<void> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  ['HAMLET', 'To be, or not to be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].forEach((t, i) =>
    page.drawText(t, { x: 72, y: 700 - i * 18, size: 12, font }),
  );
  const bytes = await doc.save();
  const r = await new WorkerImporter().importFiles([{ name: 'spike.pdf', kind: 'pdf', bytes }], 'Spike');
  out.textContent = `OK ${r.script.units.length} units; characters ${r.script.characters.map((c) => c.id).join(',')}`;
}

main().catch((err: unknown) => {
  out.textContent = `FAIL ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`;
});
```

Run `npx vite --port 5179 --strictPort` in `apps/web` (in the background), open `http://localhost:5179/spike.html` in Chrome, and read `#out`.
Expected: `OK 8 units; characters hamlet,horatio` (the unit count may differ; both characters must appear).

- [ ] **Step 9: If the spike fails with a worker error, switch pdf.js to in-thread mode**

Only if Step 8 printed `FAIL` mentioning the worker (`workerSrc`, `Setting up fake worker failed`, or a nested-worker error): replace the two pdf.js lines at the top of `import.worker.ts` with pdf.js's in-thread worker, which still runs inside our worker and keeps the main thread free:

```ts
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// pdf.js runs its "fake worker" in this thread when it finds the worker module here.
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker;
```

Re-run Step 8. Record the outcome (which mode works, the `#out` text) in the ledger or your report. Stop the dev server.

- [ ] **Step 10: Remove the spike files and commit**

```bash
rm apps/web/spike.html apps/web/src/spike.ts
git add apps/web
git commit -m "feat(web): import pipeline in a Web Worker with crash and stall handling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: App shell, services and the Library

**Files:**
- Create: `apps/web/src/services.tsx`, `apps/web/src/storage.ts`, `apps/web/src/browser.ts`, `apps/web/src/download.ts`, `apps/web/src/files.ts`, `apps/web/src/screens/Library.tsx`, `apps/web/src/screens/NotFound.tsx`, `apps/web/test/render.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/main.tsx`
- Test: `apps/web/test/storage.test.ts`, `apps/web/test/browser.test.ts`, `apps/web/test/screens/Library.test.tsx`

**Interfaces:**
- Consumes: `Repo`, `openDb` (Task 9); `Importer`, `WorkerImporter`, `runImport`, `ImportOutcome`, `ImportSource` (Task 10); router (Task 8).
- Produces:
  - `interface PendingImport { mode: 'file' | 'dasma'; script; pages; unitHints; importedFrom; warnings; cast? }`; `interface Services { repo; importer; download(name, text, mime): void; requestPersist(): Promise<boolean>; pending: Map<string, PendingImport>; saveDebounceMs: number }`; `ServicesContext`; `useServices()`.
  - `afterProductionCreated(repo, requestPersist): Promise<void>`; meta keys `'persist'` (`'granted' | 'denied'`), `'persistBannerDismissed'` (boolean), `'devTools'` (boolean).
  - `isSupportedBrowser(userAgent: string): boolean`; `downloadText(name, text, mime)`; `stem(name)`, `safeFileName(name)`.
  - `App({ services })`; `NotFound({ message? })`; `Library()`.
  - Test helpers in `test/render.tsx`: `InlineImporter`, `FakeImporter`, `outcomeFor(script?, names?, warnings?)`, `makeServices(overrides?)` returning `TestServices` (adds `downloads`, `persistCalls`), `renderApp(hash, services?)`.

- [ ] **Step 1: Write the test helpers**

`apps/web/test/render.tsx`:

```tsx
import { readDasma, type ImportWarning, type Script } from '@dasma/script';
import { render } from '@testing-library/react';
import { App } from '../src/App';
import { Repo } from '../src/db/repo';
import { openDb } from '../src/db/schema';
import type { Importer } from '../src/import/importer';
import { runImport, type ImportOutcome, type ImportSource } from '../src/import/run';
import type { Services } from '../src/services';
import { sampleScript, testDbName } from './fixtures';

/** The real import pipeline without a worker. */
export class InlineImporter implements Importer {
  importFiles: Importer['importFiles'] = (sources, title, onProgress) => runImport(sources, title, onProgress);
  readDasma: Importer['readDasma'] = async (text) => readDasma(text);
}

/** Returns a fixed outcome (or throws a fixed error) and records its calls. */
export class FakeImporter implements Importer {
  calls: Array<{ sources: ImportSource[]; title: string }> = [];
  constructor(private readonly result: ImportOutcome | Error) {}
  importFiles: Importer['importFiles'] = async (sources, title, onProgress) => {
    this.calls.push({ sources, title });
    onProgress?.('Reading…');
    if (this.result instanceof Error) throw this.result;
    return this.result;
  };
  readDasma: Importer['readDasma'] = async (text) => readDasma(text);
}

export function outcomeFor(script: Script = sampleScript(), names = ['earnest.txt'], warnings: ImportWarning[] = []): ImportOutcome {
  return { script, pages: 1, unitHints: {}, warnings, importedFrom: { kind: 'text', names } };
}

export type TestServices = Services & { downloads: Array<{ name: string; text: string; mime: string }>; persistCalls: number };

export function makeServices(overrides: Partial<Services> = {}): TestServices {
  const services: TestServices = {
    repo: new Repo(openDb(testDbName())),
    importer: new InlineImporter(),
    download: (name, text, mime) => {
      services.downloads.push({ name, text, mime });
    },
    requestPersist: async () => {
      services.persistCalls++;
      return true;
    },
    pending: new Map(),
    saveDebounceMs: 0,
    downloads: [],
    persistCalls: 0,
    ...overrides,
  };
  return services;
}

export function renderApp(hash: string, services: TestServices = makeServices()) {
  window.location.hash = hash;
  return { ...render(<App services={services} />), services };
}
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/storage.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Repo } from '../src/db/repo';
import { openDb } from '../src/db/schema';
import { afterProductionCreated } from '../src/storage';
import { testDbName } from './fixtures';

describe('afterProductionCreated', () => {
  it('asks for persistent storage until it is granted', async () => {
    const repo = new Repo(openDb(testDbName()));
    let asked = 0;
    const answer = (granted: boolean) => async () => {
      asked++;
      return granted;
    };
    await afterProductionCreated(repo, answer(false));
    expect(await repo.getMeta('persist')).toBe('denied');
    expect(await repo.getMeta('persistBannerDismissed')).toBe(false);
    await afterProductionCreated(repo, answer(true));
    expect(await repo.getMeta('persist')).toBe('granted');
    await afterProductionCreated(repo, answer(true));
    expect(asked).toBe(2);
  });

  it('treats a failing request as refused', async () => {
    const repo = new Repo(openDb(testDbName()));
    await afterProductionCreated(repo, () => Promise.reject(new Error('no')));
    expect(await repo.getMeta('persist')).toBe('denied');
  });
});
```

`apps/web/test/browser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isSupportedBrowser } from '../src/browser';
import { safeFileName, stem } from '../src/files';

describe('isSupportedBrowser', () => {
  it('accepts Chrome and Edge, not Safari or Firefox', () => {
    expect(isSupportedBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe(true);
    expect(isSupportedBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')).toBe(true);
    expect(isSupportedBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe(false);
    expect(isSupportedBrowser('Mozilla/5.0 (Macintosh; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe(false);
  });
});

describe('file names', () => {
  it('takes the stem and replaces characters files cannot hold', () => {
    expect(stem('hamlet.final.pdf')).toBe('hamlet.final');
    expect(stem('README')).toBe('README');
    expect(safeFileName('Romeo/Juliet: Act 1')).toBe('Romeo-Juliet- Act 1');
    expect(safeFileName(' / ')).toBe('-');
    expect(safeFileName('   ')).toBe('script');
  });
});
```

`apps/web/test/screens/Library.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StorageUnavailableError } from '../../src/db/repo';
import { seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

describe('Library', () => {
  it('explains how to start when there are no productions', async () => {
    renderApp('#/');
    expect(await screen.findByText(/No productions yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New production' }).getAttribute('href')).toBe('#/new');
  });

  it('lists productions with their version and check count', async () => {
    const services = makeServices();
    const { production } = await seedProduction(services.repo);
    renderApp('#/', services);
    const link = await screen.findByRole('link', { name: 'Earnest' });
    expect(link.getAttribute('href')).toBe(`#/p/${production.id}`);
    expect(screen.getByText('Version 1')).toBeTruthy();
    expect(screen.getByText('3 to check')).toBeTruthy();
  });

  it('warns when persistent storage was refused and remembers a dismissal', async () => {
    const services = makeServices();
    await services.repo.setMeta('persist', 'denied');
    const { unmount } = renderApp('#/', services);
    const user = userEvent.setup();
    expect(await screen.findByText(/may clear DASMA's data/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/may clear DASMA's data/)).toBeNull();
    expect(await services.repo.getMeta('persistBannerDismissed')).toBe(true);
    unmount();
    renderApp('#/', services);
    await screen.findByText(/No productions yet/);
    expect(screen.queryByText(/may clear DASMA's data/)).toBeNull();
  });

  it('saves the developer tools switch', async () => {
    const services = makeServices();
    renderApp('#/', services);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Show developer tools'));
    await waitFor(async () => expect(await services.repo.getMeta('devTools')).toBe(true));
  });

  it('shows a full-page message when storage is blocked', async () => {
    const services = makeServices();
    vi.spyOn(services.repo, 'open').mockRejectedValue(new StorageUnavailableError());
    renderApp('#/', services);
    expect(await screen.findByText(/blocking storage/)).toBeTruthy();
  });

  it('says when a page does not exist', async () => {
    renderApp('#/nowhere');
    expect(await screen.findByText("This page doesn't exist.")).toBeTruthy();
  });

  it('shows the best-effort notice outside Chrome and Edge', async () => {
    renderApp('#/');
    expect(await screen.findByText(/built for Chrome and Edge/)).toBeTruthy();
  });
});
```

(jsdom's user agent is neither Chrome nor Edge, so the notice shows in tests.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write `services.tsx`, `storage.ts`, `browser.ts`, `download.ts`, `files.ts`**

`apps/web/src/services.tsx`:

```tsx
import type { ImportWarning, Script, UnitHint } from '@dasma/script';
import { createContext, useContext } from 'react';
import type { Repo } from './db/repo';
import type { ImportedFrom } from './db/schema';
import type { Importer } from './import/importer';

/** A re-import or .dasma update waiting for review; kept in memory only (spec §5.5). */
export interface PendingImport {
  mode: 'file' | 'dasma';
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  importedFrom: ImportedFrom;
  warnings: ImportWarning[];
  cast?: Record<string, string[]>;
}

export interface Services {
  repo: Repo;
  importer: Importer;
  download(name: string, text: string, mime: string): void;
  requestPersist(): Promise<boolean>;
  /** Keyed by production id. */
  pending: Map<string, PendingImport>;
  saveDebounceMs: number;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices needs a ServicesContext provider.');
  return services;
}
```

`apps/web/src/storage.ts`:

```ts
import type { Repo } from './db/repo';

/** Spec §9: ask for persistent storage when a production is created, until the browser grants it. */
export async function afterProductionCreated(repo: Repo, requestPersist: () => Promise<boolean>): Promise<void> {
  if ((await repo.getMeta<string>('persist')) === 'granted') return;
  let granted = false;
  try {
    granted = await requestPersist();
  } catch {
    granted = false;
  }
  await repo.setMeta('persist', granted ? 'granted' : 'denied');
  if (!granted) await repo.setMeta('persistBannerDismissed', false);
}
```

`apps/web/src/browser.ts`:

```ts
/** D20: Chrome and Edge are supported; anything else gets a best-effort notice (never blocked). */
export function isSupportedBrowser(userAgent: string): boolean {
  return /\b(Chrome|Chromium|Edg)\//.test(userAgent) && !/\bFirefox\//.test(userAgent);
}
```

`apps/web/src/download.ts`:

```ts
export function downloadText(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

`apps/web/src/files.ts`:

```ts
/** "hamlet.final.pdf" → "hamlet.final". */
export const stem = (name: string): string => name.replace(/\.[^./\\]+$/, '');

/** A title made safe to use as a download name. */
export const safeFileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'script';
```

- [ ] **Step 5: Write `NotFound.tsx` and `Library.tsx`**

`apps/web/src/screens/NotFound.tsx`:

```tsx
import { href } from '../router';

export function NotFound({ message = "This page doesn't exist." }: { message?: string }) {
  return (
    <main className="page">
      <p>{message}</p>
      <p>
        <a href={href({ name: 'library' })}>Back to your productions</a>
      </p>
    </main>
  );
}
```

`apps/web/src/screens/Library.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ProductionSummary } from '../db/repo';
import { href } from '../router';
import { useServices } from '../services';
import { Button } from '../ui/Button';

export const STORAGE_WARNING = "Your browser may clear DASMA's data when disk space is low. Export a .dasma file after big changes.";

export function Library() {
  const { repo } = useServices();
  const [items, setItems] = useState<ProductionSummary[] | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [devTools, setDevTools] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [list, persist, dismissed, dev] = await Promise.all([
        repo.listProductions(),
        repo.getMeta<string>('persist'),
        repo.getMeta<boolean>('persistBannerDismissed'),
        repo.getMeta<boolean>('devTools'),
      ]);
      if (!live) return;
      setItems(list);
      setShowBanner(persist === 'denied' && !dismissed);
      setDevTools(!!dev);
    })();
    return () => {
      live = false;
    };
  }, [repo]);

  const dismiss = () => {
    setShowBanner(false);
    void repo.setMeta('persistBannerDismissed', true);
  };
  const toggleDevTools = (on: boolean) => {
    setDevTools(on);
    void repo.setMeta('devTools', on);
  };

  return (
    <main className="page">
      <h1>DASMA</h1>
      {showBanner && (
        <div className="banner" role="status">
          <span>{STORAGE_WARNING}</span> <Button onClick={dismiss}>Dismiss</Button>
        </div>
      )}
      <p>
        <a className="btn btn-primary" href={href({ name: 'new' })}>
          New production
        </a>
      </p>
      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p>No productions yet. Start a new production from a PDF, Word file or pasted text, or open a .dasma file someone sent you.</p>
      ) : (
        <ul className="cards">
          {items.map(({ production, version, toCheck }) => (
            <li key={production.id}>
              <a href={href({ name: 'production', id: production.id })}>{production.title}</a>
              <span className="muted">Version {version}</span>
              <span className="muted">{toCheck} to check</span>
              <span className="muted">Edited {new Date(production.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <footer className="muted">
        <label>
          <input type="checkbox" checked={devTools} onChange={(e) => toggleDevTools(e.target.checked)} /> Show developer tools
        </label>
      </footer>
    </main>
  );
}
```

(Task 18 adds the "Open .dasma file" button beside "New production".)

- [ ] **Step 6: Write `App.tsx` and `main.tsx`**

`apps/web/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { isSupportedBrowser } from './browser';
import { StorageUnavailableError } from './db/repo';
import { useRoute, type Route } from './router';
import { Library } from './screens/Library';
import { NotFound } from './screens/NotFound';
import { ServicesContext, type Services } from './services';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <Library />;
    default:
      return <NotFound />;
  }
}

export function App({ services }: { services: Services }) {
  const [state, setState] = useState<'opening' | 'ready' | 'blocked'>('opening');
  const route = useRoute();
  useEffect(() => {
    services.repo.open().then(
      () => setState('ready'),
      () => setState('blocked'),
    );
  }, [services]);

  if (state === 'blocked') {
    return (
      <main className="page">
        <h1>DASMA</h1>
        <p>{new StorageUnavailableError().message}</p>
      </main>
    );
  }
  if (state === 'opening') return null;
  return (
    <ServicesContext.Provider value={services}>
      {!isSupportedBrowser(navigator.userAgent) && (
        <p className="notice">DASMA is built for Chrome and Edge. Other browsers may work, but aren't tested yet.</p>
      )}
      <Screen route={route} />
    </ServicesContext.Provider>
  );
}
```

Later tasks add one `case` each to `Screen`: `new`, `import`, `production`, `fix`, `reimport`.

`apps/web/src/main.tsx`:

```tsx
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Repo } from './db/repo';
import { openDb } from './db/schema';
import { downloadText } from './download';
import { WorkerImporter } from './import/importer';
import type { Services } from './services';

const services: Services = {
  repo: new Repo(openDb()),
  importer: new WorkerImporter(),
  download: downloadText,
  requestPersist: () => navigator.storage?.persist?.() ?? Promise.resolve(false),
  pending: new Map(),
  saveDebounceMs: 500,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
```

- [ ] **Step 7: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint . && npm run build -w apps/web`
Expected: PASS; the build emits the import worker and the pdf.js worker as separate assets (`ls apps/web/dist/assets`).

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): app shell, services and the Library

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Import screen (new production and re-import)

**Files:**
- Create: `apps/web/src/screens/ImportScreen.tsx`, `apps/web/src/screens/warnings.ts`
- Modify: `apps/web/src/App.tsx` (cases `new` and `import`)
- Test: `apps/web/test/screens/ImportScreen.test.tsx`

**Interfaces:**
- Consumes: `useServices`, `PendingImport` (Task 11); `kindOfFile`, `ImportOutcome`, `ImportSource`, `WorkerCrashError` (Task 10); `afterProductionCreated`, `stem` (Task 11); `IMPORT_ERROR_MESSAGES`, `ScriptImportError`, `UNTITLED`.
- Produces: `ImportScreen({ productionId?: string })`; `warningText(w: ImportWarning): string`; `warningsInOrder(ws: ImportWarning[]): ImportWarning[]`. After a re-import it sets `services.pending.get(productionId)` with `mode: 'file'` and navigates to `#/p/<id>/reimport`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/screens/ImportScreen.test.tsx`:

```tsx
import { ScriptImportError } from '@dasma/script';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SAMPLE_TEXT, seedProduction } from '../fixtures';
import { FakeImporter, makeServices, outcomeFor, renderApp } from '../render';

const txt = (name: string, body = SAMPLE_TEXT) => new File([body], name, { type: 'text/plain' });

describe('Import screen', () => {
  it('creates a production from pasted text, asks to keep storage, and opens Fix tags', async () => {
    const { services } = renderApp('#/new');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Paste text' }));
    await user.type(screen.getByLabelText('Title'), 'Hamlet');
    await user.click(screen.getByLabelText('Script text'));
    await user.paste(SAMPLE_TEXT);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(window.location.hash.endsWith('/fix') || !!screen.queryByRole('button', { name: 'Continue' })).toBe(true));
    if (screen.queryByRole('button', { name: 'Continue' })) await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/[^/]+\/fix$/));
    const [item] = await services.repo.listProductions();
    expect(item.production.title).toBe('Hamlet');
    expect(services.persistCalls).toBe(1);
  });

  it('shows warnings in plain words before continuing', async () => {
    const importer = new FakeImporter(outcomeFor(undefined, undefined, [{ code: 'ambiguousAlias', token: 'MAX', candidates: ['MAXINE', 'MAXWELL'] }, { code: 'noSpeakers' }]));
    renderApp('#/new', makeServices({ importer }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Paste text' }));
    await user.click(screen.getByLabelText('Script text'));
    await user.paste('anything');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const items = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    expect(items).toEqual([
      "We couldn't find character names. Is each speech labelled like NAME: or with the name on its own line?",
      'MAX could be MAXINE or MAXWELL; check those speeches.',
    ]);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.hash).toMatch(/\/fix$/));
  });

  it('offers to paste when a PDF has no text layer', async () => {
    renderApp('#/new', makeServices({ importer: new FakeImporter(new ScriptImportError('noTextLayer')) }));
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Choose files'), txt('scan.txt'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect((await screen.findByRole('alert')).textContent).toContain("Scanned PDFs aren't supported yet");
    await user.click(screen.getByRole('button', { name: 'Paste the text instead' }));
    expect(screen.getByLabelText('Script text')).toBeTruthy();
  });

  it('refuses unsupported dropped files', async () => {
    renderApp('#/new');
    const zone = (await screen.findByText(/Drop PDF or Word files/)).closest('section')!;
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'notes.rtf')] } });
    expect((await screen.findByRole('alert')).textContent).toContain('Save it as .docx or PDF');
  });

  it('takes the title from the first file and imports files in the order shown', async () => {
    const importer = new FakeImporter(outcomeFor());
    renderApp('#/new', makeServices({ importer }));
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Choose files'), [txt('act1.txt'), txt('act2.txt')]);
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('act1');
    await user.click(screen.getByRole('button', { name: 'Move act2.txt up' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(importer.calls).toHaveLength(1));
    expect(importer.calls[0].sources.map((s) => s.name)).toEqual(['act2.txt', 'act1.txt']);
    expect(importer.calls[0].title).toBe('act1');
  });

  it('sends a re-import to review instead of saving it', async () => {
    const services = makeServices({ importer: new FakeImporter(outcomeFor()) });
    const { production } = await seedProduction(services.repo);
    renderApp(`#/p/${production.id}/import`, services);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Re-import script' })).toBeTruthy();
    await user.upload(screen.getByLabelText('Choose files'), txt('earnest-v2.txt'));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/reimport`));
    expect(services.pending.get(production.id)?.mode).toBe('file');
    expect((await services.repo.listVersions(production.id)).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/screens/ImportScreen.test.tsx`
Expected: FAIL — `#/new` renders "This page doesn't exist."

- [ ] **Step 3: Write `warnings.ts`**

```ts
import type { ImportWarning } from '@dasma/script';

const ORDER: Record<ImportWarning['code'], number> = { noSpeakers: 0, manyFlagged: 1, mixedConventions: 2, ambiguousAlias: 3 };

/** noSpeakers and manyFlagged first (spec §5.2). */
export const warningsInOrder = (ws: ImportWarning[]): ImportWarning[] => [...ws].sort((a, b) => ORDER[a.code] - ORDER[b.code]);

export function warningText(w: ImportWarning): string {
  switch (w.code) {
    case 'noSpeakers':
      return "We couldn't find character names. Is each speech labelled like NAME: or with the name on its own line?";
    case 'manyFlagged':
      return `Many lines are unsure (${Math.round(w.share * 100)}%). Fixing will take longer than usual.`;
    case 'mixedConventions':
      return 'This script labels speakers in two ways; check the speaker of each speech.';
    case 'ambiguousAlias':
      return `${w.token} could be ${w.candidates.join(' or ')}; check those speeches.`;
  }
}
```

- [ ] **Step 4: Write `ImportScreen.tsx`**

```tsx
import { IMPORT_ERROR_MESSAGES, ScriptImportError, UNTITLED, type ImportWarning } from '@dasma/script';
import { useState, type DragEvent } from 'react';
import { stem } from '../files';
import { WorkerCrashError } from '../import/importer';
import { kindOfFile, type FileKind, type ImportOutcome, type ImportSource } from '../import/run';
import { href, navigate } from '../router';
import { useServices } from '../services';
import { afterProductionCreated } from '../storage';
import { Button } from '../ui/Button';
import { warningsInOrder, warningText } from './warnings';

interface Picked {
  key: number;
  file: File;
  kind: FileKind;
}

type Status =
  | { phase: 'idle' }
  | { phase: 'running'; message: string }
  | { phase: 'error'; message: string; offerPaste: boolean }
  | { phase: 'warnings'; outcome: ImportOutcome; warnings: ImportWarning[] };

let nextKey = 1;

async function toSource(p: Picked): Promise<ImportSource> {
  return p.kind === 'text'
    ? { name: p.file.name, kind: 'text', text: await p.file.text() }
    : { name: p.file.name, kind: p.kind, bytes: new Uint8Array(await p.file.arrayBuffer()) };
}

/** Spec §5.2. With `productionId` this is a re-import, which goes to review instead of being saved. */
export function ImportScreen({ productionId }: { productionId?: string }) {
  const services = useServices();
  const [mode, setMode] = useState<'files' | 'paste'>('files');
  const [files, setFiles] = useState<Picked[]>([]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ phase: 'idle' });

  const addFiles = (list: File[]) => {
    const added: Picked[] = [];
    let refused = false;
    for (const file of list) {
      const kind = kindOfFile(file.name);
      if (kind) added.push({ key: nextKey++, file, kind });
      else refused = true;
    }
    setStatus(refused ? { phase: 'error', message: IMPORT_ERROR_MESSAGES.unsupportedFormat, offerPaste: false } : { phase: 'idle' });
    if (added.length === 0) return;
    if (!titleTouched && files.length === 0) setTitle(stem(added[0].file.name));
    setFiles((f) => [...f, ...added]);
  };

  const move = (i: number, d: -1 | 1) =>
    setFiles((f) => {
      const j = i + d;
      if (j < 0 || j >= f.length) return f;
      const n = f.slice();
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  };

  async function finish(outcome: ImportOutcome) {
    try {
      if (productionId) {
        services.pending.set(productionId, { mode: 'file', ...outcome });
        navigate({ name: 'reimport', id: productionId });
        return;
      }
      const { production } = await services.repo.createProduction({ title: title.trim() || UNTITLED, origin: 'created', version: outcome });
      await afterProductionCreated(services.repo, services.requestPersist);
      navigate({ name: 'fix', id: production.id });
    } catch (err) {
      setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err), offerPaste: false });
    }
  }

  async function run() {
    setStatus({ phase: 'running', message: 'Reading…' });
    try {
      const sources: ImportSource[] = mode === 'files' ? await Promise.all(files.map(toSource)) : [{ name: 'Pasted text', kind: 'text', text }];
      const outcome = await services.importer.importFiles(sources, title.trim() || UNTITLED, (message) => setStatus({ phase: 'running', message }));
      if (outcome.warnings.length) setStatus({ phase: 'warnings', outcome, warnings: warningsInOrder(outcome.warnings) });
      else await finish(outcome);
    } catch (err) {
      if (err instanceof ScriptImportError) setStatus({ phase: 'error', message: err.message, offerPaste: err.code === 'noTextLayer' });
      else if (err instanceof WorkerCrashError) setStatus({ phase: 'error', message: err.message, offerPaste: true });
      else setStatus({ phase: 'error', message: err instanceof Error ? err.message : String(err), offerPaste: false });
    }
  }

  const ready = mode === 'files' ? files.length > 0 : text.trim().length > 0;
  const running = status.phase === 'running';

  return (
    <main className="page">
      <p>
        <a href={productionId ? href({ name: 'production', id: productionId }) : href({ name: 'library' })}>← Back</a>
      </p>
      <h1>{productionId ? 'Re-import script' : 'New production'}</h1>
      {!productionId && (
        <label className="field">
          Title
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
          />
        </label>
      )}
      <div className="tabs">
        <Button aria-pressed={mode === 'files'} onClick={() => setMode('files')}>
          Files
        </Button>
        <Button aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>
          Paste text
        </Button>
      </div>
      {mode === 'files' ? (
        <section className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <p>Drop PDF or Word files here, or</p>
          <label className="btn btn-plain">
            Choose files
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="visually-hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
          </label>
          {files.length > 0 && (
            <>
              <ol className="file-list">
                {files.map((f, i) => (
                  <li key={f.key}>
                    <span>{f.file.name}</span>{' '}
                    <Button aria-label={`Move ${f.file.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </Button>{' '}
                    <Button aria-label={`Move ${f.file.name} down`} disabled={i === files.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </Button>{' '}
                    <Button aria-label={`Remove ${f.file.name}`} onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ol>
              <p className="muted">To add another file, choose it too. Files are joined in this order.</p>
            </>
          )}
        </section>
      ) : (
        <textarea className="paste" aria-label="Script text" rows={16} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      <p>
        <Button variant="primary" disabled={!ready || running} onClick={() => void run()}>
          Import
        </Button>
      </p>
      {status.phase === 'running' && <p role="status">{status.message}</p>}
      {status.phase === 'error' && (
        <div role="alert" className="alert">
          <p>{status.message}</p>
          {status.offerPaste && (
            <Button
              onClick={() => {
                setMode('paste');
                setStatus({ phase: 'idle' });
              }}
            >
              Paste the text instead
            </Button>
          )}
        </div>
      )}
      {status.phase === 'warnings' && (
        <section>
          <h2>Before you fix tags</h2>
          <ul>
            {status.warnings.map((w, i) => (
              <li key={i}>{warningText(w)}</li>
            ))}
          </ul>
          <Button variant="primary" onClick={() => void finish(status.outcome)}>
            Continue
          </Button>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Route to it in `App.tsx`**

```tsx
    case 'new':
      return <ImportScreen />;
    case 'import':
      return <ImportScreen productionId={route.id} />;
```

- [ ] **Step 6: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): import screen with several files, warnings and paste fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Production page (summary, cast list, exports, delete)

**Files:**
- Create: `apps/web/src/screens/Production.tsx`
- Modify: `apps/web/src/App.tsx` (case `production`)
- Test: `apps/web/test/screens/Production.test.tsx`

**Interfaces:**
- Consumes: `Repo` (Task 9); `useServices` (Task 11); `safeFileName`, `stem` (Task 11); `checkQueue`, `writeDasma`, `toAnswerKey`, `DASMA_EXTENSION`, `DASMA_MIME` from `@dasma/script`.
- Produces: `Production({ id: string })`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/screens/Production.test.tsx`:

```tsx
import { readDasma, toAnswerKey } from '@dasma/script';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

async function open(opts: Parameters<typeof seedProduction>[1] = {}, devTools = false) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo, opts);
  if (devTools) await services.repo.setMeta('devTools', true);
  renderApp(`#/p/${production.id}`, services);
  await screen.findByLabelText('Production title');
  return { services, production, user: userEvent.setup() };
}

describe('Production page', () => {
  it('summarises the live script with links to fix and re-import', async () => {
    const { production } = await open();
    expect(screen.getByText(/10 units · 3 to check/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fix tags' }).getAttribute('href')).toBe(`#/p/${production.id}/fix`);
    expect(screen.getByRole('link', { name: 'Re-import' }).getAttribute('href')).toBe(`#/p/${production.id}/import`);
  });

  it('renames the production on blur', async () => {
    const { services, production, user } = await open();
    const title = screen.getByLabelText('Production title');
    await user.clear(title);
    await user.type(title, 'The Importance{Enter}');
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.title).toBe('The Importance'));
  });

  it('saves actor names for a character', async () => {
    const { services, production, user } = await open();
    await user.type(screen.getByLabelText('Actors for LANE'), 'Ann Lee, Bo Diaz');
    await user.tab();
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann Lee', 'Bo Diaz'] }));
  });

  it('exports .dasma without the cast unless it is ticked', async () => {
    const { services, user } = await open({ title: 'Romeo/Juliet: Act 1', cast: { lane: ['Ann'] } });
    await user.click(screen.getByRole('button', { name: 'Export .dasma' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(services.downloads[0].name).toBe('Romeo-Juliet- Act 1.dasma');
    const plain = readDasma(services.downloads[0].text);
    expect(plain.script).toEqual({ ...sampleScript(), title: 'Romeo/Juliet: Act 1' });
    expect(plain.cast).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Export .dasma' }));
    await user.click(screen.getByLabelText('Include cast list'));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(readDasma(services.downloads[1].text).cast).toEqual({ lane: ['Ann'] });
  });

  it('exports an answer key named after the source file, only with developer tools on', async () => {
    const { services, user } = await open({ names: ['earnest.pdf'], kind: 'pdf' }, true);
    await user.click(screen.getByRole('button', { name: 'Export answer key' }));
    expect(services.downloads[0].name).toBe('earnest.truth.json');
    expect(JSON.parse(services.downloads[0].text)).toEqual(toAnswerKey(sampleScript(), 1));
  });

  it('hides the answer key without developer tools', async () => {
    await open();
    expect(screen.queryByRole('button', { name: 'Export answer key' })).toBeNull();
  });

  it('disables the answer key for a script from several files', async () => {
    await open({ names: ['act1.pdf', 'act2.pdf'], kind: 'pdf' }, true);
    expect((screen.getByRole('button', { name: 'Export answer key' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Only for a script imported from a single file.')).toBeTruthy();
  });

  it('deletes only after the title is typed', async () => {
    const { services, production, user } = await open();
    await user.click(screen.getByText('Delete production'));
    const del = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    await user.type(screen.getByLabelText('Type the title to confirm'), 'Earnest');
    await user.click(del);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await services.repo.getProduction(production.id)).toBeUndefined();
  });

  it('says when the production does not exist', async () => {
    renderApp('#/p/missing');
    expect(await screen.findByText("This production doesn't exist.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/screens/Production.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `Production.tsx`**

```tsx
import { checkQueue, DASMA_EXTENSION, DASMA_MIME, toAnswerKey, writeDasma } from '@dasma/script';
import { useCallback, useEffect, useState } from 'react';
import type { ProductionRow, ScriptVersionRow } from '../db/schema';
import { safeFileName, stem } from '../files';
import { href, navigate } from '../router';
import { useServices } from '../services';
import { Button } from '../ui/Button';
import { NotFound } from './NotFound';

interface Loaded {
  production: ProductionRow;
  live: ScriptVersionRow;
  versions: ScriptVersionRow[];
  devTools: boolean;
}

export const ANSWER_KEY_SINGLE_FILE = 'Only for a script imported from a single file.';

export function Production({ id }: { id: string }) {
  const { repo, download } = useServices();
  const [data, setData] = useState<Loaded | 'missing' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [includeCast, setIncludeCast] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');

  const load = useCallback(async () => {
    const [production, live] = await Promise.all([repo.getProduction(id), repo.getLiveVersion(id)]);
    if (!production || !live) {
      setData('missing');
      return;
    }
    const [versions, devTools] = await Promise.all([repo.listVersions(id), repo.getMeta<boolean>('devTools')]);
    setData({ production, live, versions, devTools: !!devTools });
  }, [repo, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (data === null) return <main className="page">Loading…</main>;
  if (data === 'missing') return <NotFound message="This production doesn't exist." />;
  const { production, live, versions, devTools } = data;
  const script = live.script;
  const lines = new Map<string, number>();
  for (const u of script.units) if (u.kind === 'dialogue' && u.characterId) lines.set(u.characterId, (lines.get(u.characterId) ?? 0) + 1);
  const characters = [...script.characters].sort((a, b) => Number(!lines.get(a.id)) - Number(!lines.get(b.id)));
  const keyAllowed = live.importedFrom.names.length === 1 && live.importedFrom.kind !== 'dasma';

  const saveTitle = async (value: string) => {
    const t = value.trim();
    if (!t || t === production.title) return;
    await repo.updateProduction(id, { title: t });
    await load();
  };
  const saveActors = async (characterId: string, value: string) => {
    const names = value.split(',').map((s) => s.trim()).filter(Boolean);
    const cast = { ...production.cast };
    if (names.length) cast[characterId] = names;
    else delete cast[characterId];
    await repo.updateProduction(id, { cast });
    await load();
  };
  const exportDasma = () => {
    const cast = Object.fromEntries(Object.entries(production.cast).filter(([, names]) => names.length > 0));
    const text = writeDasma({ ...script, title: production.title }, includeCast && Object.keys(cast).length ? { cast } : {});
    download(`${safeFileName(production.title)}${DASMA_EXTENSION}`, text, DASMA_MIME);
    setExporting(false);
    setIncludeCast(false);
  };
  const exportAnswerKey = () =>
    download(`${stem(live.importedFrom.names[0])}.truth.json`, `${JSON.stringify(toAnswerKey(script, live.pages), null, 2)}\n`, 'application/json');
  const remove = async () => {
    await repo.deleteProduction(id);
    navigate({ name: 'library' });
  };

  return (
    <main className="page">
      <p>
        <a href={href({ name: 'library' })}>← Productions</a>
      </p>
      <h1>
        <input
          aria-label="Production title"
          className="title-input"
          defaultValue={production.title}
          onBlur={(e) => void saveTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </h1>

      <section>
        <h2>Script</h2>
        <p>
          Version {live.version} · {script.units.length} units · {checkQueue(script).length} to check · Edited {new Date(production.updatedAt).toLocaleString()}
        </p>
        <p className="tabs">
          <a className="btn btn-primary" href={href({ name: 'fix', id })}>
            Fix tags
          </a>
          <a className="btn" href={href({ name: 'import', id })}>
            Re-import
          </a>
          <Button onClick={() => setExporting(true)}>Export .dasma</Button>
        </p>
        {exporting && (
          <div className="banner">
            <label>
              <input type="checkbox" checked={includeCast} onChange={(e) => setIncludeCast(e.target.checked)} /> Include cast list
            </label>{' '}
            <Button variant="primary" onClick={exportDasma}>
              Download
            </Button>{' '}
            <Button onClick={() => setExporting(false)}>Cancel</Button>
          </div>
        )}
      </section>

      <section>
        <h2>Cast list</h2>
        <table className="grid">
          <thead>
            <tr>
              <th>Character</th>
              <th>Aliases</th>
              <th>Actors (separate with commas)</th>
            </tr>
          </thead>
          <tbody>
            {characters.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {!lines.get(c.id) && <span className="muted"> (no lines)</span>}
                </td>
                <td>
                  {c.aliases.map((a) => (
                    <span key={a} className="chip">
                      {a}
                    </span>
                  ))}
                </td>
                <td>
                  <input
                    aria-label={`Actors for ${c.name}`}
                    defaultValue={production.cast[c.id]?.join(', ') ?? ''}
                    onBlur={(e) => void saveActors(c.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Versions</h2>
        <ol reversed>
          {[...versions].reverse().map((v) => (
            <li key={v.id}>
              Version {v.version} · {new Date(v.createdAt).toLocaleString()} · {v.importedFrom.names.join(', ')}
            </li>
          ))}
        </ol>
      </section>

      {devTools && (
        <section>
          <h2>Developer tools</h2>
          <Button disabled={!keyAllowed} onClick={exportAnswerKey}>
            Export answer key
          </Button>
          <p className="muted">
            {keyAllowed
              ? `Contains the script's text. Save it in harness/local/ next to ${live.importedFrom.names[0]}; never commit it.`
              : ANSWER_KEY_SINGLE_FILE}
          </p>
        </section>
      )}

      <details>
        <summary>Delete production</summary>
        <p>This deletes the production and every version of its script.</p>
        <label className="field">
          Type the title to confirm
          <input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} />
        </label>
        <Button variant="danger" disabled={confirmTitle !== production.title} onClick={() => void remove()}>
          Delete
        </Button>
      </details>
    </main>
  );
}
```

- [ ] **Step 4: Route to it in `App.tsx`**

```tsx
    case 'production':
      return <Production id={route.id} />;
```

- [ ] **Step 5: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): production page with cast list, .dasma and answer-key export, delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Script editor state — undo, debounced save, flush, conflicts

**Files:**
- Create: `apps/web/src/fix/useScriptEditor.ts`
- Test: `apps/web/test/fix/useScriptEditor.test.tsx`

**Interfaces:**
- Consumes: `applyEdit`, `EditError`, `EditOp`, `Script` from `@dasma/script`; `Repo`, `RevConflictError` (Task 9); `useServices` (Task 11).
- Produces: `useScriptEditor(productionId: string, keep: () => readonly string[]): ScriptEditor`; `interface ScriptEditor { status: 'loading' | 'ready' | 'missing'; version: ScriptVersionRow | null; script: Script | null; apply(op): string | null; undo(); redo(); canUndo; canRedo; saveState: SaveState; saveError: string | null; flush(): Promise<void> }`; `type SaveState = 'saved' | 'saving' | 'error' | 'conflict'`; `UNDO_LIMIT = 200`; `SAVE_FAILED`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/fix/useScriptEditor.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SAVE_FAILED, useScriptEditor } from '../../src/fix/useScriptEditor';
import { ServicesContext, type Services } from '../../src/services';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices } from '../render';

async function setup(overrides: Partial<Services> = {}) {
  const services = makeServices(overrides);
  const { production, version } = await seedProduction(services.repo);
  const wrapper = ({ children }: { children: ReactNode }) => <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
  const hook = renderHook(() => useScriptEditor(production.id, () => []), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe('ready'));
  const stored = async () => (await services.repo.getLiveVersion(production.id))!;
  return { services, production, version, hook, stored };
}

describe('useScriptEditor', () => {
  it('loads the live version', async () => {
    const { hook } = await setup();
    expect(hook.result.current.script).toEqual(sampleScript());
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('applies an edit and saves it with the next rev', async () => {
    const { hook, stored } = await setup();
    act(() => {
      expect(hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] })).toBeNull();
    });
    expect(hook.result.current.script!.units[0].tagConfidence).toBe(1);
    await waitFor(async () => expect((await stored()).rev).toBe(1));
    expect((await stored()).script.units[0].tagConfidence).toBe(1);
    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'));
  });

  it('returns the message of an edit that does not apply and changes nothing', async () => {
    const { hook } = await setup();
    let message: string | null = null;
    act(() => {
      message = hook.result.current.apply({ type: 'confirm', unitIds: ['nope'] });
    });
    expect(message).toBe('There is no unit nope.');
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('undoes and redoes, saving each state', async () => {
    const { hook, stored } = await setup();
    act(() => void hook.result.current.apply({ type: 'remove', unitIds: ['u2'] }));
    act(() => hook.result.current.undo());
    expect(hook.result.current.script!.units).toHaveLength(10);
    expect(hook.result.current.canRedo).toBe(true);
    await waitFor(async () => expect((await stored()).script.units).toHaveLength(10));
    act(() => hook.result.current.redo());
    expect(hook.result.current.script!.units).toHaveLength(9);
    await waitFor(async () => expect((await stored()).script.units).toHaveLength(9));
  });

  it(`keeps at most ${200} undo steps`, async () => {
    const { hook } = await setup({ saveDebounceMs: 60_000 });
    for (let k = 0; k < 205; k++) act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    for (let k = 0; k < 200; k++) act(() => hook.result.current.undo());
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('stops saving after another tab saved first', async () => {
    const { services, version, hook, stored } = await setup();
    await services.repo.saveScript(version.id, { ...sampleScript(), title: 'Other tab' }, 0);
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('conflict'));
    expect(hook.result.current.saveError).toBe('This script was changed in another tab. Reload to continue.');
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u7'] }));
    expect((await stored()).script.title).toBe('Other tab');
  });

  it('keeps edits in memory after a failed save and retries on the next change', async () => {
    const { services, hook, stored } = await setup();
    vi.spyOn(services.repo, 'saveScript').mockRejectedValueOnce(new Error('QuotaExceededError'));
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('error'));
    expect(hook.result.current.saveError).toBe(SAVE_FAILED);
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u7'] }));
    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'));
    const saved = (await stored()).script;
    expect([saved.units[0].tagConfidence, saved.units[6].tagConfidence]).toEqual([1, 1]);
  });

  it('flushes a pending save when unmounted', async () => {
    const { hook, stored } = await setup({ saveDebounceMs: 60_000 });
    act(() => void hook.result.current.apply({ type: 'confirm', unitIds: ['u1'] }));
    hook.unmount();
    await waitFor(async () => expect((await stored()).script.units[0].tagConfidence).toBe(1));
  });

  it('reports a missing production', async () => {
    const services = makeServices();
    const wrapper = ({ children }: { children: ReactNode }) => <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
    const { result } = renderHook(() => useScriptEditor('missing', () => []), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('missing'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/fix/useScriptEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `useScriptEditor.ts`**

```ts
import { applyEdit, EditError, type EditOp, type Script } from '@dasma/script';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { RevConflictError } from '../db/repo';
import type { ScriptVersionRow } from '../db/schema';
import { useServices } from '../services';

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';
export const UNDO_LIMIT = 200;
export const SAVE_FAILED = 'Not saved: the browser is out of space. Export a .dasma backup now.';

export interface ScriptEditor {
  status: 'loading' | 'ready' | 'missing';
  version: ScriptVersionRow | null;
  script: Script | null;
  /** Applies one op; returns the EditError message (and changes nothing) when it does not apply. */
  apply(op: EditOp): string | null;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  saveError: string | null;
  flush(): Promise<void>;
}

/** Spec §7.1: the live version in memory, whole-script undo, saves debounced and serialised, flushed on leave. */
export function useScriptEditor(productionId: string, keep: () => readonly string[]): ScriptEditor {
  const { repo, saveDebounceMs } = useServices();
  const [status, setStatus] = useState<ScriptEditor['status']>('loading');
  const [version, setVersion] = useState<ScriptVersionRow | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const script = useRef<Script | null>(null);
  const past = useRef<Script[]>([]);
  const future = useRef<Script[]>([]);
  const rev = useRef(0);
  const versionId = useRef<string | null>(null);
  const dirty = useRef(false);
  const stopped = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keepRef = useRef(keep);
  useLayoutEffect(() => {
    keepRef.current = keep;
  });

  useEffect(() => {
    let live = true;
    void repo.getLiveVersion(productionId).then((v) => {
      if (!live) return;
      if (!v) {
        setStatus('missing');
        return;
      }
      script.current = v.script;
      rev.current = v.rev;
      versionId.current = v.id;
      past.current = [];
      future.current = [];
      dirty.current = false;
      stopped.current = false;
      setVersion(v);
      setStatus('ready');
    });
    return () => {
      live = false;
    };
  }, [repo, productionId]);

  const saveNow = useCallback(async (): Promise<void> => {
    if (!dirty.current || stopped.current || !versionId.current || !script.current) return;
    const snapshot = script.current;
    dirty.current = false;
    setSaveState('saving');
    try {
      rev.current = await repo.saveScript(versionId.current, snapshot, rev.current);
      if (!dirty.current) {
        setSaveState('saved');
        setSaveError(null);
      }
    } catch (err) {
      if (err instanceof RevConflictError) {
        stopped.current = true;
        setSaveState('conflict');
        setSaveError(err.message);
      } else {
        dirty.current = true;
        setSaveState('error');
        setSaveError(SAVE_FAILED);
      }
    }
  }, [repo]);

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    chain.current = chain.current.then(saveNow);
    return chain.current;
  }, [saveNow]);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), saveDebounceMs);
  }, [flush, saveDebounceMs]);

  const show = useCallback(
    (next: Script) => {
      script.current = next;
      dirty.current = true;
      rerender();
      schedule();
    },
    [schedule],
  );

  const apply = useCallback(
    (op: EditOp): string | null => {
      const cur = script.current;
      if (!cur) return 'The script is still loading.';
      let next: Script;
      try {
        next = applyEdit(cur, op, { keep: keepRef.current() });
      } catch (err) {
        if (err instanceof EditError) return err.message;
        throw err;
      }
      past.current = [...past.current, cur].slice(-UNDO_LIMIT);
      future.current = [];
      show(next);
      return null;
    },
    [show],
  );

  const undo = useCallback(() => {
    const prev = past.current[past.current.length - 1];
    if (!prev || !script.current) return;
    past.current = past.current.slice(0, -1);
    future.current = [script.current, ...future.current];
    show(prev);
  }, [show]);

  const redo = useCallback(() => {
    const next = future.current[0];
    if (!next || !script.current) return;
    future.current = future.current.slice(1);
    past.current = [...past.current, script.current].slice(-UNDO_LIMIT);
    show(next);
  }, [show]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  return {
    status,
    version,
    script: script.current,
    apply,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    saveState,
    saveError,
    flush,
  };
}
```

- [ ] **Step 4: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): script editor state with undo, debounced saves and conflict detection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: Fix tags screen — layout, selection, check list and tag/edit actions

**Files:**
- Create: `apps/web/src/fix/actions.ts`, `apps/web/src/fix/ScriptView.tsx`, `apps/web/src/fix/CheckList.tsx`, `apps/web/src/fix/FixHeader.tsx`, `apps/web/src/fix/FixPanel.tsx`, `apps/web/src/fix/ShortcutSheet.tsx`, `apps/web/src/fix/FixTags.tsx`
- Modify: `apps/web/src/App.tsx` (case `fix`)
- Test: `apps/web/test/fix/actions.test.ts`, `apps/web/test/fix/FixTags.test.tsx`

**Interfaces:**
- Consumes: `useScriptEditor`, `ScriptEditor` (Task 14); `useShortcuts`, `shortcutLabel`, `Button` (Task 8); `checkQueue`, `similarUnits`, `wordSpans`, `CheckItem`, `CheckReason`, `EditOp`, `Script`, `Unit`, `UnitHint`, `UnitKind` from `@dasma/script`.
- Produces:
  - `interface Selection { unitIds: string[]; anchor: string }`; `interface WordSel { unitId: string; anchor: number; from: number; to: number }` (`to` exclusive); `type PickPurpose = 'speechBy' | 'setName' | 'moveSpeeches'`; `type Panel = { kind: 'none' } | { kind: 'help' } | { kind: 'picker'; purpose: PickPurpose } | { kind: 'editText' }`.
  - `interface FixAction { id; label; keys: string[]; group: 'nav' | 'tag' | 'edit' | 'history' | 'help'; enabled: boolean; run(): void }`; `interface FixContext` (below); `buildFixActions(ctx): FixAction[]`; `targetIds(ctx): string[]`; `liveSelection(script, sel)`; `liveWords(script, sel, words)`; `coveredBy(ranges, from, to)`; `nearbySpeakers(script, anchorId, max?)`.
  - `KIND_LABEL: Record<UnitKind, string>`; `reasonLabel(item: CheckItem): string`.
  - `FixTags({ productionId })`, `FixWorkspace`. Tasks 16 and 17 add actions to `buildFixActions` and panels to `FixWorkspace`.
  - Action ids and labels (tests and later tasks rely on them): `next` "Next to check" (j), `prev` "Previous to check" (k), `down` "Next unit" (ArrowDown), `up` "Previous unit" (ArrowUp), `confirm` "It's right" (Enter), `direction` "Direction" (d), `heading` "Heading" (h), `frontMatter` "Front matter" (f), `cut` "Cut" / "Cut words" (x), `sceneBreak` "Scene break before" (b), `remove` "Remove" (Delete, Backspace), `undo` "Undo" (mod+z), `redo` "Redo" (mod+shift+z), `help` "Shortcuts" (?).

- [ ] **Step 1: Write the failing tests**

`apps/web/test/fix/actions.test.ts`:

```ts
import { checkQueue, type EditOp } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { buildFixActions, coveredBy, liveSelection, liveWords, nearbySpeakers, targetIds, type FixContext } from '../../src/fix/actions';
import { sampleScript } from '../fixtures';

function ctx(over: Partial<FixContext> = {}) {
  const script = sampleScript();
  const applied: EditOp[] = [];
  const selected: string[] = [];
  const c: FixContext = {
    script,
    hints: {},
    queue: checkQueue(script),
    sel: null,
    words: null,
    similar: false,
    panel: { kind: 'none' },
    apply: (op) => {
      applied.push(op);
      return true;
    },
    select: (id) => selected.push(id),
    openPanel: () => {},
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
    ...over,
  };
  const run = (id: string) => buildFixActions(c).find((a) => a.id === id)!.run();
  return { c, applied, selected, run };
}

describe('Fix actions', () => {
  it('steps through the check queue, wrapping around', () => {
    const t = ctx({ sel: { unitIds: ['u7'], anchor: 'u7' } });
    t.run('next');
    t.run('prev');
    expect(t.selected).toEqual(['u8', 'u1']);
    const end = ctx({ sel: { unitIds: ['u8'], anchor: 'u8' } });
    end.run('next');
    expect(end.selected).toEqual(['u1']);
    const none = ctx();
    none.run('next');
    none.run('prev');
    expect(none.selected).toEqual(['u1', 'u8']);
  });

  it('moves unit by unit and stops at the ends', () => {
    const t = ctx({ sel: { unitIds: ['u10'], anchor: 'u10' } });
    t.run('down');
    t.run('up');
    expect(t.selected).toEqual(['u10', 'u9']);
  });

  it('widens tag actions to similar units only when ticked', () => {
    const s = sampleScript();
    s.units.push({ id: 'u11', kind: 'heading', text: 'Another guess', cut: false, tagConfidence: 0.5, source: [] });
    const base = { script: s, queue: checkQueue(s), sel: { unitIds: ['u1'], anchor: 'u1' } };
    expect(targetIds(ctx(base).c)).toEqual(['u1']);
    expect(targetIds(ctx({ ...base, similar: true }).c)).toEqual(['u1', 'u11']);
    const t = ctx({ ...base, similar: true });
    t.run('frontMatter');
    expect(t.applied).toEqual([{ type: 'setKind', unitIds: ['u1', 'u11'], kind: 'frontMatter' }]);
  });

  it('cuts words when words are selected, otherwise toggles whole units', () => {
    const words = ctx({ sel: { unitIds: ['u4'], anchor: 'u4' }, words: { unitId: 'u4', anchor: 1, from: 1, to: 3 } });
    words.run('cut');
    expect(words.applied).toEqual([{ type: 'setCutWords', unitId: 'u4', from: 1, to: 3, cut: true }]);
    const units = ctx({ sel: { unitIds: ['u4', 'u5'], anchor: 'u4' } });
    units.run('cut');
    expect(units.applied).toEqual([{ type: 'setCut', unitIds: ['u4', 'u5'], cut: true }]);
  });

  it('disables selection actions with nothing selected', () => {
    const enabled = Object.fromEntries(buildFixActions(ctx().c).map((a) => [a.id, a.enabled]));
    expect(enabled).toMatchObject({ confirm: false, direction: false, cut: false, remove: false, sceneBreak: false, next: true, help: true });
  });

  it('drops vanished ids from the selection and words', () => {
    const s = sampleScript();
    expect(liveSelection(s, { unitIds: ['u4', 'gone'], anchor: 'gone' })).toEqual({ unitIds: ['u4'], anchor: 'u4' });
    expect(liveSelection(s, { unitIds: ['gone'], anchor: 'gone' })).toBeNull();
    const sel = { unitIds: ['u4'], anchor: 'u4' };
    expect(liveWords(s, sel, { unitId: 'u4', anchor: 0, from: 0, to: 8 })).not.toBeNull();
    expect(liveWords(s, sel, { unitId: 'u4', anchor: 0, from: 0, to: 9 })).toBeNull();
    expect(liveWords(s, { unitIds: ['u4', 'u5'], anchor: 'u4' }, { unitId: 'u4', anchor: 0, from: 0, to: 1 })).toBeNull();
  });

  it('knows which words are covered by overlap ranges and who speaks nearby', () => {
    expect(coveredBy([[1, 3]], 1, 3)).toBe(true);
    expect(coveredBy([[1, 2]], 1, 3)).toBe(false);
    expect(coveredBy(undefined, 0, 1)).toBe(false);
    expect(nearbySpeakers(sampleScript(), 'u7')).toEqual(['lane', 'okay', 'algernon']);
  });
});
```

`apps/web/test/fix/FixTags.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

export async function openFix(script = sampleScript(), cast?: Record<string, string[]>) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo, { script, cast });
  renderApp(`#/p/${production.id}/fix`, services);
  await screen.findByRole('listbox', { name: 'Script' });
  const stored = async () => (await services.repo.getLiveVersion(production.id))!.script;
  const unitEl = (id: string) => document.getElementById(`unit-${id}`)!;
  const selectedIds = () => [...document.querySelectorAll('[aria-selected="true"]')].map((e) => e.id.replace('unit-', ''));
  return { services, production, user: userEvent.setup(), stored, unitEl, selectedIds };
}

describe('Fix tags', () => {
  it('lists the units to check and steps through them with j and k', async () => {
    const { user, selectedIds } = await openFix();
    const list = screen.getByRole('region', { name: 'To check' });
    expect(within(list).getByRole('heading').textContent).toBe('To check (3)');
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      "heading?Morning-room in Algernon's flat",
      'new character?OKAY.',
      "new character?I'm sorry for that, for your sake.",
    ]);
    await user.keyboard('j');
    expect(selectedIds()).toEqual(['u1']);
    await user.keyboard('jk');
    expect(selectedIds()).toEqual(['u1']);
    await user.click(screen.getByRole('button', { name: /^Next to check/ }));
    expect(selectedIds()).toEqual(['u7']);
  });

  it('retags with keys and with buttons, and saves', async () => {
    const { user, stored, unitEl } = await openFix();
    await user.keyboard('j');
    await user.keyboard('f');
    expect(unitEl('u1').dataset.kind).toBe('frontMatter');
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
    await user.click(unitEl('u2'));
    await user.click(screen.getByRole('button', { name: /^Heading/ }));
    expect(unitEl('u2').dataset.kind).toBe('heading');
    await waitFor(async () => expect((await stored()).units.slice(0, 2).map((u) => u.kind)).toEqual(['frontMatter', 'heading']));
  });

  it("confirms with It's right, and undoes and redoes", async () => {
    const { user } = await openFix();
    await user.keyboard('j{Enter}');
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
    await user.keyboard('{Meta>}z{/Meta}');
    expect(screen.getByRole('heading', { name: 'To check (3)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Redo/ }));
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
  });

  it('runs a focused button once when Enter is pressed on it', async () => {
    const { user } = await openFix();
    await user.keyboard('j');
    screen.getByRole('button', { name: /^It's right/ }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'To check (2)' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Undo/ }));
    expect(screen.getByRole('heading', { name: 'To check (3)' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('selects a range with shift-click and cuts it', async () => {
    const { user, unitEl, selectedIds } = await openFix();
    await user.click(unitEl('u2'));
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4'));
    await user.keyboard('{/Shift}');
    expect(selectedIds()).toEqual(['u2', 'u3', 'u4']);
    await user.keyboard('x');
    expect(['u2', 'u3', 'u4'].every((id) => unitEl(id).classList.contains('cut'))).toBe(true);
    await user.keyboard('x');
    expect(unitEl('u3').classList.contains('cut')).toBe(false);
  });

  it('cuts selected words by splitting the unit', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u4'));
    await user.click(unitEl('u4').querySelector('[data-word="2"]')!);
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4').querySelector('[data-word="3"]')!);
    await user.keyboard('{/Shift}');
    expect(screen.getByText('Words 3–4 selected')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Cut words/ }));
    await waitFor(async () =>
      expect((await stored()).units.slice(3, 6).map((u) => [u.text, u.cut])).toEqual([
        ['Did you', false],
        ['hear what', true],
        ['I was playing, Lane?', false],
      ]),
    );
  });

  it('inserts and removes a scene break, and survives removing the selection', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u5'));
    await user.keyboard('b');
    expect(unitEl('u11').dataset.kind).toBe('sceneBreak');
    await user.click(unitEl('u11'));
    await user.keyboard('{Delete}');
    expect(document.getElementById('unit-u11')).toBeNull();
    expect(screen.getByText('Select a unit in the script.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Remove/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(unitEl('u11')).toBeTruthy();
  });

  it('shows a refused edit as a message', async () => {
    const { user, unitEl } = await openFix(sampleScript());
    await user.click(unitEl('u1'));
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u10'));
    await user.keyboard('{/Shift}');
    await user.keyboard('{Delete}');
    expect((await screen.findByRole('alert')).textContent).toBe('A script needs at least one unit.');
  });

  it('opens and closes the shortcut sheet', async () => {
    const { user } = await openFix();
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Shortcuts/ }));
    await user.click(screen.getByRole('button', { name: /^Close/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves and returns to the production page on Done', async () => {
    const { user, production, stored } = await openFix();
    await user.keyboard('jf');
    await user.click(screen.getByRole('button', { name: /^Done/ }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}`));
    expect((await stored()).units[0].kind).toBe('frontMatter');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/fix`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `actions.ts`**

```ts
import { similarUnits, wordSpans, type CheckItem, type EditOp, type Script, type UnitHint } from '@dasma/script';

export interface Selection {
  unitIds: string[];
  anchor: string;
}

/** Selected words inside one selected unit: `tokenize` word indices, `to` exclusive. */
export interface WordSel {
  unitId: string;
  anchor: number;
  from: number;
  to: number;
}

export type PickPurpose = 'speechBy' | 'setName' | 'moveSpeeches';
export type Panel = { kind: 'none' } | { kind: 'help' } | { kind: 'picker'; purpose: PickPurpose } | { kind: 'editText' };

/** One action: it renders one button and binds its keys (spec §3.3), so a key and its button always do the same thing. */
export interface FixAction {
  id: string;
  label: string;
  keys: string[];
  group: 'nav' | 'tag' | 'edit' | 'history' | 'help';
  enabled: boolean;
  run(): void;
}

export interface FixContext {
  script: Script;
  hints: Readonly<Record<string, UnitHint>>;
  queue: CheckItem[];
  sel: Selection | null;
  words: WordSel | null;
  similar: boolean;
  panel: Panel;
  /** Applies an op; false (with a message shown) when it does not apply. */
  apply(op: EditOp): boolean;
  select(unitId: string): void;
  openPanel(panel: Panel): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export function liveSelection(script: Script, sel: Selection | null): Selection | null {
  if (!sel) return null;
  const ids = new Set(script.units.map((u) => u.id));
  const unitIds = sel.unitIds.filter((id) => ids.has(id));
  if (unitIds.length === 0) return null;
  return { unitIds, anchor: ids.has(sel.anchor) ? sel.anchor : unitIds[0] };
}

export function liveWords(script: Script, sel: Selection | null, words: WordSel | null): WordSel | null {
  if (!words || !sel || sel.unitIds.length !== 1 || sel.anchor !== words.unitId) return null;
  const u = script.units.find((x) => x.id === words.unitId);
  return u && words.to <= wordSpans(u.text).length ? words : null;
}

export function coveredBy(ranges: ReadonlyArray<readonly [number, number]> | undefined, from: number, to: number): boolean {
  for (let k = from; k < to; k++) if (!ranges?.some(([a, b]) => k >= a && k < b)) return false;
  return true;
}

/** Speakers of the closest dialogue units around a unit, nearest first (the picker's 1–9). */
export function nearbySpeakers(script: Script, anchorId: string, max = 9): string[] {
  const i = script.units.findIndex((u) => u.id === anchorId);
  if (i < 0) return [];
  const out: string[] = [];
  for (let d = 1; out.length < max && (i - d >= 0 || i + d < script.units.length); d++) {
    for (const k of [i - d, i + d]) {
      const u = script.units[k];
      if (u?.kind === 'dialogue' && u.characterId && !out.includes(u.characterId)) out.push(u.characterId);
    }
  }
  return out.slice(0, max);
}

/** The selected units, widened to the "lines like this" when apply-to-similar is ticked (spec §6.4). */
export function targetIds(ctx: FixContext): string[] {
  if (!ctx.sel) return [];
  if (!ctx.similar || ctx.sel.unitIds.length !== 1) return ctx.sel.unitIds;
  return [ctx.sel.anchor, ...similarUnits(ctx.script, ctx.hints, ctx.sel.anchor)];
}

function stepUnit(ctx: FixContext, delta: number): void {
  const { units } = ctx.script;
  if (units.length === 0) return;
  const at = ctx.sel ? units.findIndex((u) => u.id === ctx.sel!.anchor) : -1;
  const i = at < 0 ? (delta > 0 ? 0 : units.length - 1) : Math.min(units.length - 1, Math.max(0, at + delta));
  ctx.select(units[i].id);
}

function stepQueue(ctx: FixContext, delta: number): void {
  const { queue, script } = ctx;
  if (queue.length === 0) return;
  const pos = new Map(script.units.map((u, i) => [u.id, i]));
  const at = ctx.sel ? (pos.get(ctx.sel.anchor) ?? -1) : -1;
  const item =
    delta > 0
      ? (queue.find((q) => pos.get(q.unitId)! > at) ?? queue[0])
      : ([...queue].reverse().find((q) => pos.get(q.unitId)! < at) ?? queue[queue.length - 1]);
  ctx.select(item.unitId);
}

export function buildFixActions(ctx: FixContext): FixAction[] {
  const sel = ctx.sel;
  const has = !!sel && sel.unitIds.length > 0;
  const selected = sel ? ctx.script.units.filter((u) => sel.unitIds.includes(u.id)) : [];
  const wordsUnit = ctx.words ? (ctx.script.units.find((u) => u.id === ctx.words!.unitId) ?? null) : null;
  const ids = () => targetIds(ctx);
  const kind = (k: 'direction' | 'heading' | 'frontMatter') => () => void ctx.apply({ type: 'setKind', unitIds: ids(), kind: k });

  return [
    { id: 'next', label: 'Next to check', keys: ['j'], group: 'nav', enabled: ctx.queue.length > 0, run: () => stepQueue(ctx, 1) },
    { id: 'prev', label: 'Previous to check', keys: ['k'], group: 'nav', enabled: ctx.queue.length > 0, run: () => stepQueue(ctx, -1) },
    { id: 'down', label: 'Next unit', keys: ['ArrowDown'], group: 'nav', enabled: ctx.script.units.length > 0, run: () => stepUnit(ctx, 1) },
    { id: 'up', label: 'Previous unit', keys: ['ArrowUp'], group: 'nav', enabled: ctx.script.units.length > 0, run: () => stepUnit(ctx, -1) },
    { id: 'confirm', label: "It's right", keys: ['Enter'], group: 'tag', enabled: has, run: () => void ctx.apply({ type: 'confirm', unitIds: ids() }) },
    { id: 'direction', label: 'Direction', keys: ['d'], group: 'tag', enabled: has, run: kind('direction') },
    { id: 'heading', label: 'Heading', keys: ['h'], group: 'tag', enabled: has, run: kind('heading') },
    { id: 'frontMatter', label: 'Front matter', keys: ['f'], group: 'tag', enabled: has, run: kind('frontMatter') },
    {
      id: 'cut',
      label: wordsUnit ? 'Cut words' : 'Cut',
      keys: ['x'],
      group: 'edit',
      enabled: has,
      run: () => {
        if (ctx.words && wordsUnit) ctx.apply({ type: 'setCutWords', unitId: ctx.words.unitId, from: ctx.words.from, to: ctx.words.to, cut: !wordsUnit.cut });
        else ctx.apply({ type: 'setCut', unitIds: sel!.unitIds, cut: !selected.every((u) => u.cut) });
      },
    },
    { id: 'sceneBreak', label: 'Scene break before', keys: ['b'], group: 'edit', enabled: has, run: () => void ctx.apply({ type: 'insertSceneBreak', beforeUnitId: sel!.anchor }) },
    { id: 'remove', label: 'Remove', keys: ['Delete', 'Backspace'], group: 'edit', enabled: has, run: () => void ctx.apply({ type: 'remove', unitIds: ids() }) },
    { id: 'undo', label: 'Undo', keys: ['mod+z'], group: 'history', enabled: ctx.canUndo, run: ctx.undo },
    { id: 'redo', label: 'Redo', keys: ['mod+shift+z'], group: 'history', enabled: ctx.canRedo, run: ctx.redo },
    {
      id: 'help',
      label: 'Shortcuts',
      keys: ['?'],
      group: 'help',
      enabled: true,
      run: () => ctx.openPanel(ctx.panel.kind === 'help' ? { kind: 'none' } : { kind: 'help' }),
    },
  ];
}
```

- [ ] **Step 4: Write `CheckList.tsx`**

```tsx
import type { CheckItem, CheckReason, Script, UnitKind } from '@dasma/script';
import { useMemo } from 'react';

export const KIND_LABEL: Record<UnitKind, string> = {
  dialogue: 'dialogue',
  direction: 'direction',
  characterName: 'character name',
  heading: 'heading',
  sceneBreak: 'scene break',
  frontMatter: 'front matter',
};

const REASON: Record<Exclude<CheckReason, 'unsure'>, string> = { newCharacter: 'new character?', noSpeaker: 'no speaker', heading: 'heading?' };

export const reasonLabel = (item: CheckItem): string => (item.reason === 'unsure' ? `unsure ${KIND_LABEL[item.kind]}` : REASON[item.reason]);

const preview = (t: string): string => (t.length > 48 ? `${t.slice(0, 47)}…` : t);

export function CheckList({ script, queue, current, onSelect }: { script: Script; queue: CheckItem[]; current: string | null; onSelect(unitId: string): void }) {
  const text = useMemo(() => new Map(script.units.map((u) => [u.id, u.text])), [script.units]);
  return (
    <section aria-label="To check">
      <h2>To check ({queue.length})</h2>
      {queue.length === 0 ? (
        <p className="muted">Nothing left to check.</p>
      ) : (
        queue.map((q) => (
          <button key={q.unitId} type="button" className="qitem" aria-current={q.unitId === current} onClick={() => onSelect(q.unitId)}>
            <span className="reason">{reasonLabel(q)}</span>
            {preview(text.get(q.unitId) ?? '')}
          </button>
        ))
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write `ScriptView.tsx`**

```tsx
import { wordSpans, type Script, type Unit } from '@dasma/script';
import { memo, useMemo, type ReactNode } from 'react';
import type { Selection, WordSel } from './actions';

type UnitClick = (unitId: string, shift: boolean) => void;
type WordClick = (unitId: string, word: number, shift: boolean) => void;

function Words({ unit, words, onWordClick }: { unit: Unit; words: WordSel | null; onWordClick?: WordClick }) {
  const out: ReactNode[] = [];
  let at = 0;
  wordSpans(unit.text).forEach(([s, e], k) => {
    if (s > at) out.push(unit.text.slice(at, s));
    const overlap = unit.overlapRanges?.some(([a, b]) => k >= a && k < b);
    const chosen = words && k >= words.from && k < words.to;
    out.push(
      <span
        key={k}
        data-word={k}
        className={`w${overlap ? ' ov' : ''}${chosen ? ' wsel' : ''}`}
        onClick={
          onWordClick
            ? (ev) => {
                ev.stopPropagation();
                onWordClick(unit.id, k, ev.shiftKey);
              }
            : undefined
        }
      >
        {unit.text.slice(s, e)}
      </span>,
    );
    at = e;
  });
  if (at < unit.text.length) out.push(unit.text.slice(at));
  return <>{out}</>;
}

interface UnitViewProps {
  unit: Unit;
  speaker?: string;
  selected: boolean;
  flagged: boolean;
  highlighted: boolean;
  words: WordSel | null;
  onUnitClick: UnitClick;
  onWordClick: WordClick;
}

/** Memoised: an edit re-renders only the units whose objects changed (edits share unchanged units). */
const UnitView = memo(function UnitView({ unit, speaker, selected, flagged, highlighted, words, onUnitClick, onWordClick }: UnitViewProps) {
  const cls = ['unit', `unit-${unit.kind}`, flagged && 'flag', selected && 'sel', unit.cut && 'cut', highlighted && 'hl'].filter(Boolean).join(' ');
  return (
    <div id={`unit-${unit.id}`} role="option" aria-selected={selected} data-kind={unit.kind} className={cls} onClick={(e) => onUnitClick(unit.id, e.shiftKey)}>
      {speaker && <span className="speaker">{speaker}</span>}
      {selected || unit.overlapRanges ? <Words unit={unit} words={selected ? words : null} onWordClick={selected ? onWordClick : undefined} /> : unit.text}
    </div>
  );
});

export function ScriptView(props: {
  script: Script;
  selected: Selection | null;
  words: WordSel | null;
  flagged: ReadonlySet<string>;
  highlight: string | null;
  onUnitClick: UnitClick;
  onWordClick: WordClick;
}) {
  const { script, selected, words, flagged, highlight, onUnitClick, onWordClick } = props;
  const names = useMemo(() => new Map(script.characters.map((c) => [c.id, c.name])), [script.characters]);
  const chosen = useMemo(() => new Set(selected?.unitIds ?? []), [selected]);
  return (
    <div className="script" role="listbox" aria-label="Script" aria-multiselectable="true">
      {script.units.map((u) => (
        <UnitView
          key={u.id}
          unit={u}
          speaker={u.kind === 'dialogue' ? (names.get(u.characterId ?? '') ?? 'no speaker') : undefined}
          selected={chosen.has(u.id)}
          flagged={flagged.has(u.id)}
          highlighted={!!highlight && u.kind === 'dialogue' && u.characterId === highlight}
          words={chosen.has(u.id) && words?.unitId === u.id ? words : null}
          onUnitClick={onUnitClick}
          onWordClick={onWordClick}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Write `FixHeader.tsx`, `FixPanel.tsx` and `ShortcutSheet.tsx`**

`apps/web/src/fix/FixHeader.tsx`:

```tsx
import { Button } from '../ui/Button';
import type { FixAction } from './actions';
import type { SaveState } from './useScriptEditor';

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === 'saved') return <span className="muted" role="status">Saved</span>;
  if (state === 'saving') return <span className="muted" role="status">Saving…</span>;
  return (
    <span className="save-error" role="alert">
      {error}
    </span>
  );
}

export function FixHeader(props: { title: string; version: number; toCheck: number; history: FixAction[]; saveState: SaveState; saveError: string | null; onDone(): void }) {
  const { title, version, toCheck, history, saveState, saveError, onDone } = props;
  return (
    <header className="fix-header">
      <strong>{title}</strong>
      <span className="muted">Version {version}</span>
      <span>{toCheck} to check</span>
      <span className="grow" />
      {history.map((a) => (
        <Button key={a.id} shortcut={a.keys[0]} disabled={!a.enabled} onClick={a.run}>
          {a.label}
        </Button>
      ))}
      <SaveStatus state={saveState} error={saveError} />
      <Button variant="primary" onClick={onDone}>
        Done
      </Button>
    </header>
  );
}
```

`apps/web/src/fix/FixPanel.tsx`:

```tsx
import type { Script } from '@dasma/script';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import type { FixAction, Selection, WordSel } from './actions';
import { KIND_LABEL } from './CheckList';

const renderAction = (a: FixAction) => (
  <Button key={a.id} shortcut={a.keys[0]} disabled={!a.enabled} onClick={a.run}>
    {a.label}
  </Button>
);

export function FixPanel(props: {
  script: Script;
  sel: Selection | null;
  words: WordSel | null;
  message: string | null;
  actions: FixAction[];
  similarCount: number;
  similar: boolean;
  onSimilar(on: boolean): void;
  children?: ReactNode;
}) {
  const { script, sel, words, message, actions, similarCount, similar, onSimilar, children } = props;
  const unit = sel && sel.unitIds.length === 1 ? script.units.find((u) => u.id === sel.anchor) : undefined;
  const speaker = unit?.kind === 'dialogue' ? (script.characters.find((c) => c.id === unit.characterId)?.name ?? 'no speaker') : null;
  const describe = !sel
    ? 'Select a unit in the script.'
    : unit
      ? `${KIND_LABEL[unit.kind]}${speaker ? ` — ${speaker}` : ''}${unit.cut ? ' (cut)' : ''}`
      : `${sel.unitIds.length} units selected`;
  const group = (g: FixAction['group']) => actions.filter((a) => a.group === g).map(renderAction);
  return (
    <aside className="fix-right panel" aria-label="Fix">
      <h2>Selected</h2>
      <p>{describe}</p>
      {words && (
        <p className="muted">
          Words {words.from + 1}–{words.to} selected
        </p>
      )}
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {children}
      <h2>Tag</h2>
      <div className="buttons">{group('tag')}</div>
      {similarCount > 0 && (
        <label>
          <input type="checkbox" checked={similar} onChange={(e) => onSimilar(e.target.checked)} /> Also apply to the {similarCount} other lines like this
        </label>
      )}
      <h2>Edit</h2>
      <div className="buttons">{group('edit')}</div>
      <h2>Move</h2>
      <div className="buttons">{group('nav')}</div>
      <div className="buttons">{group('help')}</div>
    </aside>
  );
}
```

`apps/web/src/fix/ShortcutSheet.tsx`:

```tsx
import { Button } from '../ui/Button';
import { shortcutLabel } from '../ui/shortcuts';
import type { FixAction } from './actions';

export function ShortcutSheet({ actions, onClose }: { actions: FixAction[]; onClose(): void }) {
  return (
    <div className="sheet" role="dialog" aria-label="Keyboard shortcuts">
      <h2>Keyboard shortcuts</h2>
      <table className="grid">
        <tbody>
          {actions
            .filter((a) => a.keys.length > 0)
            .map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td>{a.keys.map(shortcutLabel).join(' or ')}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p>Shift-click to select several units, or several words inside a selected unit. In the character picker, 1–9 pick the nearby speakers.</p>
      <Button shortcut="Escape" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
```

- [ ] **Step 7: Write `FixTags.tsx`**

```tsx
import { checkQueue, similarUnits, type EditOp, type Script } from '@dasma/script';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ProductionRow } from '../db/schema';
import { navigate } from '../router';
import { NotFound } from '../screens/NotFound';
import { useServices } from '../services';
import { useShortcuts } from '../ui/shortcuts';
import { buildFixActions, liveSelection, liveWords, type FixContext, type Panel, type Selection, type WordSel } from './actions';
import { CheckList } from './CheckList';
import { FixHeader } from './FixHeader';
import { FixPanel } from './FixPanel';
import { ScriptView } from './ScriptView';
import { ShortcutSheet } from './ShortcutSheet';
import { useScriptEditor, type ScriptEditor } from './useScriptEditor';

export function FixTags({ productionId }: { productionId: string }) {
  const { repo } = useServices();
  const [production, setProduction] = useState<ProductionRow | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void repo.getProduction(productionId).then((p) => {
      if (live) setProduction(p ?? null);
    });
    return () => {
      live = false;
    };
  }, [repo, productionId]);
  const keep = useCallback(() => Object.keys(production?.cast ?? {}), [production]);
  const editor = useScriptEditor(productionId, keep);

  if (editor.status === 'missing' || production === null) return <NotFound message="This production doesn't exist." />;
  if (editor.status === 'loading' || production === undefined || !editor.script || !editor.version) return <main className="page">Loading…</main>;
  return <FixWorkspace editor={editor} script={editor.script} production={production} onProductionChange={setProduction} />;
}

interface WorkspaceProps {
  editor: ScriptEditor;
  script: Script;
  production: ProductionRow;
  onProductionChange(p: ProductionRow): void;
}

export function FixWorkspace({ editor, script, production }: WorkspaceProps) {
  const hints = editor.version!.unitHints;
  const [rawSel, setSel] = useState<Selection | null>(null);
  const [rawWords, setWords] = useState<WordSel | null>(null);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [message, setMessage] = useState<string | null>(null);
  const [similar, setSimilar] = useState(false);

  const queue = useMemo(() => checkQueue(script), [script]);
  const flagged = useMemo(() => new Set(queue.map((q) => q.unitId)), [queue]);
  const sel = useMemo(() => liveSelection(script, rawSel), [script, rawSel]);
  const words = useMemo(() => liveWords(script, sel, rawWords), [script, sel, rawWords]);
  const similarIds = useMemo(() => (sel && sel.unitIds.length === 1 ? similarUnits(script, hints, sel.anchor) : []), [script, hints, sel]);

  const scriptRef = useRef(script);
  useLayoutEffect(() => {
    scriptRef.current = script;
  });

  const { apply: editorApply, undo, redo, flush } = editor;
  const apply = useCallback(
    (op: EditOp): boolean => {
      const err = editorApply(op);
      setMessage(err);
      if (err) return false;
      setSimilar(false);
      setWords(null);
      setPanel({ kind: 'none' });
      return true;
    },
    [editorApply],
  );

  const select = useCallback((unitId: string) => {
    setSel({ unitIds: [unitId], anchor: unitId });
    setWords(null);
    setMessage(null);
    setSimilar(false);
    document.getElementById(`unit-${unitId}`)?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const onUnitClick = useCallback((unitId: string, shift: boolean) => {
    setWords(null);
    setMessage(null);
    setSimilar(false);
    setSel((prev) => {
      if (!shift || !prev) return { unitIds: [unitId], anchor: unitId };
      const units = scriptRef.current.units;
      const a = units.findIndex((u) => u.id === prev.anchor);
      const b = units.findIndex((u) => u.id === unitId);
      if (a < 0 || b < 0) return { unitIds: [unitId], anchor: unitId };
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return { unitIds: units.slice(lo, hi + 1).map((u) => u.id), anchor: prev.anchor };
    });
  }, []);

  const onWordClick = useCallback((unitId: string, k: number, shift: boolean) => {
    setWords((prev) =>
      shift && prev && prev.unitId === unitId
        ? { unitId, anchor: prev.anchor, from: Math.min(prev.anchor, k), to: Math.max(prev.anchor, k) + 1 }
        : { unitId, anchor: k, from: k, to: k + 1 },
    );
  }, []);

  const ctx: FixContext = { script, hints, queue, sel, words, similar, panel, apply, select, openPanel: setPanel, undo, redo, canUndo: editor.canUndo, canRedo: editor.canRedo };
  const actions = buildFixActions(ctx);
  useShortcuts(
    actions.map((a) => ({ keys: a.keys, run: a.run, enabled: a.enabled })),
    panel.kind === 'none' || panel.kind === 'help',
  );
  useShortcuts([{ keys: ['Escape'], run: () => setPanel({ kind: 'none' }), allowInFields: true }], panel.kind !== 'none');

  const done = async () => {
    await flush();
    navigate({ name: 'production', id: production.id });
  };

  return (
    <div className="fix">
      <FixHeader
        title={production.title}
        version={editor.version!.version}
        toCheck={queue.length}
        history={actions.filter((a) => a.group === 'history')}
        saveState={editor.saveState}
        saveError={editor.saveError}
        onDone={() => void done()}
      />
      <div className="fix-cols">
        <aside className="fix-left">
          <CheckList script={script} queue={queue} current={sel?.anchor ?? null} onSelect={select} />
        </aside>
        <ScriptView script={script} selected={sel} words={words} flagged={flagged} highlight={null} onUnitClick={onUnitClick} onWordClick={onWordClick} />
        <FixPanel
          script={script}
          sel={sel}
          words={words}
          message={message}
          actions={actions.filter((a) => a.group !== 'history')}
          similarCount={similarIds.length}
          similar={similar}
          onSimilar={setSimilar}
        />
      </div>
      {panel.kind === 'help' && <ShortcutSheet actions={actions} onClose={() => setPanel({ kind: 'none' })} />}
    </div>
  );
}
```

(`onProductionChange` is used from Task 16, when merging characters moves cast entries.)

- [ ] **Step 8: Route to it in `App.tsx`**

```tsx
    case 'fix':
      return <FixTags productionId={route.id} />;
```

- [ ] **Step 9: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS. If ESLint flags the unused `onProductionChange` destructuring, leave it out of the destructuring until Task 16 (the prop stays in `WorkspaceProps`).

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "feat(web): Fix tags screen with check list, selection and tag/edit actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Character picker, apply-to-similar and the characters panel

**Files:**
- Create: `apps/web/src/fix/CharacterPicker.tsx`, `apps/web/src/fix/CharacterList.tsx`
- Modify: `apps/web/src/fix/actions.ts`, `apps/web/src/fix/FixTags.tsx`
- Test: `apps/web/test/fix/FixCharacters.test.tsx`

**Interfaces:**
- Consumes: Task 15's actions, workspace and `openFix` helper (exported from `test/fix/FixTags.test.tsx` — move it to `apps/web/test/fix/open-fix.tsx` in this task and import it from both test files); `uniqueCharacterId`, `aliasSpeeches`, `speechCounts` from `@dasma/script`.
- Produces: actions `speechBy` "Speech by…" (s), `setName` "Character name…" (n), `moveSpeeches` "Move speeches to…" (no key), inserted after `confirm`. `CharacterPicker`, `CharacterList` components.

- [ ] **Step 1: Move the test helper**

Create `apps/web/test/fix/open-fix.tsx` with the `openFix` function from `FixTags.test.tsx` (unchanged, exported), delete it from `FixTags.test.tsx`, and import it there: `import { openFix } from './open-fix';`.

- [ ] **Step 2: Write the failing tests**

`apps/web/test/fix/FixCharacters.test.tsx`:

```tsx
import type { Script } from '@dasma/script';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sampleScript } from '../fixtures';
import { openFix } from './open-fix';

describe('Fix tags: speakers and characters', () => {
  it('turns a fake name into a line by a nearby speaker with s then 1', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u7'));
    await user.keyboard('s');
    const picker = screen.getByRole('region', { name: 'Speech by' });
    expect(within(picker).getAllByRole('button').slice(0, 3).map((b) => b.textContent)).toEqual(['LANE1', 'OKAY2', 'ALGERNON3']);
    await user.keyboard('1');
    await waitFor(async () => {
      const s = await stored();
      expect([s.units[6].characterId, s.units[7].characterId]).toEqual(['lane', 'lane']);
      expect(s.characters.map((c) => c.id)).toEqual(['algernon', 'lane']);
    });
  });

  it('filters the picker by typing, without firing shortcuts', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u2'));
    await user.keyboard('s');
    await user.keyboard('dhalg');
    expect(unitEl('u2').dataset.kind).toBe('direction');
    expect((screen.getByLabelText('Find a character') as HTMLInputElement).value).toBe('dhalg');
    await user.clear(screen.getByLabelText('Find a character'));
    await user.keyboard('alg{Enter}');
    await waitFor(async () => expect((await stored()).units[1]).toMatchObject({ kind: 'dialogue', characterId: 'algernon' }));
  });

  it('creates a new character in one undo step', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u2'));
    await user.click(screen.getByRole('button', { name: /^Speech by/ }));
    await user.click(screen.getByRole('button', { name: 'New character…' }));
    await user.type(screen.getByLabelText('Name of the new character'), 'Lady Bracknell');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(unitEl('u2').textContent).toContain('Lady Bracknell');
    await user.keyboard('{Meta>}z{/Meta}');
    expect(unitEl('u2').dataset.kind).toBe('direction');
    expect(screen.queryByText('Lady Bracknell')).toBeNull();
  });

  it('marks a character name with n', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u7'));
    await user.keyboard('n');
    await user.click(within(screen.getByRole('region', { name: 'Character name' })).getByRole('button', { name: /^ALGERNON/ }));
    await waitFor(async () => expect((await stored()).units[7].characterId).toBe('algernon'));
  });

  it('applies a fix to the other lines like this when ticked', async () => {
    const script: Script = sampleScript();
    for (const [id, text] of [
      ['u11', 'I told you so.'],
      ['u12', 'You never did.'],
      ['u13', 'Yes I did.'],
    ]) script.units.push({ id, kind: 'direction', text, cut: false, tagConfidence: 0.5, source: [{ page: 1, line: 11 }] });
    const { user, unitEl, stored } = await openFix(script);
    await user.click(unitEl('u11'));
    await user.click(screen.getByLabelText('Also apply to the 2 other lines like this'));
    await user.keyboard('s1');
    await waitFor(async () => expect((await stored()).units.slice(10).map((u) => u.characterId)).toEqual(['algernon', 'algernon', 'algernon']));
    expect(screen.queryByLabelText(/Also apply/)).toBeNull();
  });

  it('moves selected speeches to another character', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u10'));
    await user.click(screen.getByRole('button', { name: 'Move speeches to…' }));
    await user.click(within(screen.getByRole('region', { name: 'Move speeches to' })).getByRole('button', { name: /^LANE/ }));
    await waitFor(async () => expect((await stored()).units[9].characterId).toBe('lane'));
  });

  it('renames, edits aliases and highlights a character', async () => {
    const { user, stored, unitEl } = await openFix();
    const panel = screen.getByRole('region', { name: 'Characters' });
    await user.click(within(panel).getAllByRole('button', { name: 'Rename' })[2]);
    await user.clear(screen.getByLabelText('New name for OKAY'));
    await user.type(screen.getByLabelText('New name for OKAY'), 'Okay Man{Enter}');
    await user.click(within(panel).getAllByRole('button', { name: 'Aliases' })[0]);
    await user.clear(screen.getByLabelText('Aliases for ALGERNON'));
    await user.type(screen.getByLabelText('Aliases for ALGERNON'), 'ALGY, MONCRIEFF{Enter}');
    await waitFor(async () => {
      const s = await stored();
      expect(s.characters.map((c) => [c.name, c.aliases])).toEqual([
        ['ALGERNON', ['ALGY', 'MONCRIEFF']],
        ['LANE', []],
        ['Okay Man', []],
      ]);
    });
    await user.click(within(panel).getByRole('button', { name: 'LANE' }));
    expect(unitEl('u6').classList.contains('hl')).toBe(true);
  });

  it('merges a character and moves its cast entry', async () => {
    const { user, services, production, stored } = await openFix(sampleScript(), { okay: ['Sam'], lane: ['Ann'] });
    const panel = screen.getByRole('region', { name: 'Characters' });
    await user.click(within(panel).getAllByRole('button', { name: 'Merge into…' })[2]);
    await user.selectOptions(screen.getByLabelText('Merge OKAY into'), 'lane');
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(async () => expect((await stored()).characters.map((c) => c.id)).toEqual(['algernon', 'lane']));
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann', 'Sam'] }));
  });

  it('splits a silently merged alias out (CAPULET → CAPULET’S COUSIN)', async () => {
    const script: Script = {
      title: 'R&J',
      characters: [{ id: 'capulet-s-cousin', name: "CAPULET'S COUSIN", aliases: ['CAPULET'] }],
      units: [
        { id: 'u1', kind: 'characterName', text: 'CAPULET.', cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 1 }] },
        { id: 'u2', kind: 'dialogue', characterId: 'capulet-s-cousin', text: 'Welcome, gentlemen!', cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 2 }] },
        { id: 'u3', kind: 'characterName', text: "CAPULET'S COUSIN.", cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 3 }] },
        { id: 'u4', kind: 'dialogue', characterId: 'capulet-s-cousin', text: "By'r lady, thirty years.", cut: false, tagConfidence: 0.95, source: [{ page: 1, line: 4 }] },
      ],
    };
    const { user, stored } = await openFix(script);
    await user.click(screen.getByRole('button', { name: 'Split out CAPULET' }));
    await waitFor(async () => expect((await stored()).units.map((u) => u.characterId)).toEqual([undefined, 'capulet', undefined, 'capulet-s-cousin']));
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/fix`
Expected: FAIL — no "Speech by" action, no Characters region.

- [ ] **Step 4: Add the picker actions to `actions.ts`**

Insert directly after the `confirm` entry in `buildFixActions`:

```ts
    { id: 'speechBy', label: 'Speech by…', keys: ['s'], group: 'tag', enabled: has, run: () => ctx.openPanel({ kind: 'picker', purpose: 'speechBy' }) },
    {
      id: 'setName',
      label: 'Character name…',
      keys: ['n'],
      group: 'tag',
      enabled: has,
      run: () => ctx.openPanel({ kind: 'picker', purpose: 'setName' }),
    },
    {
      id: 'moveSpeeches',
      label: 'Move speeches to…',
      keys: [],
      group: 'tag',
      enabled: has && selected.every((u) => u.kind === 'dialogue'),
      run: () => ctx.openPanel({ kind: 'picker', purpose: 'moveSpeeches' }),
    },
```

and add this exported helper below `targetIds`:

```ts
/** The op a picked character applies, for each picker purpose. */
export function pickOp(ctx: FixContext, purpose: PickPurpose, characterId: string): EditOp {
  const ids = targetIds(ctx);
  if (purpose === 'speechBy') return { type: 'speechBy', unitIds: ids, characterId };
  if (purpose === 'moveSpeeches') return { type: 'moveSpeeches', unitIds: ctx.sel?.unitIds ?? [], characterId };
  const names: EditOp[] = ids.map((unitId) => ({ type: 'setName', unitId, characterId }));
  return names.length === 1 ? names[0] : { type: 'batch', ops: names };
}
```

- [ ] **Step 5: Write `CharacterPicker.tsx`**

```tsx
import type { Script } from '@dasma/script';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { nearbySpeakers } from './actions';

export function CharacterPicker(props: { script: Script; anchorId: string; title: string; onPick(characterId: string): void; onCreate(name: string): void; onClose(): void }) {
  const { script, anchorId, title, onPick, onCreate, onClose } = props;
  const [filter, setFilter] = useState('');
  const [naming, setNaming] = useState<string | null>(null);
  const nearby = useMemo(() => nearbySpeakers(script, anchorId), [script, anchorId]);
  const f = filter.trim().toUpperCase();
  const matches = f
    ? script.characters.filter((c) => [c.name, ...c.aliases].some((n) => n.toUpperCase().includes(f)))
    : [
        ...nearby.map((id) => script.characters.find((c) => c.id === id)!).filter(Boolean),
        ...script.characters.filter((c) => !nearby.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
      ];

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[0]) onPick(matches[0].id);
      else if (filter.trim()) setNaming(filter.trim());
    } else if (!filter && /^[1-9]$/.test(e.key) && nearby[Number(e.key) - 1]) {
      e.preventDefault();
      onPick(nearby[Number(e.key) - 1]);
    }
  };

  return (
    <section className="picker" aria-label={title}>
      <h2>{title}</h2>
      {naming === null ? (
        <>
          <input autoFocus aria-label="Find a character" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={onKeyDown} />
          <ul>
            {matches.map((c) => {
              const n = nearby.indexOf(c.id);
              return (
                <li key={c.id}>
                  <Button shortcut={!f && n >= 0 ? String(n + 1) : undefined} onClick={() => onPick(c.id)}>
                    {c.name}
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button onClick={() => setNaming(filter.trim())}>New character…</Button> <Button onClick={onClose}>Cancel</Button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.trim()) onCreate(naming.trim());
          }}
        >
          <label className="field">
            Name of the new character
            <input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
            />
          </label>
          <Button type="submit" variant="primary">
            Create
          </Button>{' '}
          <Button onClick={onClose}>Cancel</Button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Write `CharacterList.tsx`**

```tsx
import { aliasSpeeches, speechCounts, uniqueCharacterId, type Character, type EditOp, type Script, type UnitHint } from '@dasma/script';
import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';

interface RowProps {
  c: Character;
  script: Script;
  hints: Readonly<Record<string, UnitHint>>;
  count: number;
  highlighted: boolean;
  onHighlight(id: string | null): void;
  apply(op: EditOp): boolean;
  onMerged(fromId: string, intoId: string): void;
}

function CharacterRow({ c, script, hints, count, highlighted, onHighlight, apply, onMerged }: RowProps) {
  const [mode, setMode] = useState<'none' | 'rename' | 'aliases' | 'merge'>('none');
  const [value, setValue] = useState('');
  const others = script.characters.filter((x) => x.id !== c.id);
  const [into, setInto] = useState('');
  const close = () => setMode('none');

  return (
    <div className="char-row">
      <Button aria-pressed={highlighted} onClick={() => onHighlight(highlighted ? null : c.id)}>
        {c.name}
      </Button>{' '}
      <span className="muted">
        {count} {count === 1 ? 'speech' : 'speeches'}
      </span>
      <div>
        {c.aliases.map((a) => (
          <span key={a} className="chip">
            {a}
          </span>
        ))}
      </div>
      <div className="buttons">
        <Button
          onClick={() => {
            setMode('rename');
            setValue(c.name);
          }}
        >
          Rename
        </Button>
        <Button
          onClick={() => {
            setMode('aliases');
            setValue(c.aliases.join(', '));
          }}
        >
          Aliases
        </Button>
        <Button
          disabled={others.length === 0}
          onClick={() => {
            setMode('merge');
            setInto(others[0]?.id ?? '');
          }}
        >
          Merge into…
        </Button>
        {c.aliases.map((a) => (
          <Button key={a} onClick={() => apply({ type: 'splitAlias', characterId: c.id, alias: a, newId: uniqueCharacterId(script, a), unitIds: aliasSpeeches(script, hints, c.id, a) })}>
            Split out {a}
          </Button>
        ))}
      </div>
      {(mode === 'rename' || mode === 'aliases') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const ok = apply(
              mode === 'rename' ? { type: 'renameCharacter', characterId: c.id, name: value } : { type: 'editAliases', characterId: c.id, aliases: value.split(',') },
            );
            if (ok) close();
          }}
        >
          <input
            autoFocus
            aria-label={mode === 'rename' ? `New name for ${c.name}` : `Aliases for ${c.name}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
          />
          <Button type="submit">Save</Button> <Button onClick={close}>Cancel</Button>
        </form>
      )}
      {mode === 'merge' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (apply({ type: 'mergeCharacters', fromId: c.id, intoId: into })) {
              onMerged(c.id, into);
              close();
            }
          }}
        >
          <select aria-label={`Merge ${c.name} into`} value={into} onChange={(e) => setInto(e.target.value)}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Button type="submit">Merge</Button> <Button onClick={close}>Cancel</Button>
        </form>
      )}
    </div>
  );
}

export function CharacterList(props: {
  script: Script;
  hints: Readonly<Record<string, UnitHint>>;
  highlight: string | null;
  onHighlight(id: string | null): void;
  apply(op: EditOp): boolean;
  onMerged(fromId: string, intoId: string): void;
}) {
  const { script, ...rest } = props;
  const counts = useMemo(() => speechCounts(script), [script]);
  return (
    <section aria-label="Characters">
      <h2>Characters ({script.characters.length})</h2>
      {script.characters.map((c) => (
        <CharacterRow key={c.id} c={c} script={script} count={counts.get(c.id) ?? 0} highlighted={rest.highlight === c.id} {...rest} />
      ))}
    </section>
  );
}
```

- [ ] **Step 7: Wire the picker and characters into `FixWorkspace`**

In `FixTags.tsx`:
- import `uniqueCharacterId` from `@dasma/script`, `useServices` is already imported, `pickOp` from `./actions`, `CharacterPicker`, `CharacterList`.
- destructure `onProductionChange` from the props and add `const { repo } = useServices();` and `const [highlight, setHighlight] = useState<string | null>(null);`.
- after `const actions = …`, add:

```tsx
  const onPick = (characterId: string) => {
    if (panel.kind === 'picker') apply(pickOp(ctx, panel.purpose, characterId));
  };
  const onCreate = (name: string) => {
    if (panel.kind !== 'picker') return;
    const id = uniqueCharacterId(script, name);
    apply({ type: 'batch', ops: [{ type: 'newCharacter', id, name }, pickOp(ctx, panel.purpose, id)] });
  };
  const onMerged = async (fromId: string, intoId: string) => {
    if (!production.cast[fromId]) return;
    const cast = { ...production.cast };
    cast[intoId] = [...new Set([...(cast[intoId] ?? []), ...cast[fromId]])];
    delete cast[fromId];
    onProductionChange(await repo.updateProduction(production.id, { cast }));
  };
  const PICKER_TITLES = { speechBy: 'Speech by', setName: 'Character name', moveSpeeches: 'Move speeches to' } as const;
```

- render the characters below the check list, pass `highlight` to `ScriptView`, and render the picker as the fix panel's child:

```tsx
        <aside className="fix-left">
          <CheckList script={script} queue={queue} current={sel?.anchor ?? null} onSelect={select} />
          <CharacterList script={script} hints={hints} highlight={highlight} onHighlight={setHighlight} apply={apply} onMerged={(a, b) => void onMerged(a, b)} />
        </aside>
        <ScriptView script={script} selected={sel} words={words} flagged={flagged} highlight={highlight} onUnitClick={onUnitClick} onWordClick={onWordClick} />
        <FixPanel
          script={script}
          sel={sel}
          words={words}
          message={message}
          actions={actions.filter((a) => a.group !== 'history')}
          similarCount={similarIds.length}
          similar={similar}
          onSimilar={setSimilar}
        >
          {panel.kind === 'picker' && sel && (
            <CharacterPicker script={script} anchorId={sel.anchor} title={PICKER_TITLES[panel.purpose]} onPick={onPick} onCreate={onCreate} onClose={() => setPanel({ kind: 'none' })} />
          )}
        </FixPanel>
```

(The `FixPanel` props are unchanged from Task 15; only the children are new.)

- [ ] **Step 8: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(web): character picker, apply-to-similar and the characters panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Text editing, split, join, overlap — and shortcut parity

**Files:**
- Create: `apps/web/src/fix/EditTextPanel.tsx`
- Modify: `apps/web/src/fix/actions.ts`, `apps/web/src/fix/FixTags.tsx`
- Test: `apps/web/test/fix/FixEdit.test.tsx`, `apps/web/test/fix/parity.test.tsx`

**Interfaces:**
- Consumes: Tasks 15–16.
- Produces: actions `editText` "Edit text" (e), `split` "Split here" (/), `join` "Join to previous" (J), `overlap` "Overlap" (o), inserted in the `edit` group before `cut`. `EditTextPanel({ unit, onSave, onCancel })` with buttons "Save" (mod+Enter) and "Cancel" (Escape).

- [ ] **Step 1: Write the failing tests**

`apps/web/test/fix/FixEdit.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sampleScript } from '../fixtures';
import { openFix } from './open-fix';

describe('Fix tags: text, split, join, overlap', () => {
  it('edits a unit’s text; typing never fires shortcuts', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u4'));
    await user.keyboard('e');
    const box = screen.getByLabelText('Unit text');
    await user.clear(box);
    await user.type(box, 'dh Did you hear me?');
    expect(unitEl('u4').dataset.kind).toBe('dialogue');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(async () => expect((await stored()).units[3].text).toBe('dh Did you hear me?'));
    expect(screen.queryByLabelText('Unit text')).toBeNull();
  });

  it('keeps the editor open with a message when the text is empty, and warns about overlap marks', async () => {
    const script = sampleScript();
    script.units[3] = { ...script.units[3], overlapRanges: [[0, 2]] };
    const { user, unitEl } = await openFix(script);
    await user.click(unitEl('u4'));
    await user.click(screen.getByRole('button', { name: /^Edit text/ }));
    expect(screen.getByText("Saving clears this speech's overlap marks.")).toBeTruthy();
    await user.clear(screen.getByLabelText('Unit text'));
    await user.click(screen.getByRole('button', { name: /^Save/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('use Remove');
    expect(screen.getByLabelText('Unit text')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Unit text')).toBeNull();
  });

  it('splits before the selected word and joins back', async () => {
    const { user, unitEl } = await openFix();
    await user.click(unitEl('u4'));
    await user.click(unitEl('u4').querySelector('[data-word="3"]')!);
    await user.keyboard('/');
    expect(unitEl('u4').textContent).toContain('Did you hear');
    expect(unitEl('u11').textContent).toContain('what I was playing, Lane?');
    await user.click(unitEl('u11'));
    await user.keyboard('J');
    expect(document.getElementById('unit-u11')).toBeNull();
    expect(unitEl('u4').textContent).toContain('Did you hear what I was playing, Lane?');
  });

  it('marks and clears overlap on selected words', async () => {
    const { user, unitEl, stored } = await openFix();
    await user.click(unitEl('u4'));
    await user.click(unitEl('u4').querySelector('[data-word="5"]')!);
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4').querySelector('[data-word="6"]')!);
    await user.keyboard('{/Shift}');
    await user.keyboard('o');
    await waitFor(async () => expect((await stored()).units[3].overlapRanges).toEqual([[5, 7]]));
    await user.click(unitEl('u4').querySelector('[data-word="5"]')!);
    await user.keyboard('{Shift>}');
    await user.click(unitEl('u4').querySelector('[data-word="6"]')!);
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: /^Overlap/ }));
    await waitFor(async () => expect((await stored()).units[3].overlapRanges).toBeUndefined());
  });
});
```

`apps/web/test/fix/parity.test.tsx` — every key in spec §6.3 does exactly what its button does:

```tsx
import { cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openFix } from './open-fix';

type Fix = Awaited<ReturnType<typeof openFix>>;
interface Case {
  id: string;
  keys: string;
  button: RegExp;
  scope?: string;
  prepare(f: Fix): Promise<void>;
}

const click = (id: string) => async (f: Fix) => f.user.click(f.unitEl(id));
const words = (id: string, from: number, to: number) => async (f: Fix) => {
  await f.user.click(f.unitEl(id));
  await f.user.click(f.unitEl(id).querySelector(`[data-word="${from}"]`)!);
  if (to !== from) {
    await f.user.keyboard('{Shift>}');
    await f.user.click(f.unitEl(id).querySelector(`[data-word="${to}"]`)!);
    await f.user.keyboard('{/Shift}');
  }
};
const none = async () => {};

const CASES: Case[] = [
  { id: 'next', keys: 'j', button: /^Next to check/, prepare: none },
  { id: 'prev', keys: 'k', button: /^Previous to check/, prepare: none },
  { id: 'down', keys: '{ArrowDown}', button: /^Next unit/, prepare: click('u4') },
  { id: 'up', keys: '{ArrowUp}', button: /^Previous unit/, prepare: click('u4') },
  { id: 'confirm', keys: '{Enter}', button: /^It's right/, prepare: click('u1') },
  { id: 'speechBy', keys: 's', button: /^Speech by/, prepare: click('u2') },
  { id: 'setName', keys: 'n', button: /^Character name/, prepare: click('u2') },
  { id: 'direction', keys: 'd', button: /^Direction/, prepare: click('u1') },
  { id: 'heading', keys: 'h', button: /^Heading/, prepare: click('u2') },
  { id: 'frontMatter', keys: 'f', button: /^Front matter/, prepare: click('u1') },
  { id: 'editText', keys: 'e', button: /^Edit text/, prepare: click('u4') },
  { id: 'split', keys: '/', button: /^Split here/, prepare: words('u4', 3, 3) },
  { id: 'join', keys: 'J', button: /^Join to previous/, prepare: click('u8') },
  { id: 'cut', keys: 'x', button: /^Cut/, prepare: click('u4') },
  { id: 'cutWords', keys: 'x', button: /^Cut words/, prepare: words('u4', 1, 2) },
  { id: 'overlap', keys: 'o', button: /^Overlap/, prepare: words('u4', 1, 2) },
  { id: 'sceneBreak', keys: 'b', button: /^Scene break before/, prepare: click('u5') },
  { id: 'remove', keys: '{Delete}', button: /^Remove/, prepare: click('u2') },
  {
    id: 'undo',
    keys: '{Meta>}z{/Meta}',
    button: /^Undo/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u1'));
      await f.user.keyboard('f');
    },
  },
  {
    id: 'redo',
    keys: '{Meta>}{Shift>}z{/Shift}{/Meta}',
    button: /^Redo/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u1'));
      await f.user.keyboard('f{Meta>}z{/Meta}');
    },
  },
  { id: 'help', keys: '?', button: /^Shortcuts/, prepare: none },
  { id: 'closeHelp', keys: '{Escape}', button: /^Close/, prepare: async (f) => f.user.keyboard('?') },
  {
    id: 'pickNearby',
    keys: '1',
    button: /^LANE/,
    scope: 'Speech by',
    prepare: async (f) => {
      await f.user.click(f.unitEl('u7'));
      await f.user.keyboard('s');
    },
  },
  {
    id: 'saveText',
    keys: '{Meta>}{Enter}{/Meta}',
    button: /^Save/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u4'));
      await f.user.keyboard('e');
      await f.user.type(screen.getByLabelText('Unit text'), ' Yes.');
    },
  },
  {
    id: 'cancelText',
    keys: '{Escape}',
    button: /^Cancel/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u4'));
      await f.user.keyboard('e');
    },
  },
];

/** What a person can see: the script (kinds, text, cuts, overlap, selection) and which panel is open. */
function snapshot(): string {
  const script = document.querySelector('.script')!.innerHTML;
  const panels = ['Keyboard shortcuts', 'Speech by', 'Character name', 'Unit text'].filter((n) => screen.queryByRole('dialog', { name: n }) || screen.queryByRole('region', { name: n }) || screen.queryByLabelText(n));
  return `${script}|${panels.join(',')}`;
}

async function run(c: Case, how: 'key' | 'button'): Promise<{ before: string; after: string }> {
  const f = await openFix();
  await c.prepare(f);
  const before = snapshot();
  if (how === 'key') await f.user.keyboard(c.keys);
  else await f.user.click((c.scope ? within(screen.getByRole('region', { name: c.scope })) : screen).getByRole('button', { name: c.button }));
  const after = snapshot();
  cleanup();
  return { before, after };
}

describe('every shortcut matches its button', () => {
  for (const c of CASES) {
    it(c.id, async () => {
      const key = await run(c, 'key');
      const button = await run(c, 'button');
      expect(key.after).not.toBe(key.before);
      expect(key.after).toBe(button.after);
    });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/fix`
Expected: FAIL — no Edit text / Split / Join / Overlap actions.

- [ ] **Step 3: Add the actions to `actions.ts`**

At the top of the returned `edit` group (immediately before the `cut` entry), add:

```ts
    { id: 'editText', label: 'Edit text', keys: ['e'], group: 'edit', enabled: !!one, run: () => ctx.openPanel({ kind: 'editText' }) },
    {
      id: 'split',
      label: 'Split here',
      keys: ['/'],
      group: 'edit',
      enabled: !!ctx.words && ctx.words.from > 0,
      run: () => void ctx.apply({ type: 'split', unitId: ctx.words!.unitId, atWord: ctx.words!.from }),
    },
    {
      id: 'join',
      label: 'Join to previous',
      keys: ['J'],
      group: 'edit',
      enabled: !!one && ctx.script.units[0]?.id !== one.id,
      run: () => void ctx.apply({ type: 'join', unitId: one!.id }),
    },
```

After the `cut` entry, add:

```ts
    {
      id: 'overlap',
      label: 'Overlap',
      keys: ['o'],
      group: 'edit',
      enabled: !!ctx.words && wordsUnit?.kind === 'dialogue',
      run: () => {
        const w = ctx.words!;
        ctx.apply({ type: 'setOverlap', unitId: w.unitId, from: w.from, to: w.to, on: !coveredBy(wordsUnit!.overlapRanges, w.from, w.to) });
      },
    },
```

and near the top of `buildFixActions` add `const one = sel && sel.unitIds.length === 1 ? (ctx.script.units.find((u) => u.id === sel.anchor) ?? null) : null;`.

- [ ] **Step 4: Write `EditTextPanel.tsx`**

```tsx
import type { Unit } from '@dasma/script';
import { useState } from 'react';
import { Button } from '../ui/Button';

export function EditTextPanel({ unit, onSave, onCancel }: { unit: Unit; onSave(text: string): void; onCancel(): void }) {
  const [text, setText] = useState(unit.text);
  return (
    <section aria-label="Edit text">
      <h2>Edit text</h2>
      <textarea
        autoFocus
        aria-label="Unit text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(text);
          }
        }}
      />
      {unit.overlapRanges && <p className="muted">Saving clears this speech's overlap marks.</p>}
      <Button variant="primary" shortcut="mod+Enter" onClick={() => onSave(text)}>
        Save
      </Button>{' '}
      <Button shortcut="Escape" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
```

(`Escape` is handled by the workspace's panel-closing binding, which fires in fields.)

- [ ] **Step 5: Render it in `FixWorkspace`**

Inside `<FixPanel>`'s children, after the picker:

```tsx
          {panel.kind === 'editText' && sel?.unitIds.length === 1 && (() => {
            const unit = script.units.find((u) => u.id === sel.anchor);
            return unit ? <EditTextPanel key={unit.id} unit={unit} onSave={(text) => void apply({ type: 'editText', unitId: unit.id, text })} onCancel={() => setPanel({ kind: 'none' })} /> : null;
          })()}
```

- [ ] **Step 6: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS, including all 25 parity cases. If a parity case fails because its key does nothing (`key.after === key.before`), the action is wired wrongly — fix the action, not the case.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): text editing, split, join and overlap; shortcut parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Re-import review and opening `.dasma` files

**Files:**
- Create: `apps/web/src/screens/reimport.ts`, `apps/web/src/screens/ReimportReview.tsx`, `apps/web/src/screens/OpenDasma.tsx`
- Modify: `apps/web/src/App.tsx` (case `reimport`), `apps/web/src/screens/Library.tsx` (Open .dasma button)
- Test: `apps/web/test/screens/reimport.test.ts`, `apps/web/test/screens/ReimportReview.test.tsx`, `apps/web/test/screens/OpenDasma.test.tsx`

**Interfaces:**
- Consumes: `diffScripts`, `carryOver`, `pruneCharacters`, `ScriptFormatError`, `FormatErrorReason` from `@dasma/script`; `PendingImport`, `useServices` (Task 11); `afterProductionCreated` (Task 11); `DasmaContents` (Task 10).
- Produces: `buildReview(live: Script, pending: PendingImport, castKeys: readonly string[]): Review`; `type RowType = 'changed' | 'added' | 'removed' | 'retagged'`; `interface ReviewRow { type; oldText?; newText?; order }`; `interface Review { result: Script; unitHints; counts: Record<RowType | 'unchanged', number>; rows: ReviewRow[] }`; `pagesOf(script): number`; `ReimportReview({ productionId })`; `OpenDasma()`; `DASMA_ERROR_TEXT`.

- [ ] **Step 1: Write the failing tests**

`apps/web/test/screens/reimport.test.ts`:

```ts
import { applyEdit, FLAG_BELOW, type Script } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { buildReview, pagesOf } from '../../src/screens/reimport';
import type { PendingImport } from '../../src/services';
import { sampleScript } from '../fixtures';

function nextDraft(): Script {
  const s = sampleScript();
  s.units = s.units.filter((u) => u.id !== 'u2');
  s.units[2] = { ...s.units[2], text: 'Did you hear what I was playing, Lane? Tell me.' };
  s.units.push({ id: 'u11', kind: 'dialogue', characterId: 'lane', text: 'Yes, sir.', cut: false, tagConfidence: 0.95, source: [{ page: 2, line: 1 }] });
  return s;
}
const pending = (script: Script, mode: PendingImport['mode'] = 'file'): PendingImport => ({
  mode,
  script,
  pages: 2,
  unitHints: { u4: { band: 72, italic: false }, u11: { band: 72, italic: false } },
  importedFrom: { kind: 'text', names: ['v2.txt'] },
  warnings: [],
});

describe('buildReview', () => {
  it('carries fixes over a file re-import and lists changes in script order', () => {
    const live = applyEdit(sampleScript(), { type: 'setKind', unitIds: ['u1'], kind: 'frontMatter' });
    const r = buildReview(live, pending(nextDraft()), []);
    expect(r.counts).toEqual({ changed: 1, added: 1, removed: 1, unchanged: 8, retagged: 0 });
    expect(r.rows.map((row) => row.type)).toEqual(['removed', 'changed', 'added']);
    expect(r.result.units[0].kind).toBe('frontMatter');
    const changed = r.result.units.find((u) => u.text.endsWith('Tell me.'))!;
    expect(changed.id).toBe('u4');
    expect(changed.tagConfidence).toBeLessThan(FLAG_BELOW);
    expect(Object.keys(r.unitHints).sort()).toEqual(['u11', 'u4']);
  });

  it('takes a .dasma update as is and counts retagged or re-cut lines', () => {
    const next = sampleScript();
    next.units[5] = { ...next.units[5], cut: true };
    next.units[7] = { ...next.units[7], characterId: 'lane' };
    const r = buildReview(sampleScript(), { ...pending(next, 'dasma'), unitHints: {} }, []);
    expect(r.result).toBe(next);
    expect(r.counts).toMatchObject({ changed: 0, retagged: 2 });
    expect(r.rows.every((row) => row.type === 'retagged')).toBe(true);
  });

  it('counts pages from unit sources', () => {
    expect(pagesOf(nextDraft())).toBe(2);
  });
});
```

`apps/web/test/screens/ReimportReview.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

async function reviewWith(mode: 'file' | 'dasma', cast?: Record<string, string[]>) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo);
  const next = sampleScript();
  next.units = next.units.filter((u) => u.id !== 'u2');
  services.pending.set(production.id, { mode, script: next, pages: 1, unitHints: {}, importedFrom: { kind: mode === 'dasma' ? 'dasma' : 'text', names: ['v2'] }, warnings: [], ...(cast ? { cast } : {}) });
  renderApp(`#/p/${production.id}/reimport`, services);
  await screen.findByRole('heading', { name: 'Review the new script' });
  return { services, production, user: userEvent.setup() };
}

describe('Re-import review', () => {
  it('summarises the changes and keeps the new version', async () => {
    const { services, production, user } = await reviewWith('file');
    expect(screen.getByText('0 lines changed · 0 added · 1 removed · 9 unchanged')).toBeTruthy();
    expect(screen.getByText('Your fixes are kept on unchanged lines.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}/fix`));
    expect((await services.repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
    expect(services.pending.has(production.id)).toBe(false);
  });

  it('cancels without saving', async () => {
    const { services, production, user } = await reviewWith('file');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${production.id}`));
    expect(await services.repo.listVersions(production.id)).toHaveLength(1);
  });

  it('filters the change list', async () => {
    const { user } = await reviewWith('file');
    await user.click(screen.getByRole('button', { name: 'Removed' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Added' }));
    expect(screen.getByText('No lines of this kind.')).toBeTruthy();
  });

  it('replaces the cast from a .dasma update that carries one', async () => {
    const { services, production, user } = await reviewWith('dasma', { lane: ['Ann'] });
    expect(screen.getByText(/0 lines retagged or re-cut/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep as version 2' }));
    await waitFor(async () => expect((await services.repo.getProduction(production.id))!.cast).toEqual({ lane: ['Ann'] }));
  });

  it('explains when there is nothing to review', async () => {
    const services = makeServices();
    const { production } = await seedProduction(services.repo);
    renderApp(`#/p/${production.id}/reimport`, services);
    expect(await screen.findByText('Nothing to review.')).toBeTruthy();
  });
});
```

`apps/web/test/screens/OpenDasma.test.tsx`:

```tsx
import { writeDasma } from '@dasma/script';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

const dasma = (text: string, name = 'earnest.dasma') => new File([text], name);
const earnest = () => writeDasma(sampleScript(), { cast: { lane: ['Ann'] } });

async function openLibrary(seed = false) {
  const services = makeServices();
  const seeded = seed ? await seedProduction(services.repo) : null;
  renderApp('#/', services);
  const input = await screen.findByLabelText('Open .dasma file');
  return { services, seeded, input, user: userEvent.setup() };
}

describe('Opening a .dasma file', () => {
  it('creates a production and shows it', async () => {
    const { services, input, user } = await openLibrary();
    await user.upload(input, dasma(earnest()));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\/[^/]+$/));
    const [item] = await services.repo.listProductions();
    expect(item.production).toMatchObject({ title: 'Earnest', origin: 'dasma', cast: { lane: ['Ann'] } });
    expect((await services.repo.getLiveVersion(item.production.id))!.importedFrom).toEqual({ kind: 'dasma', names: ['earnest.dasma'] });
  });

  it('offers to update a production with the same title', async () => {
    const { services, seeded, input, user } = await openLibrary(true);
    await user.upload(input, dasma(earnest()));
    await user.click(await screen.findByRole('button', { name: 'Update "Earnest"' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/p/${seeded!.production.id}/reimport`));
    expect(services.pending.get(seeded!.production.id)).toMatchObject({ mode: 'dasma', cast: { lane: ['Ann'] } });
  });

  it('can import it as a new production instead', async () => {
    const { services, input, user } = await openLibrary(true);
    await user.upload(input, dasma(earnest()));
    await user.click(await screen.findByRole('button', { name: 'Import as a new production' }));
    await waitFor(async () => expect(await services.repo.listProductions()).toHaveLength(2));
  });

  it('explains files it cannot open', async () => {
    const { input, user } = await openLibrary();
    await user.upload(input, dasma('nonsense'));
    expect((await screen.findByRole('alert')).textContent).toBe("This isn't a DASMA script file.");
    await user.upload(input, dasma(earnest().replace('"formatVersion": 1', '"formatVersion": 9')));
    expect((await screen.findByRole('alert')).textContent).toBe('This file was made by a newer version of DASMA. Update the app to open it.');
    await user.upload(input, dasma(earnest().replace('"kind": "heading"', '"kind": "song"')));
    expect((await screen.findByRole('alert')).textContent).toBe("This DASMA file is damaged and can't be opened.");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/screens`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `reimport.ts`**

```ts
import { carryOver, diffScripts, pruneCharacters, type Script, type Unit, type UnitHint } from '@dasma/script';
import type { PendingImport } from '../services';

export type RowType = 'changed' | 'added' | 'removed' | 'retagged';

export interface ReviewRow {
  type: RowType;
  oldText?: string;
  newText?: string;
  /** Position in the new script; removed rows sit after the unit that preceded them. */
  order: number;
}

export interface Review {
  result: Script;
  unitHints: Record<string, UnitHint>;
  counts: Record<RowType | 'unchanged', number>;
  rows: ReviewRow[];
}

export const pagesOf = (script: Script): number => Math.max(1, ...script.units.map((u) => u.source[0]?.page ?? 1));

const sameTags = (a: Unit, b: Unit): boolean =>
  a.kind === b.kind && a.characterId === b.characterId && a.cut === b.cut && JSON.stringify(a.overlapRanges ?? []) === JSON.stringify(b.overlapRanges ?? []);

function tagLabel(u: Unit, script: Script): string {
  const who = u.kind === 'dialogue' ? (script.characters.find((c) => c.id === u.characterId)?.name ?? 'no speaker') : null;
  return `[${u.kind}${who ? ` — ${who}` : ''}${u.cut ? ', cut' : ''}${u.overlapRanges ? ', overlap' : ''}] ${u.text}`;
}

/** Spec §5.5: a file re-import carries fixes over (carryOver); a .dasma update is taken as is. */
export function buildReview(live: Script, pending: PendingImport, castKeys: readonly string[]): Review {
  const next = pending.script;
  const diff = diffScripts(live, next);
  const oldAt = new Map(live.units.map((u, i) => [u.id, { u, i }]));
  const newAt = new Map(next.units.map((u, i) => [u.id, { u, i }]));

  let result: Script;
  let unitHints: Record<string, UnitHint>;
  if (pending.mode === 'dasma') {
    result = next;
    unitHints = pending.unitHints;
  } else {
    result = pruneCharacters(carryOver(live, next, diff), castKeys);
    unitHints = {};
    // carryOver keeps next's unit order, so units line up by index.
    next.units.forEach((u, i) => {
      const hint = pending.unitHints[u.id];
      if (hint) unitHints[result.units[i].id] = hint;
    });
  }

  const oldToNew = new Map<number, number>();
  for (const p of [...diff.unchanged, ...diff.changed]) oldToNew.set(oldAt.get(p.oldId)!.i, newAt.get(p.newId)!.i);
  const removedOrder = (i: number): number => {
    for (let j = i - 1; j >= 0; j--) if (oldToNew.has(j)) return oldToNew.get(j)! + 0.5;
    return -0.5;
  };
  const retagged =
    pending.mode === 'dasma'
      ? diff.unchanged
          .filter((p) => !sameTags(oldAt.get(p.oldId)!.u, newAt.get(p.newId)!.u))
          .map((p): ReviewRow => ({ type: 'retagged', oldText: tagLabel(oldAt.get(p.oldId)!.u, live), newText: tagLabel(newAt.get(p.newId)!.u, next), order: newAt.get(p.newId)!.i }))
      : [];
  const rows: ReviewRow[] = [
    ...diff.changed.map((p): ReviewRow => ({ type: 'changed', oldText: oldAt.get(p.oldId)!.u.text, newText: newAt.get(p.newId)!.u.text, order: newAt.get(p.newId)!.i })),
    ...diff.added.map((id): ReviewRow => ({ type: 'added', newText: newAt.get(id)!.u.text, order: newAt.get(id)!.i })),
    ...diff.removed.map((id): ReviewRow => ({ type: 'removed', oldText: oldAt.get(id)!.u.text, order: removedOrder(oldAt.get(id)!.i) })),
    ...retagged,
  ].sort((a, b) => a.order - b.order);

  return {
    result,
    unitHints,
    counts: { changed: diff.changed.length, added: diff.added.length, removed: diff.removed.length, unchanged: diff.unchanged.length, retagged: retagged.length },
    rows,
  };
}
```

- [ ] **Step 4: Write `ReimportReview.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { ProductionRow, ScriptVersionRow } from '../db/schema';
import { href, navigate } from '../router';
import { useServices } from '../services';
import { Button } from '../ui/Button';
import { NotFound } from './NotFound';
import { buildReview, type RowType } from './reimport';

const FILTERS: Array<{ id: RowType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'changed', label: 'Changed' },
  { id: 'added', label: 'Added' },
  { id: 'removed', label: 'Removed' },
  { id: 'retagged', label: 'Retagged' },
];

export function ReimportReview({ productionId }: { productionId: string }) {
  const { repo, pending } = useServices();
  const p = pending.get(productionId);
  const [loaded, setLoaded] = useState<{ production: ProductionRow; live: ScriptVersionRow } | 'missing' | null>(null);
  const [filter, setFilter] = useState<RowType | 'all'>('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([repo.getProduction(productionId), repo.getLiveVersion(productionId)]).then(([production, version]) => {
      if (live) setLoaded(production && version ? { production, live: version } : 'missing');
    });
    return () => {
      live = false;
    };
  }, [repo, productionId]);

  const review = useMemo(
    () => (p && loaded && loaded !== 'missing' ? buildReview(loaded.live.script, p, Object.keys(loaded.production.cast)) : null),
    [p, loaded],
  );

  if (!p) {
    return (
      <main className="page">
        <p>Nothing to review.</p>
        <p>
          <a href={href({ name: 'production', id: productionId })}>Back to the production</a>
        </p>
      </main>
    );
  }
  if (loaded === 'missing') return <NotFound message="This production doesn't exist." />;
  if (!loaded || !review) return <main className="page">Loading…</main>;

  const { counts } = review;
  const dasma = p.mode === 'dasma';
  const rows = review.rows.filter((r) => filter === 'all' || r.type === filter);

  const keep = async () => {
    setBusy(true);
    await repo.addVersion(productionId, { script: review.result, pages: p.pages, unitHints: review.unitHints, importedFrom: p.importedFrom, warnings: p.warnings });
    if (dasma && p.cast) await repo.updateProduction(productionId, { cast: p.cast });
    pending.delete(productionId);
    navigate({ name: 'fix', id: productionId });
  };
  const cancel = () => {
    pending.delete(productionId);
    navigate({ name: 'production', id: productionId });
  };

  return (
    <main className="page">
      <h1>Review the new script</h1>
      <p>
        <strong>
          {counts.changed} lines changed · {counts.added} added · {counts.removed} removed · {counts.unchanged.toLocaleString()} unchanged
          {dasma && ` · ${counts.retagged} lines retagged or re-cut`}
        </strong>
      </p>
      {!dasma && <p>Your fixes are kept on unchanged lines.</p>}
      <div className="tabs">
        {FILTERS.filter((f) => dasma || f.id !== 'retagged').map((f) => (
          <Button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="muted">No lines of this kind.</p>
      ) : (
        <table className="grid">
          <thead>
            <tr>
              <th>Change</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.type}</td>
                <td>{r.oldText ?? ''}</td>
                <td>{r.newText ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tabs">
        <Button variant="primary" disabled={busy} onClick={() => void keep()}>
          Keep as version {loaded.live.version + 1}
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Write `OpenDasma.tsx`**

```tsx
import { ScriptFormatError, type FormatErrorReason } from '@dasma/script';
import { useState } from 'react';
import type { ProductionRow } from '../db/schema';
import type { DasmaContents } from '../import/importer';
import { navigate } from '../router';
import { useServices } from '../services';
import { afterProductionCreated } from '../storage';
import { Button } from '../ui/Button';
import { pagesOf } from './reimport';

export const DASMA_ERROR_TEXT: Record<FormatErrorReason, string> = {
  notJson: "This isn't a DASMA script file.",
  notDasma: "This isn't a DASMA script file.",
  newerVersion: 'This file was made by a newer version of DASMA. Update the app to open it.',
  invalid: "This DASMA file is damaged and can't be opened.",
};

type State = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'clash'; contents: DasmaContents; fileName: string; existing: ProductionRow };

/** Spec §5.6: open a .dasma file as a new production, or as an update to one with the same title. */
export function OpenDasma() {
  const services = useServices();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const createNew = async (contents: DasmaContents, fileName: string) => {
    const { production } = await services.repo.createProduction({
      title: contents.script.title,
      origin: 'dasma',
      cast: contents.cast ?? {},
      version: { script: contents.script, pages: pagesOf(contents.script), unitHints: {}, importedFrom: { kind: 'dasma', names: [fileName] }, warnings: [] },
    });
    await afterProductionCreated(services.repo, services.requestPersist);
    navigate({ name: 'production', id: production.id });
  };

  const update = (contents: DasmaContents, fileName: string, existing: ProductionRow) => {
    services.pending.set(existing.id, {
      mode: 'dasma',
      script: contents.script,
      pages: pagesOf(contents.script),
      unitHints: {},
      importedFrom: { kind: 'dasma', names: [fileName] },
      warnings: [],
      ...(contents.cast ? { cast: contents.cast } : {}),
    });
    navigate({ name: 'reimport', id: existing.id });
  };

  const onFile = async (file: File) => {
    setState({ kind: 'idle' });
    let contents: DasmaContents;
    try {
      contents = await services.importer.readDasma(await file.text());
    } catch (err) {
      setState({ kind: 'error', message: err instanceof ScriptFormatError ? DASMA_ERROR_TEXT[err.reason] : err instanceof Error ? err.message : String(err) });
      return;
    }
    const title = contents.script.title.trim().toLowerCase();
    const existing = (await services.repo.listProductions()).find((s) => s.production.title.trim().toLowerCase() === title)?.production;
    if (existing) setState({ kind: 'clash', contents, fileName: file.name, existing });
    else await createNew(contents, file.name);
  };

  return (
    <>
      <label className="btn">
        Open .dasma file
        <input
          type="file"
          accept=".dasma"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onFile(file);
          }}
        />
      </label>
      {state.kind === 'error' && (
        <p role="alert" className="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'clash' && (
        <div className="banner" role="dialog" aria-label="Production already exists">
          <p>A production called "{state.existing.title}" already exists.</p>
          <Button variant="primary" onClick={() => update(state.contents, state.fileName, state.existing)}>
            Update "{state.existing.title}"
          </Button>{' '}
          <Button onClick={() => void createNew(state.contents, state.fileName)}>Import as a new production</Button>{' '}
          <Button onClick={() => setState({ kind: 'idle' })}>Cancel</Button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 6: Wire them in**

`App.tsx`:

```tsx
    case 'reimport':
      return <ReimportReview productionId={route.id} />;
```

`Library.tsx`: change the `<p>` around the "New production" link to `<div className="tabs">` (the open-file control renders a banner and an alert, which cannot sit inside a `<p>`), and add `<OpenDasma />` after the link inside it.

- [ ] **Step 7: Run the tests and checks**

Run: `npx vitest run && npm run typecheck && npx eslint .`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): re-import review and opening .dasma files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Docs, the MVP spec changes and the done-check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-dasma-design.md`, `README.md`
- Create: `docs/script-screens-results.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Apply the MVP spec changes (spec §11)**

In `docs/superpowers/specs/2026-10-10-dasma-design.md`:

- §5, the **Production** bullet (line starting `- **Production** —`), replace with:

  `- **Production** — `id, title, cast: Record<characterId, actorName[]>` (the `.dasma` shape; an actor may play several characters), `origin: 'created' | 'dasma'`, `createdAt`, `updatedAt`. Run settings (`noAudioClips`, `autoDeleteDays`, `defaultStrictness`, `defaultPatience`) arrive with M3/M4. See the [M2b spec](2026-10-12-script-screens-design.md) §4.`

- §6 item 4, append: ` "Range-select" means click then shift-click (no drag), for units and for words; a partial cut splits the unit (M2b spec §6).`
- §6 item 5, append: ` A `.dasma` update replaces the script as is and also counts retagged or re-cut lines (M2b spec §5.5).`
- §8.1 item 1, append: ` (Engine status and model download: M3. The persistent-storage request: M2b.)`
- §11 item 3, replace its sub-bullet `M2a (script engine) done — … M2b (screens) next. …` so it ends with `M2b (screens) done — see [`docs/script-screens-results.md`](../../script-screens-results.md); it also brought in the cast list (from M4) and the persistent-storage request (from M5).` Keep the M2a outcome sentence.

- [ ] **Step 2: Update the README**

In `README.md`:
- **Status** paragraph: replace "There is no app UI yet." with "The browser app (`apps/web`) prepares a production: import, tag correction, cast list, cuts and overlaps, `.dasma` files."
- Layout table: `apps/web` row becomes `| `apps/web` | The browser app (React): library, import, tag correction, cast list, `.dasma` files |`.
- Add after "Getting started":

  ````markdown
  ## Running the app

  ```bash
  npm run dev -w apps/web
  ```

  Open the printed address in Chrome or Edge. Scripts are stored in the browser (IndexedDB) and never leave the machine. To score the importer on one of your own scripts, turn on **Show developer tools** in the library, open the production, and use **Export answer key**; save the file in `harness/local/` beside the script and run `npm run harness -- script-eval --set local`.
  ````

- [ ] **Step 3: Write `docs/script-screens-results.md`**

```markdown
# M2b script screens — results

Spec: [`docs/superpowers/specs/2026-10-12-script-screens-design.md`](superpowers/specs/2026-10-12-script-screens-design.md) §1.

## Automated checks

| Check | Result |
|---|---|
| `npx vitest run` | (fill in: number of tests, all passing) |
| `npm run typecheck` | (fill in) |
| `npx eslint .` | (fill in) |
| `npm run build -w apps/web` | (fill in) |
| PDF import in a browser worker (Task 10 spike) | (fill in: mode used — nested pdf.js worker or in-thread) |

## Done-check (run by the user, network off)

Run `npm run build -w apps/web && npx vite preview --port 4173` in `apps/web`, open `http://localhost:4173` in Chrome, then turn the network off.

1. **Real script.** New production → import one licensed script → fix its tags (check list to zero), mark at least one cut and one overlap, enter the cast. Record below; never record or commit the script.
2. **Round trip.** Production page → Export .dasma with the cast list → Library → Open .dasma file → Import as a new production. The script and cast must match.
3. **Re-import.** Edit a copy of the script file (change a few lines), Re-import it, check the counts, keep it, and confirm earlier fixes survived on unchanged lines.
4. **Answer key.** Show developer tools → Export answer key → save beside the script in `harness/local/` → `npm run harness -- script-eval --set local`.

| Item | Result |
|---|---|
| Script (family, pages) | (fill in, no title) |
| Time to fix, cut and cast (minutes) | (fill in) |
| Fixes per page (from `script-eval --set local`) | (fill in) |
| Round trip identical | (yes / no) |
| Re-import counts right, fixes kept | (yes / no) |
| Problems found | (fill in) |
```

- [ ] **Step 4: Final verification**

Run: `npx vitest run && npm run typecheck && npx eslint . && npm run build -w apps/web`
Expected: all pass. Fill in the "Automated checks" table with the real numbers (test count from the Vitest summary).

- [ ] **Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: M2b screens — MVP spec changes, README and the done-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The done-check table's items 1–4 are filled in by the user after the branch lands.
