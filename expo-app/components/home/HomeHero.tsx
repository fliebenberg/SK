import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../Button';
import { homeLinks } from './homeLinks';

/**
 * The top of Home for someone not signed in (`HOME-1`): what ScoreKeeper is in a line, then
 * *Create an account*, *Log in* and *What is ScoreKeeper?*, all before any scrolling. On a wide
 * screen those three sit on the right, beside the text; on a narrow one they follow it.
 *
 * In the theme's own colours, with the accent in the bottom-right corner only (design rule 29).
 * **To be refined in a session of its own** (decided 2026-10-22).
 */
export function HomeHero({ isWide }: { isWide: boolean }) {
  const router = useRouter();

  return (
    <View className="rounded-2xl border border-line bg-card overflow-hidden" style={{ padding: isWide ? 28 : 16 }}>
      <View
        pointerEvents="none"
        className="absolute rounded-full bg-primary-soft"
        style={isWide ? { width: 420, height: 420, right: -170, bottom: -230 } : { width: 200, height: 200, right: -110, bottom: -130 }}
      />
      <View className={isWide ? 'flex-row items-center gap-8' : 'gap-5'}>
        <View className="min-w-0" style={isWide ? { flex: 1 } : undefined}>
          <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 42 : 30, lineHeight: isWide ? 46 : 34, letterSpacing: -0.5 }}>
            School and club sport, <Text className="text-primary-ink">live</Text>.
          </Text>
          <Text className="font-inter text-ink-soft mt-3" style={{ fontSize: isWide ? 17 : 15, lineHeight: isWide ? 26 : 22, maxWidth: 520 }}>
            Follow scores, fixtures and tournaments from the schools and clubs around you. No account needed to watch.
          </Text>
        </View>
        <View className={isWide ? 'items-end gap-4' : 'gap-4'}>
          <View className="flex-row gap-2.5">
            <Button title="Create an account" onPress={() => router.push('/(auth)/signup' as any)} className={isWide ? 'px-5' : 'flex-1'} />
            <Button title="Log in" variant="ghost" onPress={() => router.push('/(auth)/login' as any)} className={isWide ? 'px-5' : 'flex-1'} />
          </View>
          <TouchableOpacity onPress={() => router.push(homeLinks.about() as any)} accessibilityRole="link" className={isWide ? undefined : 'self-start'} hitSlop={8}>
            <Text className="font-inter-bold text-sm text-primary-ink">What is ScoreKeeper? ›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
