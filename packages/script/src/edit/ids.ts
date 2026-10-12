import { slugId } from '../characters';
import type { Script } from '../types';

/** The highest n among unit ids of the form `u<n>` (the importer's and carryOver's pattern). */
export function maxUnitNumber(script: Script): number {
  let n = 0;
  for (const u of script.units) n = Math.max(n, Number(/^u(\d+)$/.exec(u.id)?.[1] ?? 0));
  return n;
}

export const nextUnitId = (script: Script): string => `u${maxUnitNumber(script) + 1}`;

/** `slugId(name)`, made unique with -2, -3 … among the script's characters. */
export function uniqueCharacterId(script: Script, name: string): string {
  const base = slugId(name);
  const used = new Set(script.characters.map((c) => c.id));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}
