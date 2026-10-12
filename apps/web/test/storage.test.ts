import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Repo } from '../src/db/repo';
import { openDb } from '../src/db/schema';
import { afterProductionCreated } from '../src/storage';
import { testDbName } from './fixtures';

describe('afterProductionCreated', () => {
  it('asks for persistent storage until it is granted', async () => {
    const repo = new Repo(openDb(testDbName()));
    let asked = 0;
    const answer = (granted: boolean) => async () => {
      asked++;
      return granted;
    };
    await afterProductionCreated(repo, answer(false));
    expect(await repo.getMeta('persist')).toBe('denied');
    expect(await repo.getMeta('persistBannerDismissed')).toBe(false);
    await afterProductionCreated(repo, answer(true));
    expect(await repo.getMeta('persist')).toBe('granted');
    await afterProductionCreated(repo, answer(true));
    expect(asked).toBe(2);
  });

  it('treats a failing request as refused', async () => {
    const repo = new Repo(openDb(testDbName()));
    await afterProductionCreated(repo, () => Promise.reject(new Error('no')));
    expect(await repo.getMeta('persist')).toBe('denied');
  });
});
