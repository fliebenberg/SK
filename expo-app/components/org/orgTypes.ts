import { Ionicons } from '@expo/vector-icons';
import { OrganizationType } from '@sk/shared';

/** The organisation types, in the order the picker offers them, each with the icon the profile banner shows. */
export const ORG_TYPES: { value: OrganizationType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'SCHOOL', label: 'School', icon: 'school-outline' },
  { value: 'CLUB', label: 'Sports Club', icon: 'people-outline' },
  { value: 'ACADEMY', label: 'Academy', icon: 'ribbon-outline' },
  { value: 'LEAGUE', label: 'League', icon: 'trophy-outline' },
  { value: 'CORPORATE', label: 'Corporate', icon: 'briefcase-outline' },
  { value: 'COMMUNITY', label: 'Community', icon: 'home-outline' },
  { value: 'OTHER', label: 'Other', icon: 'pricetag-outline' },
];

/**
 * What to call an org's type: the listed label, or for Other what was typed in ("Charity").
 * Other with nothing typed — only in data from before the description was required — reads "Other".
 */
export function orgTypeLabel(type?: OrganizationType | null, customType?: string | null): string {
  if (!type) return '';
  if (type === 'OTHER') return customType?.trim() || 'Other';
  return ORG_TYPES.find(t => t.value === type)?.label || '';
}

export function orgTypeIcon(type?: OrganizationType | null): keyof typeof Ionicons.glyphMap {
  return ORG_TYPES.find(t => t.value === type)?.icon || 'pricetag-outline';
}
