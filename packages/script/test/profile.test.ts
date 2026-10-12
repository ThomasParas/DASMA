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

  it('keeps a SCENE setting line at the end of the cast list in the front matter (rule S5)', () => {
    const p = profileDoc(
      textDoc(
        [
          'Dramatis Personæ',
          'HAMLET, Prince of Denmark',
          'HORATIO, Friend to Hamlet',
          'SCENE. Elsinore.',
          'SCENE III. A room in the Castle.',
          'HAMLET. To be.',
          'HORATIO. My lord.',
          'HAMLET. Go on.',
        ].join('\n'),
      ),
    );
    expect(p.castList).toEqual(['HAMLET', 'HORATIO']);
    expect(p.frontMatterEnd).toBe(4);
  });

  it('still ends front matter at a SCENE setting line that is not in a cast list (rule S5)', () => {
    const p = profileDoc(textDoc(['HAMLET', 'by William Shakespeare', 'SCENE. Elsinore.', 'HAMLET. To be.', 'HORATIO. My lord.'].join('\n')));
    expect(p.frontMatterEnd).toBe(2);
  });
});

describe('clusterBands', () => {
  it('merges left edges within the tolerance', () => {
    expect(clusterBands([73, 108, 72], 12)).toEqual([72.5, 108]);
  });
});
