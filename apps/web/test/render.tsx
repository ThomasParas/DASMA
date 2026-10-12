import { readDasma, type ImportWarning, type Script } from '@dasma/script';
import { render } from '@testing-library/react';
import { App } from '../src/App';
import { Repo } from '../src/db/repo';
import { openDb } from '../src/db/schema';
import type { Importer } from '../src/import/importer';
import { runImport, type ImportOutcome, type ImportSource } from '../src/import/run';
import type { Services } from '../src/services';
import { sampleScript, testDbName } from './fixtures';

/** The real import pipeline without a worker. */
export class InlineImporter implements Importer {
  importFiles: Importer['importFiles'] = (sources, title, onProgress) => runImport(sources, title, onProgress);
  readDasma: Importer['readDasma'] = async (text) => readDasma(text);
}

/** Returns a fixed outcome (or throws a fixed error) and records its calls. */
export class FakeImporter implements Importer {
  calls: Array<{ sources: ImportSource[]; title: string }> = [];
  constructor(private readonly result: ImportOutcome | Error) {}
  importFiles: Importer['importFiles'] = async (sources, title, onProgress) => {
    this.calls.push({ sources, title });
    onProgress?.('Reading…');
    if (this.result instanceof Error) throw this.result;
    return this.result;
  };
  readDasma: Importer['readDasma'] = async (text) => readDasma(text);
}

export function outcomeFor(script: Script = sampleScript(), names = ['earnest.txt'], warnings: ImportWarning[] = []): ImportOutcome {
  return { script, pages: 1, unitHints: {}, warnings, importedFrom: { kind: 'text', names } };
}

export type TestServices = Services & { downloads: Array<{ name: string; text: string; mime: string }>; persistCalls: number };

export function makeServices(overrides: Partial<Services> = {}): TestServices {
  const services: TestServices = {
    repo: new Repo(openDb(testDbName())),
    importer: new InlineImporter(),
    download: (name, text, mime) => {
      services.downloads.push({ name, text, mime });
    },
    requestPersist: async () => {
      services.persistCalls++;
      return true;
    },
    pending: new Map(),
    saveDebounceMs: 0,
    downloads: [],
    persistCalls: 0,
    ...overrides,
  };
  return services;
}

export function renderApp(hash: string, services: TestServices = makeServices()) {
  window.location.hash = hash;
  return { ...render(<App services={services} />), services };
}
