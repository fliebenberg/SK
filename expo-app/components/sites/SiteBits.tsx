import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Address, Facility, Site, Sport } from '@sk/shared';
import { facilityIcon } from '../address/facilityMarker';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * Small pieces the Sites list and the site page share, so a row and the page it opens show a site
 * the same way (docs/sites.md).
 */

/* ------------------------------------------------------------------------------------------------
 * Facility categories
 * --------------------------------------------------------------------------------------------- */

export const FACILITY_CATEGORIES: { key: string; label: string }[] = [
  { key: 'sport_field', label: 'Field or court' },
  { key: 'indoor_hall', label: 'Indoor hall' },
  { key: 'clubhouse', label: 'Clubhouse' },
  { key: 'shop', label: 'Shop or tuck shop' },
  { key: 'parking', label: 'Parking' },
  { key: 'restroom', label: 'Restrooms' },
  { key: 'other', label: 'Other' },
];

export const categoryLabel = (key?: string) => FACILITY_CATEGORIES.find(c => c.key === (key || 'other'))?.label || 'Other';

/** Fields, courts and halls — what games are played on. Everything else is for visitors. */
export const isPlayingArea = (f: Pick<Facility, 'category'>) => f.category === 'sport_field' || f.category === 'indoor_hall';

/** The facilities the list shows as icons beside a site's sports, in this order. */
const AMENITIES = ['parking', 'restroom', 'shop', 'clubhouse'];

/* ------------------------------------------------------------------------------------------------
 * Pickers
 * --------------------------------------------------------------------------------------------- */

/**
 * The sites a picker offers: an inactive site is left out, unless it is the one already chosen —
 * editing an old game must not quietly drop where it was played (docs/sites.md).
 */
export function pickableSites<T extends Pick<Site, 'id' | 'isActive'>>(sites: T[], chosen: (string | null | undefined)[] = []): T[] {
  return sites.filter(s => s.isActive !== false || chosen.includes(s.id));
}

/** The facilities a picker offers, by the same rule as `pickableSites`. */
export function pickableFacilities<T extends Pick<Facility, 'id' | 'isActive'>>(facilities: T[], chosen: (string | null | undefined)[] = []): T[] {
  return facilities.filter(f => f.isActive !== false || chosen.includes(f.id));
}

/* ------------------------------------------------------------------------------------------------
 * What a site has
 * --------------------------------------------------------------------------------------------- */

/** The sports a site's active facilities can host, by name. */
export function siteSports(facilities: Facility[], sports: Pick<Sport, 'id' | 'name'>[]): string[] {
  const ids = new Set(facilities.filter(f => f.isActive !== false).flatMap(f => f.supportedSportIds || []));
  return [...ids].map(id => sports.find(s => s.id === id)?.name).filter(Boolean).sort() as string[];
}

/** The categories of a site's active amenities — parking, restrooms, a shop, a clubhouse. */
export function siteAmenities(facilities: Facility[]): string[] {
  const have = new Set(facilities.filter(f => f.isActive !== false).map(f => f.category));
  return AMENITIES.filter(a => have.has(a));
}

/** A facility's mark — the same icon and colour as its pin on the map. */
export function FacilityIcon({ facility, sports, size = 32, dim }: {
  facility: Pick<Facility, 'primarySportId' | 'category'>;
  sports: { id: string; name?: string }[];
  size?: number;
  dim?: boolean;
}) {
  const isDark = useActiveTheme() === 'dark';
  const { icon, color } = facilityIcon(facility, sports, isDark);
  return (
    <View
      className="items-center justify-center bg-card"
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: size > 24 ? 2 : 1.5, borderColor: color, opacity: dim ? 0.5 : 1 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={icon as any} size={Math.round(size * 0.48)} color={color} />
    </View>
  );
}

/** The amenities as icons only, as on the map. Screen readers hear them named. */
export function AmenityIcons({ categories, dim }: { categories: string[]; dim?: boolean }) {
  if (!categories.length) return null;
  return (
    <View
      className="flex-row items-center gap-1"
      accessible
      accessibilityLabel={categories.map(categoryLabel).join(', ')}
    >
      {categories.map(c => <FacilityIcon key={c} facility={{ category: c }} sports={[]} size={22} dim={dim} />)}
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------
 * The address on one line
 * --------------------------------------------------------------------------------------------- */

/** Street, suburb and town — what tells an organisation's sites apart, in that order. */
export function addressParts(address?: Partial<Address> | null): string[] {
  if (!address) return [];
  const street = [address.building, address.addressLine1].filter(Boolean).join(', ');
  const parts = [street, address.addressLine2, address.city].map(p => (p || '').trim()).filter(Boolean);
  // An old address with only the one-line form.
  return parts.length ? parts : address.fullAddress ? [address.fullAddress] : [];
}

/**
 * A site's address on one line: the street, then the suburb, then the town, each dropped whole
 * from the back when there is no room — an organisation's sites are usually in one town and often
 * on one street, so the street is what is kept. Only the street is ever cut short, and only when
 * it does not fit on its own. "No address yet" for a site without one.
 */
export function SiteAddressLine({ address, className = 'font-inter text-xs text-ink-muted' }: {
  address?: Partial<Address> | null;
  className?: string;
}) {
  const parts = addressParts(address);
  const [room, setRoom] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);

  if (!parts.length) return <View className="flex-1 min-w-0"><Text className={className} numberOfLines={1}>No address yet</Text></View>;

  // How many parts fit, keeping at least the street.
  let shown = parts.length;
  if (room && widths.length === parts.length) {
    let used = 0;
    shown = 0;
    for (const w of widths) {
      if (shown > 0 && used + w > room + 0.5) break;
      used += w;
      shown += 1;
    }
  }
  const measured = (i: number, w: number) => setWidths(prev => {
    if (prev[i] === w) return prev;
    const next = [...prev];
    next[i] = w;
    return next.slice(0, parts.length);
  });

  return (
    <View className="flex-1 min-w-0" onLayout={e => setRoom(e.nativeEvent.layout.width)}>
      {/* Each part drawn unseen at its natural width, with the comma that joins it. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} aria-hidden>
        <View style={{ width: 10000, flexDirection: 'row', alignItems: 'flex-start' }}>
          {parts.map((p, i) => (
            <Text key={i} className={className} onLayout={e => measured(i, e.nativeEvent.layout.width)}>{i ? `, ${p}` : p}</Text>
          ))}
        </View>
      </View>
      <Text className={className} numberOfLines={1}>{parts.slice(0, shown).join(', ')}</Text>
    </View>
  );
}

/** For a screen reader or a search: the whole address on one line. */
export const addressText = (address?: Partial<Address> | null) => addressParts(address).join(', ');

/** A site's mark, where a team has its crest: a site has no logo, so it is a pin. */
export function SiteMark({ size, dim }: { size: number; dim?: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View
      className={`items-center justify-center ${dim ? 'bg-sunken' : 'bg-primary-soft'}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name="location" size={Math.round(size * 0.48)} color={themeColor(isDark, dim ? 'ink-muted' : 'primary-ink')} />
    </View>
  );
}
