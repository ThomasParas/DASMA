import { FLAG_BELOW, importScript } from '@dasma/script';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateLocal, loadLocalDocs } from '../../src/script-eval/evaluate-scripts';
import { draftTruth, writeDraftTruth } from '../../src/script-eval/truth-draft';

const SCENE = ['ACT I', 'HAMLET', 'To be.', 'HORATIO', 'My lord.', 'HAMLET', 'Go.', 'HORATIO', 'Yes.'].join('\n');

describe('draftTruth', () => {
  it('turns an import into an answer key in script order, marking unsure units', async () => {
    const result = await importScript({ kind: 'text', text: SCENE });
    const draft = draftTruth(result);
    expect(draft.pages).toBe(1);
    expect(draft.cast.map((c) => c.id)).toEqual(['hamlet', 'horatio']);
    expect(draft.units.map((u) => [u.kind, u.characterId ?? null, u.text])).toEqual([
      ['heading', null, 'ACT I'],
      ['characterName', null, 'HAMLET'],
      ['dialogue', 'hamlet', 'To be.'],
      ['characterName', null, 'HORATIO'],
      ['dialogue', 'horatio', 'My lord.'],
      ['characterName', null, 'HAMLET'],
      ['dialogue', 'hamlet', 'Go.'],
      ['characterName', null, 'HORATIO'],
      ['dialogue', 'horatio', 'Yes.'],
    ]);
    expect(draft.units.every((u) => u.page === 1)).toBe(true);
    const unsure = result.script.units.map((u, i) => (u.tagConfidence < FLAG_BELOW ? i : -1)).filter((i) => i >= 0);
    expect(draft.units.flatMap((u, i) => (u.check ? [i] : []))).toEqual(unsure);
  });

  it('marks a speech without a resolved speaker for checking', async () => {
    const result = await importScript({ kind: 'text', text: SCENE });
    result.script.units[2] = { ...result.script.units[2], characterId: undefined, tagConfidence: 0.4 };
    const unit = draftTruth(result).units[2];
    expect(unit).toEqual({ kind: 'dialogue', text: 'To be.', page: 1, check: true });
  });
});

describe('writeDraftTruth', () => {
  it('writes the draft and refuses to overwrite an existing file unless forced', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dasma-draft-'));
    const path = join(dir, 'nested', 'scene.truth.json');
    const draft = draftTruth(await importScript({ kind: 'text', text: SCENE }));
    writeDraftTruth(path, draft);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(draft);
    writeFileSync(path, '{"hand": "corrected"}');
    expect(() => writeDraftTruth(path, draft)).toThrow(/already exists.*--force/);
    expect(readFileSync(path, 'utf8')).toBe('{"hand": "corrected"}');
    writeDraftTruth(path, draft, true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(draft);
  });

  it('produces a valid local answer key that scores its own import as perfect', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dasma-draft-'));
    writeFileSync(join(dir, 'scene.txt'), SCENE);
    writeDraftTruth(join(dir, 'scene.truth.json'), draftTruth(await importScript({ kind: 'text', text: SCENE })));
    expect(existsSync(join(dir, 'scene.truth.json'))).toBe(true);
    const [score] = await evaluateLocal(loadLocalDocs(dir).docs);
    expect(score).toMatchObject({ docId: 'scene', fixes: [], textErrors: 0, speakerRight: 4 });
  });
});
