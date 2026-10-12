import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Event,
  EventOrgBadge,
  GameSummary,
  Organization,
  SocketAction,
  Sport,
  TournamentDivision,
  TournamentEntrant,
  divisionFullName,
  hasLeft,
  isTakingPart,
  isEntrantEntered,
} from '@sk/shared';
import { OverflowMenu } from '../OverflowMenu';
import { RegisterOrgModal } from '../RegisterOrgModal';
import { DivisionState, OrgRow, StepWarning, divisionStateOf } from './TournamentBits';
import { afterDayEndByDivision, scheduleModel } from './scheduleModel';
import type { TimeZone } from '../../utils/dates';
import { SportOrganizersDialog, SportsDialog } from './TournamentDialogs';
import { AddDivisionDialog } from './DivisionDialogs';
import { AddOrganisationsDialog, InviteOrganisationsDialog, NominateFor } from './OrganisationDialogs';
import { nominateOrgContact } from '../../services/nominations';
import { OrgAddingLine } from './DivisionEntries';
import { sendAction } from '../../services/actions';

/**
 * The two big sections of the tournament page — Sports & divisions, and Organisations & teams — as
 * hooks, so that the Overview's card and the section's full page (`events/[eventId]/sports`,
 * `events/[eventId]/organisations`) work from one copy: the same rows, the same warnings, the same
 * actions and dialogs (agreed 2026-10-09: a full page shows the same things the same way, with more
 * room).
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------------------------------------------------------------------------------------------
 * Sports & divisions
 * ------------------------------------------------------------------------------------------- */

