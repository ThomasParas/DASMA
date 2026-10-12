import { describe, expect, it } from 'vitest';
import { cleanDoc, isPageNumber, normalizeText } from '../src/clean';
import { CAST_LIST_HEADER, isHeading, isSettingLine } from '../src/patterns';
import type { RawLine } from '../src/types';
import { line, rawDoc, textDoc } from './helpers';

describe('running headers and footers', () => {
  it('removes a title repeated at the top of pages but keeps a speaker name that also appears mid-page', () => {
    const lines = [];
    for (let p = 1; p <= 6; p++) {
      const page = ['The Sea-Gull', 'NINA', 'I am a sea-gull.', 'TREPLIEFF', 'No.', 'NINA', 'Yes.', 'TREPLIEFF', 'Go.', 'NINA', 'I go.', `- ${p} -`];
      for (const text of page) lines.push(line(text, { page: p }));
    }
    const doc = cleanDoc(rawDoc(lines));
    expect(doc.lines.filter((l) => l.text === 'The Sea-Gull')).toHaveLength(0);
    expect(doc.lines.filter((l) => l.text.startsWith('-'))).toHaveLength(0);
    expect(doc.lines.filter((l) => l.text === 'NINA')).toHaveLength(18);
  });

  it('in pasted text removes a repeated line only when its number changes ("SERVANT 2" stays)', () => {
    const doc = textDoc(
      ['The Seagull 12', 'SERVANT 2', 'Yes.', 'The Seagull 13', 'SERVANT 2', 'No.', 'The Seagull 14', 'SERVANT 2', 'Maybe.'].join('\n'),
    );
    expect(doc.lines.map((l) => l.text)).toEqual(['SERVANT 2', 'Yes.', 'SERVANT 2', 'No.', 'SERVANT 2', 'Maybe.']);
  });
});

describe('running-line rules never remove headings or speaker cues (ruling R22)', () => {
  it('in pasted text keeps numbered scene headings whose digits change', () => {
    const doc = textDoc(['Scene 1', 'NINA', 'Yes.', 'Scene 2', 'NINA', 'No.', 'Scene 3', 'NINA', 'Maybe.', 'Scene 4', 'NINA', 'Go.'].join('\n'));
    expect(doc.lines.filter((l) => /^Scene \d$/.test(l.text)).map((l) => l.text)).toEqual(['Scene 1', 'Scene 2', 'Scene 3', 'Scene 4']);
  });

  it('in pasted text keeps numbered own-line speakers that cue again and again', () => {
    const out: string[] = [];
    for (let k = 0; k < 3; k++) out.push('GUARD 1', `Halt ${'x'.repeat(k)}.`, 'GUARD 2', `Pass ${'y'.repeat(k)}.`);
    const texts = textDoc(out.join('\n')).lines.map((l) => l.text);
    expect(texts.filter((t) => t === 'GUARD 1')).toHaveLength(3);
    expect(texts.filter((t) => t === 'GUARD 2')).toHaveLength(3);
  });

  it('in pasted text keeps an inline speech whose only varying part is a number, but still removes a numbered title', () => {
    const doc = textDoc(
      ['ANNA: I counted 3 apples.', 'x', 'ANNA: I counted 4 apples.', 'y', 'ANNA: I counted 5 apples.', 'The Seagull 12', 'The Seagull 13', 'The Seagull 14'].join('\n'),
    );
    expect(doc.lines.filter((l) => l.text.startsWith('ANNA:'))).toHaveLength(3);
    expect(doc.lines.filter((l) => l.text.startsWith('The Seagull'))).toHaveLength(0);
  });

  const pagedPlay = (headingAtTop: boolean) => {
    const lines: RawLine[] = [];
    for (let p = 1; p <= 5; p++) {
      const page = [headingAtTop ? `SCENE ${p}` : 'Speech', 'NINA', `Line ${p} a.`, 'KOSTYA', `Line ${p} b.`, 'NINA', `Line ${p} c.`, 'KOSTYA', `Line ${p} d.`];
      page.forEach((text) => lines.push(line(text, { page: p })));
    }
    return lines;
  };

  it('with real pages keeps scene headings that sit at the top of every page', () => {
    const texts = cleanDoc(rawDoc(pagedPlay(true))).lines.map((l) => l.text);
    expect(texts.filter((t) => /^SCENE \d$/.test(t))).toHaveLength(5);
  });

  it('with real pages still removes an all-capitals running title, which is cue-shaped', () => {
    const lines: RawLine[] = [];
    for (let p = 1; p <= 5; p++) {
      ["A DOLL'S HOUSE", 'NINA', `Line ${p} a.`, 'KOSTYA', `Line ${p} b.`, 'NINA', `Line ${p} c.`, 'KOSTYA', `Line ${p} d.`, `${p}`].forEach((text) =>
        lines.push(line(text, { page: p })),
      );
    }
    const texts = cleanDoc(rawDoc(lines)).lines.map((l) => l.text);
    expect(texts.filter((t) => t === "A DOLL'S HOUSE")).toHaveLength(0);
  });
});

