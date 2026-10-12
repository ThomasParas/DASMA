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

  it('never merges a name into a joint name; the joint name stays its own character (rule S2)', () => {
    const cast = buildCast(['MARCELLUS', 'MARCELLUS AND BARNARDO', 'BARNARDO', 'HORATIO', 'HORATIO & MARCELLUS']);
    expect(cast.characters).toEqual([
      { id: 'barnardo', name: 'BARNARDO', aliases: [] },
      { id: 'horatio', name: 'HORATIO', aliases: [] },
      { id: 'horatio-marcellus', name: 'HORATIO & MARCELLUS', aliases: [] },
      { id: 'marcellus', name: 'MARCELLUS', aliases: [] },
      { id: 'marcellus-and-barnardo', name: 'MARCELLUS AND BARNARDO', aliases: [] },
    ]);
    expect(cast.resolve('MARCELLUS')).toEqual({ characterId: 'marcellus', confidence: 1 });
    expect(cast.ambiguous).toEqual([]);
  });

  it('merges an abbreviation into the single name, ignoring the joint name it also prefixes (rule S2)', () => {
    const cast = buildCast(['ROS', 'ROSENCRANTZ', 'ROSENCRANTZ AND GUILDENSTERN'], ['ROSENCRANTZ', 'GUILDENSTERN']);
    expect(cast.resolve('ROS')).toEqual({ characterId: 'rosencrantz', confidence: 0.95 });
    expect(cast.resolve('ROSENCRANTZ AND GUILDENSTERN')).toEqual({ characterId: 'rosencrantz-and-guildenstern', confidence: 1 });
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
