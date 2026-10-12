import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { RevConflictError, Repo, StorageUnavailableError } from '../../src/db/repo';
import { openDb, type DasmaDb } from '../../src/db/schema';
import { sampleScript, seedProduction, testDbName } from '../fixtures';

describe('Repo', () => {
  let clock: number;
  let repo: Repo;
  beforeEach(() => {
    clock = 1000;
    repo = new Repo(openDb(testDbName()), () => ++clock);
  });

  it('creates a production with version 1 and lists it with its check count', async () => {
    const { production, version } = await seedProduction(repo);
    expect(version).toMatchObject({ productionId: production.id, version: 1, rev: 0 });
    expect(await repo.listProductions()).toEqual([{ production, version: 1, toCheck: 3 }]);
  });

  it('lists the most recently edited production first', async () => {
    const a = await seedProduction(repo, { title: 'A' });
    await seedProduction(repo, { title: 'B' });
    await repo.updateProduction(a.production.id, { title: 'A2' });
    expect((await repo.listProductions()).map((p) => p.production.title)).toEqual(['A2', 'B']);
  });

  it('adds versions; the highest is live and older ones are kept', async () => {
    const { production } = await seedProduction(repo);
    const v2 = await repo.addVersion(production.id, { script: sampleScript(), pages: 2, unitHints: {}, importedFrom: { kind: 'pdf', names: ['e.pdf'] }, warnings: [] });
    expect(v2).toMatchObject({ version: 2, rev: 0, pages: 2 });
    expect((await repo.getLiveVersion(production.id))!.id).toBe(v2.id);
    expect((await repo.listVersions(production.id)).map((v) => v.version)).toEqual([1, 2]);
  });

  it('saves with a rev check and refuses a stale rev', async () => {
    const { version } = await seedProduction(repo);
    const edited = { ...sampleScript(), title: 'Edited' };
    expect(await repo.saveScript(version.id, edited, 0)).toBe(1);
    expect((await repo.getLiveVersion(version.productionId))!.script.title).toBe('Edited');
    await expect(repo.saveScript(version.id, sampleScript(), 0)).rejects.toBeInstanceOf(RevConflictError);
    expect((await repo.getLiveVersion(version.productionId))!).toMatchObject({ rev: 1, script: { title: 'Edited' } });
  });

  it('refuses to save a version that is no longer live', async () => {
    const { version } = await seedProduction(repo);
    await repo.addVersion(version.productionId, { script: sampleScript(), pages: 1, unitHints: {}, importedFrom: { kind: 'text', names: ['x'] }, warnings: [] });
    await expect(repo.saveScript(version.id, { ...sampleScript(), title: 'Edited' }, 0)).rejects.toBeInstanceOf(RevConflictError);
    expect((await repo.listVersions(version.productionId))[0]).toMatchObject({ rev: 0, script: { title: 'Earnest' } });
  });

  it('updates one cast entry, keeping the others, and skips an unchanged one', async () => {
    const { production } = await seedProduction(repo, { cast: { lane: ['Ann'] } });
    const first = await repo.updateCast(production.id, 'algernon', ['Bo']);
    expect(first.cast).toEqual({ lane: ['Ann'], algernon: ['Bo'] });
    const same = await repo.updateCast(production.id, 'lane', ['Ann']);
    expect(same.updatedAt).toBe(first.updatedAt);
    expect((await repo.updateCast(production.id, 'lane', [])).cast).toEqual({ algernon: ['Bo'] });
    expect((await repo.getProduction(production.id))!.cast).toEqual({ algernon: ['Bo'] });
  });

  it('deletes a production with all its versions', async () => {
    const { production } = await seedProduction(repo);
    await repo.addVersion(production.id, { script: sampleScript(), pages: 1, unitHints: {}, importedFrom: { kind: 'text', names: ['x'] }, warnings: [] });
    await repo.deleteProduction(production.id);
    expect(await repo.getProduction(production.id)).toBeUndefined();
    expect(await repo.listVersions(production.id)).toEqual([]);
  });

  it('stores meta values', async () => {
    expect(await repo.getMeta('persist')).toBeUndefined();
    await repo.setMeta('persist', 'denied');
    expect(await repo.getMeta<string>('persist')).toBe('denied');
  });

  it('reports blocked storage', async () => {
    const blocked = new Repo({ open: () => Promise.reject(new Error('blocked')) } as unknown as DasmaDb);
    await expect(blocked.open()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});
