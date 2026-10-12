import type { DocFormat, DocSpec, Family, Variant } from './types';

export const FAMILIES: readonly Family[] = ['licensed', 'word', 'classical'];
export const FAMILY_PLAYS: Record<Family, { tune: string[]; heldout: string[] }> = {
  licensed: { tune: ['earnest', 'dolls-house'], heldout: ['seagull'] },
  word: { tune: ['earnest', 'dolls-house'], heldout: ['seagull'] },
  classical: { tune: ['hamlet'], heldout: ['romeo'] },
};
export const VARIANT_FORMAT: Record<Family, Record<Variant, DocFormat>> = {
  licensed: { '1': 'pdf', '2': 'pdf', '3': 'pdf', p: 'text' },
  word: { '1': 'docx', '2': 'docx', '3': 'docx', p: 'text' },
  classical: { '1': 'pdf', '2': 'pdf', '3': 'text', p: 'text' },
};
export const TUNE_SEEDS = [1, 2, 3];
export const HELDOUT_SEEDS = [11, 12, 13];
const TUNE_VARIANTS: Variant[] = ['1', '2', 'p'];

/** Spec §6.3. Tuning: variants 1, 2, p of the tuning plays. Held out: variant 3 of every play, and every variant of the held-out plays. */
export function corpusDocs(set: 'tune' | 'heldout', families: readonly Family[] = FAMILIES): DocSpec[] {
  const out: DocSpec[] = [];
  for (const family of families) {
    const { tune, heldout } = FAMILY_PLAYS[family];
    if (set === 'tune') {
      for (const play of tune) for (const variant of TUNE_VARIANTS) for (const seed of TUNE_SEEDS) out.push({ family, play, variant, seed });
    } else {
      for (const play of [...tune, ...heldout]) for (const seed of HELDOUT_SEEDS) out.push({ family, play, variant: '3', seed });
      for (const play of heldout) for (const variant of TUNE_VARIANTS) for (const seed of HELDOUT_SEEDS) out.push({ family, play, variant, seed });
    }
  }
  return out;
}

export function parseFamilies(raw: string): Family[] {
  const out = raw.split(',').map((f) => f.trim()).filter(Boolean);
  if (!out.length) throw new Error(`--families needs at least one family. Known: ${FAMILIES.join(', ')}`);
  for (const f of out) if (!(FAMILIES as readonly string[]).includes(f)) throw new Error(`Unknown family "${f}". Known: ${FAMILIES.join(', ')}`);
  return out as Family[];
}
