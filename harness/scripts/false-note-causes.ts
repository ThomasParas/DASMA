/**
 * Attribute every false note (status `note` on a line with no planted error) to its likely cause:
 * director chatter, a neighbouring planted error, a stumble/long-pause line, or the recognizer alone.
 *
 *   npx tsx harness/scripts/false-note-causes.ts harness/out/m1-default/runs.json [-v]
 */
import { isBenign } from '../src/perturb';
import { describeNote, errorLines, readRuns, scenesById } from './lib';

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const runs = readRuns(args.find((a) => !a.startsWith('-')));
const scenes = scenesById();
const byRoom = new Map<string, { total: number; causes: Map<string, string[]> }>();
for (const r of runs) {
  const ids = scenes.get(r.sceneId)!.lines.map((l) => l.id);
  const errs = errorLines(r);
  const kindOf = new Map(r.labels.map((l) => [l.lineId, l.kind]));
  const room = byRoom.get(r.condition) ?? { total: 0, causes: new Map<string, string[]>() };
  byRoom.set(r.condition, room);
  for (const n of r.notes) {
    if (n.status !== 'note' || errs.has(n.lineId)) continue;
    room.total++;
    const i = ids.indexOf(n.lineId);
    const next = ids[i + 1];
    const prev = ids[i - 1];
    const nextKind = next ? kindOf.get(next) : undefined;
    const prevKind = prev ? kindOf.get(prev) : undefined;
    const own = kindOf.get(n.lineId);
    let cause: string;
    if (nextKind === 'chatter' || own === 'chatter') cause = 'chatter';
    else if (own) cause = `on ${own} line`;
    else if ((next && errs.has(next)) || (prev && errs.has(prev))) {
      cause = `adjacent to ${nextKind && !isBenign(nextKind) ? nextKind : prevKind}`;
    } else cause = 'recognizer only (clean neighbourhood)';
    const key = `${cause} / ${n.category}`;
    const list = room.causes.get(key) ?? [];
    room.causes.set(key, list);
    list.push(`${r.sceneId}#${r.seed} ${n.lineId} ${describeNote(n)}`);
  }
}
for (const [room, { total, causes }] of byRoom) {
  console.log(`\n## ${room}: ${total} false notes`);
  const buckets = new Map<string, number>();
  for (const [key, list] of causes) {
    const b = key.startsWith('adjacent')
      ? 'next to a planted error'
      : key.startsWith('on aside')
        ? 'on aside line'
        : key.startsWith('on ')
          ? 'on stumble/long-pause line'
          : key.split(' / ')[0]!;
    buckets.set(b, (buckets.get(b) ?? 0) + list.length);
  }
  console.log('  buckets:', JSON.stringify(Object.fromEntries(buckets)));
  for (const [key, list] of [...causes].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${list.length}  ${key}`);
    for (const x of list.slice(0, verbose ? Infinity : 3)) console.log(`      ${x}`);
  }
}
