import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GuardianRelationship, GUARDIAN_RELATIONSHIPS, ProfileGuardian, SocketAction, isValidEmail } from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import { ConfirmationModal } from '../ConfirmationModal';
import { useActiveTheme } from '../../store/settingsStore';
import { sendAction } from '../../services/actions';
import { useRequestScope } from '../../hooks/useRequestScope';
import { GuardianDraftFields } from './GuardianDraftFields';
import {
  GuardianDraft,
  RELATIONSHIP_LABELS,
  emptyGuardianDraft,
  guardianDraftProblem,
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
  /** Shown instead of the controls while they may not be used — e.g. the profile form is dirty. */
  blockedReason?: string;
}

/**
 * Who answers for a player (`MEMBER-3`): their guardians, with contact details and whether each is on
 * ScoreKeeper. Every change is its own action and takes effect at once — it is not part of the
 * profile form's save bar — and the list updates from `org:{id}:guardians` rather than from the
 * reply, so a second screen open on the same player shows the same thing.
 */
export function GuardiansCard({ orgId, playerProfileId, playerName, guardians, canEdit, blockedReason }: GuardiansCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<ProfileGuardian | null>(null);
  const [ending, setEnding] = useState<ProfileGuardian | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const controlsBlocked = Boolean(blockedReason);

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

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1 mr-3">
          <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider">Guardians</Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {guardians.length
              ? 'The adults who answer for this player. The primary guardian is the default contact.'
              : 'No guardian recorded. A minor’s guardian decides whether they may use their own account.'}
          </Text>
        </View>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => setIsAdding(true)}
            disabled={controlsBlocked}
            className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95 ${controlsBlocked ? 'bg-slate-200 dark:bg-slate-800 opacity-60' : 'bg-brand-orange'}`}
          >
            <Ionicons name="add" size={14} color={controlsBlocked ? '#64748B' : 'white'} />
            <Text className={`font-orbitron-bold text-[9px] uppercase tracking-widest ${controlsBlocked ? 'text-slate-500' : 'text-white'}`}>
              Add guardian
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {canEdit && blockedReason ? (
        <Text className="font-inter text-xs text-amber-600 dark:text-amber-400 mb-3">{blockedReason}</Text>
      ) : null}

      <View className="space-y-2">
        {guardians.map(link => (
          <View
            key={link.id}
            className="flex-row items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3"
          >
            <View className="w-9 h-9 rounded-full bg-brand-orange/10 items-center justify-center">
              <Text className="font-orbitron-bold text-xs text-brand-orange">
                {(link.guardianName || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 flex-wrap">
                <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">{link.guardianName}</Text>
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                  {RELATIONSHIP_LABELS[link.relationship]}
                </Text>
                {link.isPrimary ? (
                  <View className="px-2 py-0.5 rounded-md bg-brand-orange/10">
                    <Text className="font-orbitron-bold text-[8px] text-brand-orange uppercase tracking-widest">Primary</Text>
                  </View>
                ) : null}
              </View>
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {[link.guardianEmail, link.guardianCellphone].filter(Boolean).join(' · ') || 'No contact details'}
              </Text>
              <Text className={`font-inter text-[11px] mt-0.5 ${link.guardianHasAccount ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {link.guardianHasAccount ? 'On ScoreKeeper' : 'Not on ScoreKeeper yet'}
              </Text>
            </View>
            {canEdit ? (
              <View className="flex-row items-center gap-1">
                {!link.isPrimary ? (
                  <IconButton
                    icon="star-outline"
                    label="Make primary"
                    disabled={controlsBlocked || busyId === link.id}
                    onPress={() => makePrimary(link)}
                  />
                ) : null}
                <IconButton icon="create-outline" label="Edit" disabled={controlsBlocked} onPress={() => setEditing(link)} />
                <IconButton
                  icon="close-circle-outline"
                  label="Remove"
                  danger
                  disabled={controlsBlocked}
                  onPress={() => { setEndError(null); setEnding(link); }}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <AddGuardianModal
        visible={isAdding}
        orgId={orgId}
        playerProfileId={playerProfileId}
        playerName={playerName}
        hasGuardians={guardians.length > 0}
        onClose={() => setIsAdding(false)}
      />
      <EditGuardianModal link={editing} onClose={() => setEditing(null)} />
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
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled, danger }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={`w-8 h-8 rounded-lg items-center justify-center active:scale-95 ${disabled ? 'opacity-40' : ''}`}
    >
      <Ionicons name={icon} size={17} color={danger ? '#EF4444' : '#94A3B8'} />
    </TouchableOpacity>
  );
}

