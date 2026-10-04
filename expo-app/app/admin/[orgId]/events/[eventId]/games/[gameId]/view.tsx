import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { wsService } from '../../../../../../../services/websocket';
import { useWsStore } from '../../../../../../../store/wsStore';
import { Event, Game, Sport, Site, Team, Organization } from '@sk/shared';


import { useAuthStore } from '../../../../../../../store/authStore';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { MatchViewSwitcher } from '../../../../../../../components/MatchViewSwitcher';
import { finishedScoreLine } from '../../../../../../../utils/matchScore';
import { RecordResultModal } from '../../../../../../../components/RecordResultModal';
import { EventLogFeed } from '../../../../../../../components/sports/shared/EventLogFeed';
import { DynamicScoringProvider } from '../../../../../../../components/sports/shared/DynamicScoringContext';
import { formatInstantDate, formatKickoffTime } from '../../../../../../../utils/dates';
import { themeColor } from '../../../../../../../constants/Colors';

export default function ViewGame() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string, eventId: string, gameId: string }>();
  const { capabilities } = useEventCapabilities(eventId);
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  // Entity caches
  const [sport, setSport] = useState<Sport | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [facility, setFacility] = useState<any>(null);
  const [homeTeam, setHomeTeam] = useState<Team | null>(null);
  const [awayTeam, setAwayTeam] = useState<Team | null>(null);
  const [homeOrg, setHomeOrg] = useState<Organization | null>(null);
  const [awayOrg, setAwayOrg] = useState<Organization | null>(null);

  const safeGoBack = () => {
    safeBack(`/admin/${orgId}/events/${eventId}`);
  };

  // Load initial game and event
  useEffect(() => {
    if (!isConnected || !orgId || !eventId || !gameId) return;

    setIsLoading(true);

    // Safety timeout in case socket callback gets dropped/handshake delays
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 5000);

    wsService.emit('get_data', { type: 'event', id: eventId }, (resEvent: any) => {
      if (resEvent) {
        setEvent(resEvent);
        if (resEvent.sportIds?.[0] && !sport) {
          wsService.emit('get_data', { type: 'sport', id: resEvent.sportIds[0] }, (resSport: any) => {
            if (resSport) setSport(resSport);
          });
        }
      }
    });

    wsService.emit('get_data', { type: 'game', id: gameId }, (resGame: any) => {
      clearTimeout(timer);
      if (resGame) {
        setGame(resGame);
        
        // Load Sport
        const resolvedSportId = resGame.sportId || resGame.customSettings?.sportId;
        if (resolvedSportId) {
          wsService.emit('get_data', { type: 'sport', id: resolvedSportId }, (resSport: any) => {
            if (resSport) setSport(resSport);
          });
        }

        // Load Site & Facility
        if (resGame.siteId) {
          wsService.emit('get_data', { type: 'site', id: resGame.siteId }, (resSite: any) => {
            if (resSite) setSite(resSite);
          });
        }
        if (resGame.facilityId) {
          wsService.emit('get_data', { type: 'facility', id: resGame.facilityId }, (resFac: any) => {
            if (resFac) setFacility(resFac);
          });
        }

        // Load Teams and their Orgs
        const homeTeamId = resGame.participants?.[0]?.teamId;
        const awayTeamId = resGame.participants?.[1]?.teamId;

        if (homeTeamId) {
          wsService.emit('get_data', { type: 'team', id: homeTeamId }, (t: any) => {
            if (t) {
              setHomeTeam(t);
              if (t.sportId && !sport) {
                wsService.emit('get_data', { type: 'sport', id: t.sportId }, (resSport: any) => {
                  if (resSport) setSport(resSport);
                });
              }
              if (t.orgId) {
                wsService.emit('get_data', { type: 'organization', id: t.orgId }, (o: any) => {
                  if (o) setHomeOrg(o);
                });
              }
            }
          });
        }

        if (awayTeamId) {
          wsService.emit('get_data', { type: 'team', id: awayTeamId }, (t: any) => {
            if (t) {
              setAwayTeam(t);
              if (t.orgId) {
                wsService.emit('get_data', { type: 'organization', id: t.orgId }, (o: any) => {
                  if (o) setAwayOrg(o);
                });
              }
            }
          });
        }

        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    });
  }, [isConnected, orgId, eventId, gameId]);

  if (isLoading || !event || !game) {
    return (
      <SafeAreaView className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        <Text className="font-orbitron text-xs text-ink-muted mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  // Format Date and Time
  // In the viewer's own time. Cutting up the ISO string here showed the UTC time (DATE-1).
  const kickoff = game.scheduledStartTime || game.startTime;
  const dateBase = formatInstantDate(kickoff);
  const timeBase = formatKickoffTime(kickoff);

  const permissions = getMatchPermissions({
    game,
    event,
    currentOrgId: orgId,
    user,
    orgMemberships,
    teamMemberships,
    // Without this the screen would hide the controls from an appointed organiser or a
    // division convenor, neither of whom holds an org membership that says so (D33).
    capabilities,
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity
          onPress={safeGoBack}
          activeOpacity={0.85}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
          Match Details
        </Text>
        <MatchViewSwitcher
          orgId={orgId!}
          eventId={eventId!}
          gameId={gameId!}
          currentView="view"
          permissions={permissions}
        />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* READ ONLY BANNER */}
        {!permissions.canEdit && !permissions.canScore && (
          <GlassCard className="border border-primary-line bg-primary-soft p-4 mb-6 flex-row items-center gap-3">
            <Ionicons name="information-circle-outline" size={20} color={themeColor(isDark, 'primary')} />
            <Text className="font-inter text-xs text-ink-muted flex-1 leading-relaxed">
              You are viewing this match in read-only mode because it belongs to another organization.
            </Text>
          </GlassCard>
        )}

        {/* MATCHUP CARD */}
        <GlassCard className="border border-line p-6 mb-6">
          <View className="flex-row justify-between items-center py-4">
            {/* HOME TEAM */}
            <View className="flex-1 items-center">
              <View className="w-14 h-14 bg-primary-soft rounded-full items-center justify-center mb-2.5">
                <Ionicons name="shield-outline" size={28} color={themeColor(isDark, 'primary')} />
              </View>
              <Text className="font-orbitron-bold text-sm text-ink text-center" numberOfLines={2}>
                {homeTeam?.name || 'Home Team'}
              </Text>
              <Text className="font-inter text-[10px] text-ink-muted mt-1 text-center" numberOfLines={1}>
                {homeOrg?.shortName || homeOrg?.name || ''}
              </Text>
            </View>

            {/* VS SPLIT */}
            <View className="px-4 items-center">
              <Text className="font-orbitron-bold text-xs text-ink-muted italic">VS</Text>
              {finishedScoreLine(game) && (
                <Text className="font-orbitron-bold text-base text-primary-ink mt-2">
                  {finishedScoreLine(game)}
                </Text>
              )}
            </View>

            {/* AWAY TEAM */}
            <View className="flex-1 items-center">
              <View className="w-14 h-14 bg-sunken rounded-full items-center justify-center mb-2.5">
                <Ionicons name="shield-outline" size={28} color={themeColor(isDark, 'ink-muted')} />
              </View>
              <Text className="font-orbitron-bold text-sm text-ink text-center" numberOfLines={2}>
                {awayTeam?.name || 'Away Team'}
              </Text>
              <Text className="font-inter text-[10px] text-ink-muted mt-1 text-center" numberOfLines={1}>
                {awayOrg?.shortName || awayOrg?.name || ''}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* RECORD RESULT — an editor or a scorer, for a match that was not live-scored or needs correcting */}
        {(permissions.canScore || permissions.canEdit) && game.status !== 'Cancelled' && (
          <TouchableOpacity
            onPress={() => setIsRecording(true)}
            activeOpacity={0.85}
            className="flex-row items-center justify-center gap-2 bg-primary rounded-xl py-3 mb-6"
          >
            <Ionicons name="trophy-outline" size={14} color={themeColor(isDark, 'on-primary')} />
            <Text className="font-orbitron-bold text-[10px] text-on-primary uppercase tracking-widest">
              {game.status === 'Finished' ? 'Correct Result' : 'Record Result'}
            </Text>
          </TouchableOpacity>
        )}

        {/* METADATA LIST */}
        <GlassCard className="border border-line p-5 gap-4">
          <Text className="font-orbitron-bold text-xs text-ink uppercase tracking-wider mb-2">Match Information</Text>
          
          <View className="flex-row justify-between py-2.5 border-b border-line-soft">
            <Text className="font-inter text-xs text-ink-muted">Sport</Text>
            <Text className="font-inter-bold text-xs text-ink">{sport?.name || 'Unknown'}</Text>
          </View>

          <View className="flex-row justify-between py-2.5 border-b border-line-soft">
            <Text className="font-inter text-xs text-ink-muted">Status</Text>
            <Text className="font-orbitron-bold text-xs text-primary-ink uppercase">{game.status || 'Scheduled'}</Text>
          </View>

          <View className="flex-row justify-between py-2.5 border-b border-line-soft">
            <Text className="font-inter text-xs text-ink-muted">Where</Text>
            <Text className="font-inter-bold text-xs text-ink">
              {site?.name || 'Main Site'} {facility?.name ? `• ${facility.name}` : ''}
            </Text>
          </View>

          <View className="flex-row justify-between py-2.5 border-b border-line-soft">
            <Text className="font-inter text-xs text-ink-muted">Date</Text>
            <Text className="font-inter-bold text-xs text-ink">{dateBase || 'TBD'}</Text>
          </View>

          <View className="flex-row justify-between py-2.5">
            <Text className="font-inter text-xs text-ink-muted">Time</Text>
            <Text className="font-inter-bold text-xs text-ink">
              {game.customSettings?.timeTbd ? 'TBD' : (timeBase || 'TBD')}
            </Text>
          </View>
        </GlassCard>

        {/* LIVE EVENT FEED */}
        <View className="h-[360px] mb-6">
          {/* The feed reads its events, rosters and sport from the shared scoring context */}
          <DynamicScoringProvider game={game}>
            <EventLogFeed gameId={game.id} game={game} canManage={false} />
          </DynamicScoringProvider>
        </View>
      </ScrollView>

      <RecordResultModal
        isOpen={isRecording}
        onClose={() => setIsRecording(false)}
        game={game}
        sideLabels={[homeTeam?.name || '', awayTeam?.name || '']}
        onRecorded={setGame}
      />
    </SafeAreaView>
  );
}
