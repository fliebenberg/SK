import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../store/settingsStore';

import { readData } from '../services/reads';
import { ReadFailure } from './ReadFailure';
import { usePagedList } from '../hooks/usePagedList';
import { themeColor } from '../constants/Colors';

/**
 * Choosing a person, by looking rather than only by remembering.
 *
 * The control this replaces was **search-only**: an input that returned nothing until you typed a
 * name you already knew. That is fine when you have somebody in mind and useless when you do not,
 * and "who on our staff could run the netball?" is the question a tournament organiser actually
 * arrives with. So the modal opens on a **list of the organisation's people** and narrows it as you
 * type — a superset of the old behaviour, since typing still works at the same speed.
 *
 * **Three scopes, because the server supports exactly three.** The organisation whose workspace you
 * are in can be *listed* (`org_people`, a page at a time, filtered on the server). Anything
 * wider can only be *searched* (`organizer_candidates`, which returns nothing without a query):
 * `Taking part` covers the event's own organisations, and `Everyone` is the deliberate widening
 * that already existed as a checkbox. Offering a browse where the server has no list to give would
 * be a promise the data cannot keep.
 *
 * **No "add a new person" here, deliberately.** Creating a profile mid-way through tournament setup
 * is how an organisation ends up with duplicate people who have no role and no email; it belongs in
 * People & Roles. The empty state says so rather than leaving a dead end. (The server still permits
 * it — `PEOPLE-2` — it is simply not offered from this screen.)
 */

/** Shape returned by both paths — the lean projection a picker needs (`PEOPLE-1`). */
export interface PickablePerson {
  id: string;
  name: string;
  image?: string;
  orgId?: string;
  orgName?: string;
  /** Only present for the browsable list; used as the secondary line. */
  roleName?: string;
}

type ScopeKey = 'org' | 'event' | 'global';

export interface PersonPickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Scopes the wider searches; required because both are event-relative. */
  eventId: string;
  /** The organisation to open on and browse. */
  hostOrgId: string;
  hostOrgName?: string;
  /** Already chosen — shown ticked and unselectable rather than hidden, so they read as accounted for. */
  excludeIds?: string[];
  /** Profile id currently being written, for the row's spinner. */
  busyId?: string | null;
  onSelect: (person: PickablePerson) => void;
  title?: string;
  /** Offered only when the event has organisations beyond the host. */
  hasParticipatingOrgs?: boolean;
  /**
   * Set when appointing an organiser of one sport. Sent with the searches for the same reason
   * `divisionId` is: the grant that authorizes the appointment has to authorize the browsing.
   */
  sportId?: string;
  /**
   * Set when appointing a division's convenor. Sent with the searches so a convenor — who may
   * appoint co-convenors but holds no event-wide rights — is authorized on their division.
   */
  divisionId?: string;
}

