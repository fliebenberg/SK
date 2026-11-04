import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OrgGuardianChild, OrgMember, SocketAction } from '@sk/shared';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { ReadCard } from '../../../../../components/ReadCard';
import { OverflowMenu } from '../../../../../components/OverflowMenu';
import { ConfirmationModal } from '../../../../../components/ConfirmationModal';
import { InviteModal, InviteStatusCard, useInviteCooldownHours } from '../../../../../components/InviteToScoreKeeper';
import { RELATIONSHIP_LABELS } from '../../../../../components/guardians/guardianDraft';
import { PersonBanner } from '../../../../../components/people/PersonBanner';
import { ContactDialog, IdentityDialog, PersonalDialog } from '../../../../../components/people/PersonDialogs';
import { PersonAvatar } from '../../../../../components/people/PersonBits';
import { PageBody } from '../../../../../components/PageBody';
import { useImageUpload } from '../../../../../hooks/useImageUpload';
import { useOrgAccess } from '../../../../../hooks/useOrgAccess';
import { useOrgGuardian } from '../../../../../hooks/useOrgGuardian';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { sendAction } from '../../../../../services/actions';
import { getAvatarUrl } from '../../../../../services/assets';
import { useActiveTheme } from '../../../../../store/settingsStore';
import { themeColor } from '../../../../../constants/Colors';
import { ageInYears, formatCalendarDate } from '../../../../../utils/dates';
import { formatCellphone } from '../../../../../utils/phone';

type Dialog = 'identity' | 'contact' | 'personal' | 'remove' | null;

/**
 * A guardian who holds no membership (`PEOPLE-9`, docs/people.md §2a), so the person page, which is
 * keyed by membership, cannot show them. The same read-first cards, without a role or member access,
 * and who they answer for. Reached from People, for Admin and Staff.
 */
