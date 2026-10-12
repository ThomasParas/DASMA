import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleScript, seedProduction } from '../fixtures';
import { makeServices, renderApp } from '../render';

export async function openFix(script = sampleScript(), cast?: Record<string, string[]>) {
  const services = makeServices();
  const { production } = await seedProduction(services.repo, { script, cast });
  renderApp(`#/p/${production.id}/fix`, services);
  await screen.findByRole('listbox', { name: 'Script' });
  const stored = async () => (await services.repo.getLiveVersion(production.id))!.script;
  const unitEl = (id: string) => document.getElementById(`unit-${id}`)!;
  const selectedIds = () => [...document.querySelectorAll('[aria-selected="true"]')].map((e) => e.id.replace('unit-', ''));
  return { services, production, user: userEvent.setup(), stored, unitEl, selectedIds };
}
