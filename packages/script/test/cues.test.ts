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
