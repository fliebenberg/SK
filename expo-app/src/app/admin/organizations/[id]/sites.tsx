import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Label, Switch } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  Plus, 
  ArrowLeft, 
  MapPin, 
  Pencil, 
  Trash2, 
  Search,
  Activity
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { store } from '../../../../store/store';
import { MetalButton } from '../../../../components/ui/MetalButton';
import { MetalCard } from '../../../../components/ui/MetalCard';
import { Input } from '../../../../components/ui/Input';
import { Site, Facility } from '@sk/types';

export default function SitesManagementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [sites, setSites] = useState<Site[]>([]);
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const primaryColor = theme.primary?.get() || '#10b981';

  useEffect(() => {
    if (!id) return;

    store.subscribeToOrganization(id);
    store.subscribeToOrganizationData(id);

    const updateData = () => {
      setSites(store.getSites(id));
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

  const handleDeleteSite = (site: Site) => {
    Alert.alert(
      'Delete Site',
      `Are you sure you want to delete ${site.name}? This may affect events scheduled at this site.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await store.deleteSite(site.id);
              Alert.alert('Success', `${site.name} has been deleted successfully.`);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete site.');
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
          <Text color="$gray10" fontSize={14}>Loading sites directory...</Text>
        </YStack>
      </Theme>
    );
  }

  // Filter sites based on queries
  const filteredSites = sites.filter(site => {
    if (!showInactive && site.isActive === false) return false;

    const facilities = store.getFacilities(site.id);
    const facilityMatch = facilities.some(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesSearch = site.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (site.address?.fullAddress || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (site.address?.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          facilityMatch;
    return matchesSearch;
  });

  return (
    <Theme name="dark">
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(40, insets.bottom) }]}
      >
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
              onPress={() => router.push(`/admin/organizations/${id}/sites/create`)}
              icon={<Plus size={14} color="#ffffff" />}
            >
              Add Site
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
              SITES & FIELDS
            </H1>
            <Paragraph color="$gray10" fontSize={13}>
              {orgName ? `Managing facilities for ${orgName}` : 'Manage organization sites'}
            </Paragraph>
          </YStack>

          {/* Search and Filters Bar */}
          <YStack gap="$3">
            <XStack position="relative" alignItems="center" width="100%">
              <Input
                placeholder="Search sites or facilities..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                paddingLeft={40}
                flex={1}
              />
              <Search size={16} color="#71717a" style={{ position: 'absolute', left: 14 }} />
            </XStack>

            <XStack alignItems="center" gap="$2" alignSelf="flex-end">
              <Switch 
                id="show-inactive-sites"
                size="$2"
                checked={showInactive}
                onCheckedChange={setShowInactive}
              >
                <Switch.Thumb />
              </Switch>
              <Label htmlFor="show-inactive-sites" fontSize={12} color="$gray10" cursor="pointer">
                Show Inactive
              </Label>
            </XStack>
          </YStack>

          {/* Sites List Section */}
          <YStack gap="$4">
            {filteredSites.map((site) => {
              const facilities = store.getFacilities(site.id);
              
              return (
                <MetalCard key={site.id} variant="dark" padding="$4" gap="$3" opacity={site.isActive === false ? 0.6 : 1}>
                  <YStack gap="$2.5">
                    
                    {/* Site identity, edit buttons */}
                    <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
                      <YStack flex={1} minWidth={0} gap="$1">
                        <XStack alignItems="center" gap="$2" flexWrap="wrap">
                          <Text fontWeight="800" fontSize={16} color="$color" numberOfLines={2}>
                            {site.name}
                          </Text>
                          {site.isActive === false && (
                            <XStack backgroundColor="#27272a" paddingHorizontal="$2" paddingVertical="$0.5" borderRadius={4}>
                              <Text fontSize={10} color="$gray10" fontWeight="700">INACTIVE</Text>
                            </XStack>
                          )}
                        </XStack>
                        <XStack gap="$1" alignItems="center">
                          <MapPin size={12} color="$gray10" />
                          <Text fontSize={12} color="$gray10" numberOfLines={1} flex={1}>
                            {site.address?.fullAddress || 'No address specified'}
                          </Text>
                        </XStack>
                      </YStack>

                      {/* Quick Edit and Delete buttons */}
                      <XStack gap="$2" flexShrink={0}>
                        <MetalButton
                          variantType="outlined"
                          size="icon"
                          style={styles.actionBtn}
                          onPress={() => router.push(`/admin/organizations/${id}/sites/${site.id}/edit`)}
                          icon={<Pencil size={12} color={primaryColor} />}
                        />
                        <MetalButton
                          variantType="outlined"
                          size="icon"
                          style={styles.actionBtn}
                          disabled={isProcessing}
                          onPress={() => handleDeleteSite(site)}
                          icon={<Trash2 size={12} color="#ef4444" />}
                        />
                      </XStack>
                    </XStack>

                    {/* Facilities badges list */}
                    <YStack gap="$1.5">
                      <Text fontSize={11} fontWeight="800" color="$gray9" letterSpacing={0.5}>
                        FACILITIES ({facilities.length})
                      </Text>
                      <XStack flexWrap="wrap" gap="$1.5">
                        {facilities.length > 0 ? (
                          facilities.map(facility => (
                            <XStack 
                              key={facility.id} 
                              backgroundColor={facility.isActive === false ? 'rgba(39, 39, 42, 0.5)' : 'rgba(16, 185, 129, 0.1)'}
                              borderColor={facility.isActive === false ? '$gray5' : 'rgba(16, 185, 129, 0.2)'}
                              borderWidth={1}
                              paddingHorizontal="$2" 
                              paddingVertical="$0.5" 
                              borderRadius={6}
                              alignItems="center"
                              gap="$1"
                            >
                              <Activity size={10} color={facility.isActive === false ? '#71717a' : primaryColor} />
                              <Text fontSize={11} color={facility.isActive === false ? '$gray9' : '$color'} fontWeight="600">
                                {facility.name} {facility.isActive === false ? '(Inactive)' : ''}
                              </Text>
                            </XStack>
                          ))
                        ) : (
                          <Text fontSize={11} fontStyle="italic" color="$gray9">No sub-facilities assigned</Text>
                        )}
                      </XStack>
                    </YStack>

                  </YStack>
                </MetalCard>
              );
            })}

            {filteredSites.length === 0 && (
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
                <MapPin size={24} color="#71717a" />
                <Text color="$gray10" fontSize={13} textAlign="center">
                  {searchQuery ? 'No sites match your filter.' : 'No sites listed. Add a new facility above!'}
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
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    padding: 0,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
