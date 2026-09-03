import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgProfile, SocketAction, TournamentOrganizer } from '@sk/shared';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';
import { wsService } from '../services/websocket';

/**
 * Appointing an organiser, at either scope (D33).
 *
 * The same control appoints an organiser of the whole tournament and a convenor of one division —
 * they are one mechanism at two scopes, so they are one component; `divisionId` is the only
 * difference between them, and it changes what is written rather than how it looks.
 *
 * **Three tiers, in this order** (implementation plan §0.1), because who you are looking for gets
 * less likely at each step:
 *
 *  1. **The host and the participating organisations.** The default, and the ordinary case in one
 *     search.
 *  2. **Everybody, behind an explicit control.** A specialist official may be on the app under an
 *     organisation that is not here. Not the default: a global list of people is a privacy surface
 *     rather than a convenience, and the control says so in as many words.
 *  3. **Somebody who is not on the app at all** — created as a profile in the hosting org with *no
 *     membership*, which is precisely what an external specialist is: a person the host knows
 *     about, who is not a member of it. The existing invite flow links an account later if they
 *     ever want one.
 *
 * Whichever tier finds them, the search returns **name, organisation and image and nothing else**
 * (`PEOPLE-1`). And appointing somebody does **not** make their organisation a participant: an org
 * is in a tournament because it entered a team, full stop.
 */

export interface OrganizerPickerProps {
  /** The tournament. Always required — it scopes the search even for a division appointment. */
  eventId: string;
  /** Set to appoint a convenor of one division; omit to appoint an organiser of the event. */
  divisionId?: string;
  /** Where a newly created person's profile lands: the organisation hosting the tournament. */
  hostOrgId: string;
  /** The workspace the user is acting from, when they are in one. */
  actingOrgId?: string;
  /** Who currently holds this scope. Replaced wholesale by what an appointment returns. */
  organizers: TournamentOrganizer[];
  onChange: (organizers: TournamentOrganizer[]) => void;
  /** False renders the list read-only — the same screen, without the ability to change it. */
  canManage?: boolean;
  /** "Tournament organisers" / "Netball convenors". */
  label?: string;
}

/** What the lean search returns. Deliberately no contact or identity fields. */
type Candidate = Pick<OrgProfile, 'id' | 'name' | 'image'> & { orgId?: string; orgName?: string };

