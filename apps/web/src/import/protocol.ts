import { readDasma, ScriptFormatError, ScriptImportError, type FormatErrorReason, type ImportErrorCode } from '@dasma/script';
import { runImport, type ImportSource } from './run';

export type WorkerCall = { type: 'import'; sources: ImportSource[]; title: string } | { type: 'readDasma'; text: string };
export type WorkerRequest = WorkerCall & { id: number };

export type WorkerError =
  | { kind: 'import'; code: ImportErrorCode }
  | { kind: 'format'; reason: FormatErrorReason; path?: string }
  | { kind: 'other'; message: string };

export type WorkerResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; error: WorkerError };

export function toWorkerError(err: unknown): WorkerError {
  if (err instanceof ScriptImportError) return { kind: 'import', code: err.code };
  if (err instanceof ScriptFormatError) return { kind: 'format', reason: err.reason, ...(err.path ? { path: err.path } : {}) };
  return { kind: 'other', message: err instanceof Error ? err.message : String(err) };
}

export function fromWorkerError(e: WorkerError): Error {
  if (e.kind === 'import') return new ScriptImportError(e.code);
  if (e.kind === 'format') return new ScriptFormatError(e.reason, e.path);
  return new Error(e.message);
}

export async function handleRequest(req: WorkerRequest, post: (r: WorkerResponse) => void): Promise<void> {
  try {
    const result =
      req.type === 'import' ? await runImport(req.sources, req.title, (message) => post({ id: req.id, type: 'progress', message })) : readDasma(req.text);
    post({ id: req.id, type: 'done', result });
  } catch (err) {
    post({ id: req.id, type: 'error', error: toWorkerError(err) });
  }
}
