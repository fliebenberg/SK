import React, { useState, useEffect, useRef, useCallback } from 'react';
import { orgColors } from '@sk/shared';
import { View, Text, TouchableOpacity, ScrollView, Platform, Image, Animated, Easing } from 'react-native';
import { useRouter, useSegments, useGlobalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { getAvatarUrl } from '../services/assets';
import { OrgLogo } from './OrgLogo';
import { useOrgSummary } from '../hooks/useOrgSummary';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { AnimatedBox } from './AnimatedBox';

import { readableTextOn } from '../utils/colorUtils';
import { themeColor } from '../constants/Colors';

// Rail geometry. These are the `w-16` / `w-64` classes as numbers, because the
// hover animation interpolates between them and a class cannot be interpolated.
const RAIL_WIDTH = 64;
const PANEL_WIDTH = 256;

const HOVER_OPEN_MS = 220;
const HOVER_CLOSE_MS = 170;

export function LeftNavigationRail() {
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { user, isAuthenticated } = useAuthStore();
  const hasFamily = useAuthStore(state => (state.dependants || []).length > 0);

  const isSidebarMinimized = useSettingsStore((state) => state.getEffectivePreference('sidebarMinimized') ?? false);
  const setLocalOverride = useSettingsStore((state) => state.setLocalOverride);
  const [isHovered, setIsHovered] = useState(false);
  const hoverAnim = useRef(new Animated.Value(0)).current;

  // The fly-out is built from <AnimatedBox> rather than Animated.View, and styled with
  // inline styles rather than classes — an animated node cannot carry a className, and
  // these three need their children positioned against the animated node itself, so
  // none of them passes one. AnimatedBox's doc comment has the why.
  useEffect(() => {
    const animation = Animated.timing(hoverAnim, {
      toValue: isHovered ? 1 : 0,
      duration: isHovered ? HOVER_OPEN_MS : HOVER_CLOSE_MS,
      easing: isHovered ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      // Width drives layout, which the native driver cannot touch.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [isHovered, hoverAnim]);

  // The rail occupies real layout width, so growing it pushes the page across
  // instead of covering it.
  const railWidth = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RAIL_WIDTH, PANEL_WIDTH],
  });

  // Cross-fade the two trees, with a slight overlap so neither edge is ever bare.
  const iconRailOpacity = hoverAnim.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });
  const panelOpacity = hoverAnim.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0, 1],
  });

  const toggleMinimized = useCallback(() => {
    setLocalOverride('sidebarMinimized', !isSidebarMinimized);
  }, [isSidebarMinimized, setLocalOverride]);

  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const { triggerDiscardPrompt } = useUnsavedChangesStore();

  const confirmThenNavigate = useCallback((action: () => void) => {
    triggerDiscardPrompt(action);
  }, [triggerDiscardPrompt]);

  // Check if we are in the org admin panel
  const isOrgAdmin = segments[0] === 'admin';
  const orgSubTab = isOrgAdmin ? (segments[2] || 'dashboard') : '';
  const { org: orgData } = useOrgSummary(isOrgAdmin ? orgId : null);

  const showAdminPortal = isAuthenticated && user?.globalRole === 'admin';

  // Extract current tab name based on active segment
  const activeTab = segments[0] === '(tabs)' 
    ? (segments[1] || 'index') 
    : (segments[0] === 'landing' ? 'index' : (segments[0] === 'admin' ? 'admin' : ''));

  const getInitials = (userName: string) => {
    if (!userName) return "U";
    return userName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const getAvatarUri = () => {
    if (!user) return null;
    if (user.avatarSource === "custom" && user.customImage) {
      return getAvatarUrl(user.customImage, 'medium');
    }
    // May be a stored name (a custom picture) as well as a provider URL.
    if (user.picture) return getAvatarUrl(user.picture, 'medium') || null;
    return null;
  };

  // Nav Items list construction
  const getNavItemsList = () => {
    if (isOrgAdmin && orgId) {
      return {
        isOrg: true,
        items: [
          // While the org has no administrator: a temporary task, set apart above the rest and gone
          // once it is done (docs/org-profile.md §6).
          ...(orgData?.isClaimed === false
            ? [{ name: 'nominate', label: 'Nominate admin', icon: 'person-add' as const, route: `/admin/${orgId}/nominate` as const, attention: true }]
            : []),
          { name: 'dashboard', label: 'Control Panel', icon: 'grid' as const, route: `/admin/${orgId}` as const },
          { name: 'profile', label: 'Profile', icon: 'business' as const, route: `/admin/${orgId}/profile` as const },
          { name: 'settings', label: 'Settings', icon: 'settings' as const, route: `/admin/${orgId}/settings` as const },
          { name: 'people', label: 'People & Roles', icon: 'people' as const, route: `/admin/${orgId}/people` as const },
          { name: 'teams', label: 'Teams & Divisions', icon: 'trophy' as const, route: `/admin/${orgId}/teams` as const },
          { name: 'sites', label: 'Sites and Facilities', icon: 'location' as const, route: `/admin/${orgId}/sites` as const },
          { name: 'events', label: 'Fixtures & Events', icon: 'calendar' as const, route: `/admin/${orgId}/events` as const },
          { name: 'leagues', label: 'Leagues & Seasons', icon: 'list' as const, route: `/admin/${orgId}/leagues` as const },
        ]
      };
    }

    const items = [];
    if (showAdminPortal) {
      items.push({ name: 'admin', label: 'Admin Portal', icon: 'shield-checkmark' as const, route: '/admin' });
    }
    items.push(
      { name: 'index', label: 'Live Feed', icon: 'pulse' as const, route: '/' },
    );
    // My Family, only for someone who is a guardian of at least one child (`MEMBER-3`).
    if (hasFamily) {
      items.push({ name: 'family', label: 'My Family', icon: 'heart' as const, route: '/family' });
    }
    items.push(
      { name: 'organizations', label: 'Organizations', icon: 'business' as const, route: '/organizations' },
      { name: 'teams', label: 'Teams', icon: 'people' as const, route: '/teams' },
      { name: 'sites', label: 'Sites', icon: 'map' as const, route: '/sites' },
      { name: 'settings', label: 'Settings', icon: 'settings' as const, route: '/settings' },
    );
    return { isOrg: false, items };
  };

  const navConfig = getNavItemsList();

  // Expanded nav content renderer
  const renderExpandedContent = () => (
    <>
      <View className="flex-1">
        {/* BRAND LOGO AND NAME */}
        <View className="flex-row items-center justify-between px-2 mb-8">
          <TouchableOpacity 
            onPress={() => confirmThenNavigate(() => router.push('/'))}
            className="flex-row items-center gap-3 active:opacity-85"
          >
            <View className="w-9 h-9 rounded-xl bg-card border border-primary shadow-md dark:shadow-primary/20 flex items-center justify-center">
              <Text className="font-orbitron-bold text-lg text-primary-ink mt-0.5">SK</Text>
            </View>
            <Text className="font-orbitron-bold text-sm tracking-widest text-ink mt-1">
              SCOREKEEPER
            </Text>
          </TouchableOpacity>

          {/* Pin / Collapse Toggle Button */}
          <TouchableOpacity
            onPress={toggleMinimized}
            className="p-1.5 rounded-lg hover:bg-sunken active:opacity-85"
            {...(Platform.OS === 'web' ? { title: isSidebarMinimized ? 'Pin Sidebar Open' : 'Collapse Sidebar' } : {})}
          >
            <Ionicons 
              name={isSidebarMinimized ? "chevron-forward-outline" : "chevron-back-outline"} 
              size={20} 
              color={themeColor(isDark, 'ink-muted')} 
            />
          </TouchableOpacity>
        </View>

        {/* NAVIGATION LINKS */}
        {navConfig.isOrg ? (
          <>
            {/* Org context card */}
            {(() => {
              const primaryColor = orgColors(orgData).primary;
              const textColor = readableTextOn(primaryColor);
              const isDarkBg = textColor === '#FFFFFF'; // colour-data: the text worked out for the org's colour

              return (
                <View className="mb-6">
                  <Text className="font-inter-bold text-[9px] uppercase tracking-widest text-ink-muted mb-2 px-1">
                    Active Workspace
                  </Text>
                  <View 
                    className="p-1.5 px-2.5 rounded-xl border flex-row items-center gap-3 relative overflow-hidden"
                    style={{ 
                      backgroundColor: primaryColor,
                      borderColor: orgColors(orgData).secondary,
                      borderWidth: 2,
                    }}
                  >
                    <View 
                      className="absolute -right-12 -top-12 w-24 h-24 rounded-full blur-xl opacity-20"
                      style={{ backgroundColor: orgColors(orgData).secondary }}
                    />
                    <View className="z-10 flex-shrink-0">
                      <OrgLogo 
                        logo={orgData?.logo} 
                        settings={orgData?.settings} 
                        size={44} 
                        className={isDarkBg ? 'border border-on-fill/20' : 'border border-on-bright/10'}
                        primaryColor={textColor}
                      />
                    </View>
                    <View className="flex-1 min-w-0 z-10 justify-center">
                      <Text 
                        numberOfLines={1}
                        className="font-orbitron-bold text-sm uppercase leading-tight"
                        style={{ color: textColor }}
                      >
                        {orgData?.shortName || orgData?.name?.substring(0, 3) || 'ORG'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            <ScrollView className="flex-grow space-y-1.5" showsVerticalScrollIndicator={false}>
              {navConfig.items.map((item: any) => {
                const isActive = orgSubTab === item.name;
                const activeColor = orgColors(orgData).primary;
                if (item.attention) {
                  return (
                    <React.Fragment key={item.name}>
                      <TouchableOpacity
                        onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                        className={`flex-row items-center gap-3.5 px-3 py-3 rounded-xl border bg-warning-soft border-warning-line ${isActive ? 'border-l-4' : ''}`}
                        style={isActive ? { borderLeftColor: themeColor(isDark, 'warning-ink') } : undefined}
                      >
                        <Ionicons name={isActive ? item.icon : (`${item.icon}-outline` as any)} size={20} color={themeColor(isDark, 'warning-ink')} />
                        <Text className="font-inter-bold text-sm tracking-wide text-warning-ink">{item.label}</Text>
                      </TouchableOpacity>
                      <View className="h-px bg-line mx-1 my-1" />
                    </React.Fragment>
                  );
                }
                return (
                  <TouchableOpacity
                    key={item.name}
                    onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                    className={`flex-row items-center gap-3.5 px-3 py-3 rounded-xl ${
                      isActive 
                        ? 'bg-sunken border-l-4'
                        : 'hover:bg-sunken border-l-4 border-transparent'
                    }`}
                    style={isActive ? { borderLeftColor: activeColor } : undefined}
                  >
                    <Ionicons 
                      name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                      size={20} 
                      color={isActive ? activeColor : (themeColor(isDark, 'ink-muted'))} 
                    />
                    <Text 
                      className={`font-inter-bold text-sm tracking-wide ${
                        isActive 
                          ? 'text-ink' 
                          : 'text-ink-muted'
                      }`}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                 onPress={() => confirmThenNavigate(() => {
                    router.replace('/(tabs)/organizations' as any);
                 })}
                className="flex-row items-center gap-3.5 px-3 py-3 mt-4 rounded-xl border border-dashed border-line-strong hover:bg-sunken active:opacity-85"
              >
                <Ionicons name="arrow-back-outline" size={20} color={themeColor(isDark, 'primary')} />
                <Text className="font-inter-bold text-sm tracking-wide text-primary-ink">
                  Exit Workspace
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </>
        ) : (
          <ScrollView className="flex-1 space-y-1.5" showsVerticalScrollIndicator={false}>
            {navConfig.items.map((item) => {
              const isActive = activeTab === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                  className={`flex-row items-center gap-3.5 px-3 py-3 rounded-xl ${
                    isActive 
                      ? 'bg-primary-soft border-l-4 border-primary'
                      : 'hover:bg-sunken border-l-4 border-transparent'
                  }`}
                >
                  <Ionicons 
                    name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                    size={20} 
                    color={isActive ? themeColor(isDark, 'primary') : (themeColor(isDark, 'ink-muted'))} 
                  />
                  <Text 
                    className={`font-inter-bold text-sm tracking-wide ${
                      isActive 
                        ? 'text-primary-ink' 
                        : 'text-ink-muted'
                    }`}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* USER PROFILE / LOGIN SECTION */}
      <View className="pt-4 border-t border-line">
        {isAuthenticated && user ? (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/settings' as any))}
            className="flex-row items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-sunken active:opacity-85"
          >
            <View className="w-10 h-10 rounded-full border border-line bg-sunken items-center justify-center overflow-hidden flex-shrink-0">
              {getAvatarUri() ? (
                <Image
                  source={{ uri: getAvatarUri()! }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Text className="font-orbitron-bold text-sm text-ink-soft">
                  {getInitials(user.name)}
                </Text>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="font-inter-bold text-sm text-ink" numberOfLines={1}>
                {user.name}
              </Text>
              <Text className="font-inter text-[10px] text-ink-muted uppercase tracking-wider mt-0.5">
                {user.globalRole === 'admin' ? 'System Admin' : (user.isAdminOrCoach ? 'Coach/Admin' : 'Member')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/(auth)/login' as any))}
            className="flex-row items-center justify-center gap-2 py-3 bg-primary-soft border border-primary-line rounded-xl hover:bg-primary-soft active:opacity-85"
          >
            <Ionicons name="log-in-outline" size={16} color={themeColor(isDark, 'primary')} />
            <Text className="font-inter-bold text-xs text-primary-ink uppercase tracking-wider">
              Log In / Sign Up
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  // Minimized Rail Content Renderer
  const renderMinimizedRail = () => (
    <View className="w-16 h-full flex flex-col justify-between items-center py-5 px-2">
      <View className="items-center w-full flex-1">
        {/* SK Logo Top */}
        <TouchableOpacity 
          onPress={() => confirmThenNavigate(() => router.push('/'))}
          className="w-10 h-10 rounded-xl bg-card border border-primary shadow-md dark:shadow-primary/20 flex items-center justify-center mb-6 active:opacity-85"
          {...(Platform.OS === 'web' ? { title: 'ScoreKeeper Home' } : {})}
        >
          <Text className="font-orbitron-bold text-base text-primary-ink">SK</Text>
        </TouchableOpacity>

        {/* Org Logo (If in Org Workspace) */}
        {navConfig.isOrg && (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push(`/admin/${orgId}` as any))}
            className="mb-5 items-center justify-center active:opacity-85"
            {...(Platform.OS === 'web' ? { title: orgData?.name || 'Organization Workspace' } : {})}
          >
            <View 
              className="rounded-xl border flex items-center justify-center p-0.5"
              style={{
                backgroundColor: orgData ? orgColors(orgData).primary : 'transparent',
                borderColor: orgData ? orgColors(orgData).secondary : themeColor(isDark, 'line'),
                borderWidth: orgData?.primaryColor ? 2 : 1,
              }}
            >
              <OrgLogo 
                logo={orgData?.logo} 
                settings={orgData?.settings} 
                size={36} 
                className="rounded-lg shadow-sm"
              />
            </View>
          </TouchableOpacity>
        )}

        {/* Menu Logos (Icons) */}
        <ScrollView className="flex-1 w-full" contentContainerStyle={{ alignItems: 'center', gap: 12 }} showsVerticalScrollIndicator={false}>
          {navConfig.items.map((item: any) => {
            const isActive = navConfig.isOrg ? orgSubTab === item.name : activeTab === item.name;
            const activeColor = item.attention
              ? themeColor(isDark, 'warning-ink')
              : navConfig.isOrg ? orgColors(orgData).primary : themeColor(isDark, 'primary');
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                className={`w-10 h-10 rounded-xl items-center justify-center relative ${
                  item.attention
                    ? 'bg-warning-soft border border-warning-line'
                    : isActive
                    ? 'bg-primary-soft border border-primary-line'
                    : 'hover:bg-sunken border border-transparent'
                }`}
                {...(Platform.OS === 'web' ? { title: item.label } : {})}
              >
                <Ionicons 
                  name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                  size={20} 
                  color={isActive || item.attention ? activeColor : (themeColor(isDark, 'ink-muted'))} 
                />
              </TouchableOpacity>
            );
          })}

          {/* Exit Workspace Icon in Minimized View */}
          {navConfig.isOrg && (
            <TouchableOpacity
              onPress={() => confirmThenNavigate(() => router.replace('/(tabs)/organizations' as any))}
              className="w-10 h-10 rounded-xl items-center justify-center border border-dashed border-danger-line hover:bg-danger-soft"
              {...(Platform.OS === 'web' ? { title: 'Exit Workspace' } : {})}
            >
              <Ionicons name="arrow-back-outline" size={20} color={themeColor(isDark, 'primary')} />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* User Logo / Avatar Bottom */}
      <View className="pt-3 border-t border-line w-full items-center">
        {isAuthenticated && user ? (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/settings' as any))}
            className="w-10 h-10 rounded-full border border-line bg-sunken items-center justify-center overflow-hidden active:opacity-85"
            {...(Platform.OS === 'web' ? { title: user.name } : {})}
          >
            {getAvatarUri() ? (
              <Image
                source={{ uri: getAvatarUri()! }}
                className="w-full h-full object-cover"
              />
            ) : (
              <Text className="font-orbitron-bold text-xs text-ink-soft">
                {getInitials(user.name)}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/(auth)/login' as any))}
            className="w-10 h-10 rounded-xl bg-primary-soft border border-primary-line items-center justify-center active:opacity-85"
            {...(Platform.OS === 'web' ? { title: 'Log In / Sign Up' } : {})}
          >
            <Ionicons name="log-in-outline" size={18} color={themeColor(isDark, 'primary')} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const webHoverHandlers = Platform.OS === 'web' ? {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  } : {};

  if (isSidebarMinimized) {
    // The `card` and `line` tokens as values, since this container cannot use classes (see the
    // note above).
    const surfaceColor = themeColor(isDark, 'card');
    const edgeColor = themeColor(isDark, 'line');

    return (
      <AnimatedBox
        {...webHoverHandlers}
        style={{
          width: railWidth,
          height: '100%',
          zIndex: 40,
          backgroundColor: surfaceColor,
          borderRightWidth: 1,
          borderRightColor: edgeColor,
          // Clip the panel so widening the rail wipes it into view.
          overflow: 'hidden',
        }}
      >
        {/* Resting icon rail */}
        <AnimatedBox
          pointerEvents={isHovered ? 'none' : 'auto'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: RAIL_WIDTH,
            opacity: iconRailOpacity,
          }}
        >
          {renderMinimizedRail()}
        </AnimatedBox>

        {/* Full panel, revealed as the rail widens */}
        <AnimatedBox
          pointerEvents={isHovered ? 'auto' : 'none'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: PANEL_WIDTH,
            paddingVertical: 24,
            paddingHorizontal: 16,
            justifyContent: 'space-between',
            opacity: panelOpacity,
          }}
        >
          {renderExpandedContent()}
        </AnimatedBox>
      </AnimatedBox>
    );
  }

  // Expanded Pinned Sidebar View
  return (
    <View className="w-64 h-full border-r bg-card border-line py-6 px-4 flex flex-col justify-between z-40">
      {renderExpandedContent()}
    </View>
  );
}
