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

  it('never renders an underscore: emphasis spans verse lines, and stray marks are dropped', () => {
    const play = {
      ...MINI_PLAY,
      units: [
        { kind: 'frontMatter' as const, text: '_[The action takes place in a room.]_' },
        { kind: 'heading' as const, text: 'ACT I' },
        { kind: 'direction' as const, text: '[Enter Horatio, very gay.] He does!' },
        { kind: 'dialogue' as const, characterId: 'hamlet', text: 'Now _Anon he finds him,\nStriking_ too late, [_Aside_ .] and so_ on.' },
      ],
    };
    const { paras, truth } = buildParas(play, play.units, STYLES.licensed['1'], mulberry32(1));
    expect(paras.some((p) => p.runs.some((r) => r.text.includes('_')))).toBe(false);
    expect(truth.some((t) => t.text.includes('_'))).toBe(false);
    const speech = paras.filter((p) => p.kind === 'speech');
    expect(speech[0].runs.find((r) => r.text.includes('Anon'))?.italic).toBe(true);
    expect(speech[1].runs.find((r) => r.text.includes('Striking'))?.italic).toBe(true);
    expect(runs(speech[1])).toContain('Striking too late,');
    // Standalone units carry no source brackets; only the style's own wrapper.
    expect(runs(paras[0])).toBe('The action takes place in a room.');
    expect(truth[0]).toEqual({ kind: 'frontMatter', text: 'The action takes place in a room.' });
    expect(truth.find((t) => t.kind === 'direction')).toEqual({ kind: 'direction', text: '(Enter Horatio, very gay. He does!)' });
    // Inline directions are cleaned before wrapping.
    expect(truth).toContainEqual({ kind: 'direction', text: '(Aside .)' });
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
