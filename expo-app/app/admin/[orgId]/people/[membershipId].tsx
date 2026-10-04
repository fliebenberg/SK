import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SocketAction } from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { ReadCard } from '../../../../components/ReadCard';
import { OverflowMenu, OverflowMenuItem } from '../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { ImageEditor, ImageConfig } from '../../../../components/ImageEditor';
import { InviteModal, InviteStatusCard, isOnScoreKeeper, useInviteCooldownHours } from '../../../../components/InviteToScoreKeeper';
import { AddGuardianDialog, GuardiansCard } from '../../../../components/guardians/GuardiansCard';
import { MinorAccessCard } from '../../../../components/guardians/MinorAccessCard';
import { PersonBanner } from '../../../../components/people/PersonBanner';
import { ContactDialog, IdentityDialog, OrgRole, PersonalDialog } from '../../../../components/people/PersonDialogs';
import { guardianshipOf, parseImageConfig } from '../../../../components/people/PersonBits';
import { useOrgMembers } from '../../../../hooks/useOrgMembers';
import { useOrgGuardians } from '../../../../hooks/useOrgGuardians';
import { useOrgMinorsSettings } from '../../../../hooks/useOrgMinorsSettings';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { useAuthStore } from '../../../../store/authStore';
import { sendAction } from '../../../../services/actions';
import { getAvatarUrl } from '../../../../services/assets';
import { ageInYears, formatCalendarDate } from '../../../../utils/dates';
import { formatCellphone } from '../../../../utils/phone';
import { useActiveTheme } from '../../../../store/settingsStore';
import { themeColor } from '../../../../constants/Colors';

type Dialog = 'identity' | 'contact' | 'personal' | 'photo' | 'guardian' | 'remove' | null;

/**
 * One person in the organisation (docs/people.md).
 *
 * Read-first (design_system.md, *Read-first record pages*): the values as text, one card per group,
 * each card's Edit opening a dialog that saves only its own fields. It replaced a read-only view
 * screen and a separate edit form with a save bar on 2026-10-03. A viewer who cannot edit people —
 * anyone but an Admin or Staff — gets the same page with no Edit links, no Invite and no ⋯ menu.
 *
 * Cards that would be empty for most people are left out rather than shown empty: the ScoreKeeper
 * account card only while they are not on the app (the banner says when they are), and the
 * Guardians card only for a minor or someone who has a guardian — for anyone else, Add guardian is
 * in the ⋯ menu.
 */
