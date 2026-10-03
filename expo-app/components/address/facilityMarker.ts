import { Facility } from '@sk/shared';
import type { MapMarker } from './AddressMap';

/**
 * How a facility looks on a map and in a list: an Ionicons name and a colour. A facility with a
 * primary sport shows that sport's icon in brand orange; otherwise its category decides both.
 */
export function facilityIcon(fac: Pick<Facility, 'primarySportId' | 'category'>, sports: { id: string; name?: string }[]): { icon: string; color: string } {
  if (fac.primarySportId) {
    const name = (sports.find(s => s.id === fac.primarySportId)?.name || '').toLowerCase();
    let icon = 'location-outline';
    if (name.includes('rugby')) icon = 'american-football';
    else if (name.includes('soccer') || name.includes('football')) icon = 'football';
    else if (name.includes('tennis')) icon = 'tennisball';
    else if (name.includes('cricket')) icon = 'baseball';
    else if (name.includes('golf')) icon = 'golf';
    else if (name.includes('chess')) icon = 'trophy-outline';
    return { icon, color: '#FF3E00' };
  }
  switch (fac.category) {
    case 'sport_field': return { icon: 'tennisball-outline', color: '#FF8C00' };
    case 'indoor_hall': return { icon: 'business-outline', color: '#FF8C00' };
    case 'clubhouse': return { icon: 'home-outline', color: '#3B82F6' };
    case 'shop': return { icon: 'cart-outline', color: '#10B981' };
    case 'parking': return { icon: 'car-outline', color: '#6B7280' };
    case 'restroom': return { icon: 'water-outline', color: '#8B5CF6' };
    default: return { icon: 'location-outline', color: '#475569' };
  }
}

/** A site's facilities as map markers, skipping any without a pin. */
export function facilityMarkers(facilities: Facility[], sports: { id: string; name?: string }[]): MapMarker[] {
  return facilities
    .filter(f => f.latitude != null && f.longitude != null)
    .map(f => ({
      id: f.id,
      latitude: f.latitude!,
      longitude: f.longitude!,
      title: f.name,
      description: f.surfaceType || undefined,
      ...facilityIcon(f, sports),
    }));
}
