import { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Checked in order, so a longer name is not taken for a shorter one inside it. */
const BY_NAME: [string, IconName][] = [
  ['table tennis', 'table-tennis'],
  ['rugby', 'rugby'],
  ['netball', 'basketball-hoop'],
  ['basketball', 'basketball'],
  ['soccer', 'soccer'],
  ['football', 'soccer'],
  ['hockey', 'hockey-sticks'],
  ['cricket', 'cricket'],
  ['tennis', 'tennis'],
  ['volleyball', 'volleyball'],
  ['baseball', 'baseball'],
  ['softball', 'baseball'],
  ['badminton', 'badminton'],
  ['water polo', 'water-polo'],
  ['swim', 'swim'],
  ['athletic', 'run-fast'],
  ['golf', 'golf'],
];

/**
 * A sport's icon, found from its name, with a trophy for any other. Stands in until a sport stores
 * its own icon (`SPORT-12`), which is why the word goes beside it wherever it is shown.
 */
export function sportIcon(sportName?: string | null): IconName {
  const name = (sportName || '').toLowerCase();
  return BY_NAME.find(([key]) => name.includes(key))?.[1] ?? 'trophy-outline';
}
