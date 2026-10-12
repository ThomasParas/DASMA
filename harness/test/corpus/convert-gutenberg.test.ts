import { describe, expect, it } from 'vitest';
import { PLAY_CONFIGS, STAGE_DIRECTION, convertGutenberg, normalizeDirections, unencodable, type PlayConfig } from '../../src/corpus/convert-gutenberg';

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
  continuations: false,
  directionStart: STAGE_DIRECTION,
};
const VERSE: PlayConfig = { ...OWN, continuations: true };
const PROSE: PlayConfig = { ...OWN, verse: false };
const SEAGULL: PlayConfig = { ...OWN, cueStyle: 'inline', verse: false, continuations: true, directionStart: PLAY_CONFIGS.find((c) => c.id === 'seagull')!.directionStart };
const body = (play: { units: Array<{ kind: string }> }) => play.units.filter((u) => u.kind !== 'frontMatter');

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

  it('continues a speech interrupted by a direction or a paragraph break (continuations on)', () => {
    const text = wrap([
      'PERSONS', 'HORATIO', 'MARCELLUS', '', 'ACT I', '', 'SCENE I. A platform.', '', 'Enter Ghost.', '', 'Can you hear me?', '',
      'HORATIO.', 'Speak to me.', '', 'Re-enter Ghost.', '', 'But, soft, behold! Lo, where it comes again!', 'Stay, illusion!', '',
      '[_The cock crows._]', '', 'Stop it, Marcellus!', '', 'Then up he rose.', '', 'MARCELLUS.', 'Shall I strike?', '', 'Exeunt.', '',
      'SCENE II. A room.', '', 'Going.', '',
    ]);
    expect(body(convertGutenberg(text, VERSE))).toEqual([
      { kind: 'heading', text: 'ACT I' },
      { kind: 'heading', text: 'SCENE I. A platform.' },
      { kind: 'direction', text: 'Enter Ghost.' },
      { kind: 'direction', text: 'Can you hear me?' },
      { kind: 'dialogue', characterId: 'horatio', text: 'Speak to me.' },
      { kind: 'direction', text: 'Re-enter Ghost.' },
      { kind: 'dialogue', characterId: 'horatio', text: 'But, soft, behold! Lo, where it comes again!\nStay, illusion!' },
      { kind: 'direction', text: 'The cock crows.' },
      { kind: 'dialogue', characterId: 'horatio', text: 'Stop it, Marcellus!' },
      { kind: 'dialogue', characterId: 'horatio', text: 'Then up he rose.' },
      { kind: 'dialogue', characterId: 'marcellus', text: 'Shall I strike?' },
      { kind: 'direction', text: 'Exeunt.' },
      { kind: 'heading', text: 'SCENE II. A room.' },
      { kind: 'direction', text: 'Going.' },
    ]);
    expect(body(convertGutenberg(text, OWN)).filter((u) => u.kind === 'dialogue')).toHaveLength(2);
  });

  it('keeps stage-direction vocabulary as directions even mid-speech', () => {
    const play = convertGutenberg(
      wrap([
        'PERSONS', 'KING', '', 'ACT I', '', 'KING.', 'Give me the cup.', '', 'Danish march. A flourish. Enter Queen.', '',
        'Trumpets sound. The dumb show enters.', '', '_Enter a King and a Queen very lovingly._', '', 'The King rises and advances.', '',
        'Juliet appears above at a window.', '', 'Exit.', '',
      ]),
      VERSE,
    );
    expect(body(play).map((u) => u.kind)).toEqual(['heading', 'dialogue', 'direction', 'direction', 'direction', 'direction', 'direction', 'direction']);
  });

  it('reads joint cues as their own speaker, exempt from the cast check', () => {
    const play = convertGutenberg(
      wrap([
        'PERSONS', 'CORNELIUS', 'VOLTEMAND', 'HORATIO', 'MARCELLUS', '', 'ACT I', '',
        'CORNELIUS and VOLTEMAND.', 'In that, and all things, will we show our duty.', '',
        'HORATIO and MARCELLUS. [_Within._] My lord, my lord.', '', 'OSRIC and LORDS.', 'Treason! treason!', '',
      ]),
      OWN,
    );
    expect(play.cast.map((c) => [c.id, c.name])).toEqual([
      ['cornelius-and-voltemand', 'CORNELIUS AND VOLTEMAND'],
      ['horatio-and-marcellus', 'HORATIO AND MARCELLUS'],
      ['osric-and-lords', 'OSRIC AND LORDS'],
    ]);
    expect(body(play).slice(1)).toEqual([
      { kind: 'dialogue', characterId: 'cornelius-and-voltemand', text: 'In that, and all things, will we show our duty.' },
      { kind: 'dialogue', characterId: 'horatio-and-marcellus', text: '[Within.] My lord, my lord.' },
      { kind: 'dialogue', characterId: 'osric-and-lords', text: 'Treason! treason!' },
    ]);
  });

  it('reads a prose joint cue followed by a bracketed direction', () => {
    const play = convertGutenberg(
      wrap(['PERSONS', 'GWENDOLEN', 'CECILY', '', 'ACT I', '', 'GWENDOLEN and CECILY [Speaking together.] Your Christian names are', 'still an insuperable barrier.', '']),
      PROSE,
    );
    expect(body(play)[1]).toEqual({ kind: 'dialogue', characterId: 'gwendolen-and-cecily', text: '[Speaking together.] Your Christian names are still an insuperable barrier.' });
  });

  it('reads a known speaker cue missing its period, a title-case cue and an inline cue in an own-line play', () => {
    const play = convertGutenberg(
      wrap([
        'PERSONS', 'BARNARDO', 'ROMEO', 'NURSE', 'WATCHMEN', '', 'ACT I', '', 'BARNARDO.', 'Who’s there?', '', 'BOTH.', 'Arm’d.', '',
        'BARNARDO', 'It would be spoke to.', '', 'Both.', 'Arm’d, my lord.', '', 'ROMEO. Nurse, commend me to thy lady and mistress. I protest unto', 'thee,—', '',
        'THIRD WATCH. Here is a Friar that trembles, sighs, and weeps.', 'We took this mattock.', '',
      ]),
      { ...OWN, castExceptions: ['BOTH'] },
    );
    expect(body(play).slice(3)).toEqual([
      { kind: 'dialogue', characterId: 'barnardo', text: 'It would be spoke to.' },
      { kind: 'dialogue', characterId: 'both', text: 'Arm’d, my lord.' },
      { kind: 'dialogue', characterId: 'romeo', text: 'Nurse, commend me to thy lady and mistress. I protest unto\nthee,—' },
      { kind: 'dialogue', characterId: 'third-watch', text: 'Here is a Friar that trembles, sighs, and weeps.\nWe took this mattock.' },
    ]);
  });

  it('gives a cue-less paragraph with a direction and speech to the current speaker', () => {
    const play = convertGutenberg(
      wrap([
        'PERSONS', 'CECILY', 'ROMEO', '', 'ACT I', '', '[Enter Algernon.] He does!', '', 'CECILY.', 'I am so afraid.', '',
        '[Enter Algernon, very gay and debonnair.] He does!', '', 'ROMEO.', 'Stay, fellow; I can read.', '',
        'A fair assembly. [_Gives back the paper_] Whither should they come?', '', '[_Exit._] [_Enter Nurse._]', '',
      ]),
      PROSE,
    );
    expect(body(play)).toEqual([
      { kind: 'heading', text: 'ACT I' },
      { kind: 'direction', text: '[Enter Algernon.] He does!' },
      { kind: 'dialogue', characterId: 'cecily', text: 'I am so afraid.' },
      { kind: 'dialogue', characterId: 'cecily', text: '[Enter Algernon, very gay and debonnair.] He does!' },
      { kind: 'dialogue', characterId: 'romeo', text: 'Stay, fellow; I can read.' },
      { kind: 'dialogue', characterId: 'romeo', text: 'A fair assembly. [Gives back the paper] Whither should they come?' },
      { kind: 'direction', text: '[Exit.] [Enter Nurse.]' },
    ]);
  });

  it('keeps prose stage directions as directions and continues quoted speech (Sea-Gull config)', () => {
    const play = convertGutenberg(
      wrap([
        'PERSONS', 'MASHA', 'DORN', 'SORIN', 'TREPLIEFF', '', 'ACT I', '', '_The scene is laid in the park._', '',
        'MASHA. I am in mourning.', '', 'MASHA and MEDVIEDENKO go out.', '', 'SORIN leaning on a cane, and TREPLIEFF come in.', '',
        'DORN. [Sings]', '', '“Once more I stand before thee.”', '', 'It is only right that artists should be made much of.', '',
        'She takes snuff. DORN takes the snuff-box. [A pause.]', '', 'A horn is blown behind the stage.', '', 'The curtain falls.', '',
        'Two years elapse between the third and fourth acts.', '',
      ]),
      SEAGULL,
    );
    expect(body(play)).toEqual([
      { kind: 'heading', text: 'ACT I' },
      { kind: 'direction', text: 'The scene is laid in the park.' },
      { kind: 'dialogue', characterId: 'masha', text: 'I am in mourning.' },
      { kind: 'direction', text: 'MASHA and MEDVIEDENKO go out.' },
      { kind: 'direction', text: 'SORIN leaning on a cane, and TREPLIEFF come in.' },
      { kind: 'dialogue', characterId: 'dorn', text: '[Sings]' },
      { kind: 'dialogue', characterId: 'dorn', text: '“Once more I stand before thee.”' },
      { kind: 'dialogue', characterId: 'dorn', text: 'It is only right that artists should be made much of.' },
      { kind: 'direction', text: 'She takes snuff. DORN takes the snuff-box. [A pause.]' },
      { kind: 'direction', text: 'A horn is blown behind the stage.' },
      { kind: 'direction', text: 'The curtain falls.' },
      { kind: 'direction', text: 'Two years elapse between the third and fourth acts.' },
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
