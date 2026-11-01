import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Organization } from '@sk/shared';
import { FixtureCrest } from '../events/EventBits';
import { Tick } from '../tournament/OrganisationDialogs';
import { wsService } from '../../services/websocket';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * Before anyone creates an organisation, wherever they do it: might it already be here? A second
 * copy splits a school's teams and fixtures in two, and nothing merges them afterwards. Asked rather
 * than refused, because two schools may share a name (`orgNameMatch` on the server decides what is
 * close enough to ask).
 *
 * This is advice, so a check that fails says nothing and stands in nobody's way: it answers with no
 * matches, and the create itself is what reports a lost connection.
 *
 * `answered` is what a dialog's save waits for: the check is back, and any matches have been ticked
 * away. The tick belongs to that list of matches, not to the dialog: a different list asks again.
 */
export function usePossibleDuplicateOrgs(name: string, active: boolean, options?: { publicOnly?: boolean }) {
  const typed = name.trim();
  const publicOnly = !!options?.publicOnly;
  const [answer, setAnswer] = useState<{ name: string; matches: Organization[] }>({ name: '', matches: [] });
  const [confirmedOf, setConfirmedOf] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !typed) return;
    let live = true;
    const timer = setTimeout(() => {
      wsService.emit('get_data', { type: 'possible_duplicate_orgs', name: typed }, (res: any) => {
        if (!live) return;
        const found: Organization[] = Array.isArray(res) ? res : [];
        setAnswer({ name: typed, matches: publicOnly ? found.filter(org => !org.isPrivate) : found });
      }, undefined, { suppressToast: true });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typed, active, publicOnly]);

  // Fresh each time it opens.
  useEffect(() => {
    if (active) return;
    setAnswer({ name: '', matches: [] });
    setConfirmedOf(null);
  }, [active]);

  // The last answer stays up while the next is on its way, so the list does not flicker as they type.
  const matches = typed ? answer.matches : [];
  const key = matches.map(org => org.id).join();
  const confirmedNew = confirmedOf === key;
  return {
    matches,
    confirmedNew,
    setConfirmedNew: (confirmed: boolean) => setConfirmedOf(confirmed ? key : null),
    answered: !typed || (answer.name === typed && (!matches.length || confirmedNew)),
  };
}

/**
 * The matches, under the name they were typed against. Pressing one is the dialog's to decide: on
 * *Add organisation* it opens that organisation's page, where one with no administrator can be
 * claimed; on *Register an organisation* it is used instead (`chooseLabel`). One that cannot be chosen
 * says why (`unavailable`). The tick is what lets a different organisation with a similar name through.
 */
export function PossibleDuplicateOrgs({ matches, onOpen, chooseLabel, unavailable, confirmedNew, onConfirmNew }: {
  matches: Organization[];
  onOpen: (org: Organization) => void;
  chooseLabel?: string;
  unavailable?: (org: Organization) => string | undefined;
  confirmedNew: boolean;
  onConfirmNew: (confirmed: boolean) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  if (!matches.length) return null;
  return (
    <View testID="possible-duplicate-orgs" className="rounded-xl bg-warning-soft px-3 py-2.5 gap-1">
      <Text className="font-inter-bold text-sm text-warning-ink">Is it already on ScoreKeeper?</Text>
      {matches.map(org => {
        const why = unavailable?.(org);
        return (
          <TouchableOpacity
            key={org.id}
            onPress={() => onOpen(org)}
            disabled={!!why}
            accessibilityRole={chooseLabel ? 'button' : 'link'}
            accessibilityLabel={`${chooseLabel ? `${chooseLabel}:` : 'Open'} ${org.name}`}
            className="flex-row items-center gap-2.5 py-1.5"
          >
            <FixtureCrest participant={{ id: org.id, orgId: org.id, orgLogo: org.logo, orgPrimaryColor: org.primaryColor }} size={26} />
            <View className="flex-1 min-w-0">
              <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{org.name}</Text>
              <Text className="font-inter text-xs text-ink-soft" numberOfLines={1}>
                {[org.shortName, org.address?.city, org.isClaimed === false ? 'No administrator yet' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {why ? (
              <Text className="font-inter text-xs text-ink-soft">{why}</Text>
            ) : chooseLabel ? (
              <Text className="font-inter-bold text-[13px] text-primary-ink">{chooseLabel}</Text>
            ) : (
              <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} />
            )}
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={() => onConfirmNew(!confirmedNew)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmedNew }}
        className="flex-row items-center gap-2.5 pt-1.5"
      >
        <Tick on={confirmedNew} />
        <Text className="flex-1 font-inter-semibold text-sm text-ink">None of these. It's a different organisation.</Text>
      </TouchableOpacity>
    </View>
  );
}
