import React, { useState } from 'react';
import { Switch, Text } from 'react-native';
import { Organization, SocketAction } from '@sk/shared';
import { ConfirmationModal } from '../ConfirmationModal';
import { ReadRow } from '../EditDialog';
import { ReadCard } from '../ReadCard';
import { sendAction } from '../../services/actions';

interface OrgPrivacyCardProps {
  org: Organization;
  /** Only an org Admin may change it; everyone else sees it. */
  isOrgAdmin: boolean;
}

/**
 * Whether the organisation is private (`ORG-14`, docs/org-profile.md §5.3): seen only by its
 * members, and playing only among itself.
 *
 * **Shown only while it can apply.** An org that has ever played another organisation can never go
 * private, so a public one with that history does not get the card at all — in practice it appears
 * on new organisations and private ones. Nor does an unclaimed one, which has no admin to decide.
 *
 * The switch saves when flipped, after a confirmation either way, because either way changes who
 * can see everything the organisation has. What is shown is the live value from the summary room.
 */
export function OrgPrivacyCard({ org, isOrgAdmin }: OrgPrivacyCardProps) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPrivate = !!org.isPrivate;
  if (!isPrivate && (org.hasExternalHistory || !org.isClaimed)) return null;

  const confirm = async () => {
    if (pending === null) return;
    setIsSaving(true);
    const result = await sendAction(
      SocketAction.SET_ORG_PRIVATE,
      { orgId: org.id, isPrivate: pending },
      { suppressToast: true }
    );
    setIsSaving(false);
    setPending(null);
    setError(result.ok ? null : result.message);
  };

  return (
    <ReadCard
      label="Visibility"
      help="A private organisation is for a group keeping track of its own games and tournaments. Only its members can see it."
    >
      <ReadRow
        label="Private"
        sub={isPrivate ? 'Only members can see this organisation' : 'Anyone can see this organisation'}
        right={isOrgAdmin ? (
          <Switch
            value={isPrivate}
            disabled={isSaving}
            onValueChange={(value) => { setError(null); setPending(value); }}
            accessibilityLabel="Private"
          />
        ) : undefined}
      />

      {error ? <Text className="font-inter text-xs text-danger-ink">{error}</Text> : null}

      <ConfirmationModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? `Make ${org.name} private?` : `Make ${org.name} public?`}
        description={pending
          ? `Only ${org.name}'s members will be able to see it. Everyone else won't find it in searches, on Home or on the map, and it can't take part in games or tournaments with other organisations. Private organisations are for groups that keep track of their own games and tournaments. New members join when an admin adds them and sends an invite.`
          // Members' names are shown until people can choose (`PEOPLE-4`), so the warning says so.
          : `Anyone will be able to see ${org.name}, its teams, venues, games and results — including members' names on team sheets — and find it in searches, on Home and on the map. It will also be able to take part in games and tournaments with other organisations. Once it has played another organisation, it can't be made private again.`}
        onConfirm={confirm}
        confirmText={pending ? 'Make private' : 'Make public'}
        variant="primary"
        isProcessing={isSaving}
      />
    </ReadCard>
  );
}

