import type { Character } from '@dasma/script';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYS_DIR } from '../paths';

export type SourceKind = 'frontMatter' | 'heading' | 'direction' | 'dialogue';

/** One unit of a source play. Dialogue text: verse lines joined by \n, inline directions as [...], emphasis as _word_. */
export interface SourceUnit {
  kind: SourceKind;
  characterId?: string;
  text: string;
  /** Dialogue only: speech the source printed without a cue, resuming the current speaker after a direction or paragraph break. */
  continues?: boolean;
}

export interface SourcePlay {
  id: string;
  title: string;
  source: string;
  cast: Character[];
  units: SourceUnit[];
}

export const PLAY_IDS = ['earnest', 'dolls-house', 'hamlet', 'romeo', 'seagull'] as const;

export function loadPlay(id: string): SourcePlay {
  if (!(PLAY_IDS as readonly string[]).includes(id)) throw new Error(`Unknown play "${id}". Known: ${PLAY_IDS.join(', ')}`);
  return JSON.parse(readFileSync(join(PLAYS_DIR, `${id}.json`), 'utf8')) as SourcePlay;
}
