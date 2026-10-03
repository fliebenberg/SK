import React, { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_TIME_ZONE, Organization, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import CustomSelect from '../CustomSelect';
import { sendAction } from '../../services/actions';
import { TIME_ZONE_CHOICES, timeZoneLabel } from '../../utils/dates';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * The org's timezone and its address pin (docs/org-profile.md §4). The two may differ on purpose;
 * the app only says so at the moment a change makes them differ, and on the Timezone card while
 * they do. Nothing is blocked.
 */

/** "The organisation address is in a different timezone, Johannesburg (UTC+2)." — or null when they agree. */
export function addressTimeZoneNote(addressTimeZone: string | null | undefined, timezone: string | null | undefined): string | null {
  if (!addressTimeZone || !timezone || addressTimeZone === timezone) return null;
  return `The organisation address is in a different timezone, ${timeZoneLabel(addressTimeZone)}.`;
}

export function TimezoneNote({ text }: { text: string }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="flex-row items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-300/25 bg-amber-50 dark:bg-amber-400/5 px-3 py-2">
      <Ionicons name="information-circle-outline" size={16} color={getThemeColor(isDark, 'warning')} style={{ marginTop: 1 }} />
      <Text className="flex-1 font-inter text-xs text-amber-800 dark:text-amber-300">{text}</Text>
    </View>
  );
}

/** Choose the org's timezone. Warns, inside the dialog, when the choice differs from the address pin's. */
export function TimezoneDialog({ org, visible, onClose }: { org: Organization; visible: boolean; onClose: () => void }) {
  const current = org.timezone || DEFAULT_TIME_ZONE;
  const [zone, setZone] = useState(current);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) setZone(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // The org's own zone, and the pin's, stay choosable even when the list does not offer them.
  const options = useMemo(() => {
    const zones = [...TIME_ZONE_CHOICES];
    for (const z of [org.addressTimeZone, current]) if (z && !zones.includes(z)) zones.unshift(z);
    return zones.map(z => ({ value: z, label: timeZoneLabel(z), description: z }));
  }, [current, org.addressTimeZone]);

  const isDirty = zone !== current;
  const note = addressTimeZoneNote(org.addressTimeZone, zone);

  const save = () => {
    setIsSaving(true);
    sendAction(SocketAction.UPDATE_ORG, { id: org.id, data: { timezone: zone } }).then(result => {
      setIsSaving(false);
      if (result.ok) onClose();
    });
  };

  return (
    <EditDialog visible={visible} title="Edit timezone" onClose={onClose} onSave={save} saveDisabled={!isDirty} isSaving={isSaving} isDirty={isDirty}>
      <View className="gap-1.5">
        <FieldLabel
          label="Timezone"
          help="Kick-offs are entered in this time at venues without a map pin. A venue with a pin uses the timezone where it is."
        />
        <CustomSelect value={zone} onChange={(v: string) => { if (v) setZone(v); }} options={options} showSearch searchPlaceholder="Search timezones..." />
      </View>
      {note ? <TimezoneNote text={`${note} The value you select here will be used in the app.`} /> : null}
    </EditDialog>
  );
}

/**
 * Asked after an address is saved whose pin is in a different timezone from the org's setting.
 * The address is already saved; this is a separate, optional change.
 */
export function FollowAddressTimezoneDialog({ org, visible, onClose }: { org: Organization | null; visible: boolean; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const [useAddress, setUseAddress] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) setUseAddress(true);
  }, [visible]);

  if (!org?.addressTimeZone) return null;
  const addressZone = org.addressTimeZone;
  const current = org.timezone || DEFAULT_TIME_ZONE;

  const confirm = () => {
    if (!useAddress) return onClose();
    setIsSaving(true);
    sendAction(SocketAction.UPDATE_ORG, { id: org.id, data: { timezone: addressZone } }).then(result => {
      setIsSaving(false);
      if (result.ok) onClose();
    });
  };

  const Option = ({ on, title, zone, onPress }: { on: boolean; title: string; zone: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      className={`flex-row items-start gap-3 rounded-xl border px-3 py-2.5 ${on ? 'border-brand-orange' : 'border-slate-200 dark:border-white/10'}`}
    >
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? COLORS.brand.orange : getThemeColor(isDark, 'textSecondary')} style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="font-inter-semibold text-sm text-slate-800 dark:text-white">{title}</Text>
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">{timeZoneLabel(zone)} · {zone}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <EditDialog visible={visible} title="Change the organisation timezone?" onClose={onClose} onSave={confirm} saveLabel="Confirm" isSaving={isSaving}>
      <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
        The address is saved. Its pin is in a different timezone from the one in the organisation settings.
      </Text>
      <View className="gap-2">
        <Option on={useAddress} title="Use the address's timezone" zone={addressZone} onPress={() => setUseAddress(true)} />
        <Option on={!useAddress} title="Keep the current timezone" zone={current} onPress={() => setUseAddress(false)} />
      </View>
    </EditDialog>
  );
}
