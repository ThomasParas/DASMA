import type { ImportWarning, Script, UnitHint } from '@dasma/script';
import Dexie, { type EntityTable } from 'dexie';

export type ImportedFrom = { kind: 'pdf' | 'docx' | 'text' | 'dasma'; names: string[] };

export interface ProductionRow {
  id: string;
  title: string;
  /** characterId → actor names (the .dasma shape). */
  cast: Record<string, string[]>;
  origin: 'created' | 'dasma';
  createdAt: number;
  updatedAt: number;
}

export interface ScriptVersionRow {
  id: string;
  productionId: string;
  /** 1, 2, 3 …; the highest is live. */
  version: number;
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  importedFrom: ImportedFrom;
  warnings: ImportWarning[];
  /** Save counter for the two-tab check. */
  rev: number;
  createdAt: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export type DasmaDb = Dexie & {
  productions: EntityTable<ProductionRow, 'id'>;
  scripts: EntityTable<ScriptVersionRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

export function openDb(name = 'dasma'): DasmaDb {
  const db = new Dexie(name) as DasmaDb;
  db.version(1).stores({
    productions: 'id, updatedAt',
    scripts: 'id, productionId, [productionId+version]',
    meta: 'key',
  });
  return db;
}