export function OrganizerPicker({
  eventId,
  divisionId,
  hostOrgId,
  actingOrgId,
  organizers,
  onChange,
  canManage = true,
  label = 'Organisers',
}: OrganizerPickerProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  const [term, setTerm] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scope = divisionId ? { divisionId } : { eventId };

  useEffect(() => {
    if (term.trim().length < 2) {
      setCandidates([]);
      setIsSearching(false);
      return;
    }

    // Debounced, so a name being typed is one search rather than one per keystroke.
    const handle = setTimeout(() => {
      setIsSearching(true);
      wsService.emit(
        'get_data',
        { type: 'organizer_candidates', eventId, query: term.trim(), global: searchAll },
        (results: any) => {
          setIsSearching(false);
          setCandidates(Array.isArray(results) ? results : []);
        }
      );
    }, 300);

    return () => clearTimeout(handle);
  }, [term, searchAll, eventId]);

  const appoint = useCallback(
    (orgProfileId: string) => {
      setBusyProfileId(orgProfileId);
      setError(null);
      wsService.emitAction(
        SocketAction.APPOINT_ORGANIZER,
        { ...scope, orgProfileId, ...(actingOrgId ? { orgId: actingOrgId } : {}) },
        (response: any) => {
          setBusyProfileId(null);
          if (response?.error) {
            setError(typeof response.error === 'string' ? response.error : 'Could not appoint that person.');
            return;
          }
          // The action answers with the scope's whole list, so this replaces rather than patches.
          onChange(response?.data?.organizers ?? response?.organizers ?? organizers);
          setTerm('');
          setCandidates([]);
        }
      );
    },
    [actingOrgId, divisionId, eventId, onChange, organizers]
  );

  const withdraw = useCallback(
    (orgProfileId: string) => {
      setBusyProfileId(orgProfileId);
      setError(null);
      wsService.emitAction(
        SocketAction.WITHDRAW_ORGANIZER,
        { ...scope, orgProfileId, ...(actingOrgId ? { orgId: actingOrgId } : {}) },
        (response: any) => {
          setBusyProfileId(null);
          if (response?.error) {
            setError(typeof response.error === 'string' ? response.error : 'Could not withdraw that person.');
            return;
          }
          onChange(response?.data?.organizers ?? response?.organizers ?? []);
        }
      );
    },
    [actingOrgId, divisionId, eventId, onChange]
  );

  /** Tier 3: a person the app has never heard of. A profile in the host org, and no membership. */
  const createAndAppoint = useCallback(() => {
    const name = term.trim();
    if (!name) return;
    setBusyProfileId('new');
    setError(null);
    wsService.emitAction(
      SocketAction.ADD_ORG_PROFILE,
      // `eventId` is what authorizes this: creating a person record is an org admin's job, and an
      // organiser of this event is the one exception (`PEOPLE-2`). It is not stored on the profile.
      { orgId: hostOrgId, name, eventId } as any,
      (response: any) => {
        const profile = response?.data ?? response;
        if (response?.error || !profile?.id) {
          setBusyProfileId(null);
          setError('Could not create that person.');
          return;
        }
        appoint(profile.id);
      }
    );
  }, [appoint, eventId, hostOrgId, term]);

  const alreadyAppointed = (profileId: string) => organizers.some(o => o.orgProfileId === profileId);

  return (
    <View className="gap-4">
      <Text className="font-orbitron-bold text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest">
        {label}
      </Text>

      {/* Who holds this scope now. */}
      <View className="gap-2">
        {organizers.length === 0 ? (
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
            Nobody has been appointed yet.
          </Text>
        ) : (
          organizers.map(organizer => (
            <View
              key={organizer.orgProfileId}
              className="flex-row items-center gap-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 px-4 py-3"
            >
              <View className="w-8 h-8 rounded-full bg-brand-orange/10 items-center justify-center">
                <Text className="font-orbitron-bold text-[11px] text-brand-orange">
                  {(organizer.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text numberOfLines={1} className="font-inter-bold text-xs text-slate-800 dark:text-white">
                  {organizer.name}
                </Text>
                {!!organizer.orgShortName && (
                  <Text numberOfLines={1} className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                    {organizer.orgShortName}
                  </Text>
                )}
              </View>
              {canManage && (
                <TouchableOpacity
                  onPress={() => withdraw(organizer.orgProfileId)}
                  disabled={busyProfileId === organizer.orgProfileId}
                  activeOpacity={0.8}
                  accessibilityLabel={`Withdraw ${organizer.name}`}
                >
                  {busyProfileId === organizer.orgProfileId ? (
                    <ActivityIndicator size="small" color={COLORS.brand.orange} />
                  ) : (
                    <Ionicons name="close-circle-outline" size={20} color={secondary} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {canManage && (
        <View className="gap-3">
          <View className="flex-row items-center gap-3 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-100/30 dark:bg-white/5 px-4 py-2.5">
            <TextInput
              value={term}
              onChangeText={setTerm}
              placeholder="Search for a person..."
              placeholderTextColor={getThemeColor(isDark, 'placeholder')}
              className="flex-1 font-inter text-sm text-slate-800 dark:text-white"
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={COLORS.brand.orange} />
            ) : (
              <Ionicons name="search-outline" size={16} color={secondary} />
            )}
          </View>

          {/* Tier 2, named rather than implied: the wider search is a decision, not a default. */}
          <TouchableOpacity
            onPress={() => setSearchAll(value => !value)}
            activeOpacity={0.8}
            className="flex-row items-center gap-2"
            accessibilityRole="button"
          >
            <Ionicons
              name={searchAll ? 'checkbox-outline' : 'square-outline'}
              size={16}
              color={searchAll ? COLORS.brand.orange : secondary}
            />
            <Text className="font-inter text-[11px] text-slate-600 dark:text-slate-300">
              Search every organisation, not just the ones taking part
            </Text>
          </TouchableOpacity>

          {term.trim().length >= 2 && (
            <View className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
              {candidates.map(candidate => {
                const appointed = alreadyAppointed(candidate.id);
                return (
                  <TouchableOpacity
                    key={candidate.id}
                    onPress={() => !appointed && appoint(candidate.id)}
                    disabled={appointed || busyProfileId === candidate.id}
                    activeOpacity={0.8}
                    className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/5"
                  >
                    <View className="flex-1">
                      <Text numberOfLines={1} className="font-inter-bold text-xs text-slate-800 dark:text-white">
                        {candidate.name}
                      </Text>
                      <Text numberOfLines={1} className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                        {candidate.orgName || 'No organisation'}
                      </Text>
                    </View>
                    {appointed ? (
                      <Text className="font-inter text-[10px] text-slate-400">Already appointed</Text>
                    ) : busyProfileId === candidate.id ? (
                      <ActivityIndicator size="small" color={COLORS.brand.orange} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={18} color={COLORS.brand.orange} />
                    )}
                  </TouchableOpacity>
                );
              })}

              {!isSearching && candidates.length === 0 && (
                <View className="px-4 py-3">
                  <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                    {searchAll
                      ? 'Nobody found. They may not be on the app yet.'
                      : 'Nobody found here. Try searching every organisation.'}
                  </Text>
                </View>
              )}

              {/* Tier 3. */}
              <TouchableOpacity
                onPress={createAndAppoint}
                disabled={busyProfileId === 'new'}
                activeOpacity={0.8}
                className="flex-row items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-white/5"
              >
                {busyProfileId === 'new' ? (
                  <ActivityIndicator size="small" color={COLORS.brand.orange} />
                ) : (
                  <Ionicons name="person-add-outline" size={16} color={COLORS.brand.orange} />
                )}
                <Text className="font-inter-bold text-[11px] text-brand-orange">
                  Add "{term.trim()}" as a new person
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!!error && (
            <Text className="font-inter text-[11px] text-brand-red">{error}</Text>
          )}
        </View>
      )}
    </View>
  );
}
