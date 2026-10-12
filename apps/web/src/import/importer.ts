import type { readDasma } from '@dasma/script';
import { fromWorkerError, type WorkerCall, type WorkerRequest, type WorkerResponse } from './protocol';
import type { ImportOutcome, ImportSource } from './run';

export type DasmaContents = ReturnType<typeof readDasma>;

export interface Importer {
  importFiles(sources: ImportSource[], title: string, onProgress?: (message: string) => void): Promise<ImportOutcome>;
  readDasma(text: string): Promise<DasmaContents>;
}

export class WorkerCrashError extends Error {
  constructor() {
    super('Import stopped unexpectedly. Try again, or paste the text.');
    this.name = 'WorkerCrashError';
  }
}

/** A worker that sends nothing for this long is treated as crashed (spec §9). */
export const STALL_MS = 60_000;

export interface WorkerLike {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  onProgress?: (message: string) => void;
  timer: ReturnType<typeof setTimeout>;
}

const createImportWorker = (): WorkerLike => new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export class WorkerImporter implements Importer {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly create: () => WorkerLike = createImportWorker,
    private readonly stallMs = STALL_MS,
  ) {}

  importFiles(sources: ImportSource[], title: string, onProgress?: (message: string) => void): Promise<ImportOutcome> {
    return this.call({ type: 'import', sources, title }, onProgress) as Promise<ImportOutcome>;
  }

  readDasma(text: string): Promise<DasmaContents> {
    return this.call({ type: 'readDasma', text }) as Promise<DasmaContents>;
  }

  private ensure(): WorkerLike {
    if (this.worker) return this.worker;
    const w = this.create();
    w.onmessage = (e) => this.receive(e.data);
    w.onerror = () => this.crash();
    this.worker = w;
    return w;
  }

  private call(call: WorkerCall, onProgress?: (message: string) => void): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress, timer: setTimeout(() => this.crash(), this.stallMs) });
      this.ensure().postMessage({ ...call, id });
    });
  }

  private receive(r: WorkerResponse): void {
    const p = this.pending.get(r.id);
    if (!p) return;
    clearTimeout(p.timer);
    if (r.type === 'progress') {
      p.onProgress?.(r.message);
      p.timer = setTimeout(() => this.crash(), this.stallMs);
      return;
    }
    this.pending.delete(r.id);
    if (r.type === 'done') p.resolve(r.result);
    else p.reject(fromWorkerError(r.error));
  }

  private crash(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new WorkerCrashError());
    }
    this.pending.clear();
  }
}
