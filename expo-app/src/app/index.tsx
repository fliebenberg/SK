import React from 'react';
import { ScrollView } from 'react-native';
import { YStack, XStack, Text, Button, Card, H1, Paragraph, Theme } from 'tamagui';
import { Flame, Trophy, Users, Wifi } from 'lucide-react-native';
import { SocketAction } from '@sk/types';

export default function HomeScreen() {
  return (
    <Theme name="dark">
      <ScrollView style={{ flex: 1, backgroundColor: '#09090b' }}>
        <YStack padding="$5" gap="$6" flex={1}>
          {/* Header Section */}
          <YStack gap="$2" alignItems="center" marginTop="$4">
            <XStack gap="$2" alignItems="center">
              <Trophy size={32} color="#f59e0b" />
              <H1 fontSize="$9" color="$yellow10" fontWeight="800" letterSpacing={1}>
                SCOREKEEPER
              </H1>
            </XStack>
            <Paragraph color="$gray10" fontSize="$4" textAlign="center">
              Universal Sports Management & Scoring Engine
            </Paragraph>
          </YStack>

          {/* Quick Stats Grid */}
          <XStack gap="$3" flexWrap="wrap" justifyContent="space-between">
            <Card elevation="$3" borderWidth={1} borderColor="$yellow5" size="$3" flex={1} flexBasis="45%" minWidth={140} padding="$4" gap="$2" theme="yellow">
              <YStack alignItems="center" gap="$2">
                <Flame size={24} color="#f59e0b" />
                <Text fontWeight="bold" color="$yellow10">Live Games</Text>
                <Text fontSize="$8" fontWeight="800" textAlign="center" color="$yellow10">12</Text>
              </YStack>
            </Card>

            <Card elevation="$3" borderWidth={1} borderColor="$blue5" size="$3" flex={1} flexBasis="45%" minWidth={140} padding="$4" gap="$2" theme="blue">
              <YStack alignItems="center" gap="$2">
                <Users size={24} color="#3b82f6" />
                <Text fontWeight="bold" color="$blue10">Active Teams</Text>
                <Text fontSize="$8" fontWeight="800" textAlign="center" color="$blue10">48</Text>
              </YStack>
            </Card>
          </XStack>

          {/* Verification / Integration Status */}
          <YStack borderWidth={1} borderColor="$gray5" padding="$4" borderRadius="$4" gap="$3" backgroundColor="#18181b">
            <XStack alignItems="center" gap="$2" justifyContent="center">
              <Wifi size={18} color="#10b981" />
              <Text color="$green10" fontWeight="bold" fontSize="$3">INTEGRATION VERIFIED</Text>
            </XStack>
            
            <YStack gap="$2">
              <XStack justifyContent="space-between" paddingHorizontal="$2">
                <Text color="$gray9">UI Engine:</Text>
                <Text color="$white" fontWeight="bold">Tamagui v3</Text>
              </XStack>
              <XStack justifyContent="space-between" paddingHorizontal="$2">
                <Text color="$gray9">Shared Package:</Text>
                <Text color="$white" fontWeight="bold">@sk/types</Text>
              </XStack>
              <XStack justifyContent="space-between" paddingHorizontal="$2">
                <Text color="$gray9">Test Enum Key:</Text>
                <Text color="$yellow10" fontWeight="bold" fontSize="$2">
                  SocketAction.{SocketAction.ADD_GAME}
                </Text>
              </XStack>
            </YStack>
          </YStack>

          {/* Interactive Button Group */}
          <YStack gap="$3">
            <Button size="$4" theme="active" icon={Trophy}>
              Start Match
            </Button>
            <Button size="$4" chromeless>
              View Tournament Brackets
            </Button>
          </YStack>
        </YStack>
      </ScrollView>
    </Theme>
  );
}
