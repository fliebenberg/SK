import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants/Colors';
import { AccessDenied } from './AccessDenied';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Restrict to members of this organization. Global admins always pass. */
  orgId?: string;
  /** Restrict to platform administrators. */
  requireGlobalAdmin?: boolean;
  /** Copy shown when the user is signed in but lacks the required role. */
  deniedMessage?: string;
}

const SessionResolving = () => (
  <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
    <ActivityIndicator size="large" color={COLORS.brand.orange} />
    <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
      Checking Access...
    </Text>
  </View>
);

/**
 * Blocks its subtree until the viewer is known to be signed in (and, when
 * `orgId` or `requireGlobalAdmin` is given, authorized). Unauthenticated
 * visitors are sent to the login screen with a redirect back to where they were
 * headed, so deep links survive the sign-in round trip.
 *
 * This is a UX gate only — every action behind it must still be authorized on
 * the server, which is the actual security boundary.
 */
export function AuthGuard({ children, orgId, requireGlobalAdmin, deniedMessage }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isSessionVerified = useAuthStore((state) => state.isSessionVerified);
  const membershipsLoaded = useAuthStore((state) => state.membershipsLoaded);
  const orgMemberships = useAuthStore((state) => state.orgMemberships);

  const isGlobalAdmin = user?.globalRole === 'admin';
  const isOrgMember = !!orgId && (orgMemberships || []).some((m: any) => m.orgId === orgId);

  // A persisted session is only trustworthy once storage has rehydrated and any
  // stored token has been checked against the server. Redirecting before that
  // would bounce signed-in users to the login screen on every hard refresh.
  const isResolvingSession = !isHydrated || (!!token && !isSessionVerified);

  // Memberships arrive over the socket after authentication, so an empty list
  // means "not fetched yet" rather than "no access".
  const isResolvingAccess =
    isAuthenticated && !!orgId && !isGlobalAdmin && !isOrgMember && !membershipsLoaded;

  const isResolving = isResolvingSession || isResolvingAccess;

  useEffect(() => {
    if (isResolving || isAuthenticated) return;
    router.replace({ pathname: '/(auth)/login', params: { redirect: pathname } });
  }, [isResolving, isAuthenticated, pathname]);

  // Also covers the frame(s) between deciding to redirect and the route change.
  if (isResolving || !isAuthenticated) {
    return <SessionResolving />;
  }

  if (requireGlobalAdmin && !isGlobalAdmin) {
    return (
      <AccessDenied
        message={deniedMessage || 'This area is restricted to platform administrators.'}
        actionLabel="Back to Live Feed"
        onAction={() => router.replace('/(tabs)' as any)}
      />
    );
  }

  if (orgId && !isGlobalAdmin && !isOrgMember) {
    return (
      <AccessDenied
        message={
          deniedMessage ||
          'You do not have a role in this organization, so its admin workspace is not available to you.'
        }
        actionLabel="Back to Organizations"
        onAction={() => router.replace('/(tabs)/organizations' as any)}
      />
    );
  }

  return <>{children}</>;
}
