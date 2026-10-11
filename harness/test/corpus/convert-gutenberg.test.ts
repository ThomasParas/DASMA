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
