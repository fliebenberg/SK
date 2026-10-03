import { Facility } from '@sk/shared';
import type { MapMarker } from './AddressMap';
import { themeColor } from '../../constants/Colors';

/**
 * How a facility looks on a map and in a list: an Ionicons name and a colour. A facility with a
 * primary sport shows that sport's icon in brand orange; otherwise its category decides both. `isDark`
 * picks the theme's shade of each colour.
 */
export function facilityIcon(fac: Pick<Facility, 'primarySportId' | 'category'>, sports: { id: string; name?: string }[], isDark: boolean): { icon: string; color: string } {
  if (fac.primarySportId) {
    const name = (sports.find(s => s.id === fac.primarySportId)?.name || '').toLowerCase();
    let icon = 'location-outline';
    if (name.includes('rugby')) icon = 'american-football';
    else if (name.includes('soccer') || name.includes('football')) icon = 'football';
    else if (name.includes('tennis')) icon = 'tennisball';
    else if (name.includes('cricket')) icon = 'baseball';
    else if (name.includes('golf')) icon = 'golf';
    else if (name.includes('chess')) icon = 'trophy-outline';
    return { icon, color: themeColor(isDark, 'primary') };
  }
  switch (fac.category) {
    case 'sport_field': return { icon: 'tennisball-outline', color: themeColor(isDark, 'primary') };
    case 'indoor_hall': return { icon: 'business-outline', color: themeColor(isDark, 'primary') };
    case 'clubhouse': return { icon: 'home-outline', color: themeColor(isDark, 'info') };
    case 'shop': return { icon: 'cart-outline', color: themeColor(isDark, 'success') };
    case 'parking': return { icon: 'car-outline', color: themeColor(isDark, 'ink-muted') };
    case 'restroom': return { icon: 'water-outline', color: themeColor(isDark, 'special') };
    default: return { icon: 'location-outline', color: themeColor(isDark, 'ink-muted') };
  }
}

/** A site's facilities as map markers, skipping any without a pin. */
export function facilityMarkers(facilities: Facility[], sports: { id: string; name?: string }[], isDark: boolean): MapMarker[] {
  return facilities
    .filter(f => f.latitude != null && f.longitude != null)
    .map(f => ({
      id: f.id,
      latitude: f.latitude!,
      longitude: f.longitude!,
      title: f.name,
      description: f.surfaceType || undefined,
      ...facilityIcon(f, sports, isDark),
    }));
}
