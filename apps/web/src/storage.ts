import type { Repo } from './db/repo';

/** Spec §9: ask for persistent storage when a production is created, until the browser grants it. */
export async function afterProductionCreated(repo: Repo, requestPersist: () => Promise<boolean>): Promise<void> {
  if ((await repo.getMeta<string>('persist')) === 'granted') return;
  let granted: boolean;
  try {
    granted = await requestPersist();
  } catch {
    granted = false;
  }
  await repo.setMeta('persist', granted ? 'granted' : 'denied');
  if (!granted) await repo.setMeta('persistBannerDismissed', false);
}
