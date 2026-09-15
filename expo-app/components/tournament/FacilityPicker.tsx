import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Facility, Site } from '@sk/shared';

/**
 * Which facilities a tournament uses — or one division of it (U47).
 *
 * **Facility** is the general term and the one the UI says (U49): the categories a facility can
 * carry are field/court, hall, clubhouse, shop, parking and toilets, so half of what belongs here
 * is never played on, and "fields" excluded it by name. A sport that wants its own word for a
 * playing surface has `Sport.facilityTerm` for that.
 *
 * **A base site is not a boundary.** The tournament is *based* somewhere, and that is what the
 * listing shows and what this picker opens on; it does not limit anything, because a host
 * borrowing the field next door is ordinary rather than exceptional. So the facilities are grouped
 * by site with the base site first, and every other site the organisation owns is right there
 * under it rather than behind a filter.
 *
 * **Empty means something.** For a division, no selection is not "none" but *inherit* — any of the
 * tournament's facilities that suit its sport. `emptyLabel` is how the caller says which of those
 * two an empty list means, and it is rendered in place of the chips so the state is legible
 * without counting.
 *
 * Facilities are not filtered by the sport they support. `Facility.supportedSportIds` is optional
 * and mostly unset in practice, so filtering on it would hide real fields; the sport rule belongs
 * to the scheduler, which warns rather than blocks (U26).
 */
export interface FacilityPickerProps {
  sites: Site[];
  facilities: Facility[];
  /** Selected facility ids. */
  value: string[];
  onChange: (facilityIds: string[]) => void;
  /** Shown first and marked, if the caller has one. Never filters the list. */
  baseSiteId?: string;
  /**
   * Narrow what may be offered at all — the event's facilities, when picking a division's.
   * Undefined offers every facility the organisation has.
   */
  allowedFacilityIds?: string[];
  /** What no selection means here. */
  emptyLabel?: string;
  disabled?: boolean;
}

export function FacilityPicker({
  sites,
  facilities,
  value,
  onChange,
  baseSiteId,
  allowedFacilityIds,
  emptyLabel = 'None chosen yet.',
  disabled,
}: FacilityPickerProps) {
  const offered = useMemo(
    () =>
      allowedFacilityIds
        ? facilities.filter(facility => allowedFacilityIds.includes(facility.id))
        : facilities,
    [facilities, allowedFacilityIds]
  );

  /** Grouped by site, base site first, then alphabetically — a stable order to scan. */
  const groups = useMemo(() => {
    const bySite = new Map<string, Facility[]>();
    for (const facility of offered) {
      const list = bySite.get(facility.siteId) || [];
      list.push(facility);
      bySite.set(facility.siteId, list);
    }
    return [...bySite.entries()]
      .map(([siteId, siteFacilities]) => ({
        siteId,
        name: sites.find(s => s.id === siteId)?.name || 'Another venue',
        isBase: !!baseSiteId && siteId === baseSiteId,
        facilities: [...siteFacilities].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [offered, sites, baseSiteId]);

  const toggle = (facilityId: string) => {
    if (disabled) return;
    onChange(
      value.includes(facilityId) ? value.filter(id => id !== facilityId) : [...value, facilityId]
    );
  };

  if (groups.length === 0) {
    return (
      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
        {allowedFacilityIds
          ? 'The tournament has no facilities in play yet, so there is nothing to narrow to.'
          : 'This organisation has no facilities recorded yet. Add them to a site first.'}
      </Text>
    );
  }

  return (
    <View className="gap-3">
      {value.length === 0 && (
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">{emptyLabel}</Text>
      )}

      {groups.map(group => (
        <View key={group.siteId} className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {group.name}
            </Text>
            {group.isBase && (
              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">
                base site
              </Text>
            )}
          </View>
          <View className="flex-row flex-wrap gap-2">
            {group.facilities.map(facility => {
              const isOn = value.includes(facility.id);
              return (
                <TouchableOpacity
                  key={facility.id}
                  onPress={() => toggle(facility.id)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isOn, disabled: !!disabled }}
                  accessibilityLabel={`${facility.name} at ${group.name}`}
                  className={`px-3 py-1.5 rounded-full border ${
                    isOn
                      ? 'bg-brand-orange/10 border-brand-orange/40'
                      : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5'
                  } ${disabled ? 'opacity-50' : ''}`}
                >
                  <Text
                    className={`font-inter text-xs ${
                      isOn ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {facility.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * What a set of facilities is called in one line — for a row that reports rather than edits.
 *
 * Takes the inheriting case seriously: an empty allocation on a division is not "no venue", it is
 * every venue the tournament has, and saying so is the difference between a row that reads as
 * unfinished and one that reads as deliberate.
 */
export function facilitySummary(
  facilityIds: string[] | undefined,
  facilities: Facility[],
  inheritLabel: string
): string {
  const ids = facilityIds || [];
  if (ids.length === 0) return inheritLabel;
  const names = ids
    .map(id => facilities.find(f => f.id === id)?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) return `${ids.length} facilit${ids.length === 1 ? 'y' : 'ies'}`;
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}
