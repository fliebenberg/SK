import React, { useState } from 'react';
import { Text } from 'react-native';
import { Organization, OrgMembershipMode, SocketAction } from '@sk/shared';
import { ReadRow } from '../EditDialog';
import { ReadCard } from '../ReadCard';
import { SegmentedControl } from '../SegmentedControl';
import { sendAction } from '../../services/actions';

const LABELS: Record<OrgMembershipMode, string> = { invite: 'Invite only', apply: 'Anyone can apply' };

/**
 * How people join (`MEMBER-1`), on Settings. The live value comes from the summary room. Not offered
 * on a private organisation, which nobody can find to apply to, nor an unclaimed one, with nobody to decide.
 */
export function OrgJoiningCard({ org, isOrgAdmin }: { org: Organization; isOrgAdmin: boolean }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (org.isPrivate || !org.isClaimed) return null;
  const mode: OrgMembershipMode = org.membershipMode || 'invite';

  const change = async (next: OrgMembershipMode) => {
    if (next === mode || isSaving) return;
    setIsSaving(true);
    setError(null);
    const result = await sendAction(SocketAction.SET_ORG_MEMBERSHIP_MODE, { orgId: org.id, mode: next }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) setError(result.message || 'It was not changed.');
  };

  return (
    <ReadCard
      label="Joining this organisation"
      help="Invite only: your admins and staff add people. Anyone can apply: people ask from your public page, and join only once your admins or staff approve them."
    >
      {isOrgAdmin ? (
        <SegmentedControl<OrgMembershipMode>
          options={[{ key: 'invite', label: LABELS.invite }, { key: 'apply', label: LABELS.apply }]}
          value={mode}
          onChange={change}
        />
      ) : <ReadRow label={LABELS[mode]} />}
      {error ? <Text className="font-inter text-xs text-danger-ink">{error}</Text> : null}
    </ReadCard>
  );
}
