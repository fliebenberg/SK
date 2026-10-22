import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  DualOutcome,
  Event,
  GameSummary,
  Organization,
  Sport,
  TournamentDivision,
  divisionFullName,
  dualOutcome,
  dualTally,
  orgColors,
} from '@sk/shared';
import { FixtureCrest, sideScores } from '../events/EventBits';
import { TournamentCard } from './TournamentBits';
import { DivisionOrgStandings } from './DivisionStandings';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * A Head to Head's results (`H2H-1`, agreed 2026-10-13 on `mockups/head-to-head.html`): games won by
 * each organisation, and drawn, for the day and for each division. There are no points or tables —
 * a Head to Head is won by games — so this stands where a tournament's Standings would.
 *
 * Each division, opened, leads with its table by organisation — P W D L, no points — the same table a
 * division set by hand has in a full tournament (`SCORE-23`, 2026-10-22), then its games.
 *
 * Results are shown in full, as everywhere else in the app; hiding them is a separate task, and
 * when it lands this has to respect it. Each game is a dot in the colours of the side that won it,
 * the primary colour with a ring in the secondary (agreed 2026-10-13), grey for a draw.
 */

type Side = { id: string; name: string; logo?: string; logoConfig?: any; primaryColor?: string | null; secondaryColor?: string | null };

/** The two sides: the host, and the organisation it plays. */
export function dualSides(event: Event, hostOrg: Organization | null): { host: Side; guest: Side | null } {
  const hostBadge = (event.participatingOrgs || []).find(o => o.id === event.orgId);
  const host: Side = {
    id: event.orgId,
    name: hostOrg?.name || hostBadge?.name || 'Host',
    logo: hostOrg?.logo || hostBadge?.logo,
    logoConfig: (hostOrg?.settings as any)?.logoConfig ?? hostBadge?.logoConfig,
    primaryColor: hostOrg?.primaryColor || hostBadge?.primaryColor,
    secondaryColor: hostOrg?.secondaryColor ?? hostBadge?.secondaryColor,
  };
  const g = (event.participatingOrgs || []).find(o => o.id !== event.orgId && o.invitation !== 'declined' && o.invitation !== 'withdrawn');
  return { host, guest: g ? { id: g.id, name: g.name, logo: g.logo, logoConfig: g.logoConfig, primaryColor: g.primaryColor, secondaryColor: g.secondaryColor } : null };
}

export function SideCrest({ side, size = 26 }: { side: Side; size?: number }) {
  return (
    <FixtureCrest
      participant={{ id: side.id, orgId: side.id, orgLogo: side.logo, orgLogoConfig: side.logoConfig, orgPrimaryColor: side.primaryColor || undefined }}
      size={size}
    />
  );
}

/** One game: the winner's colours, grey for a draw, a red ring while live, dashed until played. */
function GameDot({ outcome, host, guest }: { outcome: DualOutcome; host: Side; guest: Side | null }) {
  const isDark = useActiveTheme() === 'dark';
  const size = { width: 12, height: 12, borderRadius: 6 };
  if (outcome === 'host' || outcome === 'guest') {
    const { primary, secondary } = orgColors(outcome === 'host' ? host : guest);
    return <View style={{ ...size, backgroundColor: primary, borderWidth: 2, borderColor: secondary }} />;
  }
  if (outcome === 'drawn') return <View style={{ ...size, backgroundColor: themeColor(isDark, 'ink-faint') }} />;
  if (outcome === 'live') return <View style={{ ...size, borderWidth: 2, borderColor: themeColor(isDark, 'danger') }} />;
  return <View style={{ ...size, borderWidth: 2, borderStyle: 'dashed', borderColor: themeColor(isDark, 'ink-faint') }} />;
}

function WonDrawnWon({ host, drawn, guest }: { host: number; drawn: number; guest: number }) {
  return (
    <Text className="font-inter text-[13px] text-ink-soft" style={{ fontVariant: ['tabular-nums'] }}>
      <Text className="font-inter-bold text-ink">{host}</Text> – {drawn} – <Text className="font-inter-bold text-ink">{guest}</Text>
    </Text>
  );
}

