import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Card } from 'tamagui';
import { 
  Plus, 
  ArrowLeft, 
  Calendar, 
  History, 
  Search, 
  Trophy, 
  MapPin, 
  Activity, 
  Clock, 
  Trash2
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { store } from '../../../../store/store';
import { MetalButton } from '../../../../components/ui/MetalButton';
import { MetalCard } from '../../../../components/ui/MetalCard';
import { Input } from '../../../../components/ui/Input';
import { Event, Game } from '@sk/types';

export default function EventsManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [events, setEvents] = useState<Event[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Search & Tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'upcoming' | 'past'>('upcoming');

  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    if (!id) return;

    store.subscribeToOrganization(id);
    store.subscribeToOrganizationData(id);

    const updateData = () => {
      setEvents(store.getEvents(id));
      setGames(store.getGames());
      const org = store.getOrganization(id);
      if (org) {
        setOrgName(org.name);
      }
      setIsLoading(false);
    };

    updateData();
    const unsubscribe = store.subscribe(updateData);

    return () => {
      unsubscribe();
      store.unsubscribeFromOrganization(id);
      store.unsubscribeFromOrganizationData(id);
    };
  }, [id]);

  const getDisplayName = (event: Event) => {
    if (event.name) return event.name;
    
    const eventGames = games.filter(g => g.eventId === event.id);
    if (eventGames.length === 1) {
      const game = eventGames[0];
      const homeTeamId = game.participants?.[0]?.teamId;
      const awayTeamId = game.participants?.[1]?.teamId;
      const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : undefined;
      const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : undefined;
      
      if (homeTeam && awayTeam) {
        const homeOrg = store.getOrganization(homeTeam.orgId);
        const awayOrg = store.getOrganization(awayTeam.orgId);
        
        const homeChunk = `${homeOrg?.shortName || homeOrg?.name || ''} ${homeTeam.name}`;
        const awayChunk = `${awayOrg?.shortName || awayOrg?.name || ''} ${awayTeam.name}`;
        return `${homeChunk} vs ${awayChunk}`;
      }
    }
    return event.name || 'Unnamed Event';
  };

  const getEventDate = (event: Event) => {
    const rawStr = event.startDate || event.date;
    if (!rawStr) return null;
    
    // Priority: use specific game's startTime day if available
    const eventGames = games.filter(g => g.eventId === event.id);
    const mainGameWithTime = eventGames.find(g => g.scheduledStartTime || g.startTime);
    
    let sourceStr = mainGameWithTime?.scheduledStartTime || mainGameWithTime?.startTime || rawStr;
    
    if (event.type === 'SingleMatch' && rawStr && (mainGameWithTime?.scheduledStartTime || mainGameWithTime?.startTime)) {
      const datePart = rawStr.split('T')[0];
      const timePart = (mainGameWithTime?.scheduledStartTime || mainGameWithTime?.startTime || '').split('T')[1] || '00:00:00';
      sourceStr = `${datePart}T${timePart}`;
    }

    const dStr = sourceStr.split('T')[0];
    const components = dStr.split('-').map(Number);
    if (components.length !== 3 || components.some(isNaN)) return null;
    const [y, m, d] = components;
    return new Date(y, m - 1, d);
  };

  const handleDeleteEvent = (event: Event) => {
    const displayName = getDisplayName(event);
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete ${displayName}? This action cannot be undone and will remove all associated games.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await store.deleteEvent(event.id);
              Alert.alert('Success', `Event was deleted successfully.`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete event.');
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  };

  const formatCleanDate = (date: Date) => {
    return date.toLocaleDateString(undefined, { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatCleanTime = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const matches = timeStr.match(/T(\d{2}):(\d{2})/);
      if (matches) {
        return `${matches[1]}:${matches[2]}`;
      }
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`;
      }
    } catch (e) {}
    return timeStr;
  };

  if (isLoading) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$3">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text color="$gray10" fontSize={14}>Loading scheduled events...</Text>
        </YStack>
      </Theme>
    );
  }

  // Filter events
  const filteredEvents = events.filter(e => {
    const displayName = getDisplayName(e).toLowerCase();
    const matchesSearch = displayName.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    const eventDate = getEventDate(e);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // start of today

    if (eventDate) {
      eventDate.setHours(0, 0, 0, 0);
    }

    if (viewMode === 'upcoming') {
      return !eventDate || eventDate >= now;
    } else {
      return !!(eventDate && eventDate < now);
    }
  }).sort((a, b) => {
    const dateAStr = a.startDate || a.date || '';
    const dateBStr = b.startDate || b.date || '';
    
    if (viewMode === 'upcoming') {
      return dateAStr.localeCompare(dateBStr);
    } else {
      return dateBStr.localeCompare(dateAStr);
    }
  });

  return (
    <Theme name="dark">
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <YStack padding="$5" gap="$6" flex={1} width="100%">
          
          {/* Action Header */}
          <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
            <MetalButton 
              variantType="outlined" 
              size="sm"
              onPress={() => router.push(`/admin/organizations/${id}`)}
              icon={<ArrowLeft size={14} color={primaryColor} />}
            >
              Dashboard
            </MetalButton>

            <MetalButton 
              variantType="filled" 
              glowColor={primaryColor}
              size="sm"
              onPress={() => router.push(`/admin/organizations/${id}/events/create`)}
              icon={<Plus size={14} color="#ffffff" />}
            >
              Add Event
            </MetalButton>
          </XStack>

          {/* Page Title */}
          <YStack gap="$1.5">
            <H1 
              fontFamily="$heading" 
              fontSize={24} 
              color="$yellow10" 
              fontWeight="900" 
              letterSpacing={1.5}
            >
              EVENTS SCHEDULE
            </H1>
            <Paragraph color="$gray10" fontSize={13}>
              {orgName ? `Matches & tournaments for ${orgName}` : 'Manage organization events'}
            </Paragraph>
          </YStack>

          {/* Tabs Control Row */}
          <XStack backgroundColor="#18181b" padding="$1.5" borderRadius={12} gap="$2" width="100%">
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[
                styles.tabBtn, 
                viewMode === 'upcoming' ? { backgroundColor: primaryColor } : null
              ]}
              onPress={() => setViewMode('upcoming')}
            >
              <XStack gap="$2" alignItems="center" justifyContent="center">
                <Calendar size={14} color={viewMode === 'upcoming' ? '#000000' : '#a1a1aa'} />
                <Text fontSize={13} fontWeight="900" color={viewMode === 'upcoming' ? '#000000' : '$gray10'}>
                  UPCOMING
                </Text>
              </XStack>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.8}
              style={[
                styles.tabBtn, 
                viewMode === 'past' ? { backgroundColor: primaryColor } : null
              ]}
              onPress={() => setViewMode('past')}
            >
              <XStack gap="$2" alignItems="center" justifyContent="center">
                <History size={14} color={viewMode === 'past' ? '#000000' : '#a1a1aa'} />
                <Text fontSize={13} fontWeight="900" color={viewMode === 'past' ? '#000000' : '$gray10'}>
                  PAST ACTIONS
                </Text>
              </XStack>
            </TouchableOpacity>
          </XStack>

          {/* Search bar */}
          <XStack position="relative" alignItems="center" width="100%">
            <Input
              placeholder="Search by event or team name..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              paddingLeft={40}
              flex={1}
            />
            <Search size={16} color="#71717a" style={{ position: 'absolute', left: 14 }} />
          </XStack>

          {/* Events List */}
          <YStack gap="$5">
            {filteredEvents.map((event) => {
              const eventGames = games.filter(g => g.eventId === event.id);
              const eventDate = getEventDate(event);
              const isContainerEvent = event.type === 'SportsDay' || event.type === 'Tournament';

              return (
                <MetalCard 
                  key={event.id} 
                  variant="dark" 
                  hasRivets={isContainerEvent}
                  padding="$4" 
                  gap="$3"
                  style={isContainerEvent ? styles.containerCard : null}
                >
                  {/* Event Title Row */}
                  <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
                    <YStack flex={1} minWidth={0} gap="$1">
                      <XStack alignItems="center" gap="$2" flexWrap="wrap">
                        {event.type === 'Tournament' ? (
                          <Trophy size={16} color="#f59e0b" />
                        ) : (
                          <Activity size={16} color={primaryColor} />
                        )}
                        <Text fontWeight="900" fontSize={16} color="$color" numberOfLines={1}>
                          {getDisplayName(event)}
                        </Text>
                      </XStack>
                      <XStack gap="$3" alignItems="center" flexWrap="wrap">
                        <XStack gap="$1" alignItems="center">
                          <Clock size={11} color="$gray10" />
                          <Text fontSize={11} color="$gray10">
                            {eventDate ? formatCleanDate(eventDate) : 'No date specified'}
                          </Text>
                        </XStack>
                        <XStack backgroundColor="#27272a" paddingHorizontal="$2" paddingVertical="$0.5" borderRadius={6}>
                          <Text fontSize={9} fontWeight="900" color="$yellow10">
                            {(event.type || 'SingleMatch').toUpperCase()}
                          </Text>
                        </XStack>
                      </XStack>
                    </YStack>

                    <MetalButton
                      variantType="outlined"
                      size="icon"
                      style={styles.deleteBtn}
                      disabled={isProcessing}
                      onPress={() => handleDeleteEvent(event)}
                      icon={<Trash2 size={12} color="#ef4444" />}
                    />
                  </XStack>

                  {/* Games / Matches nested in the Event */}
                  <YStack gap="$2.5" marginTop="$2" borderTopWidth={1} borderTopColor="#27272a" paddingTop="$3">
                    {eventGames.map((game) => {
                      const homeTeamId = game.participants?.[0]?.teamId;
                      const awayTeamId = game.participants?.[1]?.teamId;
                      const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : undefined;
                      const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : undefined;
                      
                      const facility = game.facilityId ? store.getFacility(game.facilityId) : undefined;
                      const site = game.siteId ? store.getSite(game.siteId) : undefined;

                      const isCompleted = game.status === 'Finished';
                      const homeParticipantId = game.participants?.[0]?.id;
                      const awayParticipantId = game.participants?.[1]?.id;
                      const homeScore = (homeParticipantId && game.liveState?.scores?.[homeParticipantId]) ?? game.finalScoreData?.home ?? 0;
                      const awayScore = (awayParticipantId && game.liveState?.scores?.[awayParticipantId]) ?? game.finalScoreData?.away ?? 0;

                      return (
                        <Card 
                          key={game.id} 
                          backgroundColor="#18181b" 
                          borderWidth={1} 
                          borderColor="#27272a" 
                          padding="$3" 
                          borderRadius={10}
                          gap="$2"
                        >
                          {/* Teams & Scores row */}
                          <XStack justifyContent="space-between" alignItems="center">
                            <YStack gap="$1.5" flex={1} minWidth={0}>
                              <XStack gap="$2.5" alignItems="center">
                                <XStack width={6} height={6} borderRadius={3} backgroundColor={primaryColor} />
                                <Text fontSize={13} fontWeight="800" color="$color" numberOfLines={1} flex={1}>
                                  {homeTeam ? homeTeam.name : 'TBD Home Team'}
                                </Text>
                              </XStack>
                              <XStack gap="$2.5" alignItems="center">
                                <XStack width={6} height={6} borderRadius={3} backgroundColor="#f59e0b" />
                                <Text fontSize={13} fontWeight="800" color="$color" numberOfLines={1} flex={1}>
                                  {awayTeam ? awayTeam.name : 'TBD Away Team'}
                                </Text>
                              </XStack>
                            </YStack>

                            {/* Scores or scheduling */}
                            {isCompleted ? (
                              <YStack gap="$1.5" alignItems="flex-end" paddingLeft="$4">
                                <Text fontSize={13} fontWeight="900" color={homeScore > awayScore ? '$color' : '$gray10'}>
                                  {homeScore}
                                </Text>
                                <Text fontSize={13} fontWeight="900" color={awayScore > homeScore ? '$color' : '$gray10'}>
                                  {awayScore}
                                </Text>
                              </YStack>
                            ) : (
                              <YStack alignItems="flex-end" paddingLeft="$4" gap="$1">
                                <Clock size={11} color="$yellow10" />
                                <Text fontSize={11} fontWeight="800" color="$yellow10">
                                  {game.scheduledStartTime ? formatCleanTime(game.scheduledStartTime) : (game.startTime ? formatCleanTime(game.startTime) : 'TBD')}
                                </Text>
                              </YStack>
                            )}
                          </XStack>

                          {/* Location details */}
                          {(facility || site) && (
                            <XStack gap="$1" alignItems="center" borderTopWidth={1} borderTopColor="#27272a" paddingTop="$2" marginTop="$1">
                              <MapPin size={10} color="$gray9" />
                              <Text fontSize={10} color="$gray9" numberOfLines={1}>
                                {facility ? facility.name : ''}{facility && site ? ' • ' : ''}{site ? site.name : ''}
                              </Text>
                            </XStack>
                          )}

                          {/* Quick details edit */}
                          <MetalButton
                            variantType="outlined"
                            size="sm"
                            style={{ alignSelf: 'flex-end', height: 24, paddingVertical: 0, paddingHorizontal: 10, marginTop: 4 }}
                            onPress={() => {
                              if (event.type === 'SingleMatch') {
                                router.push(`/admin/organizations/${id}/events/${event.id}`);
                              } else {
                                router.push(`/admin/organizations/${id}/events/${event.id}/games/${game.id}/edit`);
                              }
                            }}
                          >
                            <Text fontSize={10} fontWeight="700">Configure Game</Text>
                          </MetalButton>
                        </Card>
                      );
                    })}

                    {eventGames.length === 0 && (
                      <Text fontSize={11} fontStyle="italic" color="$gray9" textAlign="center" padding="$2">
                        No matches scheduled under this event
                      </Text>
                    )}
                  </YStack>

                </MetalCard>
              );
            })}

            {filteredEvents.length === 0 && (
              <YStack 
                borderRadius={12} 
                borderWidth={1} 
                borderStyle="dashed" 
                borderColor="$gray6" 
                padding="$10" 
                alignItems="center" 
                justifyContent="center"
                backgroundColor="#0d0d0f"
                gap="$2"
              >
                <Calendar size={24} color="#71717a" />
                <Text color="$gray10" fontSize={13} textAlign="center">
                  {searchQuery ? 'No events found matching search query.' : (viewMode === 'upcoming' ? 'No upcoming events scheduled. Create one above!' : 'No historical past events registered.')}
                </Text>
              </YStack>
            )}
          </YStack>

        </YStack>
      </ScrollView>
    </Theme>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  containerCard: {
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1.5,
    backgroundColor: 'rgba(9, 9, 11, 0.95)'
  }
});
