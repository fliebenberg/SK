import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { NominateAdminModal } from '../NominateAdminModal';
import { SignInPrompt } from '../SignInPrompt';
import { useOrgClaimStatus } from '../../hooks/useOrgClaimStatus';
import { useAuthStore } from '../../store/authStore';

/**
 * Under the public organisation page's banner while the organisation has no administrator: the
 * page's way into `NominateAdminModal` (docs/nomination-process.md §4), for someone who is not a
 * member and so never sees the workspace's `UnclaimedOrgBanner`. Before it (2026-10-31) an outsider
 * looking at an org nobody runs — one added from a game or a tournament, waiting to be claimed — had
 * no way to claim it or say who should.
 *
 * Shown to everyone (design_spec §6.5): a visitor who presses it is asked to sign in, and comes back
 * here. Signed in, the dialog decides what they may do — take the role themselves ("It's me") when
 * the server says so, or nominate someone. The button says *Claim or nominate* unless the server has
 * said they may not take it. Amber until they have nominated someone, then green, as on the banner.
 * It goes when the org is claimed: `isClaimed` arrives with the org summary, which the takeover
 * republishes.
 */
export function UnclaimedOrgStrip({ org }: { org: { id: string; name: string; isClaimed?: boolean } }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const unclaimed = org.isClaimed === false;
  const { status, error: statusError, addPending, refresh } = useOrgClaimStatus(org.id, unclaimed && isAuthenticated, { suppressToast: true });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);

  const showStrip = unclaimed && !status?.isClaimed;
  // The dialog outlives the strip: taking the role claims the org while its "done" view is showing.
  if (!showStrip && !dialogOpen) return null;

  const mine = status?.myPendingEmails || [];
  const pending = mine.length > 0;
  const label = pending ? 'Invite another' : status && !status.canTakeOver ? 'Nominate an admin' : 'Claim or nominate';

  return (
    <>
      {showStrip ? (
        <View className={`rounded-xl px-3.5 py-2.5 flex-row flex-wrap items-center gap-2.5 ${pending ? 'bg-success-soft' : 'bg-warning-soft'}`}>
          <Text className={`flex-1 font-inter text-sm leading-snug ${pending ? 'text-success-ink' : 'text-warning-ink'}`} style={{ minWidth: 200 }}>
            <Text className="font-inter-bold">{org.name} has no administrator yet.</Text>
            {pending ? ` You invited ${mine.join(', ')}.` : ' If you run it, claim it — or tell us who does.'}
          </Text>
          <TouchableOpacity
            onPress={() => (isAuthenticated ? setDialogOpen(true) : setSignInOpen(true))}
            accessibilityRole="button"
            className="rounded-xl bg-primary px-3.5 py-2"
          >
            <Text className="font-inter-bold text-[13px] text-on-primary">{label}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isAuthenticated ? (
        <NominateAdminModal
          visible={dialogOpen}
          onClose={() => setDialogOpen(false)}
          org={org}
          status={status}
          statusError={statusError}
          onRetryStatus={refresh}
          onNominated={addPending}
          onTookOver={refresh}
        />
      ) : null}

      <SignInPrompt
        isOpen={signInOpen}
        onClose={() => setSignInOpen(false)}
        title={`Sign in to claim ${org.name}`}
        description="Take it on yourself if you run it, or invite whoever does."
      />
    </>
  );
}
