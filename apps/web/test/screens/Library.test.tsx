import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StorageUnavailableError } from '../../src/db/repo';
import { seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

describe('Library', () => {
  it('explains how to start when there are no productions', async () => {
    renderApp('#/');
    expect(await screen.findByText(/No productions yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New production' }).getAttribute('href')).toBe('#/new');
  });

  it('lists productions with their version and check count', async () => {
    const services = makeServices();
    const { production } = await seedProduction(services.repo);
    renderApp('#/', services);
    const link = await screen.findByRole('link', { name: 'Earnest' });
    expect(link.getAttribute('href')).toBe(`#/p/${production.id}`);
    expect(screen.getByText('Version 1')).toBeTruthy();
    expect(screen.getByText('3 to check')).toBeTruthy();
  });

  it('warns when persistent storage was refused and remembers a dismissal', async () => {
    const services = makeServices();
    await services.repo.setMeta('persist', 'denied');
    const { unmount } = renderApp('#/', services);
    const user = userEvent.setup();
    expect(await screen.findByText(/may clear DASMA's data/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/may clear DASMA's data/)).toBeNull();
    expect(await services.repo.getMeta('persistBannerDismissed')).toBe(true);
    unmount();
    renderApp('#/', services);
    await screen.findByText(/No productions yet/);
    expect(screen.queryByText(/may clear DASMA's data/)).toBeNull();
  });

  it('saves the developer tools switch', async () => {
    const services = makeServices();
    renderApp('#/', services);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Show developer tools'));
    await waitFor(async () => expect(await services.repo.getMeta('devTools')).toBe(true));
  });

  it('shows a full-page message when storage is blocked', async () => {
    const services = makeServices();
    vi.spyOn(services.repo, 'open').mockRejectedValue(new StorageUnavailableError());
    renderApp('#/', services);
    expect(await screen.findByText(/blocking storage/)).toBeTruthy();
  });

  it('says when a page does not exist', async () => {
    renderApp('#/nowhere');
    expect(await screen.findByText("This page doesn't exist.")).toBeTruthy();
  });

  it('shows the best-effort notice outside Chrome and Edge', async () => {
    renderApp('#/');
    expect(await screen.findByText(/built for Chrome and Edge/)).toBeTruthy();
  });
});
