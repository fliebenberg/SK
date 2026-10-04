import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Facility, GameSummary, resolveFixtureSide, Sport } from '@sk/shared';
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu';
import { fixtureDateParts } from '../../utils/dates';
import { FacilityIcon, categoryLabel, isPlayingArea } from './SiteBits';

/**
 * The rows of the site page (docs/sites.md): a facility, and a game coming up here.
 */

/**
 * One facility. The row opens Edit facility for an editor; its one ⋯ menu holds what is left —
 * deactivate or reactivate, and delete (design_system.md rule 15). A viewer who cannot edit gets
 * the row alone, which already says everything about it.
 */
export function FacilityRow({ facility, sports, first, canEdit, onPress, menu }: {
  facility: Facility;
  sports: Sport[];
  first: boolean;
  canEdit: boolean;
  onPress?: () => void;
  menu?: OverflowMenuItem[];
}) {
  const inactive = facility.isActive === false;
  const sportNames = (facility.supportedSportIds || []).map(id => sports.find(s => s.id === id)?.name).filter(Boolean).join(', ');
  const sub = isPlayingArea(facility)
    ? [sportNames, facility.surfaceType].filter(Boolean).join(' · ') || categoryLabel(facility.category)
    : categoryLabel(facility.category);
  const noPin = facility.latitude == null || facility.longitude == null;

  return (
    <View className={`flex-row items-center gap-1 -mx-4 pl-4 pr-2 ${first ? '' : 'border-t border-line-soft'}`}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.7}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityHint={onPress ? 'Edit this facility' : undefined}
        className="flex-1 flex-row items-center gap-2.5 py-2 min-w-0"
      >
        <FacilityIcon facility={facility} sports={sports} dim={inactive} />
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1.5">
            <Text className={`font-inter-semibold text-sm flex-shrink ${inactive ? 'text-ink-muted' : 'text-ink'}`} numberOfLines={1}>{facility.name}</Text>
            {inactive ? (
              <View className="ml-auto rounded-full border px-2 py-px bg-sunken border-line">
                <Text className="font-inter-semibold text-[11px] text-ink-soft">Inactive</Text>
              </View>
            ) : noPin && canEdit ? (
              <Text className="ml-auto pl-2 font-inter-semibold text-[11px] text-warning-ink">No pin</Text>
            ) : null}
          </View>
          <Text className="font-inter text-xs text-ink-muted mt-0.5" numberOfLines={1}>{sub}</Text>
        </View>
      </TouchableOpacity>
      {menu?.length ? <OverflowMenu items={menu} title={facility.name} accessibilityLabel={`Actions for ${facility.name}`} /> : <View className="w-2" />}
    </View>
  );
}

/** A small heading inside a card — Playing areas, Other. */
export function CardSubheading({ text }: { text: string }) {
  return <Text className="font-inter-bold text-xs uppercase tracking-wider text-ink-muted mt-1">{text}</Text>;
}

/**
 * Who is playing, for a game at the organisation's own site: its own teams by name alone, any other
 * side with its organisation's short name, and a side nobody is playing yet as the fixture
 * describes it (`resolveFixtureSide`).
 */
export function gameTitle(game: GameSummary, orgId: string): string {
  const sides = [...(game.participants || [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(p => resolveFixtureSide({
      participant: p as any,
      name: p.name,
      orgShortName: p.orgId === orgId ? undefined : p.orgShortName,
    }).label);
  return sides.length ? sides.join(' vs ') : 'Teams to be decided';
}

/** One game coming up here: its date, who is playing, and when, on which facility, in what. */
export function SiteGameRow({ game, orgId, facilityName, eventName, first, onPress }: {
  game: GameSummary;
  orgId: string;
  facilityName?: string;
  eventName?: string;
  first: boolean;
  onPress: () => void;
}) {
  const parts = fixtureDateParts(game.scheduledStartTime || game.startTime, { timeTbd: game.timeTbd });
  const sub = [parts?.when, facilityName, eventName].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="link"
      className={`flex-row items-center gap-2.5 py-2 ${first ? '' : 'border-t border-line-soft'}`}
    >
      <View className="w-11 items-center">
        {parts ? (
          <>
            <Text className="font-inter-bold text-base leading-tight text-ink">{parts.day}</Text>
            <Text className="font-inter text-[11px] uppercase text-ink-muted">{parts.month}</Text>
          </>
        ) : (
          <Text className="font-inter text-[11px] text-ink-muted">TBD</Text>
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{gameTitle(game, orgId)}</Text>
        {sub ? <Text className="font-inter text-xs text-ink-muted mt-0.5" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {game.status === 'Live' ? (
        <Text className="font-inter-bold text-[11px] text-on-danger bg-danger rounded-full px-2 py-0.5 overflow-hidden">LIVE</Text>
      ) : null}
    </TouchableOpacity>
  );
}
