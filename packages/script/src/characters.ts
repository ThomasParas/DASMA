import { normalizeCueToken } from './cues';
import type { Character } from './types';
import { AMBIGUOUS_CONFIDENCE, CAST_LIST_MERGE_CONFIDENCE, EXACT_CONFIDENCE, PREFIX_MERGE_CONFIDENCE } from './weights';

export interface Cast {
  characters: Character[];
  resolve(token: string): { characterId: string; confidence: number } | null;
  ambiguous: Array<{ token: string; candidates: string[] }>;
}

export function slugId(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'character';
}

/** True when the token's words appear, in order, inside a cast-list name ("HELMER" in "TORVALD HELMER"). */
export function inCastList(token: string, castList: readonly string[]): boolean {
  const t = token.split(' ');
  return castList.some((name) => {
    const w = name.split(' ');
    for (let i = 0; i + t.length <= w.length; i++) if (t.every((x, k) => w[i + k] === x)) return true;
    return false;
  });
}

const MIN_PREFIX_LETTERS = 3;

/** A joint speaker name such as "MARCELLUS AND BARNARDO" or "HORATIO & MARCELLUS". */
const JOINT_NAME = / (AND|&) /;

/**
 * Spec §5.4: one character per distinct speaker token; a unique prefix (≥ 3 letters) merges into its longest extension.
 * Rule S2 (spec §6.5a): a joint name is never a merge target, so it stays its own character.
 */
export function buildCast(tokens: Iterable<string>, castList: readonly string[] = []): Cast {
  const names = [...new Set([...tokens].map(normalizeCueToken).filter(Boolean))].sort();
  const mergedInto = new Map<string, { target: string; confidence: number }>();
  const ambiguous: Cast['ambiguous'] = [];
  for (const a of names) {
    if (a.replace(/[^\p{L}]/gu, '').length < MIN_PREFIX_LETTERS) continue;
    const longer = names.filter((b) => b !== a && b.startsWith(a) && !JOINT_NAME.test(b));
    if (!longer.length) continue;
    const maximal = longer.filter((b) => !longer.some((c) => c !== b && c.startsWith(b)));
    if (maximal.length === 1) {
      mergedInto.set(a, {
        target: maximal[0],
        confidence: inCastList(maximal[0], castList) ? CAST_LIST_MERGE_CONFIDENCE : PREFIX_MERGE_CONFIDENCE,
      });
    } else {
      ambiguous.push({ token: a, candidates: maximal });
    }
  }
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const characters: Character[] = [];
  for (const name of names) {
    if (mergedInto.has(name)) continue;
    let id = slugId(name);
    for (let n = 2; used.has(id); n++) id = `${slugId(name)}-${n}`;
    used.add(id);
    ids.set(name, id);
    characters.push({ id, name, aliases: names.filter((a) => mergedInto.get(a)?.target === name) });
  }
  characters.sort((x, y) => x.id.localeCompare(y.id));
  const ambiguousTokens = new Set(ambiguous.map((a) => a.token));
  return {
    characters,
    ambiguous,
    resolve(token) {
      const t = normalizeCueToken(token);
      const merged = mergedInto.get(t);
      if (merged) return { characterId: ids.get(merged.target)!, confidence: merged.confidence };
      const id = ids.get(t);
      if (!id) return null;
      return { characterId: id, confidence: ambiguousTokens.has(t) ? AMBIGUOUS_CONFIDENCE : EXACT_CONFIDENCE };
    },
  };
}
