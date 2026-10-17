import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { GameSummary, TournamentEntrant } from '@sk/shared';
import { SegmentedControl } from '../SegmentedControl';
import { useAuthStore } from '../../store/authStore';
import { useViewScope, ViewScope } from '../../hooks/useMineAll';

/**
 * Mine / My organisation / All inside a tournament (`FIX-31`; My organisation 2026-10-17) — the
 * events list's one remembered choice (`useViewScope`), worked out over the entrants a page shows:
 * the tournament's on its page, a division's on the division page. Mine is the viewer's teams, My
 * organisation their organisation's. Only the choices that show something different are offered —
 * none to an organiser — and a saved one not offered here falls to the next one that is.
 */
export function useTournamentScope({ orgId, canEdit, entrants, orgName }: {
  /** The acting workspace: its role sets the first choice. */
  orgId?: string;
  canEdit: boolean;
  entrants: TournamentEntrant[];
  orgName: (orgId?: string) => string | undefined;
}) {
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships) || [];
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships) || [];
  const myTeamIds = useMemo(() => new Set<string>(teamMemberships.map((m: any) => m.teamId)), [teamMemberships]);
  const myOrgIds = useMemo(() => new Set<string>(orgMemberships.map((m: any) => m.orgId)), [orgMemberships]);
  const myEntrants = useMemo(() => entrants.filter(e => !!e.teamId && myTeamIds.has(e.teamId)), [entrants, myTeamIds]);
  const orgEntrants = useMemo(() => entrants.filter(e => !!e.orgId && myOrgIds.has(e.orgId)), [entrants, myOrgIds]);

  const offersMine = !canEdit && myEntrants.length > 0;
  // Different from Mine and from All: the organisation has teams that are not the viewer's, and not every team is its.
  const offersOrg = !canEdit && orgEntrants.length > myEntrants.length && orgEntrants.length < entrants.length;
  const [saved, setScope] = useViewScope(orgId);
  const scope: ViewScope = canEdit ? 'all'
    : saved === 'mine' ? (offersMine ? 'mine' : offersOrg ? 'org' : 'all')
    : saved === 'org' ? (offersOrg ? 'org' : offersMine ? 'mine' : 'all')
    : 'all';

  /** The entrants the page narrows to, or null for the whole of it. */
  const narrowTo = scope === 'mine' ? myEntrants : scope === 'org' ? orgEntrants : null;
  const keepsGame = useMemo(() => {
    if (!narrowTo) return () => true;
    const ids = new Set(narrowTo.map(e => e.id));
    const teamIds = scope === 'mine' ? myTeamIds : new Set(narrowTo.map(e => e.teamId).filter(Boolean) as string[]);
    return (g: GameSummary) => (g.participants || []).some(p => (!!p.entrantId && ids.has(p.entrantId)) || (!!p.teamId && teamIds.has(p.teamId)));
  }, [narrowTo, scope, myTeamIds]);

  const options = [
    ...(offersMine ? [{ key: 'mine' as const, label: 'Mine' }] : []),
    ...(offersOrg ? [{ key: 'org' as const, label: 'My organisation' }] : []),
    { key: 'all' as const, label: 'All' },
  ];
  const names = (list: (string | undefined)[]) => [...new Set(list.filter(Boolean))].join(', ');
  const label = scope === 'mine' ? `Showing ${names(myEntrants.map(e => e.name))}`
    : scope === 'org' ? `Showing ${names(orgEntrants.map(e => orgName(e.orgId))) || 'your organisation'}'s teams`
    : 'Showing everything';

  return { scope, setScope, options, label, narrowTo, keepsGame, offered: options.length > 1 };
}

/** The switch and what it covers, on the line above the content it narrows (design_spec). */
export function TournamentScopeLine({ scope, setScope, options, label, offered, isWide, allLabel }: ReturnType<typeof useTournamentScope> & {
  isWide: boolean;
  /** What All shows here: "the whole tournament", "the whole division". */
  allLabel: string;
}) {
  if (!offered) return null;
  return (
    <View className={isWide ? 'flex-row items-center gap-3' : 'gap-1'}>
      <SegmentedControl<ViewScope> fit isCompact value={scope} onChange={setScope} options={options} />
      <Text className="font-inter text-xs text-ink-muted">{scope === 'all' ? `Showing ${allLabel}` : label}</Text>
    </View>
  );
}
