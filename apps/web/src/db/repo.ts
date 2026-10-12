import { checkQueue, type Script } from '@dasma/script';
import Dexie from 'dexie';
import type { DasmaDb, ProductionRow, ScriptVersionRow } from './schema';

export class RevConflictError extends Error {
  constructor() {
    super('This script was changed in another tab. Reload to continue.');
    this.name = 'RevConflictError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("This browser is blocking storage, so DASMA can't keep your scripts. Use a normal Chrome or Edge window.", options);
    this.name = 'StorageUnavailableError';
  }
}

export type NewVersion = Pick<ScriptVersionRow, 'script' | 'pages' | 'unitHints' | 'importedFrom' | 'warnings'>;

export interface ProductionSummary {
  production: ProductionRow;
  version: number;
  toCheck: number;
}

/** Spec §4. Screens use this, never Dexie directly. */
export class Repo {
  constructor(
    private readonly db: DasmaDb,
    private readonly now: () => number = Date.now,
  ) {}

  async open(): Promise<void> {
    try {
      await this.db.open();
    } catch (err) {
      throw new StorageUnavailableError({ cause: err });
    }
  }

  async listProductions(): Promise<ProductionSummary[]> {
    const productions = await this.db.productions.orderBy('updatedAt').reverse().toArray();
    return Promise.all(
      productions.map(async (production) => {
        const live = await this.getLiveVersion(production.id);
        return { production, version: live?.version ?? 0, toCheck: live ? checkQueue(live.script).length : 0 };
      }),
    );
  }

  getProduction(id: string): Promise<ProductionRow | undefined> {
    return this.db.productions.get(id);
  }

  async createProduction(input: {
    title: string;
    origin: ProductionRow['origin'];
    cast?: Record<string, string[]>;
    version: NewVersion;
  }): Promise<{ production: ProductionRow; version: ScriptVersionRow }> {
    const t = this.now();
    const production: ProductionRow = { id: crypto.randomUUID(), title: input.title, cast: input.cast ?? {}, origin: input.origin, createdAt: t, updatedAt: t };
    const version: ScriptVersionRow = { id: crypto.randomUUID(), productionId: production.id, version: 1, ...input.version, rev: 0, createdAt: t };
    await this.db.transaction('rw', this.db.productions, this.db.scripts, async () => {
      await this.db.productions.add(production);
      await this.db.scripts.add(version);
    });
    return { production, version };
  }

  async updateProduction(id: string, patch: Partial<Pick<ProductionRow, 'title' | 'cast'>>): Promise<ProductionRow> {
    const current = await this.db.productions.get(id);
    if (!current) throw new Error(`There is no production ${id}.`);
    const next = { ...current, ...patch, updatedAt: this.now() };
    await this.db.productions.put(next);
    return next;
  }

  async deleteProduction(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.productions, this.db.scripts, async () => {
      await this.db.scripts.where('productionId').equals(id).delete();
      await this.db.productions.delete(id);
    });
  }

  getLiveVersion(productionId: string): Promise<ScriptVersionRow | undefined> {
    return this.db.scripts.where('[productionId+version]').between([productionId, Dexie.minKey], [productionId, Dexie.maxKey]).last();
  }

  listVersions(productionId: string): Promise<ScriptVersionRow[]> {
    return this.db.scripts.where('productionId').equals(productionId).sortBy('version');
  }

  /** Writes only if the stored rev is `expectedRev`; returns the new rev. */
  async saveScript(versionId: string, script: Script, expectedRev: number): Promise<number> {
    return this.db.transaction('rw', this.db.scripts, this.db.productions, async () => {
      const row = await this.db.scripts.get(versionId);
      if (!row || row.rev !== expectedRev) throw new RevConflictError();
      const rev = expectedRev + 1;
      await this.db.scripts.update(versionId, { script, rev });
      await this.db.productions.update(row.productionId, { updatedAt: this.now() });
      return rev;
    });
  }

  async addVersion(productionId: string, v: NewVersion): Promise<ScriptVersionRow> {
    return this.db.transaction('rw', this.db.scripts, this.db.productions, async () => {
      const live = await this.getLiveVersion(productionId);
      const t = this.now();
      const row: ScriptVersionRow = { id: crypto.randomUUID(), productionId, version: (live?.version ?? 0) + 1, ...v, rev: 0, createdAt: t };
      await this.db.scripts.add(row);
      await this.db.productions.update(productionId, { updatedAt: t });
      return row;
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }
}