export default function GuardianPage() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, profileId } = useLocalSearchParams<{ orgId: string; profileId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 640;

  const { canManage } = useOrgAccess(orgId);
  const { guardian, isLoading } = useOrgGuardian(canManage ? orgId : null, profileId);
  const inviteCooldownHours = useInviteCooldownHours();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const back = () => safeBack(`/admin/${orgId}/people`);
  const savePhoto = async (image: string) => {
    if (!guardian) return false;
    const result = await sendAction(SocketAction.UPDATE_ORG_PROFILE, { id: guardian.id, data: { image } });
    return result.ok;
  };
  const photoUpload = useImageUpload({
    kind: 'profiles',
    title: 'Photo',
    current: guardian?.image ? getAvatarUrl(guardian.image, 'large') : null,
    onUploaded: async name => { if (await savePhoto(name)) photoUpload.saved(); },
    onRemove: () => savePhoto(''),
  });

  if (isLoading || !guardian) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Guardian" backLabel="People" onBack={back} />
        <View className="flex-1 items-center justify-center px-6">
          {isLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted text-center">
              This person is not a guardian in the organisation any more.
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // They hold no role, which the shared banner and dialogs show as nothing.
  const person = guardian as unknown as OrgMember;
  const childNames = guardian.children.map(child => child.name).join(', ');

  const remove = async () => {
    setIsRemoving(true);
    setRemoveError(null);
    // Shown inline in the confirmation, so no toast.
    const result = await sendAction(SocketAction.DELETE_ORG_PROFILE, { id: guardian.id }, { suppressToast: true });
    setIsRemoving(false);
    if (!result.ok) {
      setRemoveError(result.message || 'They could not be removed.');
      return;
    }
    setDialog(null);
    back();
  };

  const contact = (
    <ReadCard label="Contact" onEdit={() => setDialog('contact')}>
      <ValueRow icon="mail-outline" label="Email" value={guardian.email} first />
      <ValueRow icon="call-outline" label="Cell number" value={formatCellphone(guardian.cellphone)} />
    </ReadCard>
  );
  const age = ageInYears(guardian.birthdate);
  const birthdate = guardian.birthdate
    ? `${formatCalendarDate(guardian.birthdate) ?? 'Not a valid date'}${age !== null ? ` · ${age} ${age === 1 ? 'year' : 'years'} old` : ''}`
    : null;
  const personal = (
    <ReadCard label="Personal details" onEdit={() => setDialog('personal')}>
      <ValueRow icon="calendar-outline" label="Birthdate" value={birthdate} first />
      <ValueRow icon="card-outline" label="National ID" value={guardian.nationalId} />
    </ReadCard>
  );
  const children = (
    <ReadCard label="Answers for">
      <View>
        {guardian.children.map((child, index) => (
          <ChildRow
            key={child.linkId}
            child={child}
            first={index === 0}
            onPress={child.membershipId
              ? () => router.push({ pathname: '/admin/[orgId]/people/[membershipId]', params: { orgId: orgId!, membershipId: child.membershipId! } })
              : undefined}
          />
        ))}
      </View>
    </ReadCard>
  );
  const account = <InviteStatusCard person={person} cooldownHours={inviteCooldownHours} canInvite onInvite={() => setIsInviteOpen(true)} />;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Guardian"
        backLabel="People"
        onBack={back}
        right={(
          <OverflowMenu
            accessibilityLabel="Guardian actions"
            title={guardian.name}
            items={[
              { label: 'Edit photo', description: 'Upload, crop or remove their photo.', icon: 'camera-outline', onPress: photoUpload.open },
              {
                label: 'Remove from organisation',
                description: 'Ends every guardian link they have here.',
                icon: 'person-remove-outline',
                destructive: true,
                onPress: () => { setRemoveError(null); setDialog('remove'); },
              },
            ]}
          />
        )}
      />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}>
        <PageBody className="gap-4">
          <PersonBanner
            member={person}
            guardianship={null}
            isNarrow={isNarrow}
            onEdit={() => setDialog('identity')}
            onEditPhoto={photoUpload.open}
          />
          {isWide ? (
            <View className="flex-row gap-4 items-start">
              <View className="gap-4" style={{ flex: 1.6 }}>{contact}{personal}</View>
              <View className="gap-4" style={{ flex: 1 }}>{children}{account}</View>
            </View>
          ) : (
            <View className="gap-3">{children}{contact}{account}{personal}</View>
          )}
        </PageBody>
      </ScrollView>

      <IdentityDialog member={person} roles={[]} visible={dialog === 'identity'} onClose={() => setDialog(null)} />
      <ContactDialog member={person} visible={dialog === 'contact'} onClose={() => setDialog(null)} />
      <PersonalDialog member={person} visible={dialog === 'personal'} onClose={() => setDialog(null)} />
      {photoUpload.element}
      <InviteModal
        person={isInviteOpen ? person : null}
        cooldownHours={inviteCooldownHours}
        allowResend
        onClose={() => setIsInviteOpen(false)}
      />
      <ConfirmationModal
        isOpen={dialog === 'remove'}
        onClose={() => setDialog(null)}
        title="Remove from organisation?"
        description={`${guardian.name} will no longer be a guardian of ${childNames}, and will no longer be part of this organisation. Their ScoreKeeper account, if they have one, is not affected.${removeError ? `\n\n${removeError}` : ''}`}
        onConfirm={remove}
        confirmText={isRemoving ? 'Removing…' : 'Remove'}
        variant="danger"
        isProcessing={isRemoving}
      />
    </SafeAreaView>
  );
}

function ChildRow({ child, first, onPress }: { child: OrgGuardianChild; first: boolean; onPress?: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'link' : undefined}
      className={`flex-row items-center gap-3 py-2.5 ${first ? 'pt-0' : 'border-t border-line-soft'}`}
    >
      <PersonAvatar name={child.name} image={child.image} size={32} />
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{child.name}</Text>
        <Text className="font-inter text-xs text-ink-muted mt-0.5">
          {RELATIONSHIP_LABELS[child.relationship]}{child.isPrimary ? ' · Primary' : ''}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} /> : null}
    </TouchableOpacity>
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
