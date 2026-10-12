import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Repo } from './db/repo';
import { openDb } from './db/schema';
import { downloadText } from './download';
import { WorkerImporter } from './import/importer';
import type { Services } from './services';

const services: Services = {
  repo: new Repo(openDb()),
  importer: new WorkerImporter(),
  download: downloadText,
  requestPersist: () => navigator.storage?.persist?.() ?? Promise.resolve(false),
  pending: new Map(),
  saveDebounceMs: 500,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
