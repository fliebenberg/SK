import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { YStack, XStack, Text, H1, Theme, useTheme } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Activity } from 'lucide-react-native';
import { store } from '../store/store';
import { MetalButton } from '../components/ui/MetalButton';
import { MetalCard } from '../components/ui/MetalCard';
import { Game } from '@sk/types';

export default function LivePage() {
  const [games, setGames] = useState<Game[]>(() => store.getGames());
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    const update = () => {
      setGames([...store.getGames()]);
    };
    
    update(); // Initial sync
    store.subscribeToLiveGames();
    const unsubscribe = store.subscribe(update);
    
    return () => {
      unsubscribe();
      store.unsubscribeFromLiveGames();
    };
  }, []);

  const getTeamName = (id: string) => {
    return store.getTeams().find((t) => t.id === id)?.name || 'Unknown';
  };

  // Sort games: Live first, then Scheduled by date
  const sortedGames = [...games].sort((a, b) => {
    if (a.status === 'Live' && b.status !== 'Live') return -1;
    if (a.status !== 'Live' && b.status === 'Live') return 1;
    
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeA - timeB;
  });

  return (
    <Theme name="dark">
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top || 16 }]}
      >
        <YStack padding="$5" gap="$6" flex={1} width="100%">
          {/* Header */}
          <YStack gap="$2" alignItems="center">
            <H1 fontFamily="$heading" fontSize={28} fontWeight="900" color="$color" textAlign="center">
              LIVE SCORES & SCHEDULE
            </H1>
            <Text fontSize={14} color="$gray10" textAlign="center">
              Follow your favorite teams in real-time.
            </Text>
          </YStack>

          {/* Games Grid */}
          <XStack gap="$4" flexWrap="wrap" width="100%">
            {sortedGames.map((game) => {
              const isLive = game.status === 'Live';
              const p1 = game.participants?.[0]?.teamId;
              const p2 = game.participants?.[1]?.teamId;

              const getScore = (index: number) => {
                if (game.status === 'Finished' && game.finalScoreData) {
                  return game.finalScoreData[index === 0 ? 'home' : 'away'] ?? 0;
                }
                if (game.liveState) {
                  return game.liveState[index === 0 ? 'home' : 'away'] ?? 0;
                }
                return 0;
              };

              return (
                <MetalCard
                  key={game.id}
                  variant={isLive ? 'gold' : 'default'}
                  style={[
                    styles.gameCard,
                    isLive && { borderColor: '#ef4444', borderWidth: 1.5 }
                  ]}
                >
                  <YStack gap="$4" padding="$4">
                    {/* Game Status Header */}
                    <XStack justifyContent="space-between" alignItems="center">
                      <XStack gap="$1.5" alignItems="center">
                        {isLive && (
                          <View style={styles.liveIndicatorRing} />
                        )}
                        <Text
                          fontSize={11}
                          fontWeight="900"
                          color={isLive ? '#ef4444' : game.status === 'Finished' ? '$gray10' : '#3b82f6'}
                          backgroundColor={isLive ? 'rgba(239,68,68,0.1)' : game.status === 'Finished' ? 'rgba(255,255,255,0.05)' : 'rgba(59,130,246,0.1)'}
                          paddingHorizontal="$2.5"
                          paddingVertical="$1"
                          borderRadius={99}
                          borderWidth={1}
                          borderColor={isLive ? 'rgba(239,68,68,0.2)' : game.status === 'Finished' ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.2)'}
                        >
                          {isLive ? 'LIVE' : game.status.toUpperCase()}
                        </Text>
                      </XStack>

                      <XStack gap="$1.5" alignItems="center">
                        <Calendar size={13} color="#64748b" />
                        <Text fontSize={12} color="$gray10" fontFamily="$mono">
                          {game.startTime ? new Date(game.startTime).toLocaleDateString() : 'TBD'}
                        </Text>
                      </XStack>
                    </XStack>

                    {/* Matchup Teams */}
                    <YStack gap="$2" alignItems="center" marginVertical="$2">
                      <XStack justifyContent="space-between" width="100%" alignItems="center" gap="$2">
                        <Text fontSize={15} fontWeight="800" color="$color" flex={1} textAlign="right" numberOfLines={1} fontFamily="$heading">
                          {p1 ? getTeamName(p1) : 'Unknown'}
                        </Text>
                        <Text fontSize={11} color="$gray9" fontWeight="800" paddingHorizontal="$2">
                          VS
                        </Text>
                        <Text fontSize={15} fontWeight="800" color="$color" flex={1} textAlign="left" numberOfLines={1} fontFamily="$heading">
                          {p2 ? getTeamName(p2) : 'Unknown'}
                        </Text>
                      </XStack>

                      {/* Scores Panel */}
                      <XStack
                        backgroundColor="#0d0d0f"
                        borderRadius={8}
                        borderWidth={1}
                        borderColor="#1f1f23"
                        paddingVertical="$3.5"
                        paddingHorizontal="$6"
                        gap="$4"
                        alignItems="center"
                        justifyContent="center"
                        width="100%"
                        marginTop="$3"
                      >
                        <Text fontSize={28} fontWeight="900" color="$color" fontFamily="$heading">
                          {getScore(0)}
                        </Text>
                        <Text fontSize={18} color="$gray9">
                          -
                        </Text>
                        <Text fontSize={28} fontWeight="900" color="$color" fontFamily="$heading">
                          {getScore(1)}
                        </Text>
                      </XStack>
                    </YStack>

                    <MetalButton
                      variantType={isLive ? 'filled' : 'outlined'}
                      glowColor={isLive ? '#ef4444' : primaryColor}
                      href="/admin"
                      size="sm"
                    >
                      {isLive ? 'Spectate Match' : 'View Details'}
                    </MetalButton>
                  </YStack>
                </MetalCard>
              );
            })}

            {games.length === 0 && (
              <YStack
                flex={1}
                width="100%"
                padding="$8"
                alignItems="center"
                justifyContent="center"
                borderRadius={16}
                borderWidth={1}
                borderColor="$gray4"
                borderStyle="dashed"
                backgroundColor="#0d0d0f"
                gap="$2"
              >
                <Text color="$gray10" fontSize={16} fontWeight="600">
                  No games scheduled.
                </Text>
                <Text color="$gray9" fontSize={13}>
                  Matches and live scoring are managed by tournament administrators.
                </Text>
              </YStack>
            )}
          </XStack>
        </YStack>
      </ScrollView>
    </Theme>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070708',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  gameCard: {
    width: '100%',
    minWidth: 280,
    flex: 1,
    maxWidth: 380,
  },
  liveIndicatorRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
});