export default function PersonPage() {
  const isDark = useActiveTheme() === 'dark';
  const { orgId, membershipId } = useLocalSearchParams<{ orgId: string; membershipId: string }>();
  const safeBack = useSafeBack();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 640;

  const { members, isLoading: isMembersLoading } = useOrgMembers(orgId);
  const { data: rolesData, isLoading: isRolesLoading } = useSocketQuery<any>('roles');
  const roles: OrgRole[] = rolesData?.org || [];
  const { byPlayer: guardiansByPlayer } = useOrgGuardians(orgId);
  const { settings: minorsSettings } = useOrgMinorsSettings(orgId);
  const inviteCooldownHours = useInviteCooldownHours();

  const viewer = useAuthStore(state => state.user);
  const viewerRole = useAuthStore(state => state.orgMemberships.find((m: any) => m.orgId === orgId && !m.restrictedReason)?.roleId);
  const isOrgAdmin = viewer?.globalRole === 'admin' || viewerRole === 'role-org-admin';
  const canEdit = isOrgAdmin || viewerRole === 'role-org-staff';

  const [dialog, setDialog] = useState<Dialog>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const member = useMemo(() => members?.find(m => m.membershipId === membershipId) || null, [members, membershipId]);
  const guardians = member ? guardiansByPlayer.get(member.id) || [] : [];
  const guardianship = member ? guardianshipOf(member.birthdate, minorsSettings, guardians.length > 0) : null;
  const close = () => setDialog(null);
  const back = () => safeBack(`/admin/${orgId}/people`);

  if (isMembersLoading || isRolesLoading || !member) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Person" backLabel="People" onBack={back} />
        <View className="flex-1 items-center justify-center px-6">
          {isMembersLoading || isRolesLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted text-center">
              This person is not a member of the organisation any more.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const applyPhoto = (uri: string, config: ImageConfig) => {
    close();
    sendAction(SocketAction.UPDATE_ORG_PROFILE, {
      id: member.id,
      // Sent only when it changed, so moving the photo inside its frame does not re-upload it.
      data: { ...(uri !== (member.image || '') ? { image: uri } : {}), imageConfig: config },
    });
  };

  const remove = async () => {
    setIsRemoving(true);
    setRemoveError(null);
    // Shown inline in the confirmation, so no toast.
    const result = await sendAction(SocketAction.REMOVE_ORG_MEMBER, { id: member.membershipId }, { suppressToast: true });
    setIsRemoving(false);
    if (!result.ok) {
      setRemoveError(result.message || 'They could not be removed.');
      return;
    }
    close();
    back();
  };

  const menu: OverflowMenuItem[] = [
    { label: 'Edit photo', description: 'Upload, move or remove their photo.', icon: 'camera-outline', onPress: () => setDialog('photo') },
    ...(guardians.length === 0
      ? [{ label: 'Add guardian', description: 'Record a parent or other adult who answers for them.', icon: 'people-outline' as const, onPress: () => setDialog('guardian') }]
      : []),
    {
      label: 'Remove from organisation',
      description: 'Ends their membership and takes them off every team in this organisation.',
      icon: 'person-remove-outline',
      destructive: true,
      onPress: () => { setRemoveError(null); setDialog('remove'); },
    },
  ];

  const age = ageInYears(member.birthdate);
  const birthdate = member.birthdate
    ? `${formatCalendarDate(member.birthdate) ?? 'Not a valid date'}${age !== null ? ` · ${age} ${age === 1 ? 'year' : 'years'} old` : ''}`
    : null;

  const contact = (
    <ReadCard label="Contact" onEdit={canEdit ? () => setDialog('contact') : undefined}>
      <ValueRow icon="mail-outline" label="Email" value={member.email} first />
      <ValueRow icon="call-outline" label="Cell number" value={formatCellphone(member.cellphone)} />
    </ReadCard>
  );
  const personal = (
    <ReadCard label="Personal details" onEdit={canEdit ? () => setDialog('personal') : undefined}>
      <ValueRow icon="calendar-outline" label="Birthdate" value={birthdate} first />
      <ValueRow icon="card-outline" label="National ID" value={member.nationalId} />
    </ReadCard>
  );
  const account = <InviteStatusCard person={member} cooldownHours={inviteCooldownHours} canInvite={canEdit} onInvite={() => setIsInviteOpen(true)} />;
  const guardiansCard = guardians.length || guardianship === 'minor' ? (
    <GuardiansCard orgId={orgId!} playerProfileId={member.id} playerName={member.name} guardians={guardians} canEdit={canEdit} />
  ) : null;
  const access = (
    <MinorAccessCard
      player={member}
      settings={minorsSettings}
      guardians={guardians}
      isOrgAdmin={isOrgAdmin}
      nameOfProfile={id => members?.find(m => m.id === id)?.name}
    />
  );
  // The account card and the access card each decide for themselves whether to render.
  const hasSideCards = !!guardiansCard || guardianship !== null || !isOnScoreKeeper(member);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Person"
        backLabel="People"
        onBack={back}
        right={canEdit ? <OverflowMenu items={menu} accessibilityLabel="Person actions" title={member.name} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}>
        <View className="w-full gap-4 self-center" style={{ maxWidth: 960 }}>
          <PersonBanner
            member={member}
            guardianship={guardianship}
            isNarrow={isNarrow}
            onEdit={canEdit ? () => setDialog('identity') : undefined}
            onEditPhoto={canEdit ? () => setDialog('photo') : undefined}
          />
          {!isWide ? (
            <View className="gap-3">{guardiansCard}{access}{contact}{account}{personal}</View>
          ) : hasSideCards ? (
            <View className="flex-row gap-4 items-start">
              <View className="gap-4" style={{ flex: 1.6 }}>{contact}{personal}</View>
              <View className="gap-4" style={{ flex: 1 }}>{account}{guardiansCard}{access}</View>
            </View>
          ) : (
            <View className="flex-row gap-4 items-start">
              <View style={{ flex: 1 }}>{contact}</View>
              <View style={{ flex: 1 }}>{personal}</View>
            </View>
          )}
        </View>
      </ScrollView>

      <IdentityDialog member={member} roles={roles} visible={dialog === 'identity'} onClose={close} />
      <ContactDialog member={member} visible={dialog === 'contact'} onClose={close} />
      <PersonalDialog member={member} visible={dialog === 'personal'} onClose={close} />
      <AddGuardianDialog
        visible={dialog === 'guardian'}
        orgId={orgId!}
        playerProfileId={member.id}
        playerName={member.name}
        hasGuardians={false}
        onClose={close}
      />
      <ImageEditor
        visible={dialog === 'photo'}
        imageUri={getAvatarUrl(member.image, 'large') || member.image || ''}
        config={parseImageConfig(member.imageConfig)}
        title="Edit photo"
        allowRemove
        onApply={applyPhoto}
        onCancel={close}
      />
      <InviteModal
        person={isInviteOpen ? member : null}
        guardians={guardians}
        minorsSettings={minorsSettings}
        cooldownHours={inviteCooldownHours}
        allowResend
        onClose={() => setIsInviteOpen(false)}
      />
      <ConfirmationModal
        isOpen={dialog === 'remove'}
        onClose={close}
        title="Remove from organisation?"
        description={`${member.name} will no longer be a member of this organisation, and will be taken off every team in it.${removeError ? `\n\n${removeError}` : ''}`}
        onConfirm={remove}
        confirmText={isRemoving ? 'Removing…' : 'Remove'}
        variant="danger"
        isProcessing={isRemoving}
      />
    </SafeAreaView>
  );
}

/** One value on a card, with its icon and label; an empty one says "None". */
function ValueRow({ icon, label, value, first }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null; first?: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className={`flex-row items-center gap-3 ${first ? '' : 'pt-2.5 border-t border-line-soft'}`}>
      <View className="w-8 h-8 rounded-lg bg-sunken items-center justify-center">
        <Ionicons name={icon} size={15} color={themeColor(isDark, 'ink-muted')} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-inter text-xs text-ink-muted">{label}</Text>
        <Text className={`font-inter text-sm mt-0.5 ${value ? 'text-ink' : 'text-ink-muted'}`} selectable>
          {value || 'None'}
        </Text>
      </View>
    </View>
  );
}
