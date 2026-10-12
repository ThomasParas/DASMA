// The import worker: pdf.js, docx parsing and tagging run here, off the main thread (spec §3.2).
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { handleRequest, type WorkerRequest, type WorkerResponse } from './protocol';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};
scope.onmessage = (e) => {
  void handleRequest(e.data, (r) => scope.postMessage(r));
};