/** The day's score: games won by each side either side of the draws, with a bar in their colours. */
function Scoreline({ games, host, guest, large }: { games: GameSummary[]; host: Side; guest: Side | null; large: boolean }) {
  const t = dualTally(games, host.id);
  const hostColor = orgColors(host).primary;
  const guestColor = orgColors(guest).primary;
  const drawnColor = themeColor(useActiveTheme() === 'dark', 'ink-faint');
  const big = { fontSize: large ? 34 : 26, lineHeight: large ? 38 : 30 };
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 flex-row items-center gap-2.5 min-w-0">
          <SideCrest side={host} size={large ? 40 : 30} />
          <View className="min-w-0 flex-1">
            <Text className="font-inter-bold text-ink" style={big}>{t.host}</Text>
            <Text className="font-inter-bold text-sm text-ink" numberOfLines={2}>{host.name}</Text>
          </View>
        </View>
        <View className="items-center">
          <Text className="font-inter-bold text-xl text-ink-muted">{t.drawn}</Text>
          <Text className="font-inter text-xs text-ink-muted">drawn</Text>
        </View>
        <View className="flex-1 flex-row items-center justify-end gap-2.5 min-w-0">
          <View className="min-w-0 flex-1 items-end">
            <Text className="font-inter-bold text-ink" style={big}>{t.guest}</Text>
            <Text className="font-inter-bold text-sm text-ink text-right" numberOfLines={2}>{guest?.name || 'To be chosen'}</Text>
          </View>
          {guest ? <SideCrest side={guest} size={large ? 40 : 30} /> : null}
        </View>
      </View>
      {t.played ? (
        <View className="flex-row h-2.5 rounded-full overflow-hidden gap-0.5">
          {t.host ? <View style={{ flex: t.host, backgroundColor: hostColor }} /> : null}
          {t.drawn ? <View style={{ flex: t.drawn, backgroundColor: drawnColor }} /> : null}
          {t.guest ? <View style={{ flex: t.guest, backgroundColor: guestColor }} /> : null}
        </View>
      ) : (
        <View className="h-2.5 rounded-full bg-line-strong" />
      )}
      <Text className="font-inter text-xs text-ink-muted text-center">
        Games won · {t.played} of {t.total} played{t.live ? <Text className="text-danger-ink"> · {t.live} live</Text> : null}
      </Text>
    </View>
  );
}

/**
 * The Overview's *Results* card: the day's score, then one line per sport with a dot per game. Its
 * full page is the Results tab.
 */
export function DualResultsCard({ event, hostOrg, divisions, games, sports, onOpenAll }: {
  event: Event;
  hostOrg: Organization | null;
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  onOpenAll: () => void;
}) {
  const { host, guest } = dualSides(event, hostOrg);
  const sportIds = (event.sportIds || []).filter(id => divisions.some(d => d.sportId === id));
  return (
    <TournamentCard
      title="Results"
      right={
        <TouchableOpacity onPress={onOpenAll} accessibilityRole="link" hitSlop={8}>
          <Text className="font-inter-bold text-sm text-primary-ink">All results ›</Text>
        </TouchableOpacity>
      }
    >
      <Scoreline games={games} host={host} guest={guest} large={false} />
      <View>
        {sportIds.map((sportId, i) => {
          const inSport = games.filter(g => divisions.some(d => d.id === g.divisionId && d.sportId === sportId));
          const t = dualTally(inSport, host.id);
          return (
            <View key={sportId} className={`flex-row items-center gap-3 py-2 ${i ? 'border-t border-line-soft' : ''}`}>
              <Text className="font-inter-semibold text-sm text-ink" style={{ minWidth: 90 }} numberOfLines={1}>{sports.find(s => s.id === sportId)?.name || 'Sport'}</Text>
              <View className="flex-1 flex-row flex-wrap gap-1.5">
                {inSport.filter(g => g.status !== 'Cancelled').map(g => <GameDot key={g.id} outcome={dualOutcome(g, host.id)} host={host} guest={guest} />)}
              </View>
              <WonDrawnWon host={t.host} drawn={t.drawn} guest={t.guest} />
            </View>
          );
        })}
      </View>
    </TournamentCard>
  );
}

/**
 * The Results tab: the day's score, a key to the dots, then a card per sport with a row per
 * division; a division opens to its games and scores, and the teams that had no game.
 */
