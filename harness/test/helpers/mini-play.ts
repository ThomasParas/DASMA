import type { SourcePlay } from '../../src/corpus/source-play';

export const MINI_PLAY: SourcePlay = {
  id: 'mini',
  title: 'MINI',
  source: 'test fixture',
  cast: [
    { id: 'hamlet', name: 'HAMLET', aliases: [] },
    { id: 'horatio', name: 'HORATIO', aliases: [] },
    { id: 'first-clown', name: 'FIRST CLOWN', aliases: [] },
  ],
  units: [
    { kind: 'frontMatter', text: 'MINI' },
    { kind: 'frontMatter', text: 'PERSONS' },
    { kind: 'heading', text: 'ACT I' },
    { kind: 'direction', text: 'Enter Hamlet and Horatio.' },
    { kind: 'dialogue', characterId: 'hamlet', text: 'To be, _or_ not to be,\n[Aside.] that is the question.' },
    { kind: 'dialogue', characterId: 'horatio', text: 'My lord, I came to see your father’s funeral.' },
    { kind: 'dialogue', characterId: 'first-clown', text: '[Digging.] A pit of clay for to be made.' },
    { kind: 'heading', text: 'SCENE II. A room.' },
    { kind: 'dialogue', characterId: 'hamlet', text: 'Words, words, words.' },
    { kind: 'dialogue', characterId: 'horatio', text: 'Indeed, my lord.' },
  ],
};
