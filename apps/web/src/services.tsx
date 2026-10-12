import type { ImportWarning, Script, UnitHint } from '@dasma/script';
import { createContext, useContext } from 'react';
import type { Repo } from './db/repo';
import type { ImportedFrom } from './db/schema';
import type { Importer } from './import/importer';

/** A re-import or .dasma update waiting for review; kept in memory only (spec §5.5). */
export interface PendingImport {
  mode: 'file' | 'dasma';
  script: Script;
  pages: number;
  unitHints: Record<string, UnitHint>;
  importedFrom: ImportedFrom;
  warnings: ImportWarning[];
  cast?: Record<string, string[]>;
}

export interface Services {
  repo: Repo;
  importer: Importer;
  download(name: string, text: string, mime: string): void;
  requestPersist(): Promise<boolean>;
  /** Keyed by production id. */
  pending: Map<string, PendingImport>;
  saveDebounceMs: number;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices needs a ServicesContext provider.');
  return services;
}
