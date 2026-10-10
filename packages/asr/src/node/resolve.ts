import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelSpec } from '../catalog';

export interface ResolvedAsrModel {
  id: string;
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
}

export function resolveAsrModel(modelsRoot: string, spec: ModelSpec): ResolvedAsrModel {
  const dir = join(modelsRoot, spec.dirName);
  if (!existsSync(dir)) {
    throw new Error(`Model ${spec.id} not found at ${dir}. Run: npm run harness -- fetch-models`);
  }
  const files = readdirSync(dir).sort();
  const pick = (prefix: string) =>
    files.find((f) => f.startsWith(prefix) && f.endsWith('.int8.onnx')) ??
    files.find((f) => f.startsWith(prefix) && f.endsWith('.onnx'));
  const encoder = pick('encoder');
  const decoder = pick('decoder');
  const joiner = pick('joiner');
  if (!encoder || !decoder || !joiner || !files.includes('tokens.txt')) {
    throw new Error(`Model ${spec.id} at ${dir} is missing encoder/decoder/joiner/tokens.txt`);
  }
  return {
    id: spec.id,
    encoder: join(dir, encoder),
    decoder: join(dir, decoder),
    joiner: join(dir, joiner),
    tokens: join(dir, 'tokens.txt'),
  };
}
