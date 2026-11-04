import React, { useState, useEffect, useRef, useCallback } from 'react';
import { orgColors } from '@sk/shared';
import { View, Text, TouchableOpacity, Pressable, ScrollView, Platform, Image, Animated, Easing, useWindowDimensions } from 'react-native';
import { useRouter, useSegments, useGlobalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { getAvatarUrl } from '../services/assets';
import { OrgLogo } from './OrgLogo';
import { EditLink } from './ReadCard';
import { useOrgAccess } from '../hooks/useOrgAccess';
import { useOrgSummary } from '../hooks/useOrgSummary';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { AnimatedBox } from './AnimatedBox';

import { WorkspaceTile } from './org/WorkspaceTile';
import { themeColor } from '../constants/Colors';
import { getWorkspaceNavItems, currentWorkspacePage } from '../constants/workspaceNav';
import { LAYOUT } from '../constants/layout';

// Rail geometry. These are the `w-16` / `w-64` classes as numbers, because the
// hover animation interpolates between them and a class cannot be interpolated.
const RAIL_WIDTH = 64;
const PANEL_WIDTH = 256;

const HOVER_OPEN_MS = 220;
const HOVER_CLOSE_MS = 170;

// Whether the device has a mouse. Without one the collapsed rail has a menu button instead of opening
// on hover: a touch browser fakes a hover on a tap, which would open the panel and leave it stuck.
const CAN_HOVER = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

export function LeftNavigationRail() {
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { user, isAuthenticated } = useAuthStore();
  const hasFamily = useAuthStore(state => (state.dependants || []).length > 0);

  // Too narrow to stay open: the icon rail, with no way to pin it. What they chose is left alone.
  const { width } = useWindowDimensions();
  const canStayOpen = width >= LAYOUT.sidebarOpenMinWidth;
  const prefersMinimized = useSettingsStore((state) => state.getEffectivePreference('sidebarMinimized') ?? false);
  const isSidebarMinimized = prefersMinimized || !canStayOpen;
  const setLocalOverride = useSettingsStore((state) => state.setLocalOverride);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const hoverAnim = useRef(new Animated.Value(0)).current;

  // The fly-out is built from <AnimatedBox> rather than Animated.View, and styled with
  // inline styles rather than classes — an animated node cannot carry a className, and
  // these three need their children positioned against the animated node itself, so
  // none of them passes one. AnimatedBox's doc comment has the why.
  useEffect(() => {
    const animation = Animated.timing(hoverAnim, {
      toValue: isFlyoutOpen ? 1 : 0,
      duration: isFlyoutOpen ? HOVER_OPEN_MS : HOVER_CLOSE_MS,
      easing: isFlyoutOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      // Width drives layout, which the native driver cannot touch.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [isFlyoutOpen, hoverAnim]);

  // The fly-out grows over the page rather than pushing it across: only the resting
  // rail's width is reserved in the layout (see the wrapper below).
  const railWidth = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RAIL_WIDTH, PANEL_WIDTH],
  });

  // The fly-out casts a shadow onto the page it covers; the resting rail casts none.
  const flyoutShadowOpacity = hoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.18],
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
    if (!CAN_HOVER) setIsFlyoutOpen(false);
  }, [isSidebarMinimized, setLocalOverride]);

  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const { triggerDiscardPrompt } = useUnsavedChangesStore();

  const confirmThenNavigate = useCallback((action: () => void) => {
    // With a mouse the panel closes as the pointer leaves it; on a touch screen, once a choice is made.
    if (!CAN_HOVER) setIsFlyoutOpen(false);
    triggerDiscardPrompt(action);
  }, [triggerDiscardPrompt]);

  const exitWorkspace = useCallback(() => {
    confirmThenNavigate(() => router.replace('/(tabs)/organizations' as any));
  }, [confirmThenNavigate, router]);

  // Check if we are in the org admin panel
  const isOrgAdmin = segments[0] === 'admin';
  const orgSubTab = isOrgAdmin ? currentWorkspacePage(segments) : '';
  const { org: orgData } = useOrgSummary(isOrgAdmin ? orgId : null);
  const { workspace } = useOrgAccess(isOrgAdmin ? orgId : undefined);

  const showAdminPortal = isAuthenticated && user?.globalRole === 'admin';

  // Extract current tab name based on active segment
  // A public tournament page (`FIX-25`) is reached from an organisation, so Orgs stays marked.
  const activeTab = segments[0] === '(tabs)' 
    ? (segments[1] === 'events' || segments[1] === 'sites' ? 'organizations' : (segments[1] as string) === '(teamPage)' ? 'teams' : segments[1] || 'index')
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
      return { isOrg: true, items: getWorkspaceNavItems(orgId, orgData?.isClaimed, workspace) };
    }

    const items = [];
    if (showAdminPortal) {
      items.push({ name: 'admin', label: 'Admin Portal', icon: 'shield-checkmark' as const, route: '/admin' });
    }
    items.push(
      { name: 'index', label: 'Home', icon: 'home' as const, route: '/' },
    );
    // My Family, only for someone who is a guardian of at least one child (`MEMBER-3`).
    if (hasFamily) {
      items.push({ name: 'family', label: 'My Family', icon: 'heart' as const, route: '/family' });
    }
    items.push(
      { name: 'organizations', label: 'Organisations', icon: 'business' as const, route: '/organizations' },
      { name: 'teams', label: 'Teams', icon: 'people' as const, route: '/teams' },
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
          {canStayOpen ? (
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
          ) : !CAN_HOVER ? (
            <TouchableOpacity
              onPress={() => setIsFlyoutOpen(false)}
              className="p-1.5 rounded-lg active:opacity-85"
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <Ionicons name="chevron-back-outline" size={20} color={themeColor(isDark, 'ink-muted')} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* NAVIGATION LINKS */}
        {navConfig.isOrg ? (
          <>
            {/* Org context card */}
            <View className="mb-6">
              {/* The way out sits with the workspace it leaves, not at the foot of the menu. */}
              <View className="flex-row items-center justify-between mb-2 px-1">
                <Text className="font-inter-bold text-[9px] uppercase tracking-widest text-ink-muted">
                  Active Workspace
                </Text>
                <EditLink label="Exit" icon="arrow-back-outline" onPress={exitWorkspace} />
              </View>
              <WorkspaceTile org={orgData} markSize={44} />
            </View>

            <ScrollView className="flex-grow" contentContainerClassName="gap-1.5" showsVerticalScrollIndicator={false}>
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
                    {/* The current page: the bar carries the org's colour, the icon is ink like the
                        label (UI-27); the main menu below does the same with the brand orange. */}
                    <Ionicons
                      name={isActive ? item.icon : (`${item.icon}-outline` as any)}
                      size={20}
                      color={themeColor(isDark, isActive ? 'ink' : 'ink-muted')}
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
            </ScrollView>
          </>
        ) : (
          <ScrollView className="flex-1" contentContainerClassName="gap-1.5" showsVerticalScrollIndicator={false}>
            {navConfig.items.map((item) => {
              const isActive = activeTab === item.name;
              return (
                <TouchableOpacity
                  key={item.name}
                  onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                  className={`flex-row items-center gap-3.5 px-3 py-3 rounded-xl ${
                    isActive
                      ? 'bg-sunken border-l-4 border-primary'
                      : 'hover:bg-sunken border-l-4 border-transparent'
                  }`}
                >
                  <Ionicons
                    name={isActive ? item.icon : (`${item.icon}-outline` as any)}
                    size={20}
                    color={themeColor(isDark, isActive ? 'ink' : 'ink-muted')}
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

        {!CAN_HOVER ? (
          <TouchableOpacity
            onPress={() => setIsFlyoutOpen(true)}
            className="w-10 h-10 rounded-xl items-center justify-center mb-4 active:opacity-85"
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <Ionicons name="menu" size={22} color={themeColor(isDark, 'ink-muted')} />
          </TouchableOpacity>
        ) : null}

        {/* Org Logo (If in Org Workspace). The way out sits above it, where the open rail's
            Exit link sits above the workspace card, so it does not jump when the rail opens. */}
        {navConfig.isOrg && (
          <View className="mb-5 items-center gap-1">
            <TouchableOpacity
              onPress={exitWorkspace}
              className="w-10 h-8 rounded-xl items-center justify-center hover:bg-sunken"
              accessibilityRole="button"
              accessibilityLabel="Exit Workspace"
              {...(Platform.OS === 'web' ? { title: 'Exit Workspace' } : {})}
            >
              <Ionicons name="arrow-back-outline" size={18} color={themeColor(isDark, 'primary')} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => confirmThenNavigate(() => router.push(`/admin/${orgId}` as any))}
              className="items-center justify-center active:opacity-85"
              {...(Platform.OS === 'web' ? { title: orgData?.name || 'Organisation Workspace' } : {})}
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
                  size={36} 
                  className="rounded-lg shadow-sm"
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu Logos (Icons) */}
        <ScrollView className="flex-1 w-full" contentContainerStyle={{ alignItems: 'center', gap: 12 }} showsVerticalScrollIndicator={false}>
          {navConfig.items.map((item: any) => {
            const isActive = navConfig.isOrg ? orgSubTab === item.name : activeTab === item.name;
            // The current page as in the open rail: sunken, a bar in the org's colour (the brand
            // orange outside a workspace), the icon in ink (UI-27).
            const barColor = navConfig.isOrg ? orgColors(orgData).primary : themeColor(isDark, 'primary');
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                className={`w-10 h-10 rounded-xl items-center justify-center relative ${
                  item.attention
                    ? 'bg-warning-soft border border-warning-line'
                    : isActive
                    ? 'bg-sunken border-l-[3px]'
                    : 'hover:bg-sunken border-l-[3px] border-transparent'
                }`}
                style={isActive && !item.attention ? { borderLeftColor: barColor } : undefined}
                {...(Platform.OS === 'web' ? { title: item.label } : {})}
              >
                <Ionicons
                  name={isActive ? item.icon : (`${item.icon}-outline` as any)}
                  size={20}
                  color={themeColor(isDark, item.attention ? 'warning-ink' : isActive ? 'ink' : 'ink-muted')}
                />
              </TouchableOpacity>
            );
          })}
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

  const webHoverHandlers = CAN_HOVER ? {
    onMouseEnter: () => setIsFlyoutOpen(true),
    onMouseLeave: () => setIsFlyoutOpen(false),
  } : {};

  // On a touch screen the open panel sits over a dimmed page, and a tap outside it closes it. The
  // wrapper spans the window while it is open, because Android gives a view no touches outside its
  // parent; the negative margin keeps the page where it is.
  const coversPage = !CAN_HOVER && isFlyoutOpen;

  if (isSidebarMinimized) {
    // The `card` and `line` tokens as values, since this container cannot use classes (see the
    // note above).
    const surfaceColor = themeColor(isDark, 'card');
    const edgeColor = themeColor(isDark, 'line');

    return (
      // Reserves the resting rail's width, so the page never resizes; the fly-out is
      // absolutely positioned inside it and widens over the page.
      <View style={{ width: coversPage ? width : RAIL_WIDTH, marginRight: coversPage ? RAIL_WIDTH - width : 0, height: '100%', zIndex: 40 }}>
        {coversPage ? (
          <Pressable
            onPress={() => setIsFlyoutOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            className="absolute inset-0 bg-overlay/40"
          />
        ) : null}
        <AnimatedBox
          {...webHoverHandlers}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: railWidth,
            height: '100%',
            backgroundColor: surfaceColor,
            borderRightWidth: 1,
            borderRightColor: edgeColor,
            shadowColor: themeColor(isDark, 'shadow'),
            shadowOffset: { width: 4, height: 0 },
            shadowOpacity: flyoutShadowOpacity,
            shadowRadius: 12,
            // Clip the panel so widening the rail wipes it into view.
            overflow: 'hidden',
          }}
        >
          {/* Resting icon rail */}
          <AnimatedBox
            pointerEvents={isFlyoutOpen ? 'none' : 'auto'}
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
            pointerEvents={isFlyoutOpen ? 'auto' : 'none'}
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
      </View>
    );
  }

  // Expanded Pinned Sidebar View
  return (
    <View className="w-64 h-full border-r bg-card border-line py-6 px-4 flex flex-col justify-between z-40">
      {renderExpandedContent()}
    </View>
  );
}
