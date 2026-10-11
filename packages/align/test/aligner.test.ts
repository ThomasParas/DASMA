import { describe, expect, it } from 'vitest';
import { createAligner, patienceToGrace } from '../src/aligner';
import { buildExpected } from '../src/expected';
import { DEFAULT_ALIGN_OPTIONS, type AlignEvent, type NoteDraft, type ScriptLineInput, type Strictness } from '../src/types';
import { heard, runScenario } from './helpers/dsl';
import { EARNEST, LONG_SCENE, textOf } from './helpers/fixtures';

const WP: Strictness = { mode: 'word-perfect' };
const P0 = { patience: 0 };
const perf = (...ids: string[]) => ids.map((id) => textOf(id)).join(' ');
const perfLong = (...ids: string[]) => ids.map((id) => textOf(id, LONG_SCENE)).join(' ');
const NOR: ScriptLineInput[] = [{ id: 'N1', characterId: 'JULIET', text: 'It is nor hand, nor foot, nor arm, nor face.' }];
const WITH_FEELING = [perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with wonderful feeling.', perf('L5')].join(' ');
/** The notes of each line's last lineDone (the last lineDone per line wins). */
const finalNotes = (events: AlignEvent[]) => {
  const out = new Map<string, NoteDraft[]>();
  for (const e of events) if (e.type === 'lineDone') out.set(e.lineId, e.notes);
  return out;
};
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

  it('a recognizer fragment never buzzes and is only a check', () => {
    const CIG: ScriptLineInput[] = [
      { id: 'C1', characterId: 'JACK', text: 'I simply want my cigarette case back.' },
      { id: 'C2', characterId: 'ALGY', text: 'Here it is.' },
    ];
    for (const patience of [0, 0.5]) {
      const r = runScenario(CIG, heard('I simply want my cigar case back. Here it is.'), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([]);
      expect(r.flags.filter((f) => f.alert), `patience ${patience}`).toEqual([]);
    }
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

  it('a single dropped content word is noted but does not buzz', () => {
    const r = runScenario(EARNEST, heard([perf('L1', 'L2'), "I'm sorry for that. I don't play accurately.", perf('L4', 'L5')].join(' ')), P0);
    expect(r.lineNotes).toEqual([expect.objectContaining({ category: 'dropped-words', status: 'note' })]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  it('two dropped content words buzz', () => {
    const r = runScenario(EARNEST, heard([perf('L1', 'L2', 'L3'), 'Anyone can play accurately, but I play with.', perf('L5')].join(' ')), P0);
    expect(r.flags.filter((f) => f.alert)).toEqual([expect.objectContaining({ note: expect.objectContaining({ category: 'dropped-words' }) })]);
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

  it('instant patience flags a mid-line wrong word as soon as the next word confirms it', () => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play beautifully, but I play with wonderful expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), { patience: 0 });
    const flagAt = r.events.findIndex((e) => e.type === 'flag');
    const butMatchedAt = r.events.findIndex((e) => e.type === 'matched' && e.idx === 31); // "but" in L4
    expect(flagAt).toBeGreaterThan(-1);
    expect(r.events[flagAt]).toMatchObject({ alert: true });
    expect(flagAt).toBeGreaterThan(butMatchedAt);
    expect(r.events.findIndex((e) => e.type === 'matched' && e.idx === 32)).toBeGreaterThan(flagAt);
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

describe('aligner: anchored alerts (pass spec §6.1)', () => {
  it('chatter that shares a word with the next line raises no alert (M1 oracle earnest #6)', () => {
    const text = `${perf('L1', 'L2')} | Sorry sorry can we take that bit again from just before the entrance please | ${perf('L3', 'L4', 'L5')}`;
    for (const patience of [0, 0.5]) {
      const r = runScenario(EARNEST, heard(text), { patience });
      expect(r.flags.filter((f) => f.alert), `patience ${patience}`).toEqual([]);
    }
  });

  it('a wrong word mid-line alerts at once', () => {
    const text = [perf('L1', 'L2', 'L3'), 'Anyone can play beautifully, but I play with wonderful expression.', perf('L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    const flags = r.flags.filter((f) => f.note.lineId === 'L4');
    expect(flags).toHaveLength(1);
    expect(flags[0]!.alert).toBe(true);
  });

  it('a wrong first word waits until three correct words follow, then alerts once', () => {
    const text = [perf('L1', 'L2'), "Truly sorry for that, for your sake. I don't play accurately.", perf('L4', 'L5')].join(' ');
    const r = runScenario(EARNEST, heard(text), P0);
    const alertAt = r.events.flatMap((e, k) => (e.type === 'flag' && e.alert ? [k] : []));
    expect(alertAt).toHaveLength(1);
    const thirdMatched = r.events.findIndex((e) => e.type === 'matched' && e.idx === 19); // "that" in L3
    expect(alertAt[0]).toBeGreaterThan(thirdMatched);
    expect(r.flags.filter((f) => f.note.lineId === 'L3').map((f) => f.alert)).toEqual([false, true]);
  });

  // "Truly" for "I'm" waits for three correct words after it; each case below takes that wait away before they come.
  const TRULY = `${perf('L1', 'L2')} Truly sorry`;
  const trulyAlerts = (events: AlignEvent[]) =>
    events.flatMap((e) => (e.type === 'flag' && e.note.lineId === 'L3' && e.note.heard === 'truly' ? [e.alert] : []));

  it('a waiting note is dropped when the aligner gets lost', () => {
    const text = `${TRULY} for | okay hold on everybody my phone is ringing ||| that, for your sake. I don't play accurately. ${perf('L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), P0);
    expect(r.types).toContain('lost');
    expect(trulyAlerts(r.events)).toEqual([false]);
    expect(finalNotes(r.events).get('L3')).toEqual([expect.objectContaining({ heard: 'truly', status: 'note' })]);
  });

  it('a waiting note is dropped when a backward jump resets its line', () => {
    const expected = buildExpected(EARNEST, WP);
    const aligner = createAligner(expected, { ...DEFAULT_ALIGN_OPTIONS, patience: 0 });
    const events: AlignEvent[] = [];
    aligner.onEvent((e) => events.push(e));
    aligner.push(heard(TRULY));
    expect(trulyAlerts(events)).toEqual([false]);
    aligner.jumpTo(expected.findIndex((w) => w.lineId === 'L3'));
    aligner.push(heard(perf('L3', 'L4', 'L5'), { start: 20 }));
    aligner.finalize(60);
    expect(trulyAlerts(events)).toEqual([false]);
    expect(finalNotes(events).get('L3')).toEqual([]);
  });

  it('a note still waiting when the run ends is dropped: words after finalize never alert it', () => {
    const expected = buildExpected(EARNEST, WP);
    const aligner = createAligner(expected, { ...DEFAULT_ALIGN_OPTIONS, patience: 0 });
    const events: AlignEvent[] = [];
    aligner.onEvent((e) => events.push(e));
    aligner.push(heard(TRULY));
    aligner.finalize(20);
    aligner.push(heard("for that, for your sake. I don't play accurately.", { start: 30 }));
    aligner.finalize(60);
    expect(trulyAlerts(events)).toEqual([false]);
  });
});

describe('aligner: off-script talk (pass spec §6.2)', () => {
  it('a chatter tail attached to the end of a line is a check, not a note', () => {
    const text = `${perf('L1', 'L2', 'L3')} okay hold on can we play that again from just before the entrance please | ${perf('L4', 'L5')}`;
    for (const patience of [0, 0.5]) {
      const r = runScenario(EARNEST, heard(text), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([]);
      expect(r.flags.filter((f) => f.alert), `patience ${patience}`).toEqual([]);
    }
  });

  // "Oh sorry" for "Yes, sir" waits for an anchor; L5 is finished once "as" (L6) matches; one more stray word then makes
  // "oh sorry as maybe" an off-script run, so the finished line's note becomes a check after the fact.
  it('a note on a finished line that turns out to be off-script talk is re-emitted as a check and never alerts', () => {
    const text = `${perfLong('L1', 'L2', 'L3', 'L4')} Oh sorry as ~ maybe ~ far as the piano is concerned, sentiment is my forte. I keep science for Life. ${perfLong('L7', 'L8')}`;
    const r = runScenario(LONG_SCENE, heard(text), P0);
    const l5 = r.events.flatMap((e) => (e.type === 'lineDone' && e.lineId === 'L5' ? [e.notes] : []));
    expect(l5).toEqual([
      [expect.objectContaining({ category: 'wrong-words', heard: 'oh sorry', status: 'note' })],
      [expect.objectContaining({ category: 'wrong-words', heard: 'oh sorry', status: 'check' })],
    ]);
    expect(r.flags.filter((f) => f.note.lineId === 'L5').map((f) => f.alert)).toEqual([false]);
  });

  it.each([0, 0.5])('an aside without a restart produces no notes (patience %s)', (patience) => {
    const text = `${perf('L1', 'L2', 'L3')} | hang on, what comes next, I always forget this bit | ${perf('L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.lineNotes.filter((n) => n.status === 'note')).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  // Guard (passes before and after): an actor's aside followed by a restart of the line produces no notes.
  it('an aside and restart produce no notes', () => {
    const text = `${perf('L1', 'L2')} I'm sorry for that, wait, sorry, let me go again. ${perf('L3', 'L4', 'L5')}`;
    for (const patience of [0, 0.5]) {
      const r = runScenario(EARNEST, heard(text), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([]);
    }
  });
});

describe('aligner: backward jumps (pass spec §6.3)', () => {
  const quoting = (quote: string) => `${perfLong('L1', 'L2', 'L3', 'L4', 'L5')} | Go back to ${quote} please | ${perfLong('L6', 'L7')}`;

  it.each([0, 0.5])('a director quoting a finished line does not wipe it (M1 final-review probe, patience %s)', (patience) => {
    const r = runScenario(LONG_SCENE, heard(quoting('what I was playing')), { patience });
    expect(r.lineNotes.filter((n) => n.status === 'note')).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  // A 5-word quote does confirm a jump back (trigram + 2 words). Once the run moves on, the skipped lines get their
  // earlier results back. Known residual, measured by the harness's quoting chatter: at Patience 0 the 0.4 s timeout can
  // commit the trailing "please" as an added word on the quoted line before the run moves on.
  it('a longer quote that confirms a jump back still restores the lines it skipped (patience 0.5)', () => {
    const r = runScenario(LONG_SCENE, heard(quoting('what I was playing Lane')), { patience: 0.5 });
    expect(r.lineNotes.filter((n) => n.status === 'note')).toEqual([]);
    expect(r.flags.filter((f) => f.alert)).toEqual([]);
  });

  it.each([0, 0.5])('a note held for a reset line is discarded when a second restart abandons that redo (patience %s)', (patience) => {
    const text = `${perf('L1', 'L2', 'L3', 'L4', 'L3')} Someone || ${perf('L3', 'L4', 'L5')}`;
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.events.filter((e) => e.type === 'reanchored' && e.toIdx < e.fromIdx)).toHaveLength(2);
    expect(finalNotes(r.events).get('L4')).toEqual([]);
    expect(r.flags.filter((f) => f.note.lineId === 'L4')).toEqual([]);
  });

  it.each([0, 0.5])('a line restored after a confirmed jump back keeps its genuine note (patience %s)', (patience) => {
    const l3 = "I'm sorry for that, for your garden. I don't play accurately.";
    const text = `${perfLong('L1', 'L2')} ${l3} ${perfLong('L4', 'L5')} | Go back to what I was playing Lane please | ${perfLong('L6', 'L7')}`;
    const r = runScenario(LONG_SCENE, heard(text), { patience });
    expect(r.events.filter((e) => e.type === 'reanchored' && e.toIdx < e.fromIdx)).not.toEqual([]);
    expect(finalNotes(r.events).get('L3')).toEqual([expect.objectContaining({ category: 'wrong-words', expected: 'sake', heard: 'garden', status: 'note' })]);
  });

  it('jumpTo backward then forward gives the skipped lines their earlier results back', () => {
    const expected = buildExpected(EARNEST, WP);
    const aligner = createAligner(expected, { ...DEFAULT_ALIGN_OPTIONS, patience: 0 });
    const events: AlignEvent[] = [];
    aligner.onEvent((e) => events.push(e));
    const l3 = "I'm sorry for that, for your garden. I don't play accurately.";
    aligner.push(heard(`${perf('L1', 'L2')} ${l3} ${perf('L4')}`));
    aligner.jumpTo(expected.findIndex((w) => w.lineId === 'L2'));
    aligner.jumpTo(expected.findIndex((w) => w.lineId === 'L5'));
    aligner.push(heard(perf('L5'), { start: 30 }));
    aligner.finalize(60);
    const final = finalNotes(events);
    expect(final.get('L3')).toEqual([expect.objectContaining({ category: 'wrong-words', expected: 'sake', heard: 'garden', status: 'note' })]);
    for (const id of ['L1', 'L2', 'L4', 'L5']) expect(final.get(id), id).toEqual([]);
  });

  it('a real restart two lines back still re-runs those lines', () => {
    const r = runScenario(LONG_SCENE, heard(perfLong('L1', 'L2', 'L3', 'L4', 'L2', 'L3', 'L4', 'L5', 'L6')), P0);
    expect(r.lineNotes).toEqual([]);
    expect(r.types).toContain('reanchored');
  });

  // A wrong first word followed by a pause is committed alone (by the timeout) before the redo matches any word of the
  // line; once the redo reaches the line, that note stands (pass spec §6.3).
  it.each([0, 0.5])('a real error on a line the redo reaches is kept (patience %s)', (patience) => {
    const text = `${perf('L1', 'L2', 'L3', 'L4', 'L3')} Someone || can play accurately, but I play with wonderful expression. ${perf('L5')}`;
    const r = runScenario(EARNEST, heard(text), { patience });
    expect(r.types).toContain('reanchored');
    expect(finalNotes(r.events).get('L4')).toEqual([
      expect.objectContaining({ category: 'wrong-words', expected: 'Anyone', heard: 'someone', confidence: 0.85, status: 'note' }),
    ]);
    expect(r.flags.filter((f) => f.note.lineId === 'L4').map((f) => f.alert)).toEqual([false, true]);
  });

  // Review Focus 3 (guard): the run ends right after a confirmed jump back; later lines keep their earlier results.
  it('a confirmed jump back followed by the end of the run leaves no dropped lines', () => {
    const r = runScenario(LONG_SCENE, heard(`${perfLong('L1', 'L2', 'L3', 'L4', 'L5')} | Did you hear what I was playing`), P0);
    const final = new Map<string, unknown[]>();
    for (const e of r.events) if (e.type === 'lineDone') final.set(e.lineId, e.notes);
    for (const id of ['L2', 'L3', 'L4', 'L5']) expect(final.get(id), id).toEqual([]);
  });
});

describe('aligner: instant patience at line boundaries (pass spec §6.4)', () => {
  it('a skipped line is a jumped cue at patience 0, exactly as at 0.5', () => {
    const text = perfLong('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L9', 'L10');
    for (const patience of [0, 0.5]) {
      const r = runScenario(LONG_SCENE, heard(text), { patience });
      expect(r.lineNotes.filter((n) => n.status === 'note'), `patience ${patience}`).toEqual([
        expect.objectContaining({ lineId: 'L9', category: 'jumped-cue' }),
      ]);
      expect(r.flags.filter((f) => f.alert && f.note.lineId === 'L8'), `patience ${patience}`).toEqual([]);
    }
  });

  it('a wrong word in a line’s last two words is confirmed by two words at patience 0', () => {
    const r = runScenario(EARNEST, heard(WITH_FEELING), P0);
    const flagAt = r.events.findIndex((e) => e.type === 'flag');
    const matchedAt = r.events.findIndex((e) => e.type === 'matched' && e.idx === 38);
    expect(matchedAt).toBeGreaterThanOrEqual(0);
    expect(flagAt).toBeGreaterThan(matchedAt);
  });

  it('does not rebuild the alignment when the prefix before the trailing block is itself unclean', () => {
    const r = runScenario(LONG_SCENE, heard(`${perfLong('L1', 'L2', 'L3', 'L4')} | Yes, sore. | ${perfLong('L7', 'L8', 'L9', 'L10')}`), { patience: 0.5 });
    expect(r.lineNotes.filter((n) => n.status === 'note')).toEqual([
      expect.objectContaining({ lineId: 'L5', category: 'wrong-words', expected: 'sir', heard: 'sore' }),
      expect.objectContaining({ lineId: 'L7', category: 'jumped-cue' }),
    ]);
    expect(r.flags.filter((f) => f.alert && ['L6', 'L8'].includes(f.note.lineId))).toEqual([]);
  });
});
