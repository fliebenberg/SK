import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SocketAction,
  TournamentOrganizer,
  organizerScopeFields,
  organizerScopeOf,
} from '@sk/shared';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';
import { FieldLabel } from './FieldLabel';
import { PersonPickerModal } from './PersonPickerModal';
import { sendAction } from '../services/actions';

/**
 * Appointing an organiser, at any of the three scopes (D33).
 *
 * The same control appoints an organiser of the whole tournament, an organiser of one of its sports
 * and a convenor of one division — they are one mechanism at three scopes, so they are one
 * component; which scope is the only difference between them, and it changes what is written rather
 * than how it looks. `organizerScopeFields` turns the props into that payload, so the client and
 * the server read the same fields the same way.
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
  /** Set to appoint an organiser of one sport of this tournament (2026-09-20). */
  sportId?: string;
  /** Set to appoint a convenor of one division; omit both to appoint an organiser of the event. */
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
  /** Explanation folded behind the label's info icon. Omitted renders no icon. */
  help?: string;
  /** Marks the label `Optional` (see `FieldLabel`). */
  optional?: boolean;
  /** Named on the picker's first scope chip, so it reads as a place rather than "this org". */
  hostOrgName?: string;
  /**
   * Whether the event has organisations beyond the host yet.
   *
   * At Basic Info time it does not — entrants are invited two steps later — so the picker offers
   * the host's own people and a deliberate widening, and gains the middle scope only once there is
   * something in it.
   */
  hasParticipatingOrgs?: boolean;
}


export function OrganizerPicker({
  eventId,
  sportId,
  divisionId,
  hostOrgId,
  actingOrgId,
  organizers,
  onChange,
  canManage = true,
  label = 'Organisers',
  help,
  optional,
  hostOrgName,
  hasParticipatingOrgs = false,
}: OrganizerPickerProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  const [isPicking, setIsPicking] = useState(false);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The scope is read the same way it is read on the server, rather than by testing the props
  // here: a sport appointment carries the event id too, so "has an eventId" is not the question.
  const scopeFields = organizerScopeFields(
    organizerScopeOf({ eventId, sportId, divisionId }) || { kind: 'event', eventId }
  );
  /** Everything narrower than the event appoints under a per-row withdrawal rule. */
  const isNarrowScope = !!sportId || !!divisionId;


  const appoint = useCallback(
    (orgProfileId: string) => {
      setBusyProfileId(orgProfileId);
      setError(null);
      // The refusal is shown inline, under the list it concerns, rather than toasted.
      sendAction(
        SocketAction.APPOINT_ORGANIZER,
        { ...scopeFields, orgProfileId, ...(actingOrgId ? { orgId: actingOrgId } : {}) },
        { suppressToast: true }
      ).then(result => {
        setBusyProfileId(null);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        // The action answers with the scope's whole list, so this replaces rather than patches.
        onChange(result.data.organizers);
        setIsPicking(false);
      });
    },
    [actingOrgId, divisionId, eventId, onChange, sportId]
  );

  const withdraw = useCallback(
    (orgProfileId: string) => {
      setBusyProfileId(orgProfileId);
      setError(null);
      sendAction(
        SocketAction.WITHDRAW_ORGANIZER,
        { ...scopeFields, orgProfileId, ...(actingOrgId ? { orgId: actingOrgId } : {}) },
        { suppressToast: true }
      ).then(result => {
        setBusyProfileId(null);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onChange(result.data.organizers);
      });
    },
    [actingOrgId, divisionId, eventId, onChange, sportId]
  );


  const alreadyAppointed = (profileId: string) => organizers.some(o => o.orgProfileId === profileId);

  return (
    <View className="gap-4">
      <FieldLabel label={label} help={help} optional={optional} />

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
                {/* Who added them — wherever people at that scope add each other, so the
                    organisers can see how somebody came to have access. */}
                {isNarrowScope && !!organizer.grantedByName && (
                  <Text numberOfLines={1} className="font-inter text-[10px] text-slate-400 dark:text-slate-500">
                    Added by {organizer.grantedByName}
                  </Text>
                )}
              </View>
              {/* `canWithdraw` is the server's answer for this viewer; a convenor may remove only
                  the co-convenors they added (D33, revised 2026-09-19), and a sport's organiser
                  only the people they added. Absent means no per-row rule applies, as on the
                  event's own list. */}
              {canManage && organizer.canWithdraw !== false && (
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
        <>
          <TouchableOpacity
            onPress={() => setIsPicking(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Add ${organizers.length ? 'another organiser' : 'an organiser'}`}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-brand-orange/50 px-4 py-3"
          >
            <Ionicons name="add" size={16} color={COLORS.brand.orange} />
            <Text className="font-inter-bold text-[11px] uppercase tracking-wider text-brand-orange">
              {organizers.length ? 'Add another' : 'Add an organiser'}
            </Text>
          </TouchableOpacity>

          <PersonPickerModal
            visible={isPicking}
            onClose={() => setIsPicking(false)}
            eventId={eventId}
            hostOrgId={hostOrgId}
            hostOrgName={hostOrgName}
            hasParticipatingOrgs={hasParticipatingOrgs}
            excludeIds={organizers.map(o => o.orgProfileId)}
            busyId={busyProfileId}
            title={divisionId ? 'Add a convenor' : 'Add an organiser'}
            sportId={sportId}
            divisionId={divisionId}
            onSelect={person => appoint(person.id)}
          />
        </>
      )}

      {!!error && <Text className="font-inter text-[11px] text-brand-red">{error}</Text>}
    </View>
  );
}