export function useSportsSection({ event, orgId, sports, divisions, games, entrantsByDivision, canEdit, setupMode, complete, mySportIds, timeZone }: {
  event: Event;
  orgId: string;
  sports: Sport[];
  divisions: TournamentDivision[];
  games: GameSummary[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  canEdit: boolean;
  /** An organiser, while the tournament is being set up. */
  setupMode: boolean;
  /** Setup is finished — read the same way for a sport's organiser, who has no setup mode. */
  complete: boolean;
  /** The sports this viewer organises without running the tournament (`capabilities.convenesSportIds`). */
  mySportIds: string[];
  /** The venue's, which fixture times are read in for the day-end warning (Phase 7). */
  timeZone: TimeZone;
}) {
  const router = useRouter();
  const eventId = event.id;
  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';
  const gamesIn = (d: TournamentDivision) => games.filter(g => g.divisionId === d.id);

  // One rule with the division's own page (`divisionStateOf`), so the tile and the page agree.
  const lateByDivision = useMemo(
    () => afterDayEndByDivision(scheduleModel({ event, divisions, games, sports, timeZone }), games),
    [event, divisions, games, sports, timeZone]
  );
  const divisionState = (d: TournamentDivision): DivisionState =>
    divisionStateOf({ setupMode, games: gamesIn(d), entrants: entrantsByDivision.get(d.id) || [], firstStageId: d.firstStageId, afterDayEnd: lateByDivision.get(d.id) || 0 });
  /**
   * A dot on a sport's chip: red while one of its games is live; amber while setting up when one of
   * its divisions needs seeing to — too few teams, or changed since its draw. Not drawn yet is not
   * a dot: that is the Fixtures card's to say (2026-10-09).
   */
  const attention = (sportId: string): 'wait' | 'live' | null => {
    const own = divisions.filter(d => d.sportId === sportId);
    if (!setupMode) return own.some(d => gamesIn(d).some(g => g.status === 'Live')) ? 'live' : null;
    return own.some(d => divisionState(d).tone === 'wait') ? 'wait' : null;
  };
  const openDivision = (d: TournamentDivision) => router.push(`/admin/${orgId}/events/${eventId}/divisions/${d.id}`);

  /* Adding a division asks first — age group, name, how it is played — rather than creating one
     called after the sport (`FIX-27`). A sport just ticked gets its first division the same way:
     the server makes it, called Open, and the same dialog names it, one sport at a time. */
  const [sportsOpen, setSportsOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [firstFor, setFirstFor] = useState<string[]>([]);
  const firstDivision = firstFor.length ? divisions.find(d => d.sportId === firstFor[0]) || null : null;
  const [organisersOf, setOrganisersOf] = useState<string | null>(null);
  /* A sport's organiser runs their own sports here as the step screen let them (`FIX-28`): they
     add its divisions while the tournament is being set up and appoint its organisers, but choose
     and remove sports — the shape of the tournament — never. */
  const runsSport = (sportId: string) => canEdit || mySportIds.includes(sportId);
  const removeSport = (sportId: string) =>
    sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { sportIds: (event.sportIds || []).filter(id => id !== sportId) } });
  /** The ⋯ stays after setup for *Sport organisers*; *Remove sport* is the tournament's, while setting up. */
  const sportMenu = (sportId: string) => {
    if (!runsSport(sportId)) return null;
    const count = divisions.filter(d => d.sportId === sportId).length;
    return (
      <OverflowMenu
        accessibilityLabel={`${sportName(sportId)} actions`}
        title={sportName(sportId)}
        items={[
          { label: 'Sport organisers', description: `Who runs ${sportName(sportId) || 'this sport'} at this tournament`, icon: 'people-outline', onPress: () => setOrganisersOf(sportId) },
          ...(!setupMode ? [] : [{
            /* `as const` keeps the icon an Ionicons name inside the spread. */
            label: 'Remove sport',
            description: count ? `Not available: it has ${plural(count, 'division')}. Remove them first, from each division's page.` : 'Take it off this tournament.',
            icon: 'trash-outline',
            destructive: true,
            disabled: count > 0,
            onPress: () => removeSport(sportId),
          } as const]),
        ]}
      />
    );
  };

  const runsAny = canEdit || mySportIds.length > 0;
  const dialogs = runsAny ? (
    <>
      <SportOrganizersDialog
        visible={!!organisersOf}
        event={event}
        orgId={orgId}
        sport={sports.find(s => s.id === organisersOf) || null}
        onClose={() => setOrganisersOf(null)}
      />
      {canEdit ? <SportsDialog
        visible={sportsOpen}
        event={event}
        orgId={orgId}
        sports={sports}
        divisionCount={id => divisions.filter(d => d.sportId === id).length}
        onClose={addedSportIds => { setSportsOpen(false); setFirstFor(addedSportIds); }}
      /> : null}
      <AddDivisionDialog
        visible={!!addingTo}
        onClose={() => setAddingTo(null)}
        onAdded={id => router.push(`/admin/${orgId}/events/${eventId}/divisions/${id}`)}
        orgId={orgId}
        event={event}
        sport={sports.find(s => s.id === addingTo) || null}
        divisions={divisions}
      />
      {canEdit ? <AddDivisionDialog
        visible={!!firstDivision && !sportsOpen}
        onClose={() => setFirstFor(prev => prev.slice(1))}
        orgId={orgId}
        event={event}
        sport={sports.find(s => s.id === firstFor[0]) || null}
        divisions={divisions}
        existing={firstDivision}
      /> : null}
    </>
  ) : null;

  return {
    sportName,
    divisionState,
    attention,
    openDivision,
    /** Adding is an organiser's while setting up, as the tiles' ＋ always was — a sport's organiser's for their own. */
    addDivision: runsAny && !complete ? (sportId: string) => setAddingTo(sportId) : undefined,
    canAddDivision: runsSport,
    addSport: canEdit && setupMode ? () => setSportsOpen(true) : undefined,
    /** Opens the Sports dialog regardless of phase — the empty card's and the strip's "＋ Add a sport". */
    chooseSports: () => setSportsOpen(true),
    sportMenu: runsAny ? sportMenu : undefined,
    dialogs,
  };
}

/* ---------------------------------------------------------------------------------------------
 * Organisations & teams (FIX-26 — "organisations", never "schools": clubs take part too)
 * ------------------------------------------------------------------------------------------- */

