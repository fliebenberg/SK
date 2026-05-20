import React from 'react';
import { Platform } from 'react-native';
import { XStack, YStack, Text, useTheme } from 'tamagui';
import { Link } from 'expo-router';
import { Trophy, LogOut } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { MetalButton } from './ui/MetalButton';

export function Navbar() {
  // Only render on Web targets
  if (Platform.OS !== 'web') {
    return null;
  }

  const { isAuthenticated, user, logout } = useAuth();
  const theme = useTheme();
  const primaryColor = theme.primary?.get() || '#10b981';

  return (
    <XStack
      height={64}
      borderBottomWidth={1.5}
      borderColor="#1f1f23"
      backgroundColor="#070708"
      px="$5"
      alignItems="center"
      justifyContent="space-between"
      width="100%"
      zIndex={100}
    >
      {/* Brand Logo & Name */}
      <Link href="/" asChild>
        <XStack gap="$2.5" alignItems="center" cursor="pointer">
          <Trophy size={22} color="#f59e0b" style={{ filter: 'drop-shadow(0 0 4px rgba(245,158,11,0.4))' }} />
          <Text
            fontFamily="$heading"
            fontSize={18}
            fontWeight="900"
            color="$color"
            letterSpacing={1.5}
            style={{ textShadowColor: 'rgba(255,255,255,0.1)', textShadowRadius: 4 }}
          >
            SCOREKEEPER
          </Text>
        </XStack>
      </Link>

      {/* Center Navigation Links */}
      <XStack gap="$5" alignItems="center">
        <Link href="/" asChild>
          <Text
            fontSize={13}
            fontWeight="700"
            color="$gray11"
            cursor="pointer"
            hoverStyle={{ color: '$color' }}
          >
            Home
          </Text>
        </Link>

        <Link href="/teams" asChild>
          <Text
            fontSize={13}
            fontWeight="700"
            color="$gray11"
            cursor="pointer"
            hoverStyle={{ color: '$color' }}
          >
            Teams
          </Text>
        </Link>

        <Link href="/sites" asChild>
          <Text
            fontSize={13}
            fontWeight="700"
            color="$gray11"
            cursor="pointer"
            hoverStyle={{ color: '$color' }}
          >
            Sites
          </Text>
        </Link>

        <Link href="/live" asChild>
          <Text
            fontSize={13}
            fontWeight="700"
            color="$gray11"
            cursor="pointer"
            hoverStyle={{ color: '$color' }}
          >
            Live Scores
          </Text>
        </Link>

        {isAuthenticated && (
          <Link href="/admin" asChild>
            <Text
              fontSize={13}
              fontWeight="800"
              color={primaryColor}
              cursor="pointer"
              hoverStyle={{ color: '$color' }}
            >
              Admin Panel
            </Text>
          </Link>
        )}
      </XStack>

      {/* Right-aligned Profile Menu or Sign In */}
      <XStack gap="$3" alignItems="center">
        {isAuthenticated ? (
          <XStack gap="$3.5" alignItems="center">
            <YStack>
              <Text fontSize={12} fontWeight="700" color="$color" textAlign="right">
                {user?.name || 'Administrator'}
              </Text>
              <Text fontSize={10} color="$gray9" textAlign="right">
                {user?.email || 'Admin Profile'}
              </Text>
            </YStack>

            <MetalButton
              variantType="secondary"
              size="sm"
              onPress={logout}
              icon={<LogOut size={13} color="#ef4444" />}
            >
              Log Out
            </MetalButton>
          </XStack>
        ) : (
          <XStack gap="$2.5">
            <MetalButton
              variantType="outlined"
              glowColor={primaryColor}
              size="sm"
              href="/login"
            >
              Sign In
            </MetalButton>
            <MetalButton
              variantType="filled"
              glowColor={primaryColor}
              size="sm"
              href="/signup"
            >
              Sign Up
            </MetalButton>
          </XStack>
        )}
      </XStack>
    </XStack>
  );
}
