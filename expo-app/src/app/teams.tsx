import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { YStack, XStack, Text, H1, Theme, useTheme } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, Plus } from 'lucide-react-native';
import { store } from '../store/store';
import { MetalButton } from '../components/ui/MetalButton';
import { MetalCard } from '../components/ui/MetalCard';
import { Team } from '@sk/types';

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>(() => store.getTeams());
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    const updateTeams = () => {
      setTeams([...store.getTeams()]);
    };
    updateTeams();
    const unsubscribe = store.subscribe(updateTeams);
    return () => unsubscribe();
  }, []);

  return (
    <Theme name="dark">
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top || 16 }]}
      >
        <YStack padding="$5" gap="$6" flex={1} width="100%">
          {/* Header */}
          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$4">
            <YStack gap="$1.5">
              <H1 fontFamily="$heading" fontSize={32} fontWeight="900" color="$color">
                TEAMS
              </H1>
              <Text fontSize={14} color="$gray10">
                Manage your sports teams and rosters.
              </Text>
            </YStack>

            <MetalButton
              variantType="filled"
              glowColor={primaryColor}
              href="/admin"
              icon={<Plus size={16} color="#ffffff" />}
            >
              Add Team
            </MetalButton>
          </XStack>

          {/* Teams Grid */}
          <XStack gap="$4" flexWrap="wrap" width="100%">
            {teams.map((team) => {
              const sport = store.getSport(team.sportId);
              return (
                <MetalCard
                  key={team.id}
                  variant="default"
                  style={styles.teamCard}
                >
                  <YStack gap="$4" padding="$4">
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text fontFamily="$heading" fontSize={18} fontWeight="800" color="$color">
                        {team.name}
                      </Text>
                      <YStack
                        backgroundColor="#1e1e2f"
                        padding="$2"
                        borderRadius={99}
                        borderWidth={1}
                        borderColor="#3b3b4f"
                      >
                        <Users size={18} color={primaryColor} />
                      </YStack>
                    </XStack>

                    <Text fontSize={13} color="$gray10">
                      <Text fontWeight="700" color={primaryColor}>
                        {sport?.name || 'Unknown Sport'}
                      </Text>{' '}
                      • {team.ageGroup || 'All Ages'}
                    </Text>

                    <MetalButton
                      variantType="outlined"
                      glowColor={primaryColor}
                      href={`/admin`}
                      size="sm"
                    >
                      View Details
                    </MetalButton>
                  </YStack>
                </MetalCard>
              );
            })}

            {teams.length === 0 && (
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
                  No teams found.
                </Text>
                <Text color="$gray9" fontSize={13}>
                  Create a team under organization settings to get started.
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
  teamCard: {
    width: '100%',
    minWidth: 280,
    flex: 1,
    maxWidth: 380,
  },
});
