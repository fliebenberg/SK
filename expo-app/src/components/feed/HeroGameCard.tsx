import React, { useState, useEffect } from 'react';
import { Game } from '@sk/types';
import { YStack, XStack, Text, Theme } from 'tamagui';
import { Trophy } from 'lucide-react-native';
import { store } from '../../store/store';
import { formatTime } from '../../lib/utils';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

interface HeroGameCardProps {
  game: Game;
}

export const HeroGameCard = ({ game }: HeroGameCardProps) => {
  const isLive = game.status === 'Live';

  const homeTeamId = game.participants?.[0]?.teamId;
  const awayTeamId = game.participants?.[1]?.teamId;

  const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
  const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;

  const homeParticipantId = game.participants?.[0]?.id;
  const awayParticipantId = game.participants?.[1]?.id;
  const homeScore = (homeParticipantId && game.liveState?.scores?.[homeParticipantId]) ?? game.finalScoreData?.home ?? 0;
  const awayScore = (awayParticipantId && game.liveState?.scores?.[awayParticipantId]) ?? game.finalScoreData?.away ?? 0;

  // Let's add a pulsing effect for live games using a simple hook
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      setPulse((p) => !p);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  return (
    <Theme name="dark">
      <View style={styles.cardContainer}>
        {/* Glow backdrop for live games */}
        {isLive && (
          <LinearGradient
            colors={['rgba(239,68,68,0.2)', 'rgba(249,115,22,0.2)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.liveGlow}
          />
        )}

        <YStack gap="$3" zIndex={1} position="relative" padding="$5">
          
          {/* Header Row: Start Time & Live Badge */}
          <XStack justifyContent="space-between" alignItems="center">
            <Text color="$gray9" fontSize={11} fontWeight="700" letterSpacing={1}>
              {game.startTime ? formatTime(game.startTime) : 'TBD'}
            </Text>
            {isLive ? (
              <XStack gap="$1.5" alignItems="center">
                <View 
                  style={[
                    styles.pingDot, 
                    { opacity: pulse ? 1 : 0.4 }
                  ]} 
                />
                <Text color="#ef4444" fontSize={11} fontWeight="800" letterSpacing={1}>
                  LIVE
                </Text>
              </XStack>
            ) : (
              <Text color="$gray10" fontSize={11} fontWeight="800" letterSpacing={1}>
                {game.status.toUpperCase()}
              </Text>
            )}
          </XStack>

          {/* Teams and Scores Display */}
          <XStack alignItems="center" justifyContent="space-between" marginTop="$2">
            
            {/* Home Team */}
            <YStack alignItems="center" gap="$2" flex={1}>
              <View style={styles.avatarCircle}>
                <Trophy size={20} color="#71717a" />
              </View>
              <Text 
                fontWeight="700" 
                color="$color" 
                fontSize={13} 
                textAlign="center" 
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {homeTeam?.name || 'Home Team'}
              </Text>
            </YStack>

            {/* Score Center */}
            <YStack alignItems="center" paddingHorizontal="$3">
              <Text 
                fontFamily="$heading" 
                fontSize={24} 
                fontWeight="900" 
                letterSpacing={-1} 
                color="$color"
              >
                {homeScore} - {awayScore}
              </Text>
            </YStack>

            {/* Away Team */}
            <YStack alignItems="center" gap="$2" flex={1}>
              <View style={styles.avatarCircle}>
                <Trophy size={20} color="#71717a" />
              </View>
              <Text 
                fontWeight="700" 
                color="$color" 
                fontSize={13} 
                textAlign="center" 
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {awayTeam?.name || 'Away Team'}
              </Text>
            </YStack>

          </XStack>
        </YStack>
      </View>
    </Theme>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#27272a',
    backgroundColor: '#18181b',
    width: 280,
    marginRight: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  liveGlow: {
    position: 'absolute',
    left: -20,
    top: -20,
    right: -20,
    bottom: -20,
    opacity: 0.6,
  },
  pingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
