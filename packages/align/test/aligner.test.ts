import { describe, expect, it } from 'vitest';
import { createAligner, patienceToGrace } from '../src/aligner';
import { buildExpected } from '../src/expected';
import { DEFAULT_ALIGN_OPTIONS, type AlignEvent, type ScriptLineInput, type Strictness } from '../src/types';
import { heard, runScenario } from './helpers/dsl';
import { EARNEST, LONG_SCENE, textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const P0 = { patience: 0 };
const perf = (...ids: string[]) => ids.map((id) => textOf(id)).join(' ');
const perfLong = (...ids: string[]) => ids.map((id) => textOf(id, LONG_SCENE)).join(' ');
const NOR: ScriptLineInput[] = [{ id: 'N1', characterId: 'JULIET', text: 'It is nor hand, nor foot, nor arm, nor face.' }];
const WITH_FEELING = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with wonderful feeling.', perf('L5')].join(' ');
// Word indices in EARNEST: L1 0–7, L2 8–15, L3 16–26, L4 27–36, L5 37–38.

describe('patienceToGrace', () => {
  it('maps the slider to confirmation words and timeout', () => {
    expect(patienceToGrace(0)).toEqual({ confirmWords: 1, timeoutSec: 0.4 });
    const mid = patienceToGrace(0.5);
    expect(mid.confirmWords).toBe(3);
    expect(mid.timeoutSec).toBeCloseTo(1.7);
    expect(patienceToGrace(1)).toEqual({ confirmWords: 4, timeoutSec: 3 });
    expect(patienceToGrace(7)).toEqual({ confirmWords: 4, timeoutSec: 3 });
  });
});

describe('aligner: clean runs', () => {
  it.each([0, 0.5, 1])('a perfect run produces no notes and completes every line (patience %s)', (patience) => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L3', 'L4', 'L5')), { patience });
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.events.flatMap((e) => (e.type === 'lineDone' ? [e.lineId] : []))).toEqual(['L1', 'L2', 'L3', 'L4', 'L5']);
    expect(r.types).not.toContain('lost');
  });

  it('ignores fillers', () => {
    const text = ['Did you um hear what I was uh playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('a scripted filler is not expected: "Um, I really mean it." performed without the Um is clean', () => {
    const UM: ScriptLineInput[] = [
      { id: 'U1', characterId: 'X', text: 'Um, I really mean it.' },
      { id: 'U2', characterId: 'Y', text: 'Then say so plainly.' },
    ];
    for (const patience of [0, 0.5]) {
      const r = runScenario(UM, heard('I really mean it. Then say so plainly.'), { patience });
      expect(r.lineNotes).toEqual([]);
      expect(r.flags).toEqual([]);
    }
  });

  it('a line that is just a filler ("Hmm.") produces no expected words and no notes', () => {
    const HMM: ScriptLineInput[] = [
      { id: 'H1', characterId: 'X', text: 'Tell me what you think.' },
      { id: 'H2', characterId: 'Y', text: 'Hmm.' },
      { id: 'H3', characterId: 'X', text: 'Well, say something at least.' },
    ];
    const r = runScenario(HMM, heard('Tell me what you think. Well, say something at least.'), P0);
    expect(r.expected.some((w) => w.lineId === 'H2')).toBe(false);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('accepts homophones', () => {
    const KNIGHT: ScriptLineInput[] = [{ id: 'K1', characterId: 'NARRATOR', text: 'The knight rode out into the night.' }];
    const r = runScenario(KNIGHT, heard('the night rode out into the knight'), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('pre-roll chatter: talk before the first line produces no notes', () => {
    const r = runScenario(EARNEST, heard(`Okay are we starting now | ${perf('L1', 'L2', 'L3', 'L4', 'L5')}`), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('pre-roll chatter containing "line" is not a call for line', () => {
    const r = runScenario(EARNEST, heard(`Okay everyone | line up over there | ${perf('L1', 'L2', 'L3', 'L4', 'L5')}`), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.types).not.toContain('calledForLine');
  });

  it('empty script: nothing to align, nothing breaks', () => {
    const r = runScenario(EARNEST.map((l) => ({ ...l, cut: true })), heard(perf('L1')));
    expect(r.events).toEqual([]);
  });

  it('cut lines are never expected', () => {
    const lines = EARNEST.map((l) => (l.id === 'L3' ? { ...l, cut: true } : l));
    const r = runScenario(lines, heard(perf('L1', 'L2', 'L4', 'L5')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('overlap zones are not checked', () => {
    const lines = EARNEST.map((l) => (l.id === 'L2' ? { ...l, overlapRanges: [[4, 8]] as Array<[number, number]> } : l));
    const text = [perf('L1'), "I didn't think it rather mumbled noise here", perf('L3', 'L4', 'L5')].join(' ');
    const r = runScenario(lines, heard(text), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });
});

describe('aligner: line errors', () => {
  it('"Yes, sorry" for "Yes, sir" is a wrong word, not a sound-alike match', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1', 'L2', 'L3', 'L4')} Yes, sorry.`), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'wrong-words', expected: 'sir', heard: 'sorry', status: 'note' })]);
  });

  it.each([0, 0.5, 1])('wrong word (patience %s)', (patience) => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), { patience });
    expect(r.lineNotes).toEqual([
      expect.objectContaining({ lineId: 'L4', category: 'wrong-words', expected: 'expression', heard: 'feeling', status: 'note' }),
    ]);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]!.alert).toBe(true);
  });

  it('dropped words', () => {
    const r = runScenario(EARNEST, heard([perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toHaveLength(1);
    expect(r.lineNotes[0]).toMatchObject({ lineId: 'L3', category: 'dropped-words' });
    expect(r.lineNotes[0]!.expected).toContain('your sake');
  });

  it('dropped line', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L4', 'L5')), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L3', characterId: 'ALGERNON', category: 'dropped-line' })]);
  });

  it('jumped cue', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L3', 'L4', 'L5')), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L3', characterId: 'ALGERNON', category: 'jumped-cue' })]);
  });

  it('a dried actor (long silence) gets a dropped line, not a jumped cue', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1')} || ${perf('L3', 'L4', 'L5')}`), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L2', characterId: 'LANE', category: 'dropped-line' })]);
  });

  it('added words at the end of a line', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1', 'L2', 'L3', 'L4')} Yes, sir, of course.`), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'added-words', heard: 'of course' })]);
  });

  it.each([0, 0.5])('transposed words (patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with expression wonderful.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L4', category: 'transposed', status: 'note' })]);
  });

  it.each([0, 0.5])('paraphrase (patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play correctly, though my playing has marvellous expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L4', category: 'paraphrase', status: 'note' })]);
  });

  it('contractions are "check" in word-perfect and forgiven in lenient', () => {
    const text = [perf('L1', 'L2'), "I am sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' ');
    expect(runScenario(EARNEST, heard(text), P0).lineNotes).toEqual([
      expect.objectContaining({ lineId: 'L3', category: 'wrong-words', status: 'check' }),
    ]);
    expect(runScenario(EARNEST, heard(text), { ...P0, strictness: { mode: 'lenient', lineMatchThreshold: 0.8 } }).lineNotes).toEqual([]);
  });

  it('repeated words: one dropped repetition is exactly one dropped-words note', () => {
    const WELL: ScriptLineInput[] = [
      { id: 'W1', characterId: 'HAMLET', text: 'I humbly thank you; well, well, well.' },
      { id: 'W2', characterId: 'OPHELIA', text: 'My lord, I have remembrances of yours.' },
    ];
    const r = runScenario(WELL, heard('I humbly thank you, well, well. My lord, I have remembrances of yours.'), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'W1', category: 'dropped-words', expected: 'well' })]);
  });
});

