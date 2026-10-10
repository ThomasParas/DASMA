import type { ScriptLineInput } from '@dasma/align';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCENES_DIR } from './paths';

export interface SceneLine {
  id: string;
  character: string;
  text: string;
  paraphrase?: string;
}

export interface Scene {
  id: string;
  title: string;
  source: string;
  lines: SceneLine[];
}

export function assertSceneId(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid scene id "${id}": use only letters, digits, "_" and "-"`);
}

export function loadScenes(ids: string[] | 'all'): Scene[] {
  const all = readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(SCENES_DIR, f), 'utf8')) as Scene);
  for (const s of all) assertSceneId(s.id);
  if (ids === 'all') return all;
  return ids.map((id) => {
    const scene = all.find((s) => s.id === id);
    if (!scene) throw new Error(`Unknown scene "${id}". Known: ${all.map((s) => s.id).join(', ')}`);
    return scene;
  });
}

export function toScriptLines(scene: Scene): ScriptLineInput[] {
  return scene.lines.map((l) => ({ id: l.id, characterId: l.character, text: l.text }));
}
