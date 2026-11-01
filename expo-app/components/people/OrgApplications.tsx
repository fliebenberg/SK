import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MembershipApplication, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { RELATIONSHIP_LABELS } from '../guardians/guardianDraft';
import { PersonAvatar } from './PersonBits';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { ageInYears, formatCalendarDate } from '../../utils/dates';
import { formatCellphone } from '../../utils/phone';

/** What is waiting to be decided, from `org:{id}:applications`: Admin and Staff's (`MEMBER-1`). */
export function useOrgApplications(orgId: string | undefined, enabled = true) {
  const { items } = useLiveRoom<MembershipApplication>(orgId ? `org:${orgId}:applications` : null, {
    enabled,
    reduce: message => (message.type === 'ORG_APPLICATIONS_SYNC' && Array.isArray(message.data)
      ? { kind: 'replace', items: message.data }
      : { kind: 'ignore' }),
  });
  return items;
}

/**
 * The list at the top of People, there only while something is waiting (`MEMBER-1`). Its own list and
 * not rows among the people: an applicant is not on the organisation's records until approved.
 */
export function OrgApplicationsCard({ orgId }: { orgId: string }) {
  const applications = useOrgApplications(orgId);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewing = applications.find(a => a.id === reviewingId) || null;
  if (!applications.length && !reviewing) return null;

  return (
    <View testID="org-applications" className="rounded-2xl border border-warning-line bg-card overflow-hidden">
      <View className="px-4 py-2.5 bg-warning-soft">
        <Text className="font-inter-bold text-sm text-warning-ink">Applications to join · {applications.length}</Text>
      </View>
      {applications.map((application, index) => (
        <View key={application.id} className={`flex-row items-center gap-3 px-4 py-2.5 ${index ? 'border-t border-line-soft' : ''}`}>
          <PersonAvatar name={application.name} size={36} />
          <View className="flex-1 min-w-0">
            <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{application.name}</Text>
            <Text className="font-inter text-xs text-ink-muted mt-0.5" numberOfLines={1}>
              {application.relationship
                ? `Child · applied by ${application.applicantName}, ${RELATIONSHIP_LABELS[application.relationship].toLowerCase()}`
                : application.applicantEmail}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setReviewingId(application.id)}
            accessibilityRole="button"
            accessibilityLabel={`Review ${application.name}`}
            className="rounded-xl border border-line px-3 py-1.5"
          >
            <Text className="font-inter-bold text-sm text-ink-soft">Review</Text>
          </TouchableOpacity>
        </View>
      ))}
      <ReviewDialog application={reviewing} onClose={() => setReviewingId(null)} />
    </View>
  );
}

const NEW_PERSON = 'new';

function ReviewDialog({ application, onClose }: { application: MembershipApplication | null; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const [choice, setChoice] = useState<string | null>(null);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChoice(null);
    setIsDeclining(false);
    setError(null);
  }, [application?.id]);

  if (!application) return null;
  const matches = application.possibleMatches || [];
  const age = ageInYears(application.birthdate);

  const decide = async (decision: 'approve' | 'decline') => {
    setIsSaving(true);
    setError(null);
    const result = await sendAction(SocketAction.DECIDE_ORG_APPLICATION, {
      id: application.id,
      decision,
      existingProfileId: decision === 'approve' && choice && choice !== NEW_PERSON ? choice : null,
    }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'It was not saved.');
    onClose();
  };

  const row = (label: string, value?: string | null) => (value ? (
    <View className="flex-row gap-3">
      <Text className="font-inter text-sm text-ink-muted" style={{ width: 100 }}>{label}</Text>
      <Text className="font-inter text-sm text-ink flex-1" selectable>{value}</Text>
    </View>
  ) : null);
  const radio = (value: string, label: string, sub?: string) => (
    <TouchableOpacity
      key={value}
      onPress={() => setChoice(value)}
      accessibilityRole="radio"
      accessibilityState={{ checked: choice === value }}
      accessibilityLabel={label}
      className="flex-row items-start gap-2 py-1"
    >
      <Ionicons name={choice === value ? 'radio-button-on' : 'radio-button-off'} size={18} color={themeColor(isDark, choice === value ? 'primary' : 'ink-muted')} />
      <View className="flex-1">
        <Text className="font-inter-semibold text-sm text-ink">{label}</Text>
        {sub ? <Text className="font-inter text-xs text-ink-muted">{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <EditDialog
      visible
      title={isDeclining ? `Decline ${application.name}?` : `${application.name} wants to join`}
      onClose={onClose}
      onSave={() => decide(isDeclining ? 'decline' : 'approve')}
      saveLabel={isDeclining ? 'Decline' : 'Approve as Member'}
      saveDisabled={!isDeclining && matches.length > 0 && !choice}
      isSaving={isSaving}
      footerLeft={!isDeclining ? (
        <TouchableOpacity onPress={() => setIsDeclining(true)} accessibilityRole="button" className="py-2">
          <Text className="font-inter-bold text-sm text-danger-ink">Decline</Text>
        </TouchableOpacity>
      ) : undefined}
    >
      {isDeclining ? (
        <Text className="font-inter text-sm text-ink-soft">
          {application.applicantName} will be told by email, and can apply again after 30 days.
        </Text>
      ) : (
        <>
          <View className="gap-1.5">
            {row('Date of birth', `${formatCalendarDate(application.birthdate)}${age !== null ? ` (${age})` : ''}`)}
            {application.relationship ? row('Applied by', `${application.applicantName}, ${RELATIONSHIP_LABELS[application.relationship].toLowerCase()}`) : null}
            {row('Email', application.applicantEmail)}
            {row('Cellphone', formatCellphone(application.applicantCellphone) || application.applicantCellphone)}
            {row('Their note', application.note)}
          </View>
          {matches.length ? (
            <View testID="application-matches" className="rounded-xl border border-line p-3 gap-1">
              <Text className="font-inter-bold text-sm text-ink-soft mb-1">Is this someone already on your records?</Text>
              {matches.map(match => radio(
                match.id,
                match.name,
                [match.birthdate ? `Born ${formatCalendarDate(match.birthdate)}` : '', match.personOrgId ? `Org ID ${match.personOrgId}` : ''].filter(Boolean).join(' · ') || undefined,
              ))}
              {radio(NEW_PERSON, 'None of these. It’s someone new.')}
            </View>
          ) : null}
        </>
      )}
      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}