describe('page-numbered running titles in estimated pages (R26)', () => {
  /** An 8-page paste: an optional header and footer around 22 NORA / HELMER speeches per page. */
  const paste = (header: (p: number) => string | null, footer: (p: number) => string | null = () => null): string => {
    const out: string[] = [];
    for (let p = 1; p <= 8; p++) {
      const h = header(p);
      if (h) out.push(h);
      for (let k = 0; k < 22; k++) out.push(k % 2 ? 'HELMER' : 'NORA', `Speech ${String.fromCharCode(97 + p)} ${String.fromCharCode(97 + k)} goes on here.`);
      const f = footer(p);
      if (f) out.push(f);
    }
    return out.join('\n');
  };
  const cues = (texts: string[]): number => texts.filter((t) => t === 'NORA' || t === 'HELMER').length;

  it.each([
    ['HAMLET n header', paste((p) => `HAMLET ${p}`), /^HAMLET \d+$/],
    ["A DOLL'S HOUSE n header", paste((p) => `A DOLL'S HOUSE ${p}`), /^A DOLL'S HOUSE \d+$/],
    ['THE SEAGULL n footer', paste(() => null, (p) => `THE SEAGULL ${p}`), /^THE SEAGULL \d+$/],
    ['Hamlet: page n header', paste((p) => `Hamlet: page ${p}`), /^Hamlet: page \d+$/],
    ['restarting The Seagull n header', paste((p) => `The Seagull ${p > 4 ? p - 4 : p}`), /^The Seagull \d+$/],
    ['The Seagull n header and footer', paste((p) => `The Seagull ${p}`, (p) => `The Seagull ${p}`), /^The Seagull \d+$/],
  ])('removes a %s and keeps every speaker cue', (_, text, title) => {
    const texts = textDoc(text).lines.map((l) => l.text);
    expect(texts.filter((t) => title.test(t))).toHaveLength(0);
    expect(cues(texts)).toBe(8 * 22);
  });

  it('keeps an inline speech whose number appears once', () => {
    const texts = textDoc(paste((p) => (p === 3 ? "NORA: I'm 3 years older." : null))).lines.map((l) => l.text);
    expect(texts).toContain("NORA: I'm 3 years older.");
  });
});

describe('real-page edge zone: a heading is exempt only when its exact text does not recur (R26)', () => {
  it('removes an ACT ONE running head but keeps SCENE 2 / SCENE 3 headings at page tops', () => {
    const lines: RawLine[] = [];
    for (let p = 1; p <= 6; p++) {
      const scene = p === 3 ? ['SCENE 2'] : p === 5 ? ['SCENE 3'] : [];
      ['ACT ONE', ...scene, 'NINA', `Line ${p} a.`, 'KOSTYA', `Line ${p} b.`, 'NINA', `Line ${p} c.`, 'KOSTYA', `Line ${p} d.`, `${p}`].forEach((text) =>
        lines.push(line(text, { page: p })),
      );
    }
    const texts = cleanDoc(rawDoc(lines)).lines.map((l) => l.text);
    expect(texts.filter((t) => t === 'ACT ONE')).toHaveLength(0);
    expect(texts.filter((t) => /^SCENE \d$/.test(t))).toEqual(['SCENE 2', 'SCENE 3']);
  });
});

describe('pasted-text running header (rule S1)', () => {
  /** A digit-free label, so the digits rule for running lines leaves the speech lines alone. */
  const tag = (n: number): string => String.fromCharCode(97 + Math.floor(n / 26)) + String.fromCharCode(97 + (n % 26));
  /** Six pages of own-line dialogue; each page ends with its number and the next opens with `header`. */
  function pastedPages(header: string, opts: { pageNumbers: boolean }): string {
    const out = [header, 'by Henrik Ibsen'];
    for (let p = 1; p <= 6; p++) {
      out.push('NORA', `Line ${tag(p)} a.`, 'HELMER', `Line ${tag(p)} b.`, 'NORA', `Line ${tag(p)} c.`);
      for (let k = 0; k < 20; k++) out.push(`Speech line ${tag(p)} ${tag(k)}.`);
      out.push('HELMER', `Line ${tag(p)} d.`);
      if (opts.pageNumbers) out.push(`${' '.repeat(40)}${p}`);
      out.push(header);
    }
    return out.join('\n');
  }

  it('removes a digit-free title that recurs next to page numbers, keeping the title page', () => {
    const doc = textDoc(pastedPages("A DOLL'S HOUSE", { pageNumbers: true }));
    const texts = doc.lines.map((l) => l.text);
    expect(texts.filter((t) => t === "A DOLL'S HOUSE")).toHaveLength(1);
    expect(texts[0]).toBe("A DOLL'S HOUSE");
    expect(texts.filter((t) => t === 'NORA')).toHaveLength(12);
    expect(texts.filter((t) => t === 'HELMER')).toHaveLength(12);
  });

  it('removes a header that recurs at a regular spacing when there are no page numbers', () => {
    const doc = textDoc(pastedPages('THE IMPORTANCE OF BEING EARNEST', { pageNumbers: false }));
    const texts = doc.lines.map((l) => l.text);
    expect(texts.filter((t) => t === 'THE IMPORTANCE OF BEING EARNEST')).toHaveLength(1);
    expect(texts.filter((t) => t === 'NORA')).toHaveLength(12);
  });

  it('never removes a speaker name that recurs next to page numbers but also speaks elsewhere', () => {
    const out: string[] = [];
    for (let p = 1; p <= 6; p++) {
      out.push('HELMER', `Line ${tag(p)} a.`, 'NINA', `Line ${tag(p)} b.`);
      for (let k = 0; k < 20; k++) out.push(`Speech line ${tag(p)} ${tag(k)}.`);
      out.push('NINA', `${p}`, `Line ${tag(p)} c.`);
    }
    const texts = textDoc(out.join('\n')).lines.map((l) => l.text);
    expect(texts.filter((t) => t === 'NINA')).toHaveLength(12);
  });

  it('never removes a regularly spaced minor speaker when there are no page numbers (review repro)', () => {
    const out: string[] = [];
    let n = 0;
    const filler = (count: number) => {
      for (let k = 0; k < count; k++) out.push(k % 2 ? `Speech line ${tag(n++)} said.` : k % 4 ? 'HORATIO' : 'HAMLET');
    };
    for (const gap of [28, 31, 27, 33, 30, 29]) {
      filler(gap - 2);
      out.push('MESSENGER', `News ${tag(n++)}.`);
    }
    const texts = textDoc(out.join('\n')).lines.map((l) => l.text);
    expect(texts.filter((t) => t === 'MESSENGER')).toHaveLength(6);
  });

  it('still removes a header with exactly TEXT_HEADER_MAX_STRAY copies elsewhere in the body', () => {
    const lines = pastedPages("A DOLL'S HOUSE", { pageNumbers: true }).split('\n');
    lines.splice(15, 0, "A DOLL'S HOUSE");
    const texts = textDoc(lines.join('\n')).lines.map((l) => l.text);
    expect(texts.filter((t) => t === "A DOLL'S HOUSE")).toHaveLength(2);
  });

  it('keeps a header with fewer than TEXT_HEADER_MIN_COPIES copies next to page numbers', () => {
    const lines = pastedPages("A DOLL'S HOUSE", { pageNumbers: true }).split('\n');
    const short = lines.slice(0, lines.lastIndexOf("A DOLL'S HOUSE", lines.lastIndexOf("A DOLL'S HOUSE") - 1) - 1);
    const texts = textDoc(short.join('\n')).lines.map((l) => l.text);
    expect(texts.filter((t) => t === "A DOLL'S HOUSE")).toHaveLength(5);
  });
});

describe('isPageNumber', () => {
  it('matches page-number lines only', () => {
    for (const t of ['12', '- 12 -', 'Page 3', 'page 14', 'iv', '— 7 —']) expect(isPageNumber(t)).toBe(true);
    for (const t of ['I', '1895 was a year', 'Page three', 'IV.']) expect(isPageNumber(t)).toBe(false);
  });
});

describe('line numbers', () => {
  it('removes PDF line numbers set outside the text column', () => {
    const lines = [];
    for (let i = 1; i <= 10; i++) {
      const text = `Verse line number ${'x'.repeat(40)} ${i}`;
      const l = line(text, { left: 72, right: 520 });
      if (i % 5 === 0) {
        l.spans = [
          { text, left: 72, right: 520, italic: false, bold: false },
          { text: String(i), left: 560, right: 572, italic: false, bold: false },
        ];
        l.text = `${text} ${i}`;
        l.right = 572;
      }
      lines.push(l);
    }
    const doc = cleanDoc(rawDoc(lines));
    expect(doc.lines[4].text).toBe(`Verse line number ${'x'.repeat(40)} 5`);
    expect(doc.lines[4].spans).toHaveLength(1);
    expect(doc.lines[4].right).toBe(520);
    expect(doc.lines[9].text.endsWith('10')).toBe(true);
    expect(doc.lines[9].spans).toHaveLength(1);
  });

  it('removes left line numbers in text, keeping the indent, and restarts at a scene heading', () => {
    const doc = textDoc(
      [
        '      One line.',
        '      Two line.',
        '  5   Three line.',
        '      Four line.',
        ' 10   Five line.',
        '  5   Not a line number, it went backwards.',
        'SCENE II',
        '  5   Six line.',
      ].join('\n'),
    );
    expect(doc.lines.map((l) => l.text)).toEqual([
      'One line.',
      'Two line.',
      'Three line.',
      'Four line.',
      'Five line.',
      '5 Not a line number, it went backwards.',
      'SCENE II',
      'Six line.',
    ]);
    expect(doc.lines[2].left).toBe(doc.lines[0].left);
    expect(doc.lines[4].left).toBe(doc.lines[0].left);
  });
});

describe('line numbers on multi-span lines', () => {
  const sp = (text: string, italic = false) => ({ text, left: 72, right: 72 + text.length * 6, italic, bold: false });
  const docx = (text: string, spans: ReturnType<typeof sp>[]) =>
    cleanDoc(rawDoc([line(text, { spans })], { source: 'docx', realPages: false })).lines[0];

  it('strips a leading number from the first span only and keeps the italic span intact', () => {
    const a = docx('5\tHello world', [sp('5\t'), sp('Hello '), sp('world', true)]);
    expect(a.text).toBe('Hello world');
    expect(a.spans.map((s) => [s.text, s.italic])).toEqual([['Hello', false], ['world', true]]);
    const b = docx('5\tHello world', [sp('5\tHello '), sp('world', true)]);
    expect(b.text).toBe('Hello world');
    expect(b.spans.map((s) => [s.text, s.italic])).toEqual([['Hello', false], ['world', true]]);
  });

  it('removes only the trailing number span, not other number spans', () => {
    const l = docx('Act 3 is long   10', [sp('Act '), sp('3'), sp(' is long   '), sp('10')]);
    expect(l.text).toBe('Act 3 is long');
    expect(l.spans.map((s) => s.text)).toEqual(['Act', '3', 'is long']);
  });
});

describe('hyphenation', () => {
  it('rejoins a word split across lines and records both sources', () => {
    const doc = textDoc("I don't play accu-\nrately at all.");
    expect(doc.lines.map((l) => l.text)).toEqual(["I don't play accurately at all."]);
    expect(doc.lines[0].source.map((s) => s.line)).toEqual([0, 1]);
  });

  it('leaves dashes, doubled hyphens and capitalised continuations alone', () => {
    const doc = textDoc('Well-\nKnown\nwait--\nthen\nI—\nno');
    expect(doc.lines.map((l) => l.text)).toEqual(['Well-', 'Known', 'wait--', 'then', 'I—', 'no']);
  });
});

describe('normalizeText', () => {
  it('expands ligatures, straightens quotes and normalises spaces', () => {
    expect(normalizeText('ﬁne ﬂower')).toBe('fine flower');
    expect(normalizeText('“Hello” ‘there’')).toBe('"Hello" \'there\'');
    expect(normalizeText('soft­hyphen')).toBe('softhyphen');
    expect(normalizeText('non breaking   spaces\t ')).toBe('non breaking spaces');
  });

  it('drops lines left empty', () => {
    expect(textDoc('­\nHello').lines.map((l) => l.text)).toEqual(['Hello']);
  });
});

describe('isHeading', () => {
  it('matches act and scene headings, not ACT DROP or long lines', () => {
    for (const t of ['ACT I', 'Act 2', 'FIRST ACT', 'SCENE', 'SCENE II. A room.', 'Scene: a garden', 'THE PROLOGUE', 'Act One'])
      expect(isHeading(t)).toBe(true);
    for (const t of ['ACT DROP', 'Acting is hard', 'Scene of the crime, I said, and then I went home again to sleep it off'])
      expect(isHeading(t)).toBe(false);
  });
});

describe('isSettingLine', () => {
  it('matches a SCENE line that names a place with no number or ordinal (rule S5)', () => {
    for (const t of ['SCENE. Elsinore.', 'Scene: a garden', 'SCENE.—Verona.', 'SCENE: In a castle', 'Scene. Civil war in Rome'])
      expect(isSettingLine(t)).toBe(true);
    for (const t of ['SCENE III. A room in the Castle.', 'Scene 2', 'SCENE I', 'Scene iv', 'SCENE THE FIRST', 'Scene One.', 'SCENE', 'ACT I', 'Scenery'])
      expect(isSettingLine(t)).toBe(false);
  });
});

describe('CAST_LIST_HEADER', () => {
  it('matches cast-list headers, including Dramatis Personæ, and not words that merely start with one', () => {
    for (const t of ['Dramatis Personæ', 'DRAMATIS PERSONAE', 'Persons Represented', 'THE PERSONS IN THE PLAY', 'Characters'])
      expect(CAST_LIST_HEADER.test(t)).toBe(true);
    for (const t of ['Characterisation of the lead', 'Castle']) expect(CAST_LIST_HEADER.test(t)).toBe(false);
  });
});
