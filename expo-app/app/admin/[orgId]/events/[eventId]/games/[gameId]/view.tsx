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
import { Event, Game, Sport, Site, Team, Organization } from '@sk/types';
import { COLORS, getThemeColor } from '../../../../../../../constants/Colors';

import { useAuthStore } from '../../../../../../../store/authStore';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { MatchViewSwitcher } from '../../../../../../../components/MatchViewSwitcher';
import { EventLogFeed } from '../../../../../../../components/sports/shared/EventLogFeed';

export default function ViewGame() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string, eventId: string, gameId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [event, setEvent] = useState<Event | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  
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
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  // Format Date and Time
  const dateBase = game.scheduledStartTime ? game.scheduledStartTime.split('T')[0] : (game.startTime ? game.startTime.split('T')[0] : '');
  const timeBase = game.scheduledStartTime ? game.scheduledStartTime.split('T')[1]?.substring(0, 5) : (game.startTime ? game.startTime.split('T')[1]?.substring(0, 5) : '');

  const permissions = getMatchPermissions({
    game,
    event,
    currentOrgId: orgId,
    user,
    orgMemberships,
    teamMemberships,
  });

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={safeGoBack}
          activeOpacity={0.85}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
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
          <GlassCard className="border border-brand-orange/20 bg-brand-orange/5 p-4 mb-6 flex-row items-center gap-3">
            <Ionicons name="information-circle-outline" size={20} color={COLORS.brand.orange} />
            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 flex-1 leading-relaxed">
              You are viewing this match in read-only mode because it belongs to another organization.
            </Text>
          </GlassCard>
        )}

        {/* MATCHUP CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-6 mb-6">
          <View className="flex-row justify-between items-center py-4">
            {/* HOME TEAM */}
            <View className="flex-1 items-center">
              <View className="w-14 h-14 bg-brand-orange/10 rounded-full items-center justify-center mb-2.5">
                <Ionicons name="shield-outline" size={28} color={COLORS.brand.orange} />
              </View>
              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center" numberOfLines={2}>
                {homeTeam?.name || 'Home Team'}
              </Text>
              <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-center" numberOfLines={1}>
                {homeOrg?.shortName || homeOrg?.name || ''}
              </Text>
            </View>

            {/* VS SPLIT */}
            <View className="px-4 items-center">
              <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 italic">VS</Text>
              {game.status === 'Finished' && (
                <Text className="font-orbitron-bold text-base text-brand-orange mt-2">
                  {game.finalScoreData?.home ?? 0} - {game.finalScoreData?.away ?? 0}
                </Text>
              )}
            </View>

            {/* AWAY TEAM */}
            <View className="flex-1 items-center">
              <View className="w-14 h-14 bg-slate-100 dark:bg-white/5 rounded-full items-center justify-center mb-2.5">
                <Ionicons name="shield-outline" size={28} color={getThemeColor(isDark, 'textSecondary')} />
              </View>
              <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center" numberOfLines={2}>
                {awayTeam?.name || 'Away Team'}
              </Text>
              <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-center" numberOfLines={1}>
                {awayOrg?.shortName || awayOrg?.name || ''}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* METADATA LIST */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-5 gap-4">
          <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider mb-2">Match Information</Text>
          
          <View className="flex-row justify-between py-2.5 border-b border-slate-100 dark:border-white/5">
            <Text className="font-inter text-xs text-slate-500">Sport</Text>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">{sport?.name || 'Unknown'}</Text>
          </View>

          <View className="flex-row justify-between py-2.5 border-b border-slate-100 dark:border-white/5">
            <Text className="font-inter text-xs text-slate-500">Status</Text>
            <Text className="font-orbitron-bold text-xs text-brand-orange uppercase">{game.status || 'Scheduled'}</Text>
          </View>

          <View className="flex-row justify-between py-2.5 border-b border-slate-100 dark:border-white/5">
            <Text className="font-inter text-xs text-slate-500">Venue</Text>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">
              {site?.name || 'Main Site'} {facility?.name ? `• ${facility.name}` : ''}
            </Text>
          </View>

          <View className="flex-row justify-between py-2.5 border-b border-slate-100 dark:border-white/5">
            <Text className="font-inter text-xs text-slate-500">Date</Text>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">{dateBase || 'TBD'}</Text>
          </View>

          <View className="flex-row justify-between py-2.5">
            <Text className="font-inter text-xs text-slate-500">Time</Text>
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">
              {game.customSettings?.timeTbd ? 'TBD' : (timeBase || 'TBD')}
            </Text>
          </View>
        </GlassCard>

        {/* LIVE EVENT FEED */}
        <View className="h-[360px] mb-6">
          <EventLogFeed gameId={game.id} game={game} canManage={false} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
