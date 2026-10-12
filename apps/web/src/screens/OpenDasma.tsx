import { ScriptFormatError, type FormatErrorReason } from '@dasma/script';
import { useState } from 'react';
import type { ProductionRow } from '../db/schema';
import type { DasmaContents } from '../import/importer';
import { navigate } from '../router';
import { useServices } from '../services';
import { afterProductionCreated } from '../storage';
import { Button } from '../ui/Button';
import { pagesOf } from './reimport';

export const DASMA_ERROR_TEXT: Record<FormatErrorReason, string> = {
  notJson: "This isn't a DASMA script file.",
  notDasma: "This isn't a DASMA script file.",
  newerVersion: 'This file was made by a newer version of DASMA. Update the app to open it.',
  invalid: "This DASMA file is damaged and can't be opened.",
};

type State = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'clash'; contents: DasmaContents; fileName: string; existing: ProductionRow };

/** Spec §5.6: open a .dasma file as a new production, or as an update to one with the same title. */
export function OpenDasma() {
  const services = useServices();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const createNew = async (contents: DasmaContents, fileName: string) => {
    const { production } = await services.repo.createProduction({
      title: contents.script.title,
      origin: 'dasma',
      cast: contents.cast ?? {},
      version: { script: contents.script, pages: pagesOf(contents.script), unitHints: {}, importedFrom: { kind: 'dasma', names: [fileName] }, warnings: [] },
    });
    await afterProductionCreated(services.repo, services.requestPersist);
    navigate({ name: 'production', id: production.id });
  };

  const update = (contents: DasmaContents, fileName: string, existing: ProductionRow) => {
    services.pending.set(existing.id, {
      mode: 'dasma',
      script: contents.script,
      pages: pagesOf(contents.script),
      unitHints: {},
      importedFrom: { kind: 'dasma', names: [fileName] },
      warnings: [],
      ...(contents.cast ? { cast: contents.cast } : {}),
    });
    navigate({ name: 'reimport', id: existing.id });
  };

  const onFile = async (file: File) => {
    setState({ kind: 'idle' });
    let contents: DasmaContents;
    try {
      contents = await services.importer.readDasma(await file.text());
    } catch (err) {
      setState({ kind: 'error', message: err instanceof ScriptFormatError ? DASMA_ERROR_TEXT[err.reason] : err instanceof Error ? err.message : String(err) });
      return;
    }
    const title = contents.script.title.trim().toLowerCase();
    const existing = (await services.repo.listProductions()).find((s) => s.production.title.trim().toLowerCase() === title)?.production;
    if (existing) setState({ kind: 'clash', contents, fileName: file.name, existing });
    else await createNew(contents, file.name);
  };

  return (
    <>
      <label className="btn">
        Open .dasma file
        <input
          type="file"
          accept=".dasma"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onFile(file);
          }}
        />
      </label>
      {state.kind === 'error' && (
        <p role="alert" className="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'clash' && (
        <div className="banner" role="dialog" aria-label="Production already exists">
          <p>A production called "{state.existing.title}" already exists.</p>
          <Button variant="primary" onClick={() => update(state.contents, state.fileName, state.existing)}>
            Update "{state.existing.title}"
          </Button>{' '}
          <Button onClick={() => void createNew(state.contents, state.fileName)}>Import as a new production</Button>{' '}
          <Button onClick={() => setState({ kind: 'idle' })}>Cancel</Button>
        </div>
      )}
    </>
  );
}
