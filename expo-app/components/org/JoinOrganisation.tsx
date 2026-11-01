import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GuardianRelationship, isUnderAge, MembershipApplication, minorsSettingsOf, Organization, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import DatePicker from '../DatePicker';
import { SegmentedControl } from '../SegmentedControl';
import { SignInPrompt } from '../SignInPrompt';
import { RELATIONSHIP_LABELS } from '../guardians/guardianDraft';
import { useSocketQuery } from '../../hooks/useSocketQuery';
import { sendAction } from '../../services/actions';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatCalendarDate, isCalendarDate } from '../../utils/dates';
import { cellphoneProblem } from '../../utils/phone';
import { orgAccess } from '../../utils/orgAccess';

/**
 * Joining an organisation from its public page (`MEMBER-1`, agreed 2026-11-01 on
 * `mockups/member-applications.html`).
 *
 * An organisation that takes applications shows *Apply to join*, which stays when someone has applied
 * because they may be applying for themselves and each of their children, and a signed-out visitor is
 * asked to sign in. One that does not, shows a small *Invite only* flag, to those who do not belong;
 * hover or tap for why, as a phone has no hover. Neither shows on a private or unclaimed organisation.
 */
export function useJoinOrganisation(org: Organization) {
  const { isAuthenticated, user, orgMemberships, teamMemberships } = useAuthStore();
  const access = orgAccess(org.id, false, orgMemberships, teamMemberships);
  const open = !org.isPrivate && !!org.isClaimed;
  const takesApplications = open && org.membershipMode === 'apply';
  const { data: mine, refetch } = useSocketQuery<MembershipApplication[]>(
    'my_org_applications',
    { orgId: org.id },
    { enabled: isAuthenticated && open, suppressToast: true },
  );
  return {
    takesApplications,
    inviteOnly: open && !takesApplications && !access.membership,
    isMember: !!access.membership,
    userName: user?.name || '',
    userEmail: user?.email || '',
    isAuthenticated,
    applications: Array.isArray(mine) ? mine : [],
    refetch,
  };
}
type Join = ReturnType<typeof useJoinOrganisation>;

