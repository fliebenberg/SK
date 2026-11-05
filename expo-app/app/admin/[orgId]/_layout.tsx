import React, { useState, useEffect, useCallback } from 'react';
import { orgColors } from '@sk/shared';
import { Redirect, Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useActiveTheme } from '../../../store/settingsStore';
import { useWindowDimensions, View, TouchableOpacity, Text, Alert } from 'react-native';
import { LeftNavigationRail } from '../../../components/LeftNavigationRail';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useWsStore } from '../../../store/wsStore';
import { OrgLogo } from '../../../components/OrgLogo';
import { WorkspaceTile } from '../../../components/org/WorkspaceTile';
import { EditLink } from '../../../components/ReadCard';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../store/authStore';
import { useUnsavedChangesStore } from '../../../store/unsavedChangesStore';
import { BottomMenu } from '../../../components/BottomMenu';
import { AuthGuard } from '../../../components/AuthGuard';
import { UnclaimedOrgBanner } from '../../../components/UnclaimedOrgBanner';

import { inkOnBrand } from '../../../utils/colorUtils';
import { themeColor } from '../../../constants/Colors';
import { getWorkspaceNavItems, currentWorkspacePage, mayOpenWorkspacePage } from '../../../constants/workspaceNav';
import { useOrgAccess } from '../../../hooks/useOrgAccess';
import { useEventCapabilities } from '../../../hooks/useEventCapabilities';
import { useGameCapabilities } from '../../../hooks/useGameCapabilities';

/**
 * Every screen in the org workspace — including the scoring control room — is
 * behind this gate, so the guard wraps the layout body rather than living inside
 * it: unauthorized visitors never mount the workspace or its data subscriptions.
 */
export default function OrgAdminLayout() {
  const { orgId, eventId, gameId } = useGlobalSearchParams<{ orgId?: string; eventId?: string; gameId?: string }>();
  // Someone with no role in this org may still run one of its tournaments, or officiate one of its
  // games (`PERM-8`): the server says so, and that opens those pages and nothing else of it.
  // Quiet here: the guard draws a failure if it would otherwise turn someone away, and the screen inside
  // says what it means for that screen.
  const { capabilities: eventCaps, isLoading: eventLoading, error: eventError, retry: retryEvent } = useEventCapabilities(eventId, { suppressToast: true });
  const { capabilities: gameCaps, isLoading: gameLoading, error: gameError, retry: retryGame } = useGameCapabilities(gameId, { suppressToast: true });
  const grant = !!(eventCaps?.canEditEvent || eventCaps?.convenesDivisionIds?.length || eventCaps?.convenesSportIds?.length)
    || !!(gameCaps?.canScore || gameCaps?.canKeepTime);

  return (
    <AuthGuard
      orgId={orgId}
      admitted={grant}
      admitting={(!!eventId && eventLoading) || (!!gameId && gameLoading)}
      admitError={eventError || gameError}
      onRetryAdmit={() => { if (eventError) retryEvent(); if (gameError) retryGame(); }}
    >
      <OrgAdminWorkspace grant={grant} />
    </AuthGuard>
  );
}

