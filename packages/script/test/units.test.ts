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
