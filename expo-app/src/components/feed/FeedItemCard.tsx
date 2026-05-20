import React from 'react';
import { FeedItem } from '@sk/types';
import { YStack, XStack, Text, Theme } from 'tamagui';
import { Calendar } from 'lucide-react-native';
import { store } from '../../store/store';
import { formatTime, formatDate } from '../../lib/utils';
import { StyleSheet, Pressable } from 'react-native';

interface FeedItemCardProps {
  item: FeedItem;
  onPress?: () => void;
}

export const FeedItemCard = ({ item, onPress }: FeedItemCardProps) => {
  const homeTeamId = item.game.participants?.[0]?.teamId;
  const awayTeamId = item.game.participants?.[1]?.teamId;

  const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
  const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;

  const homeParticipantId = item.game.participants?.[0]?.id;
  const awayParticipantId = item.game.participants?.[1]?.id;
  const homeScore = (homeParticipantId && item.game.liveState?.scores?.[homeParticipantId]) ?? item.game.finalScoreData?.home ?? 0;
  const awayScore = (awayParticipantId && item.game.liveState?.scores?.[awayParticipantId]) ?? item.game.finalScoreData?.away ?? 0;

  return (
    <Theme name="dark">
      <Pressable onPress={onPress} style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
        <XStack gap="$4" alignItems="center" width="100%">
          
          {/* Time Badge (sunken style container) */}
          <YStack 
            alignItems="center" 
            justifyContent="center" 
            backgroundColor="#27272a" 
            borderRadius={8} 
            paddingVertical="$2" 
            paddingHorizontal="$3"
            minWidth={75}
          >
            <Text fontSize={10} fontWeight="700" color="$gray10" textTransform="uppercase">
              {formatDate(item.game.startTime || '', true)}
            </Text>
            <Text fontSize={13} fontWeight="800" color="$color" marginTop="$1">
              {formatTime(item.game.startTime || '')}
            </Text>
          </YStack>

          {/* Details Section */}
          <YStack flex={1} gap="$1" minWidth={0}>
            {item.type === 'upcoming' && (
              <XStack gap="$1.5" alignItems="center">
                <Calendar size={12} color="#10b981" />
                <Text fontSize={11} fontWeight="700" color="#10b981">
                  Upcoming Match
                </Text>
              </XStack>
            )}
            {item.type === 'recent' && (
              <Text fontSize={11} fontWeight="700" color="$gray9">
                Final Score
              </Text>
            )}
            <Text 
              fontWeight="800" 
              fontSize={14} 
              color="$color" 
              numberOfLines={1} 
              ellipsizeMode="tail"
            >
              {homeTeam?.name || 'Home'} vs {awayTeam?.name || 'Away'}
            </Text>
            <Text 
              fontSize={12} 
              color="$gray10" 
              numberOfLines={1} 
              ellipsizeMode="tail"
            >
              {item.event?.name || 'Friendly Match'}
            </Text>
          </YStack>

          {/* Scores Display */}
          <YStack alignItems="flex-end" paddingRight="$2">
            {item.type === 'recent' ? (
              <Text fontFamily="$heading" fontSize={16} fontWeight="900" color="$color" letterSpacing={-0.5}>
                {homeScore} - {awayScore}
              </Text>
            ) : (
              <Text fontSize={12} fontWeight="800" color="$gray8">
                VS
              </Text>
            )}
          </YStack>

        </XStack>
      </Pressable>
    </Theme>
  );
};

const styles = StyleSheet.create({
  pressable: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    backgroundColor: '#09090b',
    width: '100%',
  },
  pressed: {
    backgroundColor: '#18181b',
  },
});
