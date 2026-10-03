import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { GuardianRelationship, GUARDIAN_RELATIONSHIPS, ProfileGuardian, SocketAction, isValidEmail } from '@sk/shared';
import { ConfirmationModal } from '../ConfirmationModal';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu';
import { ReadCard, ReadCardEmpty } from '../ReadCard';
import { SegmentedControl } from '../SegmentedControl';
import { InviteModal, guardianAsPerson, isInvitePending, isOnScoreKeeper, useInviteCooldownHours } from '../InviteToScoreKeeper';
import { sendAction } from '../../services/actions';
import { useRequestScope } from '../../hooks/useRequestScope';
import { GuardianDraftFields } from './GuardianDraftFields';
import { formatCellphone, sameCellphone } from '../../utils/phone';
import {
  GuardianDraft,
  RELATIONSHIP_LABELS,
  emptyGuardianDraft,
  guardianDraftProblem,
  isGuardianDraftStarted,
  saveGuardianDraft,
} from './guardianDraft';

interface GuardiansCardProps {
  orgId: string;
  playerProfileId: string;
  playerName: string;
  /** The player's active guardians, primary first (`useOrgGuardians().byPlayer`). */
  guardians: ProfileGuardian[];
  /** Admin or staff: may add, change and end guardians. */
  canEdit: boolean;
}

export const GUARDIANS_HELP = 'The adults who answer for this person. The primary guardian is the default contact, and a guardian decides whether a minor or dependant may use their own account.';

/**
 * Who answers for a player (`MEMBER-3`), as a card on the read-first person page (docs/people.md).
 * Every change is its own action and takes effect at once, and the list updates from
 * `org:{id}:guardians` rather than from the reply, so a second screen open on the same player shows
 * the same thing. Each guardian's actions are in one ⋯ menu on their row.
 */
