import type { Script } from '../types';
import { maxUnitNumber } from './ids';
import { cleanAliases } from './util';

/** Spec §5.2: `b` after `a`. b's unit ids are renumbered above a's, its pages shifted; same-id characters merge. */
export function appendScripts(a: Script, b: Script, pageOffset: number): Script {
  let n = maxUnitNumber(a);
  const tail = b.units.map((u) => ({ ...u, id: `u${++n}`, source: u.source.map((s) => ({ page: s.page + pageOffset, line: s.line })) }));
  const characters = a.characters.map((c) => {
    const other = b.characters.find((x) => x.id === c.id);
    return other ? { ...c, aliases: cleanAliases([...c.aliases, ...other.aliases], c.name) } : c;
  });
  for (const c of b.characters) if (!a.characters.some((x) => x.id === c.id)) characters.push(c);
  return { title: a.title, characters, units: [...a.units, ...tail] };
}
