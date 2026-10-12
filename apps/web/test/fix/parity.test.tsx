import { cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openFix } from './open-fix';

type Fix = Awaited<ReturnType<typeof openFix>>;
interface Case {
  id: string;
  keys: string;
  button: RegExp;
  scope?: string;
  prepare(f: Fix): Promise<void>;
}

const click = (id: string) => async (f: Fix) => f.user.click(f.unitEl(id));
const words = (id: string, from: number, to: number) => async (f: Fix) => {
  await f.user.click(f.unitEl(id));
  await f.user.click(f.unitEl(id).querySelector(`[data-word="${from}"]`)!);
  if (to !== from) {
    await f.user.keyboard('{Shift>}');
    await f.user.click(f.unitEl(id).querySelector(`[data-word="${to}"]`)!);
    await f.user.keyboard('{/Shift}');
  }
};
const none = async () => {};

const CASES: Case[] = [
  { id: 'next', keys: 'j', button: /^Next to check/, prepare: none },
  { id: 'prev', keys: 'k', button: /^Previous to check/, prepare: none },
  { id: 'down', keys: '{ArrowDown}', button: /^Next unit/, prepare: click('u4') },
  { id: 'up', keys: '{ArrowUp}', button: /^Previous unit/, prepare: click('u4') },
  { id: 'confirm', keys: '{Enter}', button: /^It's right/, prepare: click('u1') },
  { id: 'speechBy', keys: 's', button: /^Speech by/, prepare: click('u2') },
  { id: 'setName', keys: 'n', button: /^Character name/, prepare: click('u2') },
  { id: 'direction', keys: 'd', button: /^Direction/, prepare: click('u1') },
  { id: 'heading', keys: 'h', button: /^Heading/, prepare: click('u2') },
  { id: 'frontMatter', keys: 'f', button: /^Front matter/, prepare: click('u1') },
  { id: 'editText', keys: 'e', button: /^Edit text/, prepare: click('u4') },
  { id: 'split', keys: '/', button: /^Split here/, prepare: words('u4', 3, 3) },
  { id: 'join', keys: 'J', button: /^Join to previous/, prepare: click('u8') },
  { id: 'cut', keys: 'x', button: /^Cut/, prepare: click('u4') },
  { id: 'cutWords', keys: 'x', button: /^Cut words/, prepare: words('u4', 1, 2) },
  { id: 'overlap', keys: 'o', button: /^Overlap/, prepare: words('u4', 1, 2) },
  { id: 'sceneBreak', keys: 'b', button: /^Scene break before/, prepare: click('u5') },
  { id: 'remove', keys: '{Delete}', button: /^Remove/, prepare: click('u2') },
  {
    id: 'undo',
    keys: '{Meta>}z{/Meta}',
    button: /^Undo/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u1'));
      await f.user.keyboard('f');
    },
  },
  {
    id: 'redo',
    keys: '{Meta>}{Shift>}z{/Shift}{/Meta}',
    button: /^Redo/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u1'));
      await f.user.keyboard('f{Meta>}z{/Meta}');
    },
  },
  { id: 'help', keys: '?', button: /^Shortcuts/, prepare: none },
  { id: 'closeHelp', keys: '{Escape}', button: /^Close/, prepare: async (f) => f.user.keyboard('?') },
  {
    id: 'pickNearby',
    keys: '1',
    button: /^LANE/,
    scope: 'Speech by',
    prepare: async (f) => {
      await f.user.click(f.unitEl('u7'));
      await f.user.keyboard('s');
    },
  },
  {
    id: 'saveText',
    keys: '{Meta>}{Enter}{/Meta}',
    button: /^Save/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u4'));
      await f.user.keyboard('e');
      await f.user.type(screen.getByLabelText('Unit text'), ' Yes.');
    },
  },
  {
    id: 'cancelText',
    keys: '{Escape}',
    button: /^Cancel/,
    prepare: async (f) => {
      await f.user.click(f.unitEl('u4'));
      await f.user.keyboard('e');
    },
  },
];

/** What a person can see: the script (kinds, text, cuts, overlap, selection) and which panel is open. */
function snapshot(): string {
  const script = document.querySelector('.script')!.innerHTML;
  const panels = ['Keyboard shortcuts', 'Speech by', 'Character name', 'Unit text'].filter((n) => screen.queryByRole('dialog', { name: n }) || screen.queryByRole('region', { name: n }) || screen.queryByLabelText(n));
  return `${script}|${panels.join(',')}`;
}

async function run(c: Case, how: 'key' | 'button'): Promise<{ before: string; after: string }> {
  const f = await openFix();
  await c.prepare(f);
  const before = snapshot();
  if (how === 'key') await f.user.keyboard(c.keys);
  else await f.user.click((c.scope ? within(screen.getByRole('region', { name: c.scope })) : screen).getByRole('button', { name: c.button }));
  const after = snapshot();
  cleanup();
  return { before, after };
}

describe('every shortcut matches its button', () => {
  for (const c of CASES) {
    it(c.id, async () => {
      const key = await run(c, 'key');
      const button = await run(c, 'button');
      expect(key.after).not.toBe(key.before);
      expect(key.after).toBe(button.after);
    });
  }
});