function ModalShell({ visible, title, onClose, children }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/75 items-center justify-center p-6">
        <GlassCard
          className="w-full max-w-lg border border-slate-200 dark:border-white/10 p-6 shadow-lg"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', maxHeight: '90%' }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </GlassCard>
      </View>
    </Modal>
  );
}

function AddGuardianModal({ visible, orgId, playerProfileId, playerName, hasGuardians, onClose }: {
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
    <ModalShell visible={visible} title={`Add a guardian for ${playerName}`} onClose={close}>
      <GuardianDraftFields
        orgId={orgId}
        draft={draft}
        onChange={setDraft}
        showPrimary={hasGuardians}
        excludeProfileId={playerProfileId}
      />
      {error ? <Text className="font-inter text-xs text-red-500 mt-4">{error}</Text> : null}
      <View className="flex-row gap-3 mt-6">
        <Button title="Cancel" variant="ghost" onPress={close} disabled={isSaving} className="flex-1 min-h-[40px] py-2" />
        <Button title="Add guardian" variant="primary" onPress={save} isLoading={isSaving} disabled={isSaving} className="flex-1 min-h-[40px] py-2" />
      </View>
    </ModalShell>
  );
}

const LABEL = 'font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5';
const INPUT = 'font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none';

/**
 * Edit a guardian: their own details (their profile, shared by every child they are linked to) and
 * how they are related to this player (the link). Two writes; each is sent only if it changed, and
 * the first failure stops the save with the modal still open.
 */
function EditGuardianModal({ link, onClose }: { link: ProfileGuardian | null; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
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
    setCellphone(link.guardianCellphone || '');
    setRelationship(link.relationship);
    setError(null);
  }

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

    const detailsChanged = name.trim() !== (link.guardianName || '')
      || email.trim() !== (link.guardianEmail || '')
      || cellphone.trim() !== (link.guardianCellphone || '');
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
    if (relationship !== link.relationship) {
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
    <ModalShell visible={!!link} title="Edit guardian" onClose={close}>
      <View className="space-y-4">
        <View>
          <Text className={LABEL}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholderTextColor="#94A3B8" className={INPUT} />
        </View>
        <View>
          <Text className={LABEL}>Email</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor="#94A3B8" className={INPUT} />
        </View>
        <View>
          <Text className={LABEL}>Cell number</Text>
          <TextInput value={cellphone} onChangeText={setCellphone} keyboardType="phone-pad" placeholderTextColor="#94A3B8" className={INPUT} />
        </View>
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
          Their details are the same for every child they are recorded for.
        </Text>
        <View>
          <Text className={LABEL}>Relationship to this player</Text>
          <View className="flex-row flex-wrap gap-2">
            {GUARDIAN_RELATIONSHIPS.map(value => {
              const selected = relationship === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setRelationship(value)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'),
                    backgroundColor: selected ? '#FF3E00' : 'transparent',
                  }}
                  className="px-3 py-2 rounded-xl active:scale-95"
                >
                  <Text
                    style={{ color: selected ? '#fff' : (isDark ? '#94A3B8' : '#64748B') }}
                    className="font-orbitron-bold text-[9px] uppercase tracking-widest"
                  >
                    {RELATIONSHIP_LABELS[value]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      {error ? <Text className="font-inter text-xs text-red-500 mt-4">{error}</Text> : null}
      <View className="flex-row gap-3 mt-6">
        <Button title="Cancel" variant="ghost" onPress={close} disabled={isSaving} className="flex-1 min-h-[40px] py-2" />
        <Button title="Save" variant="primary" onPress={save} isLoading={isSaving} disabled={isSaving} className="flex-1 min-h-[40px] py-2" />
      </View>
    </ModalShell>
  );
}
