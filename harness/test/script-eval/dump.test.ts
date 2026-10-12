import type { ImportResult } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { renderDumpHtml } from '../../src/script-eval/dump';

const RESULT: ImportResult = {
  script: {
    title: 'T<1>',
    characters: [{ id: 'hamlet', name: 'HAMLET', aliases: [] }],
    units: [
      { id: 'u1', kind: 'dialogue', characterId: 'hamlet', text: '<b>hi</b>\nthere', cut: false, tagConfidence: 0.5, source: [] },
      { id: 'u2', kind: 'direction', text: '(He sits.)', cut: false, tagConfidence: 0.95, source: [] },
    ],
  },
  profile: {
    bands: [72],
    speakerBand: 'centered',
    dialogueBand: 72,
    directionBand: null,
    primary: 'ownLine',
    secondary: null,
    directionMarks: { italic: 0, parens: 1, brackets: 0, ownBand: 0 },
    castList: [],
    cueTokens: new Map([['HAMLET', 3]]),
    frontMatterEnd: 0,
  },
  warnings: [{ code: 'noSpeakers' }],
  pages: 1,
};

describe('renderDumpHtml', () => {
  it('escapes text, highlights flagged units and lists warnings and cue tokens', () => {
    const html = renderDumpHtml(RESULT, 'a&b.pdf');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;<br>there');
    expect(html).toContain('T&lt;1&gt;');
    expect(html).toContain('a&amp;b.pdf');
    expect(html).toContain('class="flagged dialogue"');
    expect(html).toContain('class=" direction"');
    expect(html).toContain('noSpeakers');
    expect(html).toContain('HAMLET (3)');
    expect(html).not.toContain('<b>hi');
  });
});
