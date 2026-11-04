import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OrgMember, SocketAction } from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { ReadCard } from '../../../../components/ReadCard';
import { OverflowMenu, OverflowMenuItem } from '../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { InviteModal, InviteStatusCard, isOnScoreKeeper, useInviteCooldownHours } from '../../../../components/InviteToScoreKeeper';
import { AddGuardianDialog, GuardiansCard } from '../../../../components/guardians/GuardiansCard';
import { MinorAccessCard } from '../../../../components/guardians/MinorAccessCard';
import { PersonBanner } from '../../../../components/people/PersonBanner';
import { ContactDialog, IdentityDialog, OrgRole, PersonalDialog, rolesTheyMayGive } from '../../../../components/people/PersonDialogs';
import { guardianshipOf } from '../../../../components/people/PersonBits';
import { useOrgPerson } from '../../../../hooks/useOrgPerson';
import { useTeamGuardians } from '../../../../hooks/useOrgGuardians';
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
import { PageBody } from '../../../../components/PageBody';
import { useOrgAccess } from '../../../../hooks/useOrgAccess';
import { useTeamRoster } from '../../../../hooks/useTeamRoster';
import { useImageUpload } from '../../../../hooks/useImageUpload';

type Dialog = 'identity' | 'contact' | 'personal' | 'guardian' | 'remove' | null;

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
  // `teamId` when opened from a team's roster: a coach of that team looks after its people (`PERM-5`).
  const { orgId, membershipId, teamId } = useLocalSearchParams<{ orgId: string; membershipId: string; teamId?: string }>();
  const safeBack = useSafeBack();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 640;

  const { data: rolesData, isLoading: isRolesLoading } = useSocketQuery<any>('roles');
  const orgAccessOf = useOrgAccess(orgId);
  const isOrgAdmin = orgAccessOf.isAdmin;
  const coachesTeam = !!teamId && orgAccessOf.coachedTeamIds.includes(teamId);
  // Admin and Staff read the organisation's people; someone with a duty on the team opened from, that
  // team's alone (`PEOPLE-8`).
  const fromTeam = !orgAccessOf.canManage && !!teamId && orgAccessOf.dutyTeamIds.includes(teamId) ? teamId : null;
  const { person, isLoading: isPersonLoading } = useOrgPerson(orgAccessOf.canManage ? orgId : null, membershipId);
  const { roster: teamRoster, isLoading: isRosterLoading } = useTeamRoster(coachesTeam || fromTeam ? teamId : null);
  const roles: OrgRole[] = rolesTheyMayGive(rolesData?.org || [], isOrgAdmin);
  const { byPlayer: teamGuardians } = useTeamGuardians(fromTeam);
  const { settings: minorsSettings } = useOrgMinorsSettings(orgId);
  const inviteCooldownHours = useInviteCooldownHours();

  const viewer = useAuthStore(state => state.user);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const member = useMemo((): OrgMember | null => {
    if (!fromTeam) return person;
    const row = teamRoster.find(r => r.orgMembershipId === membershipId);
    return row ? { ...row, membershipId: row.orgMembershipId!, roleId: row.orgRoleId || 'role-org-member', roleName: undefined } as unknown as OrgMember : null;
  }, [person, teamRoster, fromTeam, membershipId]);
  // Admin or Staff; or a coach, for someone on their team (`PERM-5`).
  const canEdit = orgAccessOf.canManage || (!!member && teamRoster.some(r => r.id === member.id));
  const guardians = fromTeam ? (member && teamGuardians.get(member.id)) || [] : person?.guardians || [];
  const guardianship = member ? guardianshipOf(member.birthdate, minorsSettings, guardians.length > 0) : null;
  const close = () => setDialog(null);
  const back = () => safeBack(`/admin/${orgId}/people`);

  // A new photo is saved as soon as it is uploaded. On failure sendAction has said why, and the
  // upload is deleted when the page closes.
  const savePhoto = async (image: string) => {
    if (!member) return false;
    const result = await sendAction(SocketAction.UPDATE_ORG_PROFILE, { id: member.id, data: { image } });
    return result.ok;
  };
  const photoUpload = useImageUpload({
    kind: 'profiles',
    title: 'Photo',
    current: member?.image ? getAvatarUrl(member.image, 'large') : null,
    onUploaded: async name => { if (await savePhoto(name)) photoUpload.saved(); },
    onRemove: () => savePhoto(''),
  });

  const isLoadingPerson = isPersonLoading || isRolesLoading || (!!fromTeam && isRosterLoading);
  if (isLoadingPerson || !member) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Person" backLabel="People" onBack={back} />
        <View className="flex-1 items-center justify-center px-6">
          {isLoadingPerson ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted text-center">
              This person is not a member of the organisation any more.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

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
    { label: 'Edit photo', description: 'Upload, crop or remove their photo.', icon: 'camera-outline', onPress: photoUpload.open },
    ...(guardians.length === 0
      ? [{ label: 'Add guardian', description: 'Record a parent or other adult who answers for them.', icon: 'people-outline' as const, onPress: () => setDialog('guardian') }]
      : []),
    // Staff remove Members; removing staff or an admin is the admins' (`PERM-2`).
    ...(orgAccessOf.canManage && (isOrgAdmin || member.roleId === 'role-org-member')
      ? [{
        label: 'Remove from organisation',
        description: 'Ends their membership and takes them off every team in this organisation.',
        icon: 'person-remove-outline' as const,
        destructive: true,
        onPress: () => { setRemoveError(null); setDialog('remove'); },
      }]
      : []),
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
      nameOfProfile={id => (id === person?.ownAccountSetBy ? person?.ownAccountSetByName ?? undefined : undefined)}
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
        <PageBody className="gap-4">
          <PersonBanner
            member={member}
            guardianship={guardianship}
            isNarrow={isNarrow}
            onEdit={canEdit ? () => setDialog('identity') : undefined}
            onEditPhoto={canEdit ? photoUpload.open : undefined}
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
        </PageBody>
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
      {photoUpload.element}
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
        description={`${member.name} will no longer be a member of this organisation, and will be taken off every team in it. Their guardians will no longer be linked to them. Their ScoreKeeper account, if they have one, is not affected.${removeError ? `\n\n${removeError}` : ''}`}
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
