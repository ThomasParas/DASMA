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

  it('does not count a bracket that closes mid-line, even when another bracket ends the line', () => {
    expect(bracketBlocks(['(drops her cloak) Someone is coming now! (Goes to the door.)'])).toEqual([false]);
  });

  it('does not count a two-line block that closes mid-way through its second line', () => {
    expect(bracketBlocks(['(He crosses to the window', 'and looks out) and calls to her.', 'Hello.'])).toEqual([false, false, false]);
  });
});
