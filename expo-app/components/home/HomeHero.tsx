import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GameSummary, HomeNearby, Sport } from '@sk/shared';
import { Button } from '../Button';
import { FixtureCrest, RowTag, fixtureSideNames, sideScores } from '../events/EventBits';
import { homeLinks } from './homeLinks';
import { formatDistance } from '../../utils/distance';

/**
 * The top of Home for someone not signed in (`HOME-1`, option B on mockups/home-near-you.html):
 * what ScoreKeeper is in a line, *Create an account*, *Log in* and *What is ScoreKeeper?*, all
 * before any scrolling — and, on a wide screen, the closest game that is live right now, the real
 * one, as the preview of what the app does. No live game, no preview.
 *
 * In the theme's own colours, with the accent in the bottom-right corner only (design rule 29).
 * **To be refined in a session of its own** (decided 2026-10-22).
 */
export function HomeHero({ nearby, sports, isWide }: { nearby: HomeNearby | null; sports: Sport[]; isWide: boolean }) {
  const router = useRouter();
  const live = isWide ? closestLiveGame(nearby) : null;

  return (
    <View className="rounded-2xl border border-line bg-card overflow-hidden" style={{ padding: isWide ? 28 : 16 }}>
      <View
        pointerEvents="none"
        className="absolute rounded-full bg-primary-soft"
        style={isWide ? { width: 420, height: 420, right: -170, bottom: -230 } : { width: 200, height: 200, right: -110, bottom: -130 }}
      />
      <View className={isWide ? 'flex-row items-center gap-8' : 'gap-4'}>
        <View className="min-w-0" style={isWide ? { flex: 1.15 } : undefined}>
          <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 42 : 30, lineHeight: isWide ? 46 : 34, letterSpacing: -0.5 }}>
            School and club sport, <Text className="text-primary-ink">live</Text>.
          </Text>
          <Text className="font-inter text-ink-soft mt-3" style={{ fontSize: isWide ? 17 : 15, lineHeight: isWide ? 26 : 22, maxWidth: 520 }}>
            Follow scores, fixtures and tournaments from the schools and clubs around you. No account needed to watch.
          </Text>
          <View className="flex-row gap-2.5 mt-5">
            <Button title="Create an account" onPress={() => router.push('/(auth)/signup' as any)} className={isWide ? 'px-5' : 'flex-1'} />
            <Button title="Log in" variant="ghost" onPress={() => router.push('/(auth)/login' as any)} className={isWide ? 'px-5' : 'flex-1'} />
          </View>
          <TouchableOpacity onPress={() => router.push(homeLinks.about() as any)} accessibilityRole="link" className="mt-4 self-start" hitSlop={8}>
            <Text className="font-inter-bold text-sm text-primary-ink">What is ScoreKeeper? ›</Text>
          </TouchableOpacity>
        </View>
        {live ? (
          <View style={{ flex: 0.85 }} className="min-w-0">
            <LivePreview game={live.game} km={live.km} sports={sports} facilityName={id => (id && nearby?.facilityNames[id]) || ''} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The closest live game near the viewer: a single match first, else one in a tournament. */
function closestLiveGame(nearby: HomeNearby | null): { game: GameSummary; km: number | null } | null {
  if (!nearby) return null;
  const single = nearby.games.find(g => g.game.status === 'Live');
  if (single) return single;
  for (const t of nearby.tournaments) {
    const game = t.games.find(g => g.status === 'Live');
    if (game) return { game, km: t.km };
  }
  return null;
}

function LivePreview({ game, km, sports, facilityName }: {
  game: GameSummary;
  km: number | null;
  sports: Sport[];
  facilityName: (id?: string | null) => string;
}) {
  const router = useRouter();
  const [home, away] = game.participants || [];
  const scores = sideScores(game);
  const heading = [sports.find(s => s.id === game.sportId)?.name, facilityName(game.facilityId), formatDistance(km)].filter(Boolean).join(' · ');
  const side = (participant: typeof home, score: number | undefined) => (
    <View className="flex-row items-center gap-2.5 py-1.5">
      <FixtureCrest participant={participant} size={26} />
      <Text className="flex-1 font-inter-bold text-base text-ink" numberOfLines={1}>{fixtureSideNames(participant).full}</Text>
      <Text className="font-orbitron-bold text-xl text-danger-ink">{score ?? ''}</Text>
    </View>
  );
  return (
    <TouchableOpacity
      onPress={() => router.push(homeLinks.game(game.eventId, game.id) as any)}
      accessibilityRole="link"
      accessibilityLabel={`Live: ${fixtureSideNames(home).full} against ${fixtureSideNames(away).full}`}
      activeOpacity={0.85}
      className="rounded-2xl border border-line bg-popover p-4"
      style={{ transform: [{ rotate: '1.2deg' }] }}
    >
      <View className="flex-row items-center justify-between gap-2 mb-2">
        <Text className="flex-1 font-inter-semibold text-xs text-ink-muted" numberOfLines={1}>{heading}</Text>
        <RowTag tone="live" label="● Live" />
      </View>
      {side(home, scores?.[0])}
      {side(away, scores?.[1])}
      <View className="flex-row items-center justify-between mt-2 pt-2.5 border-t border-line-soft">
        <Text className="font-inter text-xs text-ink-muted">Scored live from the touchline</Text>
        {game.periodLabel ? <Text className="font-inter-semibold text-xs text-danger-ink">{game.periodLabel}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}
