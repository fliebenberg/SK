import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, Image } from 'react-native';
import { useRouter, useSegments, useGlobalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme, useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../services/api';
import { OrgLogo } from './OrgLogo';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';

export function LeftNavigationRail() {
  const router = useRouter();
  const segments = useSegments();
  const navigation = useNavigation();
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { user, isAuthenticated } = useAuthStore();
  const isConnected = useWsStore(state => state.isConnected);

  const isSidebarMinimized = useSettingsStore((state) => state.getEffectivePreference('sidebarMinimized') ?? false);
  const setLocalOverride = useSettingsStore((state) => state.setLocalOverride);
  const [isHovered, setIsHovered] = useState(false);

  const toggleMinimized = useCallback(() => {
    setLocalOverride('sidebarMinimized', !isSidebarMinimized);
  }, [isSidebarMinimized, setLocalOverride]);

  const { orgId } = useGlobalSearchParams<{ orgId?: string }>();
  const [orgData, setOrgData] = useState<any>(null);
  const lastFetchedId = useRef<string | null>(null);
  const { triggerDiscardPrompt } = useUnsavedChangesStore();

  const confirmThenNavigate = useCallback((action: () => void) => {
    triggerDiscardPrompt(action);
  }, [triggerDiscardPrompt]);

  // Check if we are in the org admin panel
  const isOrgAdmin = segments[0] === 'admin';
  const orgSubTab = isOrgAdmin ? (segments[2] || 'dashboard') : '';

  useEffect(() => {
    if (!isConnected || !orgId || !isOrgAdmin) {
      setOrgData(null);
      lastFetchedId.current = null;
      return;
    }

    if (lastFetchedId.current !== orgId) {
      wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
        if (res && !res.error) {
          setOrgData(res);
          lastFetchedId.current = orgId;
        }
      });
    }

    const room = `org:${orgId}:summary`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (event && event.type === 'ORGANIZATION_UPDATED') {
        if (event.data && event.data.id === orgId) {
          setOrgData((prev: any) => prev ? { ...prev, ...event.data } : event.data);
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, isOrgAdmin]);

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
      return `${API_BASE_URL}/uploads/profiles/${user.customImage}_medium.webp`;
    }
    if (user.picture) return user.picture;
    return null;
  };

  // Nav Items list construction
  const getNavItemsList = () => {
    if (isOrgAdmin && orgId) {
      return {
        isOrg: true,
        items: [
          { name: 'dashboard', label: 'Control Panel', icon: 'grid' as const, route: `/admin/${orgId}` as const },
          { name: 'settings', label: 'Org Settings', icon: 'settings' as const, route: `/admin/${orgId}/settings` as const },
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
            <View className="w-9 h-9 rounded-xl bg-white dark:bg-slate-950 border border-brand-orange shadow-md dark:shadow-brand-orange/20 flex items-center justify-center">
              <Text className="font-orbitron-bold text-lg text-brand-orange mt-0.5">SK</Text>
            </View>
            <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white mt-1">
              SCOREKEEPER
            </Text>
          </TouchableOpacity>

          {/* Pin / Collapse Toggle Button */}
          <TouchableOpacity
            onPress={toggleMinimized}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 active:opacity-85"
            {...(Platform.OS === 'web' ? { title: isSidebarMinimized ? 'Pin Sidebar Open' : 'Collapse Sidebar' } : {})}
          >
            <Ionicons 
              name={isSidebarMinimized ? "chevron-forward-outline" : "chevron-back-outline"} 
              size={20} 
              color={isDark ? '#94A3B8' : '#64748B'} 
            />
          </TouchableOpacity>
        </View>

        {/* NAVIGATION LINKS */}
        {navConfig.isOrg ? (
          <>
            {/* Org context card */}
            {(() => {
              const getContrastColor = (hexColor: string) => {
                if (!hexColor) return '#FFFFFF';
                const color = hexColor.replace('#', '');
                if (color.length !== 6) return '#FFFFFF';
                const r = parseInt(color.substring(0, 2), 16);
                const g = parseInt(color.substring(2, 4), 16);
                const b = parseInt(color.substring(4, 6), 16);
                const yiq = (r * 299 + g * 587 + b * 114) / 1000;
                return yiq >= 128 ? '#0F172A' : '#FFFFFF';
              };

              const primaryColor = orgData?.primaryColor || '#FF3E00';
              const textColor = getContrastColor(primaryColor);
              const isDarkBg = textColor === '#FFFFFF';

              return (
                <View className="mb-6">
                  <Text className="font-inter-bold text-[9px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 px-1">
                    Active Workspace
                  </Text>
                  <View 
                    className="p-1.5 px-2.5 rounded-xl border flex-row items-center gap-3 relative overflow-hidden"
                    style={{ 
                      backgroundColor: primaryColor,
                      borderColor: orgData?.secondaryColor || '#00E5FF',
                      borderWidth: 2,
                    }}
                  >
                    <View 
                      className="absolute -right-12 -top-12 w-24 h-24 rounded-full blur-xl opacity-20"
                      style={{ backgroundColor: orgData?.secondaryColor || '#00E5FF' }}
                    />
                    <View className="z-10 flex-shrink-0">
                      <OrgLogo 
                        logo={orgData?.logo} 
                        settings={orgData?.settings} 
                        size={44} 
                        className={isDarkBg ? 'border border-white/20' : 'border border-black/10'}
                        primaryColor={textColor}
                      />
                    </View>
                    <View className="flex-1 min-w-0 z-10 justify-center">
                      <Text 
                        className="font-orbitron-bold text-sm uppercase leading-tight truncate"
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
              {navConfig.items.map((item) => {
                const isActive = orgSubTab === item.name;
                const activeColor = orgData?.primaryColor || '#FF3E00';
                return (
                  <TouchableOpacity
                    key={item.name}
                    onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                    className={`flex-row items-center gap-3.5 px-3 py-3 rounded-xl ${
                      isActive 
                        ? 'bg-slate-100 dark:bg-white/5 border-l-4'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5 border-l-4 border-transparent'
                    }`}
                    style={isActive ? { borderLeftColor: activeColor } : undefined}
                  >
                    <Ionicons 
                      name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                      size={20} 
                      color={isActive ? activeColor : (isDark ? '#94A3B8' : '#64748B')} 
                    />
                    <Text 
                      className={`font-inter-bold text-sm tracking-wide ${
                        isActive 
                          ? 'text-slate-900 dark:text-white' 
                          : 'text-slate-600 dark:text-slate-400'
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
                className="flex-row items-center gap-3.5 px-3 py-3 mt-4 rounded-xl border border-dashed border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 active:opacity-85"
              >
                <Ionicons name="arrow-back-outline" size={20} color="#FF3E00" />
                <Text className="font-inter-bold text-sm tracking-wide text-brand-orange">
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
                      ? 'bg-brand-orange/10 dark:bg-brand-orange/15 border-l-4 border-brand-orange'
                      : 'hover:bg-slate-100 dark:hover:bg-white/5 border-l-4 border-transparent'
                  }`}
                >
                  <Ionicons 
                    name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                    size={20} 
                    color={isActive ? '#FF3E00' : (isDark ? '#94A3B8' : '#64748B')} 
                  />
                  <Text 
                    className={`font-inter-bold text-sm tracking-wide ${
                      isActive 
                        ? 'text-brand-orange' 
                        : 'text-slate-600 dark:text-slate-400'
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
      <View className="pt-4 border-t border-slate-200 dark:border-white/5">
        {isAuthenticated && user ? (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/settings' as any))}
            className="flex-row items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 active:opacity-85"
          >
            <View className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden flex-shrink-0">
              {getAvatarUri() ? (
                <Image
                  source={{ uri: getAvatarUri()! }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Text className="font-orbitron-bold text-sm text-slate-700 dark:text-slate-200">
                  {getInitials(user.name)}
                </Text>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="font-inter-bold text-sm text-slate-800 dark:text-white truncate">
                {user.name}
              </Text>
              <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">
                {user.globalRole === 'admin' ? 'System Admin' : (user.isAdminOrCoach ? 'Coach/Admin' : 'Member')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/(auth)/login' as any))}
            className="flex-row items-center justify-center gap-2 py-3 bg-brand-orange/10 dark:bg-brand-orange/20 border border-brand-orange/20 rounded-xl hover:bg-brand-orange/15 active:opacity-85"
          >
            <Ionicons name="log-in-outline" size={16} color="#FF3E00" />
            <Text className="font-inter-bold text-xs text-brand-orange uppercase tracking-wider">
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
          className="w-10 h-10 rounded-xl bg-white dark:bg-slate-950 border border-brand-orange shadow-md dark:shadow-brand-orange/20 flex items-center justify-center mb-6 active:opacity-85"
          {...(Platform.OS === 'web' ? { title: 'ScoreKeeper Home' } : {})}
        >
          <Text className="font-orbitron-bold text-base text-brand-orange">SK</Text>
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
                backgroundColor: orgData?.primaryColor || 'transparent',
                borderColor: orgData?.secondaryColor || (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
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
          {navConfig.items.map((item) => {
            const isActive = navConfig.isOrg ? orgSubTab === item.name : activeTab === item.name;
            const activeColor = navConfig.isOrg ? (orgData?.primaryColor || '#FF3E00') : '#FF3E00';
            return (
              <TouchableOpacity
                key={item.name}
                onPress={() => confirmThenNavigate(() => router.push(item.route as any))}
                className={`w-10 h-10 rounded-xl items-center justify-center relative ${
                  isActive 
                    ? 'bg-brand-orange/15 dark:bg-brand-orange/20 border border-brand-orange/30'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                }`}
                {...(Platform.OS === 'web' ? { title: item.label } : {})}
              >
                <Ionicons 
                  name={isActive ? item.icon : (`${item.icon}-outline` as any)} 
                  size={20} 
                  color={isActive ? activeColor : (isDark ? '#94A3B8' : '#64748B')} 
                />
              </TouchableOpacity>
            );
          })}

          {/* Exit Workspace Icon in Minimized View */}
          {navConfig.isOrg && (
            <TouchableOpacity
              onPress={() => confirmThenNavigate(() => router.replace('/(tabs)/organizations' as any))}
              className="w-10 h-10 rounded-xl items-center justify-center border border-dashed border-red-400/40 hover:bg-red-50 dark:hover:bg-red-950/20"
              {...(Platform.OS === 'web' ? { title: 'Exit Workspace' } : {})}
            >
              <Ionicons name="arrow-back-outline" size={20} color="#FF3E00" />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* User Logo / Avatar Bottom */}
      <View className="pt-3 border-t border-slate-200 dark:border-white/5 w-full items-center">
        {isAuthenticated && user ? (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/settings' as any))}
            className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800 items-center justify-center overflow-hidden active:opacity-85"
            {...(Platform.OS === 'web' ? { title: user.name } : {})}
          >
            {getAvatarUri() ? (
              <Image
                source={{ uri: getAvatarUri()! }}
                className="w-full h-full object-cover"
              />
            ) : (
              <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-200">
                {getInitials(user.name)}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => confirmThenNavigate(() => router.push('/(auth)/login' as any))}
            className="w-10 h-10 rounded-xl bg-brand-orange/10 dark:bg-brand-orange/20 border border-brand-orange/20 items-center justify-center active:opacity-85"
            {...(Platform.OS === 'web' ? { title: 'Log In / Sign Up' } : {})}
          >
            <Ionicons name="log-in-outline" size={18} color="#FF3E00" />
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
    return (
      <View className="relative h-full z-40" {...webHoverHandlers}>
        {/* Minimized Static Icon Rail */}
        <View className="w-16 h-full border-r bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5">
          {renderMinimizedRail()}
        </View>

        {/* Hover Floating Overlay Modal with CSS transition */}
        <View 
          pointerEvents={isHovered ? 'auto' : 'none'}
          className="absolute top-0 left-0 bottom-0 w-64 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/10 shadow-2xl z-50 py-6 px-4 flex flex-col justify-between"
          style={Platform.OS === 'web' ? ({
            transition: 'opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'translateX(0px)' : 'translateX(-12px)',
          } as any) : {
            opacity: isHovered ? 1 : 0,
          }}
        >
          {renderExpandedContent()}
        </View>
      </View>
    );
  }

  // Expanded Pinned Sidebar View
  return (
    <View className="w-64 h-full border-r bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 py-6 px-4 flex flex-col justify-between z-40">
      {renderExpandedContent()}
    </View>
  );
}