export function useOrganisationsSection({ event, orgId, sports, divisions, entrantsByDivision, hostOrg, viewerOrgIds, canEdit, setupMode }: {
  event: Event;
  orgId: string;
  sports: Sport[];
  divisions: TournamentDivision[];
  entrantsByDivision: Map<string, TournamentEntrant[]>;
  hostOrg: Organization | null;
  /** The viewer's organisations, to put theirs first. */
  viewerOrgIds: string[];
  canEdit: boolean;
  setupMode: boolean;
}) {
  const router = useRouter();
  const eventId = event.id;
  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';
  const allEntrants = useMemo(() => Array.from(entrantsByDivision.values()).flat(), [entrantsByDivision]);
  const activeEntrants = allEntrants.filter(e => isEntrantEntered(e.status));
  const takingPart = event.participatingOrgs || [];
  const divisionName = (id: string) => {
    const d = divisions.find(x => x.id === id);
    return d ? divisionFullName(d.name, sportName(d.sportId)) : '';
  };

  const orgRows: OrgRow[] = useMemo(() => {
    const sportOrder = event.sportIds || [];
    const rowFor = (org: OrgRow['org'], isHost: boolean, invitation?: OrgRow['invitation']): OrgRow => {
      const mine = activeEntrants.filter(e => e.orgId === org.id);
      const bySport: Array<[string, string[]]> = [];
      for (const sportId of sportOrder) {
        const names = mine
          .map(e => divisions.find(d => d.id === e.divisionId))
          .filter((d): d is TournamentDivision => !!d && d.sportId === sportId)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map(d => d.name);
        if (names.length) bySport.push([sportName(sportId), names]);
      }
      const all = allEntrants.filter(e => e.orgId === org.id);
      return {
        org, isHost, invitation, bySport,
        teams: mine.filter(e => e.teamId).length,
        players: mine.filter(e => e.orgProfileId).length,
        toBeNamed: mine.filter(e => !e.teamId && !e.orgProfileId).length,
        // Its teams' answers (`FIX-31`). An organisation only invited has none of its own yet: its
        // teams wait with it, so they are not counted twice.
        toAnswer: isHost || invitation === 'not_invited' || invitation === 'invited' ? 0 : all.filter(e => e.status === 'invited').length,
        declinedTeams: isHost ? 0 : all.filter(e => e.status === 'declined').length,
        requests: all.filter(e => e.status === 'requested' || e.status === 'withdrawal_pending').length,
      };
    };
    const rows: OrgRow[] = [];
    if (hostOrg) rows.push(rowFor({ id: hostOrg.id, name: hostOrg.name, logo: hostOrg.logo, logoConfig: (hostOrg.settings as any)?.logoConfig, primaryColor: hostOrg.primaryColor }, true));
    for (const org of takingPart) {
      if (org.id === event.orgId) continue;
      rows.push(rowFor(org, false, org.invitation));
    }
    // The viewer's own organisation first, after the host, when they are a guest.
    const mine = rows.filter(r => !r.isHost && viewerOrgIds.includes(r.org.id));
    // Those that declined or withdrew last: kept as the record, but out of it (`FIX-30`).
    const left = (r: OrgRow) => !!r.invitation && hasLeft(r.invitation);
    const others = rows.filter(r => !r.isHost && !viewerOrgIds.includes(r.org.id));
    return [...rows.filter(r => r.isHost), ...mine, ...others.filter(r => !left(r)), ...others.filter(left)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostOrg, takingPart, allEntrants, divisions, sports, viewerOrgIds, event.orgId, event.sportIds]);

  /** Invitations are an organiser's business; anyone else sees who is taking part. */
  const visibleRows = canEdit ? orgRows : orgRows.filter(r => r.isHost || (!!r.invitation && isTakingPart(r.invitation)));
  const highlightOrgId = canEdit ? undefined : orgRows.find(r => !r.isHost && viewerOrgIds.includes(r.org.id))?.org.id;
  /** Competitors that belong to nobody yet — *Winner of the regional qualifier*. */
  const unnamed = activeEntrants.filter(e => !e.orgId && !e.teamId && !e.orgProfileId);
  const notInvited = takingPart.filter(o => o.id !== event.orgId && o.invitation === 'not_invited');
  const nobodyInvited = takingPart.every(o => o.id === event.orgId || o.invitation === 'not_invited');
  const openOrg = (id: string) => router.push(`/admin/${orgId}/events/${eventId}/organisations/${id}` as any);

  /**
   * What keeps the section from being done, one line each, with where to put it right: an
   * organisation asking to withdraw, one with no teams, one that has not answered. A division with
   * too few teams is not one of these (2026-10-09): it is the division's, shown on its tile, as a
   * dot on its sport and under the Fixtures card's *Still to draw*.
   */
  const warnings: Array<StepWarning & { orgId: string }> = (() => {
    if (!setupMode) return [];
    const list: Array<StepWarning & { orgId: string }> = [];
    // Declined and withdrawn are not warnings: they are answers (`FIX-30`), listed at the bottom.
    for (const row of orgRows.filter(r => !r.isHost && !(r.invitation && hasLeft(r.invitation)))) {
      const entered = row.teams + row.players + row.toBeNamed;
      if (row.invitation === 'withdrawal_pending') {
        list.push({ orgId: row.org.id, text: `${row.org.name} asks to withdraw.`, actionLabel: 'Review', onAction: () => openOrg(row.org.id) });
        continue;
      }
      if (!entered) list.push({ orgId: row.org.id, text: `${row.org.name} has no teams yet.`, actionLabel: 'Enter teams', onAction: () => openOrg(row.org.id) });
      if (row.invitation === 'invited') list.push({ orgId: row.org.id, text: `${row.org.name} has not answered its invitation.`, actionLabel: 'Record answer', onAction: () => openOrg(row.org.id) });
      if (row.toAnswer) list.push({ orgId: row.org.id, text: `${row.org.name}: ${row.toAnswer} ${row.toAnswer === 1 ? 'team' : 'teams'} still to answer.`, actionLabel: 'Open', onAction: () => openOrg(row.org.id) });
      if (row.requests) list.push({ orgId: row.org.id, text: `${row.org.name}: ${row.requests} ${row.requests === 1 ? 'request' : 'requests'} waiting for you.`, actionLabel: 'Review', onAction: () => openOrg(row.org.id) });
    }
    return list;
  })();

  type OrgDialog =
    | null
    | { kind: 'add' }
    | { kind: 'inviteAll' }
    | { kind: 'register'; name: string }
    | { kind: 'nominate'; orgId: string };
  const [orgDialog, setOrgDialog] = useState<OrgDialog>(null);
  const closeOrgDialog = () => setOrgDialog(null);
  const badgeFor = (id: string) => takingPart.find(o => o.id === id) || null;
  // The host may have been taken off the list (it can run a tournament it does not play in).
  const hostBadge: EventOrgBadge | null = hostOrg
    ? badgeFor(hostOrg.id) || { id: hostOrg.id, name: hostOrg.name, shortName: hostOrg.shortName || hostOrg.name, logo: hostOrg.logo, logoConfig: (hostOrg.settings as any)?.logoConfig, primaryColor: hostOrg.primaryColor, isClaimed: true, invitation: 'accepted' }
    : null;
  const dialogOrg = orgDialog && 'orgId' in orgDialog ? (orgDialog.orgId === event.orgId ? hostBadge : badgeFor(orgDialog.orgId)) : null;

  const dialogs = canEdit ? (
    <>
      {/* One dialog at a time, each handing on to the next. */}
      <AddOrganisationsDialog
        visible={orgDialog?.kind === 'add'}
        event={event}
        orgId={orgId}
        onClose={closeOrgDialog}
        onRegister={name => setOrgDialog({ kind: 'register', name })}
      />
      <InviteOrganisationsDialog
        visible={orgDialog?.kind === 'inviteAll'}
        event={event}
        orgId={orgId}
        onClose={closeOrgDialog}
        onNominate={org => setOrgDialog({ kind: 'nominate', orgId: org.id })}
      />
      {/* One the search did not find: registered, then added — invited too once invitations have started. */}
      <RegisterOrgModal
        isOpen={orgDialog?.kind === 'register'}
        onClose={closeOrgDialog}
        initialName={orgDialog?.kind === 'register' ? orgDialog.name : ''}
        sportId={(event.sportIds || []).length === 1 ? event.sportIds![0] : undefined}
        onRegistered={async (org, contactEmail) => {
          const result = await sendAction(SocketAction.ADD_EVENT_ORGS, { eventId, orgId, participantOrgIds: [org.id], invite: !nobodyInvited });
          if (result.ok && contactEmail) void nominateOrgContact(org.id, contactEmail);
          closeOrgDialog();
        }}
      />
      {orgDialog?.kind === 'nominate' && dialogOrg ? <NominateFor org={dialogOrg} onClose={closeOrgDialog} /> : null}
    </>
  ) : null;

  /**
   * *Organisations can add their own teams* (`FIX-33`): the tournament's setting, a line with a
   * toggle at the foot of the section — the same line a division's Teams card has.
   */
  const [savingAdding, setSavingAdding] = useState(false);
  const addingLine = canEdit ? (
    <OrgAddingLine
      event={event}
      busy={savingAdding}
      onChange={async allow => {
        setSavingAdding(true);
        await sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { orgsMayAddTeams: allow } });
        setSavingAdding(false);
      }}
    />
  ) : null;

  return {
    orgRows,
    addingLine,
    visibleRows,
    highlightOrgId,
    unnamed,
    notInvited,
    nobodyInvited,
    warnings,
    divisionName,
    openOrg,
    openUnnamed: (e: TournamentEntrant) => router.push(`/admin/${orgId}/events/${eventId}/divisions/${e.divisionId}`),
    /** "＋ Add organisation" — one action, since the dialog offers both Add and Add and invite. */
    addOrganisation: canEdit ? () => setOrgDialog({ kind: 'add' }) : undefined,
    inviteAll: () => setOrgDialog({ kind: 'inviteAll' }),
    dialogs,
  };
}