export function DualResults({ event, orgId, hostOrg, divisions, games, sports, unpairedNames }: {
  event: Event;
  orgId: string;
  hostOrg: Organization | null;
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  /** The teams of a division that have no game, by name with their organisation. */
  unpairedNames: (divisionId: string) => string[];
}) {
  const router = useRouter();
  const { host, guest } = dualSides(event, hostOrg);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const sportIds = (event.sportIds || []).filter(id => divisions.some(d => d.sportId === id));
  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name || '';

  const key = (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
      {[
        ['host', `${host.name} won`],
        ['drawn', 'Drawn'],
        ['guest', `${guest?.name || 'They'} won`],
        ['live', 'Live'],
        ['notPlayed', 'Not played'],
      ].map(([outcome, label]) => (
        <View key={outcome} className="flex-row items-center gap-1.5">
          <GameDot outcome={outcome as DualOutcome} host={host} guest={guest} />
          <Text className="font-inter text-xs text-ink-muted">{label}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View className="gap-3.5">
      <TournamentCard title="The day">
        <Scoreline games={games} host={host} guest={guest} large />
      </TournamentCard>
      {key}
      {sportIds.map(sportId => {
        const sportDivisions = divisions.filter(d => d.sportId === sportId);
        const t = dualTally(games.filter(g => sportDivisions.some(d => d.id === g.divisionId)), host.id);
        return (
          <TournamentCard key={sportId} title={sportName(sportId)} right={<WonDrawnWon host={t.host} drawn={t.drawn} guest={t.guest} />}>
            <View>
              {sportDivisions.map((d, i) => {
                const inDivision = games.filter(g => g.divisionId === d.id && g.status !== 'Cancelled');
                const dt = dualTally(inDivision, host.id);
                const isOpen = open.has(d.id);
                return (
                  <View key={d.id} className={i ? 'border-t border-line-soft' : ''}>
                    <TouchableOpacity
                      onPress={() => toggle(d.id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      accessibilityLabel={`${divisionFullName(d.name, sportName(d.sportId))}: ${host.name} ${dt.host}, drawn ${dt.drawn}, ${guest?.name || 'they'} ${dt.guest}`}
                      className="flex-row items-center gap-3 py-2.5"
                    >
                      <Text className="font-inter-semibold text-sm text-ink" style={{ minWidth: 90 }} numberOfLines={1}>{d.name}</Text>
                      <View className="flex-1 flex-row flex-wrap gap-1.5">
                        {inDivision.map(g => <GameDot key={g.id} outcome={dualOutcome(g, host.id)} host={host} guest={guest} />)}
                      </View>
                      <WonDrawnWon host={dt.host} drawn={dt.drawn} guest={dt.guest} />
                      <Text className="font-inter-bold text-xs text-ink-muted">{isOpen ? '▴' : '▾'}</Text>
                    </TouchableOpacity>
                    {isOpen ? (
                      <View className="pb-2 gap-1">
                        <View className="pb-2">
                          <DivisionOrgStandings eventId={event.id} divisionId={d.id} showPoints={false} orgs={event.participatingOrgs} />
                        </View>
                        {inDivision.map(g => {
                          const sides = g.participants || [];
                          const h = sides.find(p => p.orgId === host.id) || sides[0];
                          const a = sides.find(p => p !== h);
                          const scores = sideScores(g);
                          const hostFirst = sides[0] === h;
                          const score = scores ? (hostFirst ? `${scores[0]}–${scores[1]}` : `${scores[1]}–${scores[0]}`) : 'v';
                          const outcome = dualOutcome(g, host.id);
                          return (
                            <TouchableOpacity
                              key={g.id}
                              onPress={() => router.push(`/admin/${orgId}/events/${event.id}/games/${g.id}`)}
                              accessibilityRole="link"
                              className="flex-row items-center gap-2 py-1"
                            >
                              <Text className={`flex-1 text-right text-[13px] text-ink ${outcome === 'host' ? 'font-inter-bold' : 'font-inter'}`} numberOfLines={1}>{h?.name || 'TBC'}</Text>
                              <SideCrest side={host} size={18} />
                              <Text className={`font-inter-bold text-[13px] text-center ${outcome === 'live' ? 'text-danger-ink' : 'text-ink'}`} style={{ minWidth: 52, fontVariant: ['tabular-nums'] }}>{score}</Text>
                              {guest ? <SideCrest side={guest} size={18} /> : null}
                              <Text className={`flex-1 text-[13px] text-ink ${outcome === 'guest' ? 'font-inter-bold' : 'font-inter'}`} numberOfLines={1}>{a?.name || 'TBC'}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        {unpairedNames(d.id).map(name => (
                          <Text key={name} className="font-inter text-xs text-ink-muted text-center">{name} had no game</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </TournamentCard>
        );
      })}
    </View>
  );
}