function OrgAdminWorkspace({ grant }: { grant: boolean }) {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const router = useRouter();
  const segments = useSegments();

  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const { org: orgData } = useOrgSummary(orgId);
  const currentPage = currentWorkspacePage(segments);
  // Each role opens only its part of the workspace (`PERM-4`): a coach gets their teams and fixtures.
  const { workspace } = useOrgAccess(orgId);
  // A grant opens the tournament or game it names, which are under Fixtures & Events.
  // Until their memberships arrive nothing is known against them: a grant can admit someone first, and
  // sending them to the Control Panel then would lose the page they opened.
  const membershipsLoaded = useAuthStore(state => state.membershipsLoaded);
  const mayOpenPage = !membershipsLoaded || mayOpenWorkspacePage(workspace, currentPage, segments[3]) || (grant && currentPage === 'events');
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const isConnected = useWsStore(state => state.isConnected);
  const { isDirty, onDiscard, clear, triggerDiscardPrompt } = useUnsavedChangesStore();

  const confirmThenNavigate = useCallback((action: () => void) => {
    setWorkspaceMenuVisible(false);
    triggerDiscardPrompt(action);
  }, [triggerDiscardPrompt]);

  const exitWorkspace = useCallback(() => {
    confirmThenNavigate(() => router.replace('/(tabs)/organizations' as any));
  }, [confirmThenNavigate, router]);

  // The workspace menu belongs to the org on screen; it should not survive a switch or a drop.
  useEffect(() => {
    setWorkspaceMenuVisible(false);
  }, [isConnected, orgId]);

  const fabTextColor = orgData ? inkOnBrand(orgData.primaryColor ?? '').text : themeColor(isDark, 'on-fill');

  const stackContent = (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="address" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="nominate" />
      <Stack.Screen name="people" />
      <Stack.Screen name="people/import" />
      <Stack.Screen name="people/[membershipId]" />
      <Stack.Screen name="people/guardian/[profileId]" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="teams/[teamId]" />
      <Stack.Screen name="sites" />
      <Stack.Screen name="sites/[siteId]" />
      <Stack.Screen name="events/index" />
      <Stack.Screen name="events/create" />
      <Stack.Screen name="events/[eventId]" />
    </Stack>
  );

  const mainView = (
    <View className="flex-1 bg-canvas relative">
      {/* While the org has no administrator, on every workspace page (docs/nomination-process.md §4). */}
      <UnclaimedOrgBanner org={orgData} />
      {/* A page their role does not open goes to the Control Panel, which lists the ones it does. */}
      {mayOpenPage ? stackContent : <Redirect href={`/admin/${orgId}` as any} />}

      {/* Floating Workspace Hub Button (Mobile Only) - Positioned higher to clear the bottom menu */}
      {!isLargeScreen && orgId && (
        <TouchableOpacity
          onPress={() => setWorkspaceMenuVisible(!workspaceMenuVisible)}
          activeOpacity={0.8}
          className="absolute bottom-[75px] right-4 w-12 h-12 rounded-xl overflow-hidden items-center justify-center shadow-lg z-50 border"
          style={{ 
            backgroundColor: orgColors(orgData).primary,
            borderColor: orgColors(orgData).secondary,
            borderWidth: 2,
          }}
        >
          {workspaceMenuVisible ? (
            <Ionicons name="close-outline" size={22} color={fabTextColor} />
          ) : (
            orgData?.logo ? (
              <OrgLogo logo={orgData.logo} size={44} />
            ) : (
              <Ionicons name="grid" size={22} color={fabTextColor} />
            )
          )}
        </TouchableOpacity>
      )}

      {/* Workspace Menu Overlay (Mobile Only) - Positioned higher to clear the bottom menu */}
      {workspaceMenuVisible && orgId && (
        <>
          {/* Backdrop Dimming */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setWorkspaceMenuVisible(false)}
            className="absolute inset-0 bg-overlay/40 z-40"
          />

          {/* Workspace Action Menu Sheet floating above FAB */}
          <View className="absolute bottom-[135px] right-4 z-50 w-64 bg-card border border-line rounded-2xl shadow-lg overflow-hidden p-2.5">
            {/* Header section inside the menu */}
            {orgData && (
              <View className="mb-2.5">
                {/* The way out sits with the workspace it leaves, as in the sidebar. */}
                <View className="flex-row items-center justify-between mb-1.5 px-1">
                  <Text className="font-inter-bold text-[8px] uppercase tracking-widest text-ink-muted">
                    Active Workspace
                  </Text>
                  <EditLink label="Exit" icon="arrow-back-outline" onPress={exitWorkspace} />
                </View>

                <WorkspaceTile org={orgData} markSize={32} />
              </View>
            )}

            {/* List of administration modules */}
            {/* The same list as the sidebar, the current page marked the same way (UI-27). */}
            <View className="gap-0.5">
              {getWorkspaceNavItems(orgId, orgData?.isClaimed, workspace).map((item) => {
                const isCurrent = item.name === currentPage;
                // Tapping the page already on screen just closes the menu.
                const onPress = isCurrent
                  ? () => setWorkspaceMenuVisible(false)
                  : () => confirmThenNavigate(() => router.push(item.route as any));
                if (item.attention) {
                  return (
                    <React.Fragment key={item.name}>
                      <TouchableOpacity
                        onPress={onPress}
                        activeOpacity={0.7}
                        className={`flex-row items-center gap-3 px-3 py-2 rounded-lg bg-warning-soft border border-warning-line ${isCurrent ? 'border-l-4' : ''}`}
                        style={isCurrent ? { borderLeftColor: themeColor(isDark, 'warning-ink') } : undefined}
                      >
                        <Ionicons name={isCurrent ? item.icon : (`${item.icon}-outline` as any)} size={16} color={themeColor(isDark, 'warning-ink')} />
                        <Text className="font-inter-bold text-sm text-warning-ink">{item.label}</Text>
                      </TouchableOpacity>
                      <View className="h-[1px] bg-sunken mb-1" />
                    </React.Fragment>
                  );
                }
                return (
                  <TouchableOpacity
                    key={item.name}
                    onPress={onPress}
                    activeOpacity={0.7}
                    className={`flex-row items-center gap-3 px-3 py-2 rounded-lg border-l-4 ${isCurrent ? 'bg-sunken' : 'border-transparent'}`}
                    style={isCurrent ? { borderLeftColor: orgColors(orgData).primary } : undefined}
                  >
                    <Ionicons
                      name={isCurrent ? item.icon : (`${item.icon}-outline` as any)}
                      size={16}
                      color={themeColor(isDark, isCurrent ? 'ink' : 'ink-muted')}
                    />
                    <Text className={`font-inter-bold text-sm ${isCurrent ? 'text-ink' : 'text-ink-soft'}`}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </>
      )}

      {/* Bottom Menu (Mobile Only) */}
      {!isLargeScreen && (
        <BottomMenu confirmThenNavigate={confirmThenNavigate} />
      )}
    </View>
  );

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-canvas">
        <LeftNavigationRail />
        <View className="flex-1 h-full">
          {mainView}
        </View>
      </View>
    );
  }

  return mainView;
}
