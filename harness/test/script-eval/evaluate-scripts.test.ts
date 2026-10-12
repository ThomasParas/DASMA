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
