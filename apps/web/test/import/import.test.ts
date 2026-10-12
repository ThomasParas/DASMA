import { ScriptFormatError, ScriptImportError } from '@dasma/script';
import { describe, expect, it } from 'vitest';
import { WorkerCrashError, WorkerImporter } from '../../src/import/importer';
import { handleRequest, type WorkerRequest, type WorkerResponse } from '../../src/import/protocol';
import { kindOfFile, runImport } from '../../src/import/run';
import { SAMPLE_TEXT } from '../fixtures';

const text = (name: string, t = SAMPLE_TEXT) => ({ name, kind: 'text' as const, text: t });

describe('runImport', () => {
  it('imports one source with hints for every unit', async () => {
    const r = await runImport([text('scene.txt')], 'Hamlet');
    expect(r.importedFrom).toEqual({ kind: 'text', names: ['scene.txt'] });
    expect(r.script.title).toBe('Hamlet');
    for (const u of r.script.units) expect(r.unitHints[u.id]).toBeDefined();
  });

  it('appends several sources in order', async () => {
    const one = await runImport([text('a.txt')], 'T');
    const both = await runImport([text('a.txt'), text('b.txt')], 'T', () => {});
    expect(both.importedFrom.names).toEqual(['a.txt', 'b.txt']);
    expect(both.script.units).toHaveLength(one.script.units.length * 2);
    expect(new Set(both.script.units.map((u) => u.id)).size).toBe(both.script.units.length);
    expect(both.pages).toBe(one.pages * 2);
    for (const u of both.script.units) expect(both.unitHints[u.id]).toBeDefined();
    expect(both.script.characters.map((c) => c.id)).toEqual(one.script.characters.map((c) => c.id));
  });

  it('reports progress per file and refuses no sources', async () => {
    const seen: string[] = [];
    await runImport([text('a.txt'), text('b.txt')], 'T', (m) => seen.push(m));
    expect(seen).toEqual(['Reading file 1 of 2…', 'Reading file 2 of 2…']);
    await expect(runImport([], 'T')).rejects.toBeInstanceOf(ScriptImportError);
  });

  it('knows file kinds by extension', () => {
    expect([kindOfFile('a.PDF'), kindOfFile('b.docx'), kindOfFile('c.txt'), kindOfFile('d.rtf'), kindOfFile('noext')]).toEqual(['pdf', 'docx', 'text', null, null]);
  });
});

describe('handleRequest', () => {
  it('posts progress then the outcome', async () => {
    const posted: WorkerResponse[] = [];
    await handleRequest({ id: 7, type: 'import', sources: [text('a.txt')], title: 'T' }, (r) => posted.push(r));
    expect(posted.map((r) => r.type)).toEqual(['progress', 'done']);
    expect(posted.every((r) => r.id === 7)).toBe(true);
  });

  it('posts typed errors', async () => {
    const posted: WorkerResponse[] = [];
    await handleRequest({ id: 1, type: 'readDasma', text: 'not json' }, (r) => posted.push(r));
    await handleRequest({ id: 2, type: 'import', sources: [text('a.txt', '   ')], title: 'T' }, (r) => posted.push(r));
    expect(posted.filter((r) => r.type === 'error').map((r) => (r.type === 'error' ? r.error : null))).toEqual([
      { kind: 'format', reason: 'notJson' },
      { kind: 'import', code: 'empty' },
    ]);
  });
});

class FakeWorker {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private readonly silent = false) {}
  postMessage(req: WorkerRequest): void {
    if (this.silent) return;
    void handleRequest(req, (r) => this.onmessage?.({ data: r } as MessageEvent<WorkerResponse>));
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerImporter', () => {
  it('returns the worker’s outcome and forwards progress', async () => {
    const seen: string[] = [];
    const importer = new WorkerImporter(() => new FakeWorker());
    const r = await importer.importFiles([text('a.txt')], 'T', (m) => seen.push(m));
    expect(r).toEqual(await runImport([text('a.txt')], 'T'));
    expect(seen).toEqual(['Reading a.txt…']);
  });

  it('rebuilds typed errors', async () => {
    const importer = new WorkerImporter(() => new FakeWorker());
    await expect(importer.readDasma('{}')).rejects.toBeInstanceOf(ScriptFormatError);
  });

  it('treats a silent worker as crashed, terminates it, and starts a new one next time', async () => {
    const workers: FakeWorker[] = [];
    const importer = new WorkerImporter(() => {
      const w = new FakeWorker(workers.length === 0);
      workers.push(w);
      return w;
    }, 20);
    await expect(importer.importFiles([text('a.txt')], 'T')).rejects.toBeInstanceOf(WorkerCrashError);
    expect(workers[0].terminated).toBe(true);
    await expect(importer.importFiles([text('a.txt')], 'T')).resolves.toBeDefined();
    expect(workers).toHaveLength(2);
  });

  it('rejects pending calls when the worker errors', async () => {
    const box: { worker?: FakeWorker } = {};
    const importer = new WorkerImporter(() => (box.worker = new FakeWorker(true)));
    const p = importer.importFiles([text('a.txt')], 'T');
    box.worker!.onerror?.({} as ErrorEvent);
    await expect(p).rejects.toBeInstanceOf(WorkerCrashError);
  });
});
