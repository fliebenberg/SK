import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, View, RefreshControl, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, H1, Paragraph, Theme, useTheme, Card } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flame, Trophy, Users, Wifi, Activity, Plus, ArrowRight, Sparkles } from 'lucide-react-native';
import { store } from '../store/store';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { HeroGameCard } from '../components/feed/HeroGameCard';
import { FeedItemCard } from '../components/feed/FeedItemCard';
import { MetalButton } from '../components/ui/MetalButton';
import { FeedHomeResponse } from '@sk/types';

export default function HomeScreen() {
  const { isAuthenticated, user, loginWithGoogle } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // State
  const [hasOrg, setHasOrg] = useState(false);
  const [feedData, setFeedData] = useState<FeedHomeResponse | null>(null);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const primaryColor = theme.primary?.get() || '#10b981';

  // 1. Sync User Organizations from Store
  useEffect(() => {
    const checkOrg = () => {
      if (!isAuthenticated || !user) {
        setHasOrg(false);
        return;
      }
      const isGlobalAdmin = user.globalRole === 'admin';
      // Safety checks for store properties
      const orgMemberships = store.userOrgMemberships || [];
      const teamMemberships = store.userTeamMemberships || [];
      const hasOwned = orgMemberships.length > 0 || teamMemberships.length > 0;
      setHasOrg(isGlobalAdmin || hasOwned);
    };

    checkOrg();
    return store.subscribe(checkOrg);
  }, [isAuthenticated, user]);

  // 2. Fetch Dashboard Feed from Socket Store
  const loadFeedData = async () => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const data = await store.getHomeFeed(user?.id, timezone);
      setFeedData(data);
    } catch (error) {
      console.error('Failed to load mobile home feed:', error);
    } finally {
      setIsLoadingFeed(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (store.isConnected()) {
      loadFeedData();
    }

    // Subscribe to store updates to capture real-time score feeds
    const unsubscribe = store.subscribe(() => {
      if (store.isConnected()) {
        loadFeedData();
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated, user]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadFeedData();
  };

  return (
    <Theme name="dark">
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top || 16 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={primaryColor}
            colors={[primaryColor]}
          />
        }
      >
        <YStack padding="$5" gap="$6" flex={1} width="100%">
          
          {/* Header Banner Logo Section */}
          <YStack gap="$2" alignItems="center">
            <XStack gap="$3" alignItems="center">
              <Trophy size={36} color="#f59e0b" />
              <H1 
                fontFamily="$heading" 
                fontSize={32} 
                color="$yellow10" 
                fontWeight="900" 
                letterSpacing={1.5}
              >
                SCOREKEEPER
              </H1>
            </XStack>
            <Paragraph color="$gray10" fontSize={14} textAlign="center">
              Universal Sports Management & Scoring Engine
            </Paragraph>
          </YStack>

          {/* Real-time Connection / Integration Status */}
          <XStack 
            borderWidth={1} 
            borderColor="$gray5" 
            paddingHorizontal="$4" 
            paddingVertical="$2.5" 
            borderRadius={12} 
            gap="$3.5" 
            backgroundColor="#18181b"
            alignItems="center"
            justifyContent="center"
          >
            <Wifi size={16} color="#10b981" />
            <Text color="$green10" fontWeight="800" fontSize={12} letterSpacing={0.5}>
              REAL-TIME SYNC ACTIVE
            </Text>
          </XStack>

          {/* Context-aware Actions Panel */}
          <YStack 
            borderRadius={16} 
            borderWidth={1.5} 
            borderColor="#27272a" 
            padding="$5" 
            backgroundColor="#111113" 
            gap="$4"
          >
            <YStack gap="$1.5">
              <Text fontSize={18} fontWeight="900" color="$color">Quick Actions</Text>
              <Text fontSize={13} color="$gray10">Create matches or manage your sports organizations</Text>
            </YStack>

            <XStack gap="$3" flexWrap="wrap">
              {!isAuthenticated ? (
                <MetalButton
                  variantType="filled"
                  glowColor={primaryColor}
                  size="default"
                  onPress={() => router.push('/login')}
                  style={{ flex: 1, minWidth: 150 }}
                >
                  Sign In to Start
                </MetalButton>
              ) : !hasOrg ? (
                <MetalButton
                  variantType="outlined"
                  glowColor={primaryColor}
                  size="default"
                  icon={<Plus size={16} color={primaryColor} />}
                  onPress={() => router.push('/admin')}
                  style={{ flex: 1, minWidth: 150 }}
                >
                  Add Organization
                </MetalButton>
              ) : (
                <MetalButton
                  variantType="filled"
                  glowColor={primaryColor}
                  size="default"
                  icon={<ArrowRight size={16} color="#ffffff" />}
                  onPress={() => router.push('/admin')}
                  style={{ flex: 1, minWidth: 150 }}
                >
                  Manage Dashboards
                </MetalButton>
              )}
            </XStack>
          </YStack>

          {/* Activity Hub (Horizontal Carousel) */}
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <H1 fontFamily="$heading" fontSize={20} fontWeight="900" color="$color">
                Activity Hub
              </H1>
              <Activity size={18} color={primaryColor} />
            </XStack>

            {isLoadingFeed ? (
              <XStack gap="$3" paddingVertical="$4" justifyContent="center">
                <ActivityIndicator size="small" color={primaryColor} />
                <Text color="$gray9" fontSize={13}>Syncing active matches...</Text>
              </XStack>
            ) : feedData?.heroGames && feedData.heroGames.length > 0 ? (
              <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                snapToInterval={296} // Card width (280) + padding (16)
                decelerationRate="fast"
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {feedData.heroGames.map((game) => (
                  <HeroGameCard key={game.id} game={game} />
                ))}
              </ScrollView>
            ) : (
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
                <Text color="$gray10" fontSize={13}>No live matches right now. Pull to refresh!</Text>
              </YStack>
            )}
          </YStack>

          {/* Unauthenticated / Premium Feature Prompt */}
          {!isAuthenticated && (
            <Card 
              borderWidth={1.5} 
              borderColor="rgba(16, 185, 129, 0.2)" 
              backgroundColor="rgba(16, 185, 129, 0.05)" 
              padding="$5" 
              borderRadius={16}
              gap="$3"
            >
              <XStack gap="$2" alignItems="center">
                <Sparkles size={18} color={primaryColor} />
                <Text fontWeight="800" fontSize={15} color="$color">Personalize ScoreKeeper</Text>
              </XStack>
              <Paragraph fontSize={13} color="$gray11" lineHeight={18}>
                Log in using your account credentials to follow specific sports, configure tournament brackets, and get custom alerts.
              </Paragraph>
              <MetalButton
                variantType="outlined"
                glowColor={primaryColor}
                size="sm"
                onPress={loginWithGoogle}
                icon={<Sparkles size={14} color={primaryColor} />}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              >
                Discover Leagues
              </MetalButton>
            </Card>
          )}

          {/* Feed Timeline list */}
          <YStack gap="$3">
            <H1 fontFamily="$heading" fontSize={20} fontWeight="900" color="$color">
              My Timeline
            </H1>

            {isLoadingFeed ? (
              <YStack gap="$3" paddingVertical="$4">
                {[1, 2].map((i) => (
                  <View key={i} style={styles.skeletonItem} />
                ))}
              </YStack>
            ) : feedData?.personalizedFeed && feedData.personalizedFeed.length > 0 ? (
              <YStack gap="$3">
                {feedData.personalizedFeed.map((item, idx) => (
                  <FeedItemCard 
                    key={item.id || idx} 
                    item={item} 
                    onPress={() => {
                      // Navigate to event details in future
                    }}
                  />
                ))}
              </YStack>
            ) : (
              <YStack 
                borderRadius={12} 
                borderWidth={1} 
                borderColor="$gray5" 
                padding="$6" 
                alignItems="center" 
                justifyContent="center"
                backgroundColor="#0d0d0f"
                gap="$4"
              >
                <Text color="$gray10" fontSize={13} textAlign="center">
                  Your timeline is currently empty.
                </Text>
                {!isAuthenticated ? (
                  <MetalButton 
                    variantType="outlined" 
                    size="sm" 
                    onPress={() => router.push('/login')}
                  >
                    Sign In to Follow Leagues
                  </MetalButton>
                ) : (
                  <Text color="$gray9" fontSize={11}>
                    Tell us what sports you follow under customization options in Settings.
                  </Text>
                )}
              </YStack>
            )}
          </YStack>

          {/* Sidebar Modules: Trending Orgs & Popular Tournaments */}
          <XStack gap="$4" flexWrap="wrap" marginTop="$2" width="100%">
            
            {/* Trending Organizations */}
            <YStack 
              borderRadius={16} 
              borderWidth={1} 
              borderColor="$gray5" 
              backgroundColor="#111113" 
              padding="$4.5" 
              flex={1}
              minWidth={250}
              gap="$3"
            >
              <XStack gap="$2" alignItems="center" borderBottomWidth={1} borderBottomColor="$gray6" paddingBottom="$2">
                <Users size={16} color="$gray10" />
                <Text fontWeight="800" fontSize={14} color="$color" letterSpacing={0.5}>
                  TRENDING LEAGUES
                </Text>
              </XStack>

              {isLoadingFeed ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : feedData?.discovery?.trendingOrganizations && feedData.discovery.trendingOrganizations.length > 0 ? (
                <YStack gap="$2.5">
                  {feedData.discovery.trendingOrganizations.map((org) => (
                    <YStack key={org.id} gap="$1" padding="$2" borderRadius={8} hoverStyle={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <Text fontWeight="700" fontSize={13} color="$color">{org.name}</Text>
                      <Text fontSize={11} color="$gray9">Public Organization</Text>
                    </YStack>
                  ))}
                </YStack>
              ) : (
                <Text fontSize={12} color="$gray10">No trending organizations listed.</Text>
              )}
            </YStack>

            {/* Top Tournaments */}
            <YStack 
              borderRadius={16} 
              borderWidth={1} 
              borderColor="$gray5" 
              backgroundColor="#111113" 
              padding="$4.5" 
              flex={1}
              minWidth={250}
              gap="$3"
            >
              <XStack gap="$2" alignItems="center" borderBottomWidth={1} borderBottomColor="$gray6" paddingBottom="$2">
                <Trophy size={16} color="$gray10" />
                <Text fontWeight="800" fontSize={14} color="$color" letterSpacing={0.5}>
                  TOP TOURNAMENTS
                </Text>
              </XStack>

              {isLoadingFeed ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : feedData?.discovery?.popularTournaments && feedData.discovery.popularTournaments.length > 0 ? (
                <YStack gap="$2.5">
                  {feedData.discovery.popularTournaments.map((tournament) => (
                    <YStack key={tournament.id} gap="$1" padding="$2" borderRadius={8} hoverStyle={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                      <Text fontWeight="700" fontSize={13} color="$color">{tournament.name}</Text>
                      <XStack gap="$1.5">
                        <Text fontSize={11} color="$gray9">Event</Text>
                      </XStack>
                    </YStack>
                  ))}
                </YStack>
              ) : (
                <Text fontSize={12} color="$gray10">No active tournaments listed.</Text>
              )}
            </YStack>

          </XStack>

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
  skeletonItem: {
    height: 70,
    borderRadius: 12,
    backgroundColor: '#18181b',
    width: '100%',
    opacity: 0.7,
  },
});
