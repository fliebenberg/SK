import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import { SocketAction, MIN_MINOR_AGE, MAX_MINOR_AGE, isValidMinorAge } from '@sk/shared';
import { ConfirmationModal } from '../ConfirmationModal';
import { EditDialog, ReadRow } from '../EditDialog';
import { EditLink, ReadCard } from '../ReadCard';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { useOrgMinorsSettings } from '../../hooks/useOrgMinorsSettings';

interface OrgMinorsSettingsCardProps {
  orgId: string;
  /** Only an org Admin may change these; everyone else sees them. */
  isOrgAdmin: boolean;
}

type Pending = { accountsAllowed: boolean; minorAge: number; title: string; description: string };

const MINORS_HELP =
  'A player is a minor here if they are younger than the minor age, or if a guardian is recorded for them. ' +
  'A minor who signs in always sees this organisation as theirs; whether they get member access — the people ' +
  'list, rosters and the admin area — is decided here first, and then by their guardian.';

/** What changing the minor age from `from` to `to` does, in a sentence. */
function ageChangeEffect(from: number, to: number, accountsAllowed: boolean): string {
  if (to > from) {
    return `Players aged ${from} to ${to - 1} become minors in this organisation${accountsAllowed ? ', so their guardians decide their access' : ' and lose member access at once'}.`;
  }
  return `Players aged ${to} to ${from - 1} are treated as adults from now on and get member access — except anyone with a guardian recorded, who stays a minor whatever their age.`;
}

/**
 * An organisation's minors settings (`MEMBER-3`), as a card on the org Settings page: whether
 * players under its minor age get member access at all, and what that age is.
 *
 * Each row saves on its own, through its own action (`SET_ORG_MINORS_SETTINGS`) — never with the
 * org's other settings, which the server keeps from touching these. The switch saves when flipped,
 * after a confirmation, because it changes what every minor in the organisation can see. The age
 * opens a dialog that says what the new age would change before it is saved. What is shown is the
 * live value from the org's summary room, never a draft.
 */
export function OrgMinorsSettingsCard({ orgId, isOrgAdmin }: OrgMinorsSettingsCardProps) {
  const { settings } = useOrgMinorsSettings(orgId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingAge, setEditingAge] = useState(false);
  const [ageText, setAgeText] = useState('');

  useEffect(() => {
    if (editingAge) setAgeText(String(settings.minorAge));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAge]);

  const save = async (accountsAllowed: boolean, minorAge: number) => {
    setIsSaving(true);
    const result = await sendAction(
      SocketAction.SET_ORG_MINORS_SETTINGS,
      { orgId, accountsAllowed, minorAge },
      { suppressToast: true }
    );
    setIsSaving(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setError(null);
    return true;
  };

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

  const confirmToggle = async () => {
    if (!pending) return;
    await save(pending.accountsAllowed, pending.minorAge);
    setPending(null);
  };

  const age = Number(ageText);
  const ageValid = /^\d+$/.test(ageText.trim()) && isValidMinorAge(age);
  const ageChanged = ageValid && age !== settings.minorAge;

  const saveAge = async () => {
    if (!ageChanged) return;
    if (await save(settings.accountsAllowed, age)) setEditingAge(false);
  };

  return (
    <ReadCard label="Minors" help={MINORS_HELP}>
      <View>
        <ReadRow
          label="Minor age"
          sub="Players younger than this are minors"
          value={`Under ${settings.minorAge}`}
          right={isOrgAdmin ? <EditLink onPress={() => { setError(null); setEditingAge(true); }} /> : undefined}
        />
        <View className="h-px bg-slate-200 dark:bg-white/5" />
        <ReadRow
          label="Minors may have member access"
          sub={settings.accountsAllowed
            ? 'Each minor has access unless their guardian switches it off'
            : 'No minor has member access, whatever their guardians say'}
          right={
            <Switch
              value={settings.accountsAllowed}
              disabled={!isOrgAdmin || isSaving}
              onValueChange={askToggle}
              accessibilityLabel="Minors may have member access"
            />
          }
        />
      </View>

      {!isOrgAdmin ? (
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Only an organisation admin can change these.</Text>
      ) : null}
      {error && !editingAge ? <Text className="font-inter text-xs text-red-700 dark:text-red-400">{error}</Text> : null}

      <EditDialog
        visible={editingAge}
        title="Edit minor age"
        onClose={() => setEditingAge(false)}
        onSave={saveAge}
        saveDisabled={!ageChanged}
        isSaving={isSaving}
        isDirty={ageText.trim() !== String(settings.minorAge)}
      >
        <View className="gap-1.5">
          <FieldLabel label="Minor age" help="Most organisations use 18; some give older teenagers full access." />
          <TextInput
            value={ageText}
            onChangeText={setAgeText}
            keyboardType="number-pad"
            maxLength={2}
            autoFocus
            accessibilityLabel="Minor age"
            className={`${TEXT_INPUT} w-24`}
          />
        </View>
        {ageText.trim() && !ageValid ? (
          <Text className="font-inter text-xs text-amber-800 dark:text-amber-300">
            The minor age must be a whole number from {MIN_MINOR_AGE} to {MAX_MINOR_AGE}.
          </Text>
        ) : ageChanged ? (
          <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
            {ageChangeEffect(settings.minorAge, age, settings.accountsAllowed)}
          </Text>
        ) : null}
        {error ? <Text className="font-inter text-xs text-red-700 dark:text-red-400">{error}</Text> : null}
      </EditDialog>

      <ConfirmationModal
        isOpen={!!pending}
        onClose={() => setPending(null)}
        title={pending?.title || ''}
        description={pending?.description || ''}
        onConfirm={confirmToggle}
        confirmText="Confirm"
        variant="primary"
        isProcessing={isSaving}
      />
    </ReadCard>
  );
}
