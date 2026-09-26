import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch } from 'react-native';
import { SocketAction, MIN_MINOR_AGE, MAX_MINOR_AGE, isValidMinorAge } from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { ConfirmationModal } from '../ConfirmationModal';
import { sendAction } from '../../services/actions';
import { useOrgMinorsSettings } from '../../hooks/useOrgMinorsSettings';

interface OrgMinorsSettingsCardProps {
  orgId: string;
  /** Only an org Admin may change these; everyone else sees them. */
  isOrgAdmin: boolean;
}

type Pending = { accountsAllowed: boolean; minorAge: number; title: string; description: string };

/**
 * An organisation's minors settings (`MEMBER-3`): whether players under its minor age get member
 * access at all, and what that age is.
 *
 * Deliberately **not** part of the settings screen's form. Each change is its own action behind a
 * confirmation, because one switch changes what every minor in the organisation can see — and the
 * screen's save bar sends the whole `settings` object, which the server no longer lets touch these.
 * What is shown is the live value from the org's summary room, never a draft.
 */
export function OrgMinorsSettingsCard({ orgId, isOrgAdmin }: OrgMinorsSettingsCardProps) {
  const { settings } = useOrgMinorsSettings(orgId);
  const [ageText, setAgeText] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askToggle = (accountsAllowed: boolean) => {
    setError(null);
    setPending({
      accountsAllowed,
      minorAge: settings.minorAge,
      title: accountsAllowed ? 'Give minors member access?' : 'Take member access from minors?',
      description: accountsAllowed
        ? `Players under ${settings.minorAge} who are on ScoreKeeper will see this organisation as members do — the people list and rosters included — unless their guardian has said no. You can switch this off again at any time.`
        : `Players under ${settings.minorAge} will keep their membership and can still coach or score what they are appointed to, but lose member access at once, whatever their guardians say.`,
    });
  };

  const askAge = () => {
    const age = Number(ageText);
    if (!isValidMinorAge(age)) {
      setError(`The minor age must be a whole number from ${MIN_MINOR_AGE} to ${MAX_MINOR_AGE}.`);
      return;
    }
    setError(null);
    if (age === settings.minorAge) {
      setAgeText(null);
      return;
    }
    setPending({
      accountsAllowed: settings.accountsAllowed,
      minorAge: age,
      title: `Change the minor age to ${age}?`,
      description: age > settings.minorAge
        ? `Players aged ${settings.minorAge} to ${age - 1} become minors in this organisation${settings.accountsAllowed ? ', so their guardians decide their access' : ' and lose member access at once'}.`
        : `Players aged ${age} to ${settings.minorAge - 1} are treated as adults from now on and get member access — except anyone with a guardian recorded, who stays a minor whatever their age.`,
    });
  };

  const confirm = async () => {
    if (!pending) return;
    setIsSaving(true);
    const result = await sendAction(
      SocketAction.SET_ORG_MINORS_SETTINGS,
      { orgId, accountsAllowed: pending.accountsAllowed, minorAge: pending.minorAge },
      { suppressToast: true }
    );
    setIsSaving(false);
    if (!result.ok) {
      setError(result.message);
      setPending(null);
      return;
    }
    setPending(null);
    setAgeText(null);
  };

  return (
    <View className="mb-6 mt-6">
      <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
        Minors
      </Text>
      <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5">
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
          A player is a minor here if they are younger than the minor age, or if a guardian is recorded for
          them. A minor who signs in always sees this organisation as theirs; whether they get member access —
          the people list, rosters and the admin area — is decided here first, and then by their guardian.
        </Text>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Minors may have member access</Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {settings.accountsAllowed
                ? 'On — each minor has access unless their guardian switches it off.'
                : 'Off — no minor has member access, whatever their guardians say.'}
            </Text>
          </View>
          <Switch
            value={settings.accountsAllowed}
            disabled={!isOrgAdmin || isSaving}
            onValueChange={askToggle}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Minor age</Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Players younger than this are minors. Most organisations use 18; some give older teenagers full access.
            </Text>
          </View>
          {ageText === null ? (
            <View className="flex-row items-center gap-3">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">{settings.minorAge}</Text>
              {isOrgAdmin ? (
                <TouchableOpacity
                  onPress={() => { setError(null); setAgeText(String(settings.minorAge)); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                >
                  <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Change</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <TextInput
                value={ageText}
                onChangeText={setAgeText}
                keyboardType="number-pad"
                maxLength={2}
                className="w-16 text-center font-orbitron-bold text-base text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-2 py-2 outline-none"
              />
              <TouchableOpacity onPress={askAge} className="px-3 py-2 rounded-lg bg-brand-orange">
                <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest">Set</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAgeText(null); setError(null); }} className="px-2 py-2">
                <Text className="font-orbitron-bold text-[9px] text-slate-500 uppercase tracking-widest">Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!isOrgAdmin ? (
          <Text className="font-inter text-xs text-slate-400 dark:text-slate-500">Only an organisation admin can change these.</Text>
        ) : null}
        {error ? <Text className="font-inter text-xs text-red-500">{error}</Text> : null}
      </GlassCard>

      <ConfirmationModal
        isOpen={!!pending}
        onClose={() => setPending(null)}
        title={pending?.title || ''}
        description={pending?.description || ''}
        onConfirm={confirm}
        confirmText="Confirm"
        variant="primary"
        isProcessing={isSaving}
      />
    </View>
  );
}
