import { normalizeToken, tokenize } from '@dasma/align';
import { describe, expect, it } from 'vitest';
import { perturbScene, SOLO_BENIGN_KINDS, SOLO_ERROR_KINDS, SOUND_ALIKES, isBenign, type Performance } from '../src/perturb';
import { mulberry32 } from '../src/rng';
import { loadScenes, type Scene } from '../src/scenes';

const SCENE: Scene = {
  id: 't',
  title: 'T',
  source: 'test',
  lines: [
    { id: 'A1', character: 'ANN', text: 'The garden looks wonderful in the morning light today.', paraphrase: 'This morning the garden is looking lovely in the sun.' },
    { id: 'B1', character: 'BEN', text: 'I planted every single flower there myself, you know.' },
    { id: 'A2', character: 'ANN', text: 'Then you deserve a medal for patience and skill.' },
    { id: 'B2', character: 'BEN', text: 'Thank you kindly.' },
  ],
};
const run = (opts: Parameters<typeof perturbScene>[2], seed = 7): Performance => perturbScene(SCENE, mulberry32(seed), opts);

describe('perturbScene', () => {
  it('with no errors, performs the scene verbatim', () => {
    const p = run({ errorRate: 0, benignRate: 0 });
    expect(p.labels).toEqual([]);
    expect(p.segments.map((s) => s.text)).toEqual(SCENE.lines.map((l) => l.text));
    expect(p.segments.map((s) => s.speaker)).toEqual(['ANN', 'BEN', 'ANN', 'BEN']);
  });

  it('wrong-words changes exactly one word and labels it', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['wrong-words'] });
    expect(p.labels).toHaveLength(4);
    for (const label of p.labels) {
      const original = tokenize(SCENE.lines.find((l) => l.id === label.lineId)!.text);
      const spoken = tokenize(p.segments[label.segmentIndex]!.text);
      const diffs = original.map((w, i) => (w !== spoken[i] ? i : -1)).filter((i) => i >= 0);
      expect(diffs).toEqual([label.wordIndex]);
    }
  });

  it('dropped-line skips the line and points at the next spoken segment', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['dropped-line'] });
    // The line after a dropped line is always performed clean (controller ruling), so B1 is spoken.
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1', 'A2']);
    expect(p.segments.map((s) => s.lineId)).toEqual(['B1', 'B2']);
    expect(p.labels.map((l) => l.segmentIndex)).toEqual([0, 1]);
    expect(p.segments[0]!.pauseBefore).toBeGreaterThanOrEqual(2.5);
    expect(p.segments[0]!.pauseBefore).toBeLessThanOrEqual(3.5);
  });

  it('jumped-cue labels the next (different-character) line, performed cleanly after a short gap', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['jumped-cue'] });
    expect(p.labels.map((l) => [l.kind, l.lineId, l.characterId])).toEqual([
      ['jumped-cue', 'B1', 'BEN'],
      ['jumped-cue', 'B2', 'BEN'],
    ]);
    expect(p.segments.map((s) => s.text)).toEqual([SCENE.lines[1]!.text, SCENE.lines[3]!.text]);
    expect(p.segments[0]!.pauseBefore).toBeCloseTo(0.2);
  });

  it('called-for-line inserts a "Line!" segment and labels it', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['called-for-line'] });
    expect(p.labels).toHaveLength(3); // B2 has only 3 words
    for (const label of p.labels) expect(p.segments[label.segmentIndex]!.text).toBe('Line!');
  });

  it('paraphrase uses the scene text', () => {
    const p = run({ errorRate: 1, benignRate: 0, errorKinds: ['paraphrase'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1']);
    expect(p.segments[0]!.text).toBe(SCENE.lines[0]!.paraphrase);
  });

  it('chatter is spoken by the director before the line', () => {
    const p = run({ errorRate: 0, benignRate: 1, benignKinds: ['chatter'] });
    expect(p.segments.filter((s) => s.speaker === 'DIRECTOR')).toHaveLength(4);
    expect(p.labels.every((l) => l.kind === 'chatter')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const opts = { errorRate: 0.5, benignRate: 0.3 };
    expect(run(opts, 99)).toEqual(run(opts, 99));
  });

  it('keeps every label anchored to a real, correctly timed moment across bundled scenes and seeds', () => {
    const norm = (text: string) => tokenize(text).flatMap(normalizeToken);
    for (const scene of loadScenes('all')) {
      const original = new Map(scene.lines.map((l) => [l.id, l.text]));
      for (let seed = 1; seed <= 200; seed++) {
        const where = `scene ${scene.id}, seed ${seed}`;
        const p = perturbScene(scene, mulberry32(seed), { errorRate: 0.4, benignRate: 0.3 });
        for (const label of p.labels) {
          const seg = p.segments[label.segmentIndex];
          expect(seg, `${where}: ${label.kind} on ${label.lineId} points past the performance`).toBeDefined();
          expect(seg!.speaker, `${where}: ${label.kind} on ${label.lineId} points at the director`).not.toBe('DIRECTOR');
          if (label.kind === 'dropped-line') {
            expect(seg!.pauseBefore, `${where}: dropped-line gap`).toBeGreaterThanOrEqual(2.5);
            expect(seg!.pauseBefore, `${where}: dropped-line gap`).toBeLessThanOrEqual(3.5);
          }
          if (label.kind === 'transposed') {
            expect(norm(seg!.text), `${where}: transposed ${label.lineId} is a no-op`).not.toEqual(norm(original.get(label.lineId)!));
          }
        }
      }
      for (const character of [...new Set(scene.lines.map((l) => l.character))]) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = perturbScene(scene, mulberry32(seed), {
            errorRate: 0.4, benignRate: 0.3, solo: character, errorKinds: SOLO_ERROR_KINDS, benignKinds: SOLO_BENIGN_KINDS,
          });
          for (const label of p.labels) {
            const seg = p.segments[label.segmentIndex];
            expect(seg, `solo ${character} ${scene.id} #${seed}: ${label.kind} points past the end`).toBeDefined();
            expect(seg!.silent, `solo ${character} ${scene.id} #${seed}: ${label.kind} points at a cue`).toBeUndefined();
            expect(label.characterId).toBe(character);
          }
        }
      }
    }
  });
});

