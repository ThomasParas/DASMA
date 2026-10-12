import { describe, expect, it } from 'vitest';
import { cleanDoc, isPageNumber, normalizeText } from '../src/clean';
import { CAST_LIST_HEADER, isHeading, isSettingLine } from '../src/patterns';
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