export function GuardiansCard({ orgId, playerProfileId, playerName, guardians, canEdit }: GuardiansCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<ProfileGuardian | null>(null);
  const [ending, setEnding] = useState<ProfileGuardian | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [inviting, setInviting] = useState<ProfileGuardian | null>(null);
  const inviteCooldownHours = useInviteCooldownHours();

  const makePrimary = async (link: ProfileGuardian) => {
    setBusyId(link.id);
    await sendAction(SocketAction.UPDATE_PROFILE_GUARDIAN, { id: link.id, isPrimary: true });
    setBusyId(null);
  };

  const endLink = async () => {
    if (!ending) return;
    setBusyId(ending.id);
    setEndError(null);
    const result = await sendAction(SocketAction.END_PROFILE_GUARDIAN, { id: ending.id }, { suppressToast: true });
    setBusyId(null);
    if (!result.ok) {
      setEndError(result.message);
      return;
    }
    setEnding(null);
  };

  const menuFor = (link: ProfileGuardian): OverflowMenuItem[] => {
    const person = guardianAsPerson(link);
    const items: OverflowMenuItem[] = [];
    if (!isOnScoreKeeper(person)) {
      items.push({ label: isInvitePending(person) ? 'Resend invite' : 'Invite to ScoreKeeper', icon: 'mail-outline', onPress: () => setInviting(link) });
    }
    if (!link.isPrimary) {
      items.push({ label: 'Make primary', description: 'The default contact for this person.', icon: 'star-outline', disabled: busyId === link.id, onPress: () => makePrimary(link) });
    }
    items.push({ label: 'Edit', icon: 'create-outline', onPress: () => setEditing(link) });
    items.push({ label: 'Remove guardian', icon: 'close-circle-outline', destructive: true, onPress: () => { setEndError(null); setEnding(link); } });
    return items;
  };

  return (
    <ReadCard
      label={guardians.length === 1 ? 'Guardian' : 'Guardians'}
      help={GUARDIANS_HELP}
      onEdit={canEdit && guardians.length ? () => setIsAdding(true) : undefined}
      editLabel="Add"
      editIcon="add"
    >
      {guardians.length ? (
        <View>
          {guardians.map((link, index) => (
            <View
              key={link.id}
              className={`flex-row items-start gap-3 py-2.5 ${index > 0 ? 'border-t border-line-soft' : 'pt-0'}`}
            >
              <View className="w-8 h-8 rounded-full bg-primary-soft items-center justify-center mt-0.5">
                <Text className="font-inter-bold text-sm text-primary-ink">
                  {(link.guardianName || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Text className="font-inter-semibold text-sm text-ink">{link.guardianName}</Text>
                  {link.isPrimary && guardians.length > 1 ? (
                    <View className="px-2 py-px rounded-full bg-sunken border border-line">
                      <Text className="font-inter-semibold text-[11px] text-ink-soft">Primary</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="font-inter text-xs text-ink-muted mt-0.5">
                  {[RELATIONSHIP_LABELS[link.relationship], link.guardianEmail, formatCellphone(link.guardianCellphone)].filter(Boolean).join(' · ')}
                </Text>
                <Text className={`font-inter text-xs mt-0.5 ${link.guardianHasAccount ? 'text-success-ink' : 'text-ink-muted'}`}>
                  {link.guardianHasAccount ? 'On ScoreKeeper' : 'Not on ScoreKeeper yet'}
                </Text>
              </View>
              {canEdit ? <OverflowMenu items={menuFor(link)} accessibilityLabel={`Actions for ${link.guardianName}`} title={link.guardianName} /> : null}
            </View>
          ))}
        </View>
      ) : (
        <ReadCardEmpty text="No guardian recorded." action={canEdit ? 'Add guardian' : undefined} onPress={canEdit ? () => setIsAdding(true) : undefined} />
      )}

      <AddGuardianDialog
        visible={isAdding}
        orgId={orgId}
        playerProfileId={playerProfileId}
        playerName={playerName}
        hasGuardians={guardians.length > 0}
        onClose={() => setIsAdding(false)}
      />
      <EditGuardianDialog link={editing} onClose={() => setEditing(null)} />
      {/* A guardian's own invite; the list updates from the guardians room once it has gone. */}
      <InviteModal
        person={inviting ? guardianAsPerson(inviting) : null}
        cooldownHours={inviteCooldownHours}
        allowResend
        onClose={() => setInviting(null)}
      />
      <ConfirmationModal
        isOpen={!!ending}
        onClose={() => setEnding(null)}
        title="Remove guardian?"
        description={
          ending
            ? `${ending.guardianName} will no longer be recorded as ${playerName}’s guardian. Their own profile is kept, and the record of the link stays in the history.${endError ? `\n\n${endError}` : ''}`
            : ''
        }
        onConfirm={endLink}
        confirmText="Remove"
        variant="danger"
        isProcessing={!!ending && busyId === ending.id}
      />
    </ReadCard>
  );
}

/** Also opened from the person page's ⋯ menu, for someone with no guardian and so no card. */
export function AddGuardianDialog({ visible, orgId, playerProfileId, playerName, hasGuardians, onClose }: {
  visible: boolean;
  orgId: string;
  playerProfileId: string;
  playerName: string;
  hasGuardians: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GuardianDraft>(emptyGuardianDraft);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scope = useRequestScope();

  const close = () => {
    setDraft(emptyGuardianDraft());
    setError(null);
    scope.renew();
    onClose();
  };

  const save = async () => {
    const problem = guardianDraftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setIsSaving(true);
    setError(null);
    const result = await saveGuardianDraft(orgId, playerProfileId, draft, scope.current(), { quiet: true });
    setIsSaving(false);
    if (!result.ok) {
      // Keep the draft and the scope: a retry re-sends under the same keys.
      setError(result.message);
      return;
    }
    close();
  };

  return (
    <EditDialog
      visible={visible}
      title={`Add a guardian for ${playerName}`}
      onClose={close}
      onSave={save}
      saveLabel="Add guardian"
      saveDisabled={!isGuardianDraftStarted(draft)}
      isSaving={isSaving}
      isDirty={isGuardianDraftStarted(draft)}
    >
      <GuardianDraftFields
        orgId={orgId}
        draft={draft}
        onChange={setDraft}
        showPrimary={hasGuardians}
        excludeProfileId={playerProfileId}
      />
      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}

/**
 * Edit a guardian: their own details (their profile, shared by every child they are linked to) and
 * how they are related to this player (the link). Two writes; each is sent only if it changed, and
 * the first failure stops the save with the dialog still open.
 */
function EditGuardianDialog({ link, onClose }: { link: ProfileGuardian | null; onClose: () => void }) {
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cellphone, setCellphone] = useState('');
  const [relationship, setRelationship] = useState<GuardianRelationship>('parent');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Seed once per link opened, never from later pushes — an edit in progress is not overwritten.
  if (link && seededFor !== link.id) {
    setSeededFor(link.id);
    setName(link.guardianName || '');
    setEmail(link.guardianEmail || '');
    setCellphone(formatCellphone(link.guardianCellphone));
    setRelationship(link.relationship);
    setError(null);
  }

  const detailsChanged = !!link && (name.trim() !== (link.guardianName || '')
    || email.trim() !== (link.guardianEmail || '')
    || !sameCellphone(cellphone, link.guardianCellphone));
  const relationshipChanged = !!link && relationship !== link.relationship;

  const close = () => {
    setSeededFor(null);
    onClose();
  };

  const save = async () => {
    if (!link) return;
    if (!name.trim()) return setError('The guardian needs a name.');
    if (email.trim() && !isValidEmail(email)) return setError('That email is not a valid address.');
    setIsSaving(true);
    setError(null);

    if (detailsChanged) {
      const result = await sendAction(
        SocketAction.UPDATE_ORG_PROFILE,
        { id: link.guardianProfileId, data: { name: name.trim(), email: email.trim() || null, cellphone: cellphone.trim() || null } as any },
        { suppressToast: true }
      );
      if (!result.ok) {
        setIsSaving(false);
        return setError(`Their details were not saved: ${result.message}`);
      }
    }
    if (relationshipChanged) {
      const result = await sendAction(SocketAction.UPDATE_PROFILE_GUARDIAN, { id: link.id, relationship }, { suppressToast: true });
      if (!result.ok) {
        setIsSaving(false);
        return setError(`The relationship was not saved: ${result.message}`);
      }
    }
    setIsSaving(false);
    close();
  };

  return (
    <EditDialog
      visible={!!link}
      title="Edit guardian"
      onClose={close}
      onSave={save}
      saveDisabled={!detailsChanged && !relationshipChanged}
      isSaving={isSaving}
      isDirty={detailsChanged || relationshipChanged}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput value={name} onChangeText={setName} accessibilityLabel="Guardian’s name" className={TEXT_INPUT} />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Email" help="Their details are the same for every child they are recorded for." />
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" accessibilityLabel="Guardian’s email" className={TEXT_INPUT} />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Cell number" />
        <TextInput value={cellphone} onChangeText={setCellphone} keyboardType="phone-pad" accessibilityLabel="Guardian’s cell number" className={TEXT_INPUT} style={{ maxWidth: 240 }} />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Relationship to this person" />
        <SegmentedControl
          options={GUARDIAN_RELATIONSHIPS.map(value => ({ key: value, label: RELATIONSHIP_LABELS[value] }))}
          value={relationship}
          onChange={setRelationship}
          isCompact={false}
        />
      </View>
      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}