describe('perturbScene: solo', () => {
  it("the other characters' lines become silent cues; only the soloist's lines are spoken or labelled", () => {
    const p = run({ errorRate: 0.6, benignRate: 0.3, solo: 'ANN', errorKinds: SOLO_ERROR_KINDS, benignKinds: SOLO_BENIGN_KINDS }, 3);
    for (const seg of p.segments) {
      if (seg.speaker === 'BEN') {
        expect(seg.silent).toBe(true);
        expect(seg.lineId).toBeUndefined();
      } else {
        expect(seg.silent).toBeUndefined();
      }
    }
    expect(p.segments.filter((s) => s.silent).map((s) => s.text)).toEqual([SCENE.lines[1]!.text, SCENE.lines[3]!.text]);
    for (const label of p.labels) {
      expect(label.characterId).toBe('ANN');
      expect(p.segments[label.segmentIndex]!.silent).toBeUndefined();
    }
  });

  it('a dropped line in solo points at the soloist’s next spoken line, past the cue', () => {
    const p = run({ errorRate: 1, benignRate: 0, solo: 'ANN', errorKinds: ['dropped-line'] });
    expect(p.labels.map((l) => l.lineId)).toEqual(['A1']);
    const seg = p.segments[p.labels[0]!.segmentIndex]!;
    expect(seg.lineId).toBe('A2');
    expect(seg.silent).toBeUndefined();
  });

  it('an aside is benign, interrupts the line, and is followed by the rest of the line or a restart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = run({ errorRate: 0, benignRate: 1, solo: 'ANN', benignKinds: ['aside'] }, seed);
      const asides = p.labels.filter((l) => l.kind === 'aside');
      expect(asides.length).toBeGreaterThan(0);
      for (const label of asides) {
        expect(isBenign(label.kind)).toBe(true);
        const after = p.segments[label.segmentIndex + 1]!;
        expect(after.lineId).toBe(label.lineId);
        const lineWords = tokenize(SCENE.lines.find((l) => l.id === label.lineId)!.text);
        const fragment = tokenize(p.segments[label.segmentIndex - 1]!.text);
        expect(fragment).toEqual(lineWords.slice(0, fragment.length));
        const rest = tokenize(after.text).join(' ');
        expect([lineWords.join(' '), lineWords.slice(fragment.length).join(' ')]).toContain(rest);
      }
    }
  });
});

describe('perturbScene: sound-alikes and quoting chatter', () => {
  it('sound-alike substitutions come from the list, change one word, and are flagged', () => {
    const alike = new Map(SOUND_ALIKES.flatMap(([a, b]) => [[a, b], [b, a]] as Array<[string, string]>));
    let seen = 0;
    for (const scene of loadScenes('all')) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = perturbScene(scene, mulberry32(seed), { errorRate: 1, benignRate: 0, errorKinds: ['wrong-words'] });
        for (const label of p.labels.filter((l) => l.soundAlike)) {
          seen++;
          const original = tokenize(scene.lines.find((l) => l.id === label.lineId)!.text);
          const spoken = tokenize(p.segments[label.segmentIndex]!.text);
          const core = (w: string) => w.replace(/[^A-Za-z']/g, '').toLowerCase();
          expect(alike.get(core(original[label.wordIndex]!))).toBe(core(spoken[label.wordIndex]!));
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('the sound-alike list holds distinct, non-identical spellings, and no true homophones', () => {
    const homophones = [
      ['father', 'farther'], ['arms', 'alms'], ['piece', 'peace'], ['there', 'their'], ['night', 'knight'], ['sea', 'see'],
      ['counsel', 'council'], ['pale', 'pail'], ['hue', 'hew'], ['great', 'grate'], ['week', 'weak'], ['write', 'right'],
    ];
    const banned = new Set(homophones.flatMap(([a, b]) => [`${a}/${b}`, `${b}/${a}`]));
    for (const [a, b] of SOUND_ALIKES) {
      expect(a).not.toBe(b);
      expect(a).toBe(a.toLowerCase());
      expect(b).toBe(b.toLowerCase());
      expect(banned.has(`${a}/${b}`), `${a}/${b} is a true homophone pair`).toBe(false);
    }
  });

  it('some director chatter quotes the opening words of an earlier line', () => {
    const scene = loadScenes(['earnest-act1'])[0]!;
    const quotes: string[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const p = perturbScene(scene, mulberry32(seed), { errorRate: 0, benignRate: 1, benignKinds: ['chatter'] });
      quotes.push(...p.segments.filter((s) => s.speaker === 'DIRECTOR' && s.text.startsWith('Go back to')).map((s) => s.text));
    }
    expect(quotes.length).toBeGreaterThan(5);
    const openings = scene.lines.map((l) => tokenize(l.text).slice(0, 4).join(' ').replace(/[^A-Za-z']+$/, ''));
    for (const q of quotes) expect(openings.some((o) => q.includes(o))).toBe(true);
  });
});
