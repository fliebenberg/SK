import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { useAuthStore } from '../../../../store/authStore';
import { SocketAction, Event, Game, Sport, Site } from '@sk/shared';
import { COLORS, getThemeColor } from '../../../../constants/Colors';
import { getMatchPermissions } from '../../../../utils/matchPermissions';

class EventsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[EventsErrorBoundary] Render error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl my-4">
          <Text className="font-orbitron-bold text-red-500 text-sm mb-2">Render Error in Events List</Text>
          <Text className="font-inter text-xs text-slate-300 mb-4">{this.state.error?.toString()}</Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            className="bg-brand-orange px-4 py-2 rounded-lg self-start"
          >
            <Text className="font-inter-bold text-xs text-white uppercase">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function OrgEventsList() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  // Data States
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');
  const [isAddMenuVisible, setIsAddMenuVisible] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load Data & Subscribe to socket updates
  useEffect(() => {
    if (!isConnected || !orgId) return;

    let active = true;
    setIsLoading(true);

    const loadData = () => {
      wsService.emit('get_data', { type: 'events', orgId }, (res: any) => {
        if (!active) return;
        console.log('[OrgEventsList] Fetched events count:', Array.isArray(res) ? res.length : 0);
        if (Array.isArray(res)) setEvents(res);
      });

      wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
        if (!active) return;
        console.log('[OrgEventsList] Fetched games count:', Array.isArray(res) ? res.length : 0);
        if (Array.isArray(res)) setGames(res);
        setIsLoading(false);
      });

      wsService.emit('get_data', { type: 'sports' }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setSports(res);
      });

      wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
        if (!active) return;
        if (Array.isArray(res)) setSites(res);
      });
    };

    loadData();

    // Subscribe to event updates for this organization
    const eventsRoom = `org:${orgId}:events`;
    const gamesRoom = `org:${orgId}:games`;
    const unsubEvents = wsService.subscribeToRoom(eventsRoom);
    const unsubGames = wsService.subscribeToRoom(gamesRoom);

    const handleUpdate = (eventPayload: any) => {
      if (!active) return;
      if (eventPayload) {
        if (eventPayload.type.startsWith('EVENT') || eventPayload.type === 'EVENTS_SYNC') {
          wsService.emit('get_data', { type: 'events', orgId }, (res: any) => {
            if (!active) return;
            if (Array.isArray(res)) setEvents(res);
          });
        }
        if (eventPayload.type.startsWith('GAME') || eventPayload.type === 'GAMES_SYNC') {
          wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
            if (!active) return;
            if (Array.isArray(res)) setGames(res);
          });
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubEvents();
      unsubGames();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  // Handle Deleting an Event
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    setIsProcessing(true);
    try {
      const userId = useAuthStore.getState().user?.id;
      wsService.emit('action', { 
        type: SocketAction.DELETE_EVENT, 
        payload: { id: eventToDelete.id, userId, orgId } 
      }, (res: any) => {
        setIsProcessing(false);
        setEventToDelete(null);
      });
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  // Helper to determine display name for event
  const getEventName = (event: Event) => {
    if (!event) return 'Unnamed Event';
    if (event.name) return event.name;

    const eventGames = (games || []).filter(g => g && g.eventId === event.id);
    if (event.type === 'SingleMatch' && eventGames.length === 1) {
      const game = eventGames[0];
      const p1 = game?.participants?.[0]?.teamId;
      const p2 = game?.participants?.[1]?.teamId;
      if (p1 && p2) {
        return `Game: ${p1} vs ${p2}`;
      }
    }
    return event.name || 'Unnamed Event';
  };

  // Filter & Sort Events
  const filteredEvents = (events || [])
    .filter(e => {
      if (!e) return false;
      const name = getEventName(e).toLowerCase();
      const matchesSearch = searchQuery ? name.includes(searchQuery.toLowerCase()) : true;
      if (!matchesSearch) return false;

      if (!e.startDate) {
        console.warn('[OrgEventsList] Event missing startDate:', e);
        return false;
      }

      const eventDate = new Date(e.startDate);
      if (isNaN(eventDate.getTime())) {
        console.warn('[OrgEventsList] Invalid startDate for event:', e.id, e.startDate);
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (viewMode === 'upcoming') {
        return eventDate >= today;
      } else {
        return eventDate < today;
      }
    })
    .sort((a, b) => {
      const dateA = a?.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b?.startDate ? new Date(b.startDate).getTime() : 0;
      return viewMode === 'upcoming' ? dateA - dateB : dateB - dateA;
    });

  console.log('[OrgEventsList] viewMode:', viewMode, 'Total events:', events.length, 'Filtered count:', filteredEvents.length);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Fixtures & Events
        </Text>
        <TouchableOpacity 
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => setIsAddMenuVisible(true)}
        >
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* SEARCH BAR */}
        <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-4 shadow-sm">
          <Ionicons name="search-outline" size={18} color={COLORS.dark.placeholder} />
          <TextInput
            placeholder="Search events by name..."
            placeholderTextColor={getThemeColor(isDark, 'placeholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.dark.placeholder} />
            </TouchableOpacity>
          )}
        </View>

        {/* UPCOMING / PAST VIEW SELECTOR */}
        <View className="flex-row bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200/50 dark:border-white/5 mb-6">
          <TouchableOpacity
            onPress={() => setViewMode('upcoming')}
            className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg"
            style={{
              backgroundColor: viewMode === 'upcoming' ? getThemeColor(isDark, 'surface') : 'transparent',
            }}
          >
            <Ionicons
              name="calendar"
              size={14}
              color={viewMode === 'upcoming' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              style={{ marginRight: 6 }}
            />
            <Text
              className="font-orbitron-bold text-xs uppercase tracking-widest"
              style={{
                color: viewMode === 'upcoming' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary'),
              }}
            >
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('past')}
            className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg"
            style={{
              backgroundColor: viewMode === 'past' ? getThemeColor(isDark, 'surface') : 'transparent',
            }}
          >
            <Ionicons
              name="time"
              size={14}
              color={viewMode === 'past' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')}
              style={{ marginRight: 6 }}
            />
            <Text
              className="font-orbitron-bold text-xs uppercase tracking-widest"
              style={{
                color: viewMode === 'past' ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary'),
              }}
            >
              Past
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color={COLORS.brand.orange} />
            <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-4 uppercase tracking-widest">
              Loading events...
            </Text>
          </View>
        ) : (
          <EventsErrorBoundary>
            <View className="space-y-4">
              {filteredEvents.map(event => {
                const eventGames = (games || []).filter(g => g && g.eventId === event.id);
                const isSportsDay = event.type === 'SportsDay';
                const isTournament = event.type === 'Tournament';
                const isContainer = isSportsDay || isTournament;
                const isEventOwner = event.orgId === orgId;

                return (
                <TouchableOpacity
                  key={event.id}
                  onPress={() => {
                    if (event.type === 'SingleMatch' && eventGames.length > 0) {
                      router.push(`/admin/${orgId}/events/${event.id}/games/${eventGames[0].id}/${isEventOwner ? 'edit' : 'view'}`);
                    } else {
                      router.push(`/admin/${orgId}/events/${event.id}`);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <GlassCard className="border border-slate-200 dark:border-white/5 p-5 relative">
                    {/* Right-Aligned Compact Actions */}
                    <View className="absolute right-4 top-4 flex-row items-center gap-1.5 z-10">
                      {event.type === 'SingleMatch' && eventGames.length > 0 ? (() => {
                        const singleGame = eventGames[0];
                        const perms = getMatchPermissions({
                          game: singleGame,
                          event,
                          currentOrgId: orgId,
                          user,
                          orgMemberships,
                          teamMemberships
                        });
                        return (
                          <>
                            <TouchableOpacity
                              onPress={(e: any) => {
                                if (e && e.stopPropagation) e.stopPropagation();
                                router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/view`);
                              }}
                              className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                            >
                              <Ionicons name="eye-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                            </TouchableOpacity>
                            {perms.canEdit && (
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/edit`);
                                }}
                                className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="pencil-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                              </TouchableOpacity>
                            )}
                            {perms.canSelectLineup && (
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/selection`);
                                }}
                                className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="people-outline" size={13} color={COLORS.brand.orange} />
                              </TouchableOpacity>
                            )}
                            {perms.canScore && (
                              <TouchableOpacity
                                onPress={(e: any) => {
                                  if (e && e.stopPropagation) e.stopPropagation();
                                  router.push(`/admin/${orgId}/events/${event.id}/games/${singleGame.id}/score`);
                                }}
                                className="w-7 h-7 bg-brand-orange/10 border border-brand-orange/30 rounded-lg items-center justify-center active:opacity-80"
                              >
                                <Ionicons name="trophy-outline" size={13} color={COLORS.brand.orange} />
                              </TouchableOpacity>
                            )}
                          </>
                        );
                      })() : (
                        <TouchableOpacity
                          onPress={(e: any) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            router.push(`/admin/${orgId}/events/${event.id}`);
                          }}
                          className="w-7 h-7 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-lg items-center justify-center active:opacity-80"
                        >
                          <Ionicons name="eye-outline" size={13} color={getThemeColor(isDark, 'textSecondary')} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <View className="flex-row items-center gap-2 mb-2 pr-12">
                      <View className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-md">
                        <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                          {event.type === 'SingleMatch' ? 'Single Match' : event.type === 'SportsDay' ? 'Sports Day' : 'Tournament'}
                        </Text>
                      </View>
                      {event.status === 'Cancelled' && (
                        <View className="bg-red-500/10 px-2 py-0.5 rounded-md">
                          <Text className="font-inter-bold text-[9px] text-brand-red uppercase tracking-widest">
                            Cancelled
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="pr-12">
                      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white mb-2 leading-tight">
                        {getEventName(event)}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-6 mt-2">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="calendar-outline" size={13} color={COLORS.dark.textSecondary} />
                        <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                          {event.startDate ? event.startDate.split('T')[0] : 'TBD'}
                        </Text>
                      </View>
                      {event.siteId && (
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="location-outline" size={13} color={COLORS.dark.textSecondary} />
                          <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                            {sites.find(s => s.id === event.siteId)?.name || 'Multi-site'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Render Nested Game Summaries */}
                    {eventGames.length > 0 && (
                      <View className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 space-y-2">
                        <Text className="font-orbitron text-[9px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1">
                          {isContainer ? `${eventGames.length} Scheduled Games` : 'Game Details'}
                        </Text>
                        {eventGames.slice(0, 3).map(game => (
                          <View key={game.id} className="flex-row justify-between items-center bg-slate-50 dark:bg-white/5 p-2 rounded-lg">
                            <Text className="font-inter text-[11px] text-slate-800 dark:text-white flex-1" numberOfLines={1}>
                              {game.participants?.[0]?.teamId || 'TBD'} vs {game.participants?.[1]?.teamId || 'TBD'}
                            </Text>
                            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 pl-2">
                              {game.status}
                            </Text>
                          </View>
                        ))}
                        {eventGames.length > 3 && (
                          <Text className="font-inter text-[10px] text-brand-orange text-center mt-1">
                            + {eventGames.length - 3} more games
                          </Text>
                        )}
                      </View>
                    )}
                  </GlassCard>
                </TouchableOpacity>
              );
              })}

              {filteredEvents.length === 0 && (
                <View className="items-center justify-center py-16">
                  <Ionicons name="calendar-outline" size={48} color={COLORS.dark.textSecondary} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                    No {viewMode} Events
                  </Text>
                  <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                    Click the plus icon in the header to schedule a single match, sports day, or tournament.
                  </Text>
                </View>
              )}
            </View>
          </EventsErrorBoundary>
        )}
      </ScrollView>

      {/* Floating Action Button Popover Modal */}
      <Modal
        visible={isAddMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddMenuVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/60 justify-end"
          activeOpacity={1}
          onPress={() => setIsAddMenuVisible(false)}
        >
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-white/5">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider">
                Create Event
              </Text>
              <TouchableOpacity onPress={() => setIsAddMenuVisible(false)}>
                <Ionicons name="close" size={24} color={getThemeColor(isDark, 'textPrimary')} />
              </TouchableOpacity>
            </View>

            <View className="space-y-3">
              <TouchableOpacity
                className="flex-row items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 active:bg-slate-100 dark:active:bg-white/10"
                onPress={() => {
                  setIsAddMenuVisible(false);
                  router.push(`/admin/${orgId}/events/create?type=game`);
                }}
              >
                <View className="w-10 h-10 rounded-full bg-brand-orange/15 items-center justify-center mr-4">
                  <Ionicons name="trophy" size={20} color={COLORS.brand.orange} />
                </View>
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                    Schedule Single Match
                  </Text>
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Standard head-to-head game between two teams
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-row items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 active:bg-slate-100 dark:active:bg-white/10"
                onPress={() => {
                  setIsAddMenuVisible(false);
                  router.push(`/admin/${orgId}/events/create?type=sportsday`);
                }}
              >
                <View className="w-10 h-10 rounded-full bg-brand-blue/15 items-center justify-center mr-4">
                  <Ionicons name="analytics" size={20} color={COLORS.brand.blue} />
                </View>
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                    Create Sports Day
                  </Text>
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Multi-organization, multi-sport event
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-row items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 active:bg-slate-100 dark:active:bg-white/10"
                onPress={() => {
                  setIsAddMenuVisible(false);
                  router.push(`/admin/${orgId}/events/create?type=tournament`);
                }}
              >
                <View className="w-10 h-10 rounded-full bg-brand-green/15 items-center justify-center mr-4">
                  <Ionicons name="ribbon" size={20} color={COLORS.brand.green} />
                </View>
                <View className="flex-1">
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">
                    Create Tournament
                  </Text>
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Bracket or pool-based competition
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Confirmation Modal for Deleting Events */}
      <ConfirmationModal
        isOpen={eventToDelete !== null}
        title="Delete Event?"
        description={`Are you sure you want to permanently delete "${
          eventToDelete ? getEventName(eventToDelete) : ''
        }"? All scheduled games and standings associated with this event will be deleted.`}
        confirmText="Delete Event"
        cancelText="Cancel"
        onConfirm={handleDeleteEvent}
        onClose={() => setEventToDelete(null)}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