describe('aligner: stumbles, calls, chatter, restarts', () => {
  it('pause-and-correct is a stumble, not a note', () => {
    // Default patience: instant patience would commit the substitution during the 1 s pause.
    const r = runScenario(EARNEST, heard(['Did you hear what you | I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ')));
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('stumble');
  });

  it('repetition is a stumble, not a note', () => {
    const r = runScenario(EARNEST, heard(['Did you hear did you hear what I was playing, Lane?', perf('L2', 'L3', 'L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('stumble');
  });

  it.each([0, 0.5])('lenient mode: a single wrong word in a long line fires no live alert and no note (patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with garden expression.', perf('L5')].join(' ');
    const strict = runScenario(EARNEST, heard(text), { patience });
    expect(strict.flags.some((f) => f.alert && f.note.category === 'wrong-words')).toBe(true);
    const r = runScenario(EARNEST, heard(text), { patience, strictness: { mode: 'lenient', lineMatchThreshold: 0.8 } });
    expect(r.flags.some((f) => f.alert)).toBe(false);
    expect(r.lineNotes).toEqual([]);
  });

  it('called for line', () => {
    const text = [perf('L1', 'L2'), "I'm sorry for that, for your sake. || Line! | I don't play accurately.", perf('L4', 'L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L3', category: 'called-for-line', status: 'note' })]);
    expect(r.types).toContain('calledForLine');
    expect(r.flags.every((f) => !f.alert)).toBe(true);
  });

  it('long off-script talk then a jump: skipped text is "not run", with no notes', () => {
    const text = `${perf('L1', 'L2')} Okay everybody hold on let me fix this chair ||| ${perf('L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.types).toContain('lost');
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'notRun', fromIdx: 16, toIdx: 27 }));
  });

  it('off-script chatter that echoes script words does not skip lines', () => {
    const text = `${perf('L1')} hold on everybody my phone is ringing sorry I play with my phone ${perf('L2', 'L3', 'L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('off-script talk containing "line" is not a call for line', () => {
    const text = `${perf('L1', 'L2')} Okay everybody hold on let me fix this chair now please | line up the chair ||| ${perf('L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.types).not.toContain('calledForLine');
  });

  it('"line" after the last script word is not a call for line', () => {
    const r = runScenario(EARNEST, heard(`${perf('L1', 'L2', 'L3', 'L4', 'L5')} | line`), P0);
    // The stray word is an ordinary added word on the last line, never a call for line.
    expect(r.lineNotes).toEqual([expect.objectContaining({ lineId: 'L5', category: 'added-words', heard: 'line' })]);
    expect(r.types).not.toContain('calledForLine');
  });

  it('going back to an earlier line is a restart, not an error', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L3', 'L1', 'L2')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.types).toContain('reanchored');
  });

  it('after a restart, lines are completed again (the last lineDone per line wins)', () => {
    const r = runScenario(EARNEST, heard(perf('L1', 'L2', 'L3', 'L1', 'L2', 'L3', 'L4', 'L5')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
    expect(r.events.flatMap((e) => (e.type === 'lineDone' ? [e.lineId] : []))).toEqual(['L1', 'L2', 'L1', 'L2', 'L3', 'L4', 'L5']);
  });
});

describe('aligner: controls', () => {
  const setup = () => {
    const expected = buildExpected(EARNEST, WP);
    const aligner = createAligner(expected, { ...DEFAULT_ALIGN_OPTIONS, patience: 0 });
    const events: AlignEvent[] = [];
    aligner.onEvent((e) => events.push(e));
    return { expected, aligner, events };
  };

  it('jumpTo skips ahead without notes', () => {
    const { expected, aligner, events } = setup();
    const l4 = expected.findIndex((w) => w.lineId === 'L4');
    aligner.push(heard(perf('L1')));
    aligner.jumpTo(l4);
    aligner.push(heard(perf('L4', 'L5'), { start: 10 }));
    aligner.finalize(30);
    expect(events.flatMap((e) => (e.type === 'lineDone' ? e.notes : []))).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'notRun', fromIdx: 8, toIdx: l4 }));
    expect(aligner.cursor).toBe(expected.length);
  });

  it('ignores words while paused', () => {
    const { aligner, events } = setup();
    const words = heard(perf('L1', 'L2', 'L3'));
    aligner.push(words.slice(0, 8));
    aligner.pause();
    aligner.push(words.slice(8, 16));
    aligner.resume();
    aligner.push(words.slice(16));
    aligner.finalize(60);
    const matched = events.flatMap((e) => (e.type === 'matched' ? [e.idx] : []));
    expect(matched.some((i) => i >= 8 && i < 16)).toBe(false);
    expect(matched).toContain(16);
  });

  it('instant patience flags a wrong word as soon as the next word confirms it', () => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), { patience: 0 });
    const flagAt = r.events.findIndex((e) => e.type === 'flag');
    const sirMatchedAt = r.events.findIndex((e) => e.type === 'matched' && e.idx === 38);
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(sirMatchedAt);
  });

  it('relaxed patience shows a suspect before confirming', () => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), { patience: 1 });
    expect(r.types.indexOf('suspect')).toBeGreaterThan(-1);
    expect(r.types.indexOf('suspect')).toBeLessThan(r.types.indexOf('flag'));
  });

  it('exposes the look-ahead window for recognizer hotwords', () => {
    const { aligner } = setup();
    expect(aligner.lookahead().map((w) => w.norm).slice(0, 3)).toEqual(['did', 'you', 'hear']);
  });
});

describe('aligner: recognizer word boundaries and abbreviations', () => {
  it.each([0, 0.5])('rejoins a word the recognizer split ("any one" for "Anyone", patience %s)', (patience) => {
    const text = [perf('L1', 'L2', 'L3'), 'any one can play accurately, but I play with wonderful expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it('keeps two heard words apart when the script has them as two words (Review Focus 2)', () => {
    const ANY: ScriptLineInput[] = [
      { id: 'A1', characterId: 'X', text: 'Pick any one card you like.' },
      { id: 'A2', characterId: 'Y', text: 'Anyone can do that.' },
    ];
    const r = runScenario(ANY, heard('Pick any one card you like. Anyone can do that.'), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it.each([0, 0.5])('splits a heard word that runs one script word into the next ("norhan", patience %s)', (patience) => {
    const r = runScenario(NOR, heard('It is norhan nor foot nor arm nor face'), { patience });
    expect(r.lineNotes).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  it('does not split a real different word that merely starts the same ("normal")', () => {
    const r = runScenario(NOR, heard('It is normal nor foot nor arm nor face'), P0);
    expect(r.lineNotes.length).toBeGreaterThan(0);
  });

  it('reads "Mr." in the script as "mister"', () => {
    const l10 = textOf('L10', LONG_SCENE).replace('Mr.', 'mister');
    const text = [perfLong('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'), l10, perfLong('L11')].join(' ');
    expect(runScenario(LONG_SCENE, heard(text), P0).lineNotes).toEqual([]);
  });
});
