import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Plus, ShieldAlert, Building2 } from 'lucide-react-native';
import { store } from '../../store/store';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { MetalButton } from '../../components/ui/MetalButton';
import { MetalCard } from '../../components/ui/MetalCard';
import { OrgLogo } from '../../components/ui/OrgLogo';

export default function AdminScreen() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [adminOrgIds, setAdminOrgIds] = useState<string[]>([]);
  const [isStoreLoaded, setIsStoreLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    const update = () => {
      if (user) {
        setAdminOrgIds(store.getAdminOrgIds(user.id, user.globalRole));
      }
      setIsStoreLoaded(store.isLoaded());
      if (store.isLoaded()) {
        setIsLoading(false);
      }
    };
    update();
    return store.subscribe(update);
  }, [user]);

  // Handle Redirection Logic
  useEffect(() => {
    if (authLoading || isLoading || !isStoreLoaded) return;

    if (!isAuthenticated || !user) {
      router.replace('/');
      return;
    }

    const orgIds = store.getAdminOrgIds(user.id, user.globalRole);
    
    if (orgIds.length === 1) {
      // Single Org Admins go straight to their dashboard
      router.replace(`/admin/organizations/${orgIds[0]}`);
    }
  }, [authLoading, isLoading, isAuthenticated, user, isStoreLoaded, router]);

  if (authLoading || isLoading || !isStoreLoaded) {
    return (
      <Theme name="dark">
        <YStack style={styles.container} justifyContent="center" alignItems="center" gap="$3">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text color="$gray10" fontSize={14}>Checking admin permissions...</Text>
        </YStack>
      </Theme>
    );
  }

  // Get administrative organizations based on IDs or global admin access
  const allOrganizations = store.getOrganizations();
  const adminOrgs = user?.globalRole === 'admin' 
    ? allOrganizations 
    : allOrganizations.filter(org => adminOrgIds.includes(org.id));

  const isGlobalAdmin = user?.globalRole === 'admin';

  return (
    <Theme name="dark">
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(40, insets.bottom) }]}
      >
        <YStack padding="$5" gap="$6" flex={1} width="100%">
          
          {/* Header Section */}
          <YStack gap="$2" alignItems="center" marginTop="$4">
            <XStack gap="$3" alignItems="center">
              <ShieldAlert size={36} color="#f59e0b" />
              <H1 
                fontFamily="$heading" 
                fontSize={30} 
                color="$yellow10" 
                fontWeight="900" 
                letterSpacing={1.5}
                textAlign="center"
              >
                ADMIN PORTAL
              </H1>
            </XStack>
            <Paragraph color="$gray10" fontSize={14} textAlign="center">
              {isGlobalAdmin ? 'Global Administrative Control Panel' : 'Manage your sports organizations'}
            </Paragraph>
          </YStack>

          {/* Create Organization Header Button */}
          <XStack justifyContent="space-between" alignItems="center" marginTop="$2">
            <YStack>
              <Text fontSize={18} fontWeight="900" color="$color">My Organizations</Text>
              <Text fontSize={12} color="$gray10">
                {isGlobalAdmin 
                  ? `Viewing ${adminOrgs.length} system organizations` 
                  : `Select from ${adminOrgs.length} organizations to manage`}
              </Text>
            </YStack>
            {adminOrgs.length > 0 && (
              <MetalButton
                variantType="filled"
                glowColor={primaryColor}
                size="sm"
                onPress={() => router.push('/admin/organizations/new')}
                icon={<Plus size={14} color="#ffffff" />}
              >
                Create New
              </MetalButton>
            )}
          </XStack>

          {/* Organizations list */}
          <YStack gap="$4">
            {adminOrgs.map((org) => (
              <MetalCard 
                key={org.id} 
                variant="dark" 
                hasRivets={true} 
                padding="$4"
                onPress={() => router.push(`/admin/organizations/${org.id}`)}
              >
                <XStack alignItems="center" gap="$4">
                  <OrgLogo organization={org} size="md" />
                  <YStack flex={1} gap="$1" minWidth={0}>
                    <Text fontWeight="800" fontSize={16} color="$color" numberOfLines={1}>
                      {org.name}
                    </Text>
                    <Text fontSize={12} color="$gray10" numberOfLines={1}>
                      {org.address?.city ? `${org.address.city}${org.address.province ? `, ${org.address.province}` : ''}` : 'Public Organization'}
                    </Text>
                  </YStack>
                  <ArrowRight size={18} color={primaryColor} />
                </XStack>
              </MetalCard>
            ))}
          </YStack>

          {/* Empty State */}
          {adminOrgs.length === 0 && (
            <YStack 
              borderRadius={16} 
              borderWidth={1} 
              borderStyle="dashed" 
              borderColor="$gray6" 
              padding="$8" 
              alignItems="center" 
              justifyContent="center"
              backgroundColor="#111113"
              gap="$5"
              marginTop="$2"
            >
              <Building2 size={48} color="$gray9" />
              <YStack gap="$1.5" alignItems="center">
                <Text fontWeight="800" fontSize={18} color="$color" textAlign="center">
                  Welcome to ScoreKeeper Admin
                </Text>
                <Paragraph fontSize={13} color="$gray10" textAlign="center" lineHeight={18}>
                  You do not have administrative access to any organizations yet. Create your own to get started!
                </Paragraph>
              </YStack>

              <YStack gap="$3" width="100%">
                <MetalButton 
                  variantType="filled" 
                  glowColor={primaryColor}
                  size="default"
                  onPress={() => router.push('/admin/organizations/new')}
                  icon={<Plus size={16} color="#ffffff" />}
                >
                  Create New Organization
                </MetalButton>
                <MetalButton 
                  variantType="outlined" 
                  size="default" 
                  onPress={() => router.push('/')}
                >
                  Return Home
                </MetalButton>
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
