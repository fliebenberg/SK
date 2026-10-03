import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { ReadCard } from '../../../components/ReadCard';
import { NominateAdminModal } from '../../../components/NominateAdminModal';
import { ConfirmationModal } from '../../../components/ConfirmationModal';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useOrgClaimStatus } from '../../../hooks/useOrgClaimStatus';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { nominateOrgContact } from '../../../services/nominations';
import { useToastStore } from '../../../store/toastStore';
import { formatInstantDate } from '../../../utils/dates';
import { COLORS } from '../../../constants/Colors';

const STATUS_STYLE: Record<string, { box: string; text: string }> = {
  pending: { box: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30', text: 'text-amber-800 dark:text-amber-300' },
  claimed: { box: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30', text: 'text-emerald-800 dark:text-brand-green' },
  declined: { box: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30', text: 'text-red-700 dark:text-red-400' },
  voided: { box: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700', text: 'text-slate-600 dark:text-slate-400' },
};

/**
 * Finding an administrator for an org that has none (docs/nomination-process.md §4).
 *
 * A temporary page for a temporary task: the workspace menu offers it, in amber above everything
 * else, only while the org is unclaimed, and the banner on every workspace page points the same
 * way. Once the org has an administrator the menu item goes and this page says there is nothing
 * left to do; the nominations stay in the database but are no longer shown (decided 2026-10-01).
 * Neither query here is sent for a claimed org.
 */
export default function NominateAdmin() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const safeBack = useSafeBack();
  const { width } = useWindowDimensions();
  const { org, isLoading } = useOrgSummary(orgId);
  const isUnclaimed = org?.isClaimed === false;
  const { data: nominations, refetch } = useSocketQuery<any[]>('org_referrals', { orgId }, { enabled: isUnclaimed });
  const { status: claimStatus, refresh: refreshClaimStatus } = useOrgClaimStatus(orgId, isUnclaimed);
  const [isNominating, setIsNominating] = useState(false);
  /** A pending nomination whose invitation is to be sent again (`ORG-7`), awaiting confirmation. */
  const [resendTarget, setResendTarget] = useState<{ email: string; sentAt: string } | null>(null);
  const [isResending, setIsResending] = useState(false);

  // A claim made from here (taking the role) shows in the claim status before the summary push.
  const needsAdmin = isUnclaimed && !claimStatus?.isClaimed;

  const confirmResend = () => {
    if (!resendTarget || !orgId) return;
    setIsResending(true);
    nominateOrgContact(orgId, resendTarget.email, { resend: true }).then(result => {
      setIsResending(false);
      if (!result.ok) return;
      setResendTarget(null);
      refetch();
      if (result.outcome === 'sent') {
        useToastStore.getState().showSuccess(`The invitation went to ${result.email} again, with a new link.`, 'Invitation Resent');
      } else {
        useToastStore.getState().showInfo(`${result.email} has already answered this invitation, so nothing was sent.`, 'Not Resent');
      }
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Nominate admin" onBack={() => safeBack(`/admin/${orgId}`)} />
      {isLoading || !org ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={COLORS.brand.orange} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: width >= 768 ? 24 : 12, paddingBottom: 60 }}>
          <View className="w-full gap-4 self-center" style={{ maxWidth: 720 }}>
            {!needsAdmin ? (
              <ReadCard label="Administrator">
                <Text className="font-inter text-sm text-slate-700 dark:text-slate-200">
                  {org.name} has an administrator, so there is no one left to nominate. To make someone else an
                  administrator, add them under People with the admin role.
                </Text>
              </ReadCard>
            ) : (
              <>
                <View className="rounded-2xl border p-4 gap-3 bg-amber-50 dark:bg-amber-400/5 border-amber-200 dark:border-amber-300/25">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="font-inter-bold text-base text-amber-900 dark:text-amber-200 flex-1">No administrator yet</Text>
                    <TouchableOpacity
                      onPress={() => setIsNominating(true)}
                      accessibilityRole="button"
                      className="flex-row items-center gap-1.5 rounded-xl bg-brand-orange px-3.5 min-h-[40px]"
                    >
                      <Ionicons name="add" size={16} color="white" />
                      <Text className="font-inter-bold text-sm text-white">Nominate</Text>
                    </TouchableOpacity>
                  </View>
                  <Text className="font-inter text-sm text-amber-900 dark:text-amber-200">
                    Invite someone to run {org.name}. The first person to accept becomes its administrator, and the other
                    invitations are cancelled.
                  </Text>
                </View>

                <ReadCard label="Nominations">
                  {Array.isArray(nominations) && nominations.length > 0 ? (
                    <View>
                      {nominations.map((ref: any, i: number) => {
                        const style = STATUS_STYLE[ref.status] || STATUS_STYLE.voided;
                        return (
                          <View key={ref.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-slate-200 dark:border-white/5' : ''}`}>
                            <View className="flex-1 min-w-0">
                              <Text className="font-inter-semibold text-sm text-slate-800 dark:text-white" numberOfLines={1}>{ref.referredEmail}</Text>
                              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Nominated {formatInstantDate(ref.createdAt)}
                                {ref.status === 'pending' && ref.lastSentAt && ref.lastSentAt !== ref.createdAt
                                  ? ` · last sent ${formatInstantDate(ref.lastSentAt)}`
                                  : ''}
                              </Text>
                            </View>
                            {/* A lost invitation can be sent again here, deliberately (`ORG-7`). */}
                            {ref.status === 'pending' ? (
                              <TouchableOpacity
                                onPress={() => setResendTarget({ email: ref.referredEmail, sentAt: ref.lastSentAt || ref.createdAt })}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={`Resend the invitation to ${ref.referredEmail}`}
                              >
                                <Text className="font-inter-bold text-sm text-orange-700 dark:text-brand-orange">Resend</Text>
                              </TouchableOpacity>
                            ) : null}
                            <View className={`px-2.5 py-0.5 rounded-full border ${style.box}`}>
                              <Text className={`font-inter-bold text-[10px] uppercase ${style.text}`}>{ref.status}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">No one has been nominated yet.</Text>
                  )}
                </ReadCard>
              </>
            )}
          </View>
        </ScrollView>
      )}

      <NominateAdminModal
        visible={isNominating}
        onClose={() => setIsNominating(false)}
        org={{ id: orgId, name: org?.name || '' }}
        status={claimStatus}
        onNominated={() => { refetch(); refreshClaimStatus(); }}
        onTookOver={() => refreshClaimStatus()}
      />

      <ConfirmationModal
        isOpen={resendTarget !== null}
        onClose={() => { if (!isResending) setResendTarget(null); }}
        title="Resend Invitation?"
        description={resendTarget
          ? `An invitation already went to ${resendTarget.email} on ${formatInstantDate(resendTarget.sentAt)}. Only send it again if they say it did not arrive, and ask them to check their spam folder first. Resending sends a new link, so the earlier one will stop working.`
          : ''}
        confirmText="Resend"
        variant="primary"
        onConfirm={confirmResend}
        isProcessing={isResending}
      />
    </SafeAreaView>
  );
}
