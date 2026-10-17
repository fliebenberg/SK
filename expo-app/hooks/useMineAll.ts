import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';

/** Whose things a page shows: the viewer's own teams, their organisation's, or everything. */
export type ViewScope = 'mine' | 'org' | 'all';
export type MineAll = 'mine' | 'all';

/** The one remembered choice (design_spec, *Mine / My organisation / All is one choice, in one place*). */
const SCOPE_KEY = 'eventsListScope';

/** Admin and Staff manage the organisation: everything is their business. */
const EVERYTHING_ROLES = ['role-org-admin', 'role-org-staff'];

/** Admin or Staff of the workspace (or a site admin): they start on All, and All means everything. */
function useEverythingFirst(orgId?: string | null) {
  const globalRole = useAuthStore((state: any) => state.user?.globalRole);
  const memberships = useAuthStore((state: any) => state.orgMemberships) || [];
  return globalRole === 'admin' || memberships.some((m: any) =>
    m.orgId === orgId && EVERYTHING_ROLES.includes(m.roleId) && (!m.endDate || new Date(m.endDate) > new Date()));
}

/**
 * Mine / My organisation / All, **one choice shared by every page that has it** — the events list,
 * the tournament page, an organisation's page in a tournament (agreed 2026-10-10, `FIX-31`; *My
 * organisation* added 2026-10-17): pick one on a page and the others follow. Remembered on this
 * device. Until someone chooses, Admin and Staff of the workspace start on All and everyone else on
 * Mine. The tournament page offers all three; read it with this.
 */
export function useViewScope(orgId?: string | null): [ViewScope, (next: ViewScope) => void] {
  const everythingFirst = useEverythingFirst(orgId);
  const saved = useSettingsStore(state => state.localOverrides[SCOPE_KEY]) as ViewScope | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  return [saved ?? (everythingFirst ? 'all' : 'mine'), next => setLocalOverride(SCOPE_KEY, next)];
}

/**
 * The same choice on a page where My organisation and All show the same thing — the events list
 * (everything there is the organisation's), an organisation's page in a tournament — so it offers
 * Mine / All. My organisation shows as All. Tapping All saves the wider view the viewer's role
 * usually wants (2026-10-17): everything for Admin and Staff, their organisation for anyone else.
 */
export function useMineAll(orgId?: string | null): [MineAll, (next: MineAll) => void] {
  const everythingFirst = useEverythingFirst(orgId);
  const [scope, setScope] = useViewScope(orgId);
  return [
    scope === 'mine' ? 'mine' : 'all',
    next => setScope(next === 'mine' ? 'mine' : everythingFirst ? 'all' : 'org'),
  ];
}