export function PersonPickerModal({
  visible,
  onClose,
  eventId,
  hostOrgId,
  hostOrgName,
  excludeIds = [],
  busyId,
  onSelect,
  title = 'Add an organiser',
  hasParticipatingOrgs = false,
  sportId,
  divisionId,
}: PersonPickerModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = themeColor(isDark, 'ink-muted');

  const [scope, setScope] = useState<ScopeKey>('org');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PickablePerson[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  /*
    Whether the host's member list may be read. A convenor from a visiting school is not a member of
    the host, so the browsable list is refused for them — and an empty list would read as "the host
    has nobody". Instead the tab is dropped and the picker opens on the search, which covers the host.
  */
  const [rosterAvailable, setRosterAvailable] = useState(true);
  /* A failed search is not "Nobody found" (`SYNC-9`). */
  const [searchFailure, setSearchFailure] = useState<string | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);

  /* Reopening should not show the last visit's typing or the wrong scope. */
  useEffect(() => {
    if (!visible) return;
    setScope('org');
    setTerm('');
    setResults([]);
    setRosterAvailable(true);
  }, [visible]);

  /** The browsable list: the first page, narrowed on the server as they type. */
  const hostList = usePagedList<PickablePerson>({
    type: 'org_people', noun: 'people', params: { orgId: hostOrgId }, search: term, page: 1,
    enabled: visible && !!hostOrgId && scope === 'org',
  });
  /* Only a refusal means the list is not theirs to read. No answer says nothing about that: the tab
     stays, and says what went wrong. */
  const rosterRefused = hostList.refused;
  const rosterFailure = hostList.error && !rosterRefused ? hostList.error : null;
  useEffect(() => {
    if (!rosterRefused) return;
    setRosterAvailable(false);
    setScope(current => (current === 'org' ? 'event' : current));
  }, [rosterRefused]);

  /** The searchable scopes. Debounced, and silent below two characters like every other search here. */
  useEffect(() => {
    if (!visible || scope === 'org') return;
    setSearchFailure(null);
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    setIsLoading(true);
    const handle = setTimeout(() => {
      void readData<PickablePerson[]>(
        'organizer_candidates',
        {
          eventId,
          ...(sportId ? { sportId } : {}),
          ...(divisionId ? { divisionId } : {}),
          query: term.trim(),
          global: scope === 'global',
        },
        { suppressToast: true, stillWanted: () => active },
      ).then(result => {
        if (!active) return;
        setIsLoading(false);
        if (result.ok) {
          setResults(Array.isArray(result.data) ? result.data : []);
        } else {
          setResults([]);
          setSearchFailure(result.message);
        }
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
      setIsLoading(false);
    };
  }, [visible, scope, term, eventId, sportId, divisionId, searchAttempt]);

  /* The org scope filters what is already loaded; the others show what came back. */
  const people = scope === 'org' ? hostList.items : results;

  /* Without the host's list, the "taking part" search stands in for it — it covers the host too —
     so it is always offered, named for the host when nobody else is taking part yet. */
  const scopes: Array<{ key: ScopeKey; label: string }> = rosterAvailable
    ? [
        { key: 'org', label: hostOrgName || 'This organisation' },
        ...(hasParticipatingOrgs ? [{ key: 'event' as ScopeKey, label: 'Taking part' }] : []),
        { key: 'global', label: 'Everyone' },
      ]
    : [
        {
          key: 'event',
          label: hasParticipatingOrgs ? 'Taking part' : hostOrgName || 'This tournament',
        },
        { key: 'global', label: 'Everyone' },
      ];

  const needsQuery = scope !== 'org' && term.trim().length < 2;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-overlay/60 items-center justify-center px-6">
        <Pressable
          onPress={() => {}}
          className="w-full max-w-md rounded-2xl overflow-hidden bg-card border border-line"
        >
          <View className="px-5 pt-4 pb-3 flex-row items-center justify-between border-b border-line-soft">
            <Text className="font-orbitron-bold text-[11px] uppercase tracking-widest text-ink-soft">
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={20} color={secondary} />
            </TouchableOpacity>
          </View>

          <View className="px-5 pt-4 gap-3">
            <View className="flex-row items-center gap-3 rounded-xl border border-line bg-sunken px-4 py-2.5">
              <Ionicons name="search-outline" size={16} color={secondary} />
              <TextInput
                value={term}
                onChangeText={setTerm}
                autoFocus
                placeholder={scope === 'org' ? 'Filter by name...' : 'Search by name...'}
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                /* Keeps Chrome's saved-addresses popup off our results. */
                autoComplete="off"
                autoCorrect={false}
                spellCheck={false}
                className="flex-1 font-inter text-sm text-ink"
              />
              {(scope === 'org' ? hostList.isLoading : isLoading) && <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />}
            </View>

            {/* Where to look. The host organisation is a list; the wider two are searches, which is
                why the placeholder and the empty state change with the scope. */}
            <View className="flex-row flex-wrap gap-2">
              {scopes.map(option => {
                const isActive = option.key === scope;
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setScope(option.key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    className={`px-3 py-1.5 rounded-lg border ${
                      isActive
                        ? 'bg-raised border-line-selected'
                        : 'bg-sunken border-line'
                    }`}
                  >
                    <Text
                      numberOfLines={1}
                      className={`font-inter-bold text-[10px] uppercase tracking-wider ${
                        isActive ? 'text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <ScrollView className="px-5 py-3" style={{ maxHeight: 320 }}>
            {scope === 'org' && rosterFailure ? (
              <ReadFailure title={rosterFailure} reason="" onRetry={hostList.retry} />
            ) : scope !== 'org' && searchFailure ? (
              <ReadFailure title="The search did not work." reason={searchFailure} onRetry={() => setSearchAttempt(n => n + 1)} />
            ) : needsQuery ? (
              <Text className="font-inter text-xs text-ink-muted py-6 text-center">
                Type at least two letters to search
                {scope === 'global' ? ' every organisation' : ' the organisations taking part'}.
              </Text>
            ) : people.length === 0 ? (
              <View className="py-6 gap-2">
                <Text className="font-inter text-xs text-ink-muted text-center">
                  {isLoading ? 'Looking…' : 'Nobody found.'}
                </Text>
                {!isLoading && scope === 'org' && (
                  <Text className="font-inter text-[11px] text-ink-muted text-center leading-relaxed">
                    An organiser has to exist as a person first. Add them under People &amp; Roles,
                    then come back here.
                  </Text>
                )}
              </View>
            ) : (
              <View className="gap-1.5">
                {people.map(person => {
                  const taken = excludeIds.includes(person.id);
                  const isBusy = busyId === person.id;
                  return (
                    <TouchableOpacity
                      key={person.id}
                      onPress={() => !taken && !isBusy && onSelect(person)}
                      disabled={taken || isBusy}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`${person.name}${taken ? ', already an organiser' : ''}`}
                      className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 border ${
                        taken
                          ? 'border-transparent opacity-60'
                          : 'border-line bg-sunken'
                      }`}
                    >
                      <View className="w-8 h-8 rounded-full bg-primary-soft items-center justify-center">
                        <Text className="font-orbitron-bold text-[11px] text-primary-ink">
                          {(person.name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text
                          numberOfLines={1}
                          className="font-inter-bold text-xs text-ink"
                        >
                          {person.name}
                        </Text>
                        {!!(person.roleName || person.orgName) && (
                          <Text
                            numberOfLines={1}
                            className="font-inter text-[10px] text-ink-muted"
                          >
                            {person.roleName || person.orgName}
                          </Text>
                        )}
                      </View>
                      {isBusy ? (
                        <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />
                      ) : taken ? (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={themeColor(isDark, 'success-ink')}
                        />
                      ) : (
                        <Ionicons name="add" size={18} color={themeColor(isDark, 'primary')} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
