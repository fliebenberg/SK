import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Card } from 'tamagui';
import { 
  Plus, 
  ArrowLeft, 
  Trophy, 
  Shield, 
  Target, 
  Circle, 
  Activity,
  UserCheck
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { store } from '../../../../store/store';
import { MetalButton } from '../../../../components/ui/MetalButton';
import { MetalCard } from '../../../../components/ui/MetalCard';
import { Team, Sport } from '@sk/types';

export default function TeamsManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [teams, setTeams] = useState<Team[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    if (!id) return;

    store.subscribeToOrganization(id);
    store.subscribeToOrganizationData(id);

    const updateData = () => {
      setTeams(store.getTeams(id));
      setSports(store.getSports());
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

  const getSportIcon = (sportName: string) => {
    const name = sportName.toLowerCase();
    if (name.includes('soccer') || name.includes('football')) {
      return <Activity size={18} color="#f59e0b" />;
    }
    if (name.includes('rugby')) {
      return <Shield size={18} color="#3b82f6" />;
    }
    if (name.includes('cricket')) {
      return <Target size={18} color="#ef4444" />;
    }
    if (name.includes('netball') || name.includes('basketball')) {
      return <Circle size={18} color="#10b981" />;
    }
    return <Trophy size={18} color="#ebd07d" />;
  };

  if (isLoading) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$3">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text color="$gray10" fontSize={14}>Loading teams directory...</Text>
        </YStack>
      </Theme>
    );
  }

  const activeTeams = teams.filter(t => t.isActive ?? true);
  const deactivatedTeams = teams.filter(t => !(t.isActive ?? true));

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
              onPress={() => router.push(`/admin/organizations/${id}/teams/new`)}
              icon={<Plus size={14} color="#ffffff" />}
            >
              Add Team
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
              TEAMS DIRECTORY
            </H1>
            <Paragraph color="$gray10" fontSize={13}>
              {orgName ? `Managing rosters for ${orgName}` : 'Manage organization teams'}
            </Paragraph>
          </YStack>

          {/* Active Teams Section */}
          <YStack gap="$3">
            <Text fontSize={16} fontWeight="900" color="$color">Active Rosters ({activeTeams.length})</Text>
            
            {activeTeams.map((team) => {
              const sport = sports.find(s => s.id === team.sportId);
              const sportName = sport ? sport.name : 'Unknown Sport';

              return (
                <MetalCard key={team.id} variant="dark" padding="$4" gap="$2">
                  <XStack justifyContent="space-between" alignItems="center">
                    <XStack gap="$3" alignItems="center" flex={1} minWidth={0}>
                      {getSportIcon(sportName)}
                      <YStack minWidth={0} flex={1}>
                        <Text fontWeight="800" fontSize={16} color="$color" numberOfLines={1}>
                          {team.name}
                        </Text>
                        <Text fontSize={12} color="$gray10">
                          {sportName} {team.ageGroup ? `• ${team.ageGroup}` : ''}
                        </Text>
                      </YStack>
                    </XStack>
                    
                    <XStack gap="$2" alignItems="center" marginLeft="$2">
                      <UserCheck size={14} color={primaryColor} />
                      <Text fontSize={12} fontWeight="700" color={primaryColor}>
                        {(team.playerCount || 0) + (team.staffCount || 0)}
                      </Text>
                    </XStack>
                  </XStack>

                  <MetalButton 
                    variantType="outlined" 
                    size="sm" 
                    onPress={() => router.push(`/admin/organizations/${id}/teams/${team.id}`)}
                    style={{ alignSelf: 'flex-end', marginTop: 4 }}
                  >
                    View Roster
                  </MetalButton>
                </MetalCard>
              );
            })}

            {activeTeams.length === 0 && (
              <YStack 
                borderRadius={12} 
                borderWidth={1} 
                borderStyle="dashed" 
                borderColor="$gray6" 
                padding="$6" 
                alignItems="center" 
                justifyContent="center"
                backgroundColor="#0d0d0f"
              >
                <Text color="$gray10" fontSize={13}>No active teams listed. Add a new team above!</Text>
              </YStack>
            )}
          </YStack>

          {/* Deactivated Teams Section */}
          {deactivatedTeams.length > 0 && (
            <YStack gap="$3" marginTop="$2">
              <Text fontSize={15} fontWeight="900" color="$gray11">Deactivated Teams ({deactivatedTeams.length})</Text>
              {deactivatedTeams.map((team) => {
                const sport = sports.find(s => s.id === team.sportId);
                const sportName = sport ? sport.name : 'Unknown Sport';

                return (
                  <Card key={team.id} borderWidth={1} borderColor="$gray5" backgroundColor="#111113" padding="$4" borderRadius={12}>
                    <XStack justifyContent="space-between" alignItems="center">
                      <XStack gap="$3" alignItems="center" opacity={0.6}>
                        {getSportIcon(sportName)}
                        <YStack minWidth={0}>
                          <Text fontWeight="700" fontSize={15} color="$gray11" numberOfLines={1}>
                            {team.name}
                          </Text>
                          <Text fontSize={12} color="$gray9">
                            {sportName} {team.ageGroup ? `• ${team.ageGroup}` : ''}
                          </Text>
                        </YStack>
                      </XStack>
                      <MetalButton 
                        variantType="outlined" 
                        size="sm"
                        onPress={() => router.push(`/admin/organizations/${id}/teams/${team.id}`)}
                      >
                        Manage
                      </MetalButton>
                    </XStack>
                  </Card>
                );
              })}
            </YStack>
          )}

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
});
