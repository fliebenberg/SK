import { useSettingsStore } from '../store/settingsStore';

export type MineAll = 'mine' | 'all';

/** The one remembered choice (design_spec, *Mine / All is one choice, in one place*). */
const MINE_ALL_KEY = 'eventsListScope';

/**
 * Mine / All, **one choice shared by every page that has it** — the events list, the tournament page,
 * an organisation's page in a tournament (agreed 2026-10-10, `FIX-31`): switch to All on one and the
 * others are on All too, so "Mine" means the same everywhere. Remembered on this device. Until someone
 * chooses, `everythingFirst` (Admin and Staff) start on All and everyone else on Mine.
 */
export function useMineAll(everythingFirst: boolean): [MineAll, (next: MineAll) => void] {
  const saved = useSettingsStore(state => state.localOverrides[MINE_ALL_KEY]) as MineAll | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  return [saved ?? (everythingFirst ? 'all' : 'mine'), next => setLocalOverride(MINE_ALL_KEY, next)];
}
