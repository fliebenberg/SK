import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Card } from 'tamagui';
import { 
  Users, 
  Trophy, 
  MapPin, 
  Calendar, 
  ShieldAlert, 
  ShieldCheck, 
  ArrowLeft,
  Settings,
  Power,
  PowerOff,
  Trash2
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { store } from '../../../store/store';
import { useAuth } from '../../../contexts/AuthContext';
import { MetalButton } from '../../../components/ui/MetalButton';
import { MetalCard } from '../../../components/ui/MetalCard';
import { OrgLogo } from '../../../components/ui/OrgLogo';
import { Organization } from '@sk/types';

export default function OrganizationDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();

  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const primaryColor = theme.primary?.get() || '#10b981';
  const isAppAdmin = user?.globalRole === 'admin';

  useEffect(() => {
    if (!id) return;

    store.subscribeToOrganization(id);
    store.subscribeToOrganizationSummary(id);

    const update = () => {
      const foundOrg = store.getOrganization(id);
      if (foundOrg) {
        setOrg(foundOrg);
        setIsLoading(false);
      } else if (store.isLoaded() && !store.isConnected()) {
        setIsLoading(false);
      }
    };

    update();
    const unsubscribe = store.subscribe(update);

    // Fetch if connected
    if (store.isConnected()) {
      store.fetchOrganization(id);
    }

    return () => {
      unsubscribe();
      store.unsubscribeFromOrganization(id);
      store.unsubscribeFromOrganizationSummary(id);
    };
  }, [id]);

  const handleClaim = async () => {
    if (!user || !id || !org) return;
    setIsClaiming(true);
    try {
      await store.claimOrganization(id, user.id);
      Alert.alert('Success', `You have successfully claimed ${org.name}!`);
    } catch (e: any) {
      Alert.alert('Claim Failed', e.message || 'Something went wrong.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleDeactivate = async () => {
    if (!org) return;
    setIsProcessing(true);
    try {
      await store.updateOrganization(org.id, { isActive: !org.isActive });
      Alert.alert(
        'Success', 
        `${org.name} has been ${org.isActive ? 'deactivated' : 'activated'}.`
      );
    } catch (e: any) {
      Alert.alert('Action Failed', e.message || 'Something went wrong.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!org) return;
    
    Alert.alert(
      'Delete Organization',
      `Are you sure you want to permanently delete ${org.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await store.deleteOrganization(org.id);
              Alert.alert('Organization Deleted', 'Organization has been permanently removed.');
              router.push('/admin');
            } catch (e: any) {
              Alert.alert(
                'Deletion Failed', 
                e.message || 'Ensure no linked teams, events, or sites exist.'
              );
            } finally {
              setIsProcessing(false);
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$3">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text color="$gray10" fontSize={14}>Loading organization details...</Text>
        </YStack>
      </Theme>
    );
  }

  if (!org) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$4" padding="$6">
          <ShieldAlert size={48} color="#ef4444" />
          <Text fontWeight="800" fontSize={18} color="$color" textAlign="center">
            Organization Not Found
          </Text>
          <Paragraph color="$gray10" fontSize={13} textAlign="center">
            This organization could not be loaded or doesn't exist.
          </Paragraph>
          <MetalButton variantType="outlined" onPress={() => router.push('/admin')}>
            Back to Dashboard
          </MetalButton>
        </YStack>
      </Theme>
    );
  }

  const counts = {
    teams: org.teamCount || 0,
    sites: org.siteCount || 0,
    events: org.eventCount || 0,
    people: org.memberCount || 0
  };

  const canDelete = counts.teams === 0 && counts.sites === 0 && counts.events === 0 && counts.people === 0;

  const managementSections = [
    {
      title: 'People',
      description: 'Manage staff, coaches, and members.',
      icon: Users,
      href: `/admin/organizations/${id}/people`,
      count: counts.people,
    },
    {
      title: 'Teams',
      description: 'Manage teams and squads.',
      icon: Trophy,
      href: `/admin/organizations/${id}/teams`,
      count: counts.teams,
    },
    {
      title: 'Sites',
      description: 'Manage fields, courts, and facilities.',
      icon: MapPin,
      href: `/admin/organizations/${id}/sites`,
      count: counts.sites,
    },
    {
      title: 'Events',
      description: 'Schedule games and tournaments.',
      icon: Calendar,
      href: `/admin/organizations/${id}/events`,
      count: counts.events,
    },
  ];

  return (
    <Theme name="dark">
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <YStack padding="$5" gap="$6" flex={1} width="100%">
          
          {/* Header Action Bar */}
          <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
            <MetalButton 
              variantType="outlined" 
              size="sm"
              onPress={() => router.push('/admin')}
              icon={<ArrowLeft size={14} color={primaryColor} />}
            >
              Portal
            </MetalButton>

            <MetalButton 
              variantType="outlined" 
              size="sm"
              onPress={() => router.push(`/admin/organizations/${id}/edit`)}
              icon={<Settings size={14} color={primaryColor} />}
            >
              Settings
            </MetalButton>
          </XStack>

          {/* Org Identity banner Card */}
          <MetalCard variant="dark" hasRivets={true} padding="$5" gap="$4">
            <XStack gap="$4" alignItems="center" flexWrap="wrap">
              <OrgLogo organization={org} size="lg" />
              <YStack gap="$1.5" flex={1} minWidth={150}>
                <Text fontFamily="$heading" fontWeight="900" fontSize={22} color="$color">
                  {org.name}
                </Text>
                {org.shortName && (
                  <Text fontSize={13} color="$yellow10" fontWeight="700" letterSpacing={0.5}>
                    CODE: {org.shortName.toUpperCase()}
                  </Text>
                )}
                <Text fontSize={13} color="$gray10">
                  {org.address?.city ? `${org.address.city}${org.address.province ? `, ${org.address.province}` : ''}` : 'Public League'}
                </Text>
              </YStack>
            </XStack>
          </MetalCard>

          {/* Claim Banner Box */}
          {!org.isClaimed && (
            <Card 
              borderWidth={1.5} 
              borderColor="rgba(59, 130, 246, 0.4)" 
              backgroundColor="rgba(59, 130, 246, 0.05)" 
              padding="$5" 
              borderRadius={16}
              gap="$3.5"
            >
              <XStack gap="$2" alignItems="center">
                <ShieldCheck size={20} color="#3b82f6" />
                <Text fontWeight="900" fontSize={16} color="#93c5fd">Claim This Organization</Text>
              </XStack>
              <Paragraph fontSize={13} color="#cbd5e1" lineHeight={18}>
                This organization is currently a community placeholder. Claim it to become the administrator and manage its resources.
              </Paragraph>
              {isAuthenticated ? (
                <MetalButton
                  variantType="filled"
                  glowColor="#3b82f6"
                  size="sm"
                  onPress={handleClaim}
                  disabled={isClaiming}
                >
                  {isClaiming ? 'Claiming...' : 'Claim Now'}
                </MetalButton>
              ) : (
                <MetalButton
                  variantType="outlined"
                  glowColor="#3b82f6"
                  size="sm"
                  onPress={() => router.push('/login')}
                >
                  Log in to Claim
                </MetalButton>
              )}
            </Card>
          )}

          {/* Management Subroutes Grid */}
          <YStack gap="$4">
            <Text fontSize={18} fontWeight="900" color="$color">Management Hub</Text>
            
            {managementSections.map((section) => (
              <MetalCard key={section.title} variant="dark" padding="$4" gap="$3">
                <XStack justifyContent="space-between" alignItems="center">
                  <XStack gap="$3" alignItems="center">
                    <section.icon size={20} color={primaryColor} />
                    <Text fontWeight="800" fontSize={16} color="$color">
                      {section.title}
                    </Text>
                  </XStack>
                  <XStack 
                    backgroundColor="#27272a" 
                    paddingHorizontal="$3" 
                    paddingVertical="$1" 
                    borderRadius={20}
                  >
                    <Text fontWeight="900" fontSize={12} color="$yellow10">
                      {section.count}
                    </Text>
                  </XStack>
                </XStack>

                <Paragraph fontSize={12} color="$gray10" lineHeight={16}>
                  {section.description}
                </Paragraph>

                <MetalButton 
                  variantType="outlined" 
                  size="sm" 
                  onPress={() => router.push(section.href as any)}
                  style={{ alignSelf: 'flex-end', marginTop: 4 }}
                >
                  Manage
                </MetalButton>
              </MetalCard>
            ))}
          </YStack>

          {/* Danger Zone (Global App Admin Only) */}
          {isAppAdmin && (
            <YStack 
              borderRadius={16} 
              borderWidth={1.5} 
              borderColor="rgba(239, 68, 68, 0.3)" 
              backgroundColor="rgba(239, 68, 68, 0.03)" 
              padding="$5" 
              gap="$4"
              marginTop="$2"
            >
              <XStack gap="$2" alignItems="center" borderBottomWidth={1} borderBottomColor="rgba(239, 68, 68, 0.15)" paddingBottom="$2">
                <ShieldAlert size={18} color="#ef4444" />
                <Text fontWeight="900" fontSize={15} color="#ef4444" letterSpacing={0.5}>
                  DANGER ZONE
                </Text>
              </XStack>

              {/* Activate / Deactivate row */}
              <YStack gap="$2">
                <Text fontWeight="800" fontSize={14} color="$color">
                  {org.isActive ? 'Deactivate Organization' : 'Activate Organization'}
                </Text>
                <Paragraph fontSize={11} color="$gray10" lineHeight={15}>
                  {org.isActive 
                    ? 'Marks the organization as inactive. It will become read-only but retain its history.' 
                    : 'Enables all administrative features and active matching for this organization.'}
                </Paragraph>
                <MetalButton 
                  variantType="outlined" 
                  glowColor={org.isActive ? '#f59e0b' : primaryColor}
                  size="sm"
                  onPress={handleDeactivate}
                  disabled={isProcessing}
                  icon={org.isActive ? <PowerOff size={14} color="#f59e0b" /> : <Power size={14} color={primaryColor} />}
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {org.isActive ? 'Deactivate' : 'Activate'}
                </MetalButton>
              </YStack>

              {/* Delete row */}
              <YStack gap="$2" marginTop="$2" borderTopWidth={1} borderTopColor="rgba(239, 68, 68, 0.1)" paddingTop="$4">
                <Text fontWeight="800" fontSize={14} color="$color">
                  Delete Organization
                </Text>
                <Paragraph fontSize={11} color="$gray10" lineHeight={15}>
                  Permanently deletes this organization and all associated database records. This action is irreversible.
                </Paragraph>
                <MetalButton 
                  variantType="outlined" 
                  glowColor="#ef4444"
                  size="sm"
                  onPress={handleDelete}
                  disabled={!canDelete || isProcessing}
                  icon={<Trash2 size={14} color="#ef4444" />}
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                >
                  Delete Permanently
                </MetalButton>
                {!canDelete && (
                  <Text fontSize={10} color="$gray9" fontStyle="italic" marginTop="$1">
                    Cannot delete: Org has {counts.teams} teams, {counts.sites} sites, {counts.events} events, {counts.people} people.
                  </Text>
                )}
              </YStack>
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