/** The flag, with the sentence behind it. `onCard` is on the organisation's coloured banner. */
export function InviteOnlyFlag({ onCard, color }: { onCard?: boolean; color?: string }) {
  const isDark = useActiveTheme() === 'dark';
  // Hover shows it while the pointer is there; a press keeps it, and is the way in on a phone.
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const isOpen = isHovered || isPinned;
  const ink = onCard && color ? color : themeColor(isDark, 'ink-soft');
  return (
    <View className={onCard ? 'items-end' : 'items-start'}>
      <Pressable
        onPress={() => setIsPinned(value => !value)}
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        accessibilityRole="button"
        accessibilityLabel="Invite only. Why?"
        accessibilityState={{ expanded: isOpen }}
        className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${onCard ? 'bg-overlay/20' : 'bg-sunken'}`}
      >
        <Text className="font-inter-bold text-[11px] uppercase tracking-wider" style={{ color: ink }}>Invite only</Text>
        <Ionicons name="information-circle-outline" size={13} color={ink} />
      </Pressable>
      {isOpen ? (
        <Text className="font-inter text-xs mt-1 max-w-xs" style={{ color: ink }}>
          Membership is by invitation from this organisation’s admins and staff.
        </Text>
      ) : null}
    </View>
  );
}

/** *Apply to join*, with its form and the sign-in prompt. `onCard` is on the coloured banner. */
export function ApplyToJoinButton({ org, join, onCard }: { org: Organization; join: Join; onCard?: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  const [isApplying, setIsApplying] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => (join.isAuthenticated ? setIsApplying(true) : setIsSigningIn(true))}
        accessibilityRole="button"
        className={onCard
          ? 'flex-row items-center gap-1.5 rounded-full px-3 py-1 border bg-overlay/20 border-on-fill/30'
          : 'flex-row items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5'}
      >
        <Ionicons name="person-add-outline" size={onCard ? 13 : 16} color={themeColor(isDark, onCard ? 'on-fill' : 'on-primary')} />
        <Text className={`font-inter-bold text-sm ${onCard ? 'text-on-fill' : 'text-on-primary'}`}>Apply to join</Text>
      </TouchableOpacity>
      <ApplyDialog org={org} join={join} visible={isApplying} onClose={() => setIsApplying(false)} />
      <SignInPrompt
        isOpen={isSigningIn}
        onClose={() => setIsSigningIn(false)}
        title={`Sign in to apply to ${org.name}`}
        description="Apply for yourself or for your child, and its admins and staff will decide."
      />
    </>
  );
}

type Who = 'self' | 'child';
/** The ones that fit a phone's width; a grandparent answers Guardian, and the admin can change it. */
const RELATIONSHIPS: GuardianRelationship[] = ['parent', 'guardian', 'other'];

function ApplyDialog({ org, join, visible, onClose }: { org: Organization; join: Join; visible: boolean; onClose: () => void }) {
  // Someone who already belongs can only be applying for a child.
  const [who, setWho] = useState<Who>('self');
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [yourName, setYourName] = useState('');
  const [cellphone, setCellphone] = useState('');
  const [relationship, setRelationship] = useState<GuardianRelationship>('parent');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setWho(join.isMember ? 'child' : 'self');
    setName(join.isMember ? '' : join.userName);
    setBirthdate('');
    setYourName(join.userName);
    setCellphone('');
    setRelationship('parent');
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pick = (next: Who) => {
    setWho(next);
    setName(next === 'self' ? yourName : '');
  };

  const isChild = who === 'child';
  const minors = minorsSettingsOf(org.settings);
  const validDate = isCalendarDate(birthdate);
  // The server refuses it too; saying so here spares them the rest of the form.
  const tooYoung = !isChild && validDate && !minors.accountsAllowed && isUnderAge(birthdate, minors.minorAge);
  const phoneProblem = cellphone.trim() ? cellphoneProblem(cellphone) : null;
  const canSave = !!name.trim() && validDate && !tooYoung && !!cellphone.trim() && !phoneProblem && (!isChild || !!yourName.trim());

  const save = async () => {
    setIsSaving(true);
    setError(null);
    const result = await sendAction(SocketAction.APPLY_TO_ORG, {
      orgId: org.id,
      name: name.trim(),
      birthdate,
      applicantName: isChild ? yourName.trim() : name.trim(),
      applicantCellphone: cellphone.trim(),
      relationship: isChild ? relationship : null,
      note: note.trim() || null,
    }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'The application was not sent.');
    join.refetch();
    onClose();
  };

  const cellField = (
    <View className="gap-1.5 flex-1" style={{ minWidth: 180 }}>
      <FieldLabel label={isChild ? 'Your cellphone *' : 'Cellphone *'} />
      <TextInput
        value={cellphone}
        onChangeText={setCellphone}
        placeholder="082 555 0100"
        keyboardType="phone-pad"
        accessibilityLabel={isChild ? 'Your cellphone' : 'Cellphone'}
        className={TEXT_INPUT}
      />
      {phoneProblem ? <Text className="font-inter text-xs text-danger-ink">{phoneProblem}</Text> : null}
    </View>
  );
  const dateField = (
    <View className="gap-1.5 flex-1" style={{ minWidth: 180 }}>
      <FieldLabel label="Date of birth *" />
      <DatePicker value={birthdate} onChange={setBirthdate} accessibilityLabel="Date of birth" />
    </View>
  );

  return (
    <EditDialog
      visible={visible}
      title={`Apply to join ${org.name}`}
      onClose={onClose}
      onSave={save}
      saveLabel="Apply"
      saveDisabled={!canSave}
      isSaving={isSaving}
      isDirty={!!birthdate || !!cellphone.trim() || !!note.trim()}
    >
      {join.isMember ? null : (
        <View className="gap-1.5">
          <FieldLabel label="Who is this for?" />
          <SegmentedControl<Who>
            options={[{ key: 'self', label: 'Myself' }, { key: 'child', label: 'My child' }]}
            value={who}
            onChange={pick}
          />
        </View>
      )}

      <View className="flex-row flex-wrap gap-3">
        <View className="gap-1.5 flex-1" style={{ minWidth: 180 }}>
          <FieldLabel label={isChild ? 'Child’s full name *' : 'Full name *'} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            accessibilityLabel={isChild ? 'Child’s full name' : 'Full name'}
            className={TEXT_INPUT}
          />
        </View>
        {dateField}
      </View>

      {tooYoung ? (
        <View className="flex-row gap-2 rounded-xl bg-warning-soft px-3 py-2.5">
          <Text className="font-inter text-sm text-warning-ink flex-1">
            At this organisation, a parent or guardian applies for anyone under {minors.minorAge}. Ask yours to apply for you with their own account.
          </Text>
        </View>
      ) : null}

      {isChild ? (
        <>
          <View className="flex-row flex-wrap gap-3">
            <View className="gap-1.5 flex-1" style={{ minWidth: 180 }}>
              <FieldLabel label="Your name *" />
              <TextInput value={yourName} onChangeText={setYourName} placeholder="Your name" accessibilityLabel="Your name" className={TEXT_INPUT} />
            </View>
            {cellField}
          </View>
          <View className="gap-1.5">
            <FieldLabel label="You are their *" />
            <SegmentedControl<GuardianRelationship>
              options={RELATIONSHIPS.map(key => ({ key, label: RELATIONSHIP_LABELS[key] }))}
              value={relationship}
              onChange={setRelationship}
            />
          </View>
        </>
      ) : cellField}

      <View className="gap-1.5">
        <FieldLabel label="Email" />
        <Text className="font-inter text-sm text-ink-muted">{join.userEmail}, from your account</Text>
      </View>

      <View className="gap-1.5">
        <FieldLabel label="Anything they should know? (optional)" />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Which team or sport, say"
          maxLength={500}
          multiline
          accessibilityLabel="Anything they should know"
          className={TEXT_INPUT}
        />
      </View>

      <Text className="font-inter text-sm text-ink-soft">
        {isChild ? 'Ages and contact details are' : 'Your age and contact details are'} not shown publicly. Only this organisation’s admins and staff can see them.
      </Text>
      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}

/** The applicant's own applications here, waiting or lately declined. Nothing when there are none. */
export function YourApplications({ join }: { join: Join }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!join.applications.length) return null;

  const withdraw = async (id: string) => {
    setBusyId(id);
    setError(null);
    const result = await sendAction(SocketAction.WITHDRAW_ORG_APPLICATION, { id }, { suppressToast: true });
    setBusyId(null);
    if (!result.ok) return setError(result.message || 'It was not withdrawn.');
    join.refetch();
  };

  return (
    <View testID="your-applications" className="rounded-2xl border border-line bg-card p-4 gap-2.5">
      <Text className="font-inter-bold text-sm text-ink-soft">Your applications</Text>
      {join.applications.map((application, index) => (
        <View key={application.id} className={`flex-row items-center gap-3 ${index ? 'border-t border-line-soft pt-2.5' : ''}`}>
          <View className="flex-1 min-w-0">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-inter-semibold text-sm text-ink">{application.name}</Text>
              <Text className={`font-inter-bold text-[11px] uppercase tracking-wider ${application.status === 'pending' ? 'text-warning-ink' : 'text-ink-muted'}`}>
                {application.status === 'pending' ? 'Waiting' : 'Not accepted'}
              </Text>
            </View>
            <Text className="font-inter text-xs text-ink-muted mt-0.5">
              {application.status === 'pending'
                ? 'We’ll email you when it’s decided.'
                : `You can apply again from ${formatCalendarDate(application.reapplyFrom)}.`}
            </Text>
          </View>
          {application.status === 'pending' ? (
            <TouchableOpacity
              onPress={() => withdraw(application.id)}
              disabled={busyId === application.id}
              accessibilityRole="button"
              accessibilityLabel={`Withdraw the application for ${application.name}`}
            >
              <Text className="font-inter-bold text-sm text-primary-ink">Withdraw</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {error ? <Text className="font-inter text-xs text-danger-ink">{error}</Text> : null}
    </View>
  );
}
