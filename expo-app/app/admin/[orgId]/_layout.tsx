import React, { useState, useEffect, useCallback } from 'react';
import { orgColors } from '@sk/shared';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import { useActiveTheme } from '../../../store/settingsStore';
import { useWindowDimensions, View, TouchableOpacity, Text, Alert } from 'react-native';
import { LeftNavigationRail } from '../../../components/LeftNavigationRail';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useWsStore } from '../../../store/wsStore';
import { OrgLogo } from '../../../components/OrgLogo';
import { Ionicons } from '@expo/vector-icons';
import { useUnsavedChangesStore } from '../../../store/unsavedChangesStore';
import { BottomMenu } from '../../../components/BottomMenu';
import { AuthGuard } from '../../../components/AuthGuard';
import { UnclaimedOrgBanner } from '../../../components/UnclaimedOrgBanner';

import { inkOnBrand } from '../../../utils/colorUtils';
import { themeColor } from '../../../constants/Colors';

/**
 * Every screen in the org workspace — including the scoring control room — is
 * behind this gate, so the guard wraps the layout body rather than living inside
 * it: unauthorized visitors never mount the workspace or its data subscriptions.
 */
export default function OrgAdminLayout() {
  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();

  return (
    <AuthGuard orgId={orgId}>
      <OrgAdminWorkspace />
    </AuthGuard>
  );
}

function OrgAdminWorkspace() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const router = useRouter();
  const segments = useSegments();

  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const { org: orgData } = useOrgSummary(orgId);
  const [workspaceMenuVisible, setWorkspaceMenuVisible] = useState(false);
  const isConnected = useWsStore(state => state.isConnected);
  const { isDirty, onDiscard, clear, triggerDiscardPrompt } = useUnsavedChangesStore();

  const confirmThenNavigate = useCallback((action: () => void) => {
    setWorkspaceMenuVisible(false);
    triggerDiscardPrompt(action);
  }, [triggerDiscardPrompt]);

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
      <Stack.Screen name="teams" />
      <Stack.Screen name="teams/[teamId]" />
      <Stack.Screen name="sites" />
      <Stack.Screen name="sites/[siteId]" />
      <Stack.Screen name="sites/[siteId]/view" />
      <Stack.Screen name="sites/[siteId]/facilities/[facilityId]" />
      <Stack.Screen name="sites/[siteId]/facilities/[facilityId]/view" />
      <Stack.Screen name="events/index" />
      <Stack.Screen name="events/create" />
      <Stack.Screen name="events/[eventId]" />
    </Stack>
  );

  const mainView = (
    <View className="flex-1 bg-canvas relative">
      {/* While the org has no administrator, on every workspace page (docs/nomination-process.md §4). */}
      <UnclaimedOrgBanner org={orgData} />
      {stackContent}

      {/* Floating Workspace Hub Button (Mobile Only) - Positioned higher to clear the bottom menu */}
      {!isLargeScreen && orgId && (
        <TouchableOpacity
          onPress={() => setWorkspaceMenuVisible(!workspaceMenuVisible)}
          activeOpacity={0.8}
          className="absolute bottom-[75px] right-4 w-12 h-12 rounded-full items-center justify-center shadow-lg z-50 border overflow-hidden"
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
              <OrgLogo logo={orgData.logo} settings={orgData.settings} size={44} />
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
                <Text className="font-inter-bold text-[8px] uppercase tracking-widest text-ink-muted mb-1.5 px-1">
                  Active Workspace
                </Text>
                
                <View 
                  className="p-1.5 px-2.5 rounded-xl border flex-row items-center gap-2.5 relative overflow-hidden"
                  style={{ 
                    backgroundColor: orgColors(orgData).primary,
                    borderColor: orgColors(orgData).secondary,
                    borderWidth: 1.5,
                  }}
                >
                  <View 
                    className="absolute -right-8 -top-8 w-16 h-16 rounded-full blur-lg opacity-20"
                    style={{ backgroundColor: orgColors(orgData).secondary }}
                  />

                  <View className="z-10 flex-shrink-0">
                    <OrgLogo 
                      logo={orgData.logo} 
                      settings={orgData.settings} 
                      size={32} 
                      className="bg-on-fill/10 border border-on-fill/20"
                      primaryColor="white"
                    />
                  </View>

                  <View className="flex-1 min-w-0 z-10 justify-center">
                    <Text 
                      numberOfLines={1}
                      className="font-orbitron-bold text-xs uppercase leading-tight"
                      style={{ color: fabTextColor }}
                    >
                      {orgData.shortName || orgData.name?.substring(0, 3) || 'ORG'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* List of administration modules */}
            <View className="space-y-0.5">
              {/* While the org has no administrator: a temporary task, so set apart above the rest
                  and gone once it is done (docs/org-profile.md §6). */}
              {orgData?.isClaimed === false && (
                <>
                  <TouchableOpacity
                    onPress={() => confirmThenNavigate(() => router.push(`/admin/${orgId}/nominate` as any))}
                    activeOpacity={0.7}
                    className="flex-row items-center gap-3 px-3 py-2 rounded-lg bg-warning-soft border border-warning-line"
                  >
                    <Ionicons name="person-add-outline" size={16} color={themeColor(isDark, 'warning-ink')} />
                    <Text className="font-inter-bold text-sm text-warning-ink">Nominate admin</Text>
                  </TouchableOpacity>
                  <View className="h-[1px] bg-sunken my-1" />
                </>
              )}
              {[
                { label: 'Control Panel', icon: 'grid', route: `/admin/${orgId}` },
                { label: 'Profile', icon: 'business', route: `/admin/${orgId}/profile` },
                { label: 'Settings', icon: 'settings', route: `/admin/${orgId}/settings` },
                { label: 'People & Roles', icon: 'people', route: `/admin/${orgId}/people` },
                { label: 'Teams & Divisions', icon: 'trophy', route: `/admin/${orgId}/teams` },
                { label: 'Sites and Facilities', icon: 'location', route: `/admin/${orgId}/sites` },
                { label: 'Fixtures & Events', icon: 'calendar', route: `/admin/${orgId}/events` },
                { label: 'Leagues & Seasons', icon: 'list', route: `/admin/${orgId}/leagues` },
              ].map((item) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => {
                    confirmThenNavigate(() => router.push(item.route as any));
                  }}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-3 px-3 py-2 rounded-lg"
                >
                  <Ionicons name={`${item.icon}-outline` as any} size={16} color={themeColor(isDark, 'ink-muted')} />
                  <Text className="font-inter-bold text-sm text-ink-soft">
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}

              <View className="h-[1px] bg-sunken my-1" />

              {/* Exit Workspace */}
              <TouchableOpacity
                onPress={() => {
                  confirmThenNavigate(() => router.replace('/(tabs)/organizations' as any));
                }}
                activeOpacity={0.7}
                className="flex-row items-center gap-3 px-3 py-2 rounded-lg"
              >
                <Ionicons name="arrow-back-outline" size={16} color={themeColor(isDark, 'danger')} />
                <Text className="font-inter-bold text-sm text-danger-ink">
                  Exit Workspace
                </Text>
              </TouchableOpacity>
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
