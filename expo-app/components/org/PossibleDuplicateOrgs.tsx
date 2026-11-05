import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Organization } from '@sk/shared';
import { FixtureCrest } from '../events/EventBits';
import { Tick } from '../tournament/OrganisationDialogs';
import { ReadFailure } from '../ReadFailure';
import { readData } from '../../services/reads';
import { useActiveTheme } from '../../store/settingsStore';
import { useWsStore } from '../../store/wsStore';
import { themeColor } from '../../constants/Colors';

/**
 * Before anyone creates an organisation, wherever they do it: might it already be here? A second
 * copy splits a school's teams and fixtures in two, and nothing merges them afterwards. Asked rather
 * than refused, because two schools may share a name (`orgNameMatch` on the server decides what is
 * close enough to ask).
 *
 * **A check that fails blocks the save** (decided 2026-11-05, user; `SYNC-9`). "We could not check"
 * is not "no matches", and a duplicate is expensive to undo, so `failure` says what went wrong and
 * the save waits until the check has worked. It asks again when the connection returns.
 *
 * `answered` is what a dialog's save waits for: the check is back, and any matches have been ticked
 * away. The tick belongs to that list of matches, not to the dialog: a different list asks again.
 */
export function usePossibleDuplicateOrgs(name: string, active: boolean, options?: { publicOnly?: boolean }) {
  const typed = name.trim();
  const publicOnly = !!options?.publicOnly;
  const isConnected = useWsStore(state => state.isConnected);
  const [answer, setAnswer] = useState<{ name: string; matches: Organization[]; failure?: string }>({ name: '', matches: [] });
  const [confirmedOf, setConfirmedOf] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active || !typed) return;
    let live = true;
    const timer = setTimeout(() => {
      void readData<Organization[]>('possible_duplicate_orgs', { name: typed }, { suppressToast: true, stillWanted: () => live }).then(result => {
        if (!live) return;
        if (!result.ok) {
          setAnswer({ name: typed, matches: [], failure: result.message });
        } else {
          const found = Array.isArray(result.data) ? result.data : [];
          setAnswer({ name: typed, matches: publicOnly ? found.filter(org => !org.isPrivate) : found });
        }
      });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [typed, active, publicOnly, isConnected, attempt]);

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
  const failure = typed && answer.name === typed ? answer.failure ?? null : null;
  return {
    matches,
    confirmedNew,
    setConfirmedNew: (confirmed: boolean) => setConfirmedOf(confirmed ? key : null),
    answered: !typed || (answer.name === typed && !failure && (!matches.length || confirmedNew)),
    failure,
    retry: () => {
      setAnswer({ name: '', matches: [] });
      setAttempt(n => n + 1);
    },
  };
}

/**
 * The matches, under the name they were typed against. Pressing one is the dialog's to decide: on
 * *Add organisation* it opens that organisation's page, where one with no administrator can be
 * claimed; on *Register an organisation* it is used instead (`chooseLabel`). One that cannot be chosen
 * says why (`unavailable`). The tick is what lets a different organisation with a similar name through.
 */
export function PossibleDuplicateOrgs({ matches, onOpen, chooseLabel, unavailable, confirmedNew, onConfirmNew, failure, onRetry }: {
  matches: Organization[];
  onOpen: (org: Organization) => void;
  chooseLabel?: string;
  unavailable?: (org: Organization) => string | undefined;
  confirmedNew: boolean;
  onConfirmNew: (confirmed: boolean) => void;
  /** The check itself failed, so saving waits. */
  failure: string | null;
  onRetry: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  if (failure) {
    return (
      <ReadFailure
        title="Could not check whether this organisation is already on ScoreKeeper."
        reason={`${failure} You can save once the check has worked.`}
        onRetry={onRetry}
      />
    );
  }
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
