import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgClaimStatus, SocketAction } from '@sk/shared';
import { Button } from './Button';
import { wsService } from '../services/websocket';
import { sendAction } from '../services/actions';
import { useAuthStore } from '../store/authStore';
import { useActiveTheme } from '../store/settingsStore';
import { COLORS, getThemeColor } from '../constants/Colors';

/**
 * The small icon on an organisation chip that asks the user to help get an unclaimed org claimed.
 *
 * Self-contained so any screen that adds organisations can drop it in: it reads the org's claim
 * status itself (`org_claim_status`), and the invitation is sent the moment the email is submitted
 * rather than when the surrounding form saves — the nomination is not part of whatever process
 * the org is being added to. Yellow means "you have not referred anyone for this org"; green means
 * you have, so an organiser setting up several events in a day is not asked about the same school
 * each time. Someone else's nomination does not count: the org stays yellow for you until you
 * name a contact yourself — and naming the address they used records you as a nominator without
 * sending a second email inside the cooldown.
 *
 * Renders nothing for a claimed org. The hover hint is positioned above the icon, so a container
 * that stacks chips should raise the hovered chip via `onHoverChange`.
 */
export interface UnclaimedOrgBadgeProps {
  org: { id: string; name: string; isClaimed?: boolean };
  size?: number;
  className?: string;
  onHoverChange?: (hovered: boolean) => void;
  /**
   * Open the nomination modal as soon as the status comes back yellow — for a chip the user has
   * just added, so the appeal is made without relying on them noticing the icon. Once per org;
   * they can cancel. Leave off for chips that were already there when the screen opened.
   */
  autoPrompt?: boolean;
}

/** Why an address could not be invited: the nominee has already answered. */
type Answered = 'declined' | 'claimed' | 'referred';

const ANSWERED_COPY: Record<Answered, (email: string, org: string) => string> = {
  declined: (email, org) => `${email} has already declined an invitation to manage ${org}, so nothing was sent. Please nominate a different contact.`,
  claimed: (email, org) => `${email} has already claimed ${org}, so no invitation is needed.`,
  referred: (email, org) => `${email} passed an earlier invitation for ${org} on to someone else, so nothing was sent. Please nominate a different contact.`,
};

const APPEAL = (name: string) =>
  `${name} doesn't have an administrator on Scorekeeper yet. Help bring this organization to life by nominating a contact email—we'll invite them to claim it, manage their teams, and keep schedules up to date.`;

export function UnclaimedOrgBadge({ org, size = 14, className = '', onHoverChange, autoPrompt = false }: UnclaimedOrgBadgeProps) {
  const isDark = useActiveTheme() === 'dark';
  const userId = useAuthStore(s => s.user?.id);

  const [status, setStatus] = useState<OrgClaimStatus | null>(null);
  const [sentEmails, setSentEmails] = useState<string[]>([]);
  const [hovered, setHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; outcome: 'sent' | 'already-invited' | Answered } | null>(null);
  const promptedForOrg = useRef<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setSentEmails([]);
    if (org.isClaimed !== false) return;
    wsService.emit(
      'get_data',
      { type: 'org_claim_status', orgId: org.id },
      (res: OrgClaimStatus | null) => {
        if (!res || res.orgId !== org.id) return;
        setStatus(res);
        if (autoPrompt && !res.isClaimed && res.myPendingEmails.length === 0 && promptedForOrg.current !== org.id) {
          promptedForOrg.current = org.id;
          setIsOpen(true);
        }
      },
      7000,
      { suppressToast: true }
    );
  }, [org.id, org.isClaimed, autoPrompt]);

  if (org.isClaimed !== false || status?.isClaimed) return null;

  const mine = Array.from(new Set([...(status?.myPendingEmails || []), ...sentEmails]));
  const pending = mine.length > 0;
  const hint = pending
    ? `You invited ${mine.join(', ')} to claim this organisation. Click to invite someone else.`
    : 'Click to help get this organisation claimed on Scorekeeper.';

  const setHover = (h: boolean) => {
    setHovered(h);
    onHoverChange?.(h);
  };

  const close = () => {
    setIsOpen(false);
    setEmail('');
    setSentTo(null);
  };

  /** Back to the form with the field cleared, after an address that could not be invited. */
  const tryAnother = () => {
    setEmail('');
    setSentTo(null);
  };

  const send = () => {
    const address = email.trim().toLowerCase();
    if (!address.includes('@') || !userId) return;
    setSending(true);
    sendAction(
      SocketAction.REFER_ORG_CONTACT,
      { orgId: org.id, contactEmails: [address], referredByUserId: userId }
    ).then(result => {
        setSending(false);
        // A failure has already been toasted; keep the form open.
        if (!result.ok) return;
        // The referrals are in `data`. This used to test the ack itself with `Array.isArray`, so
        // `row` was always null and an answered nomination was always reported as "sent".
        const row = Array.isArray(result.data) ? result.data[0] : null;
        // Claimed, declined or passed on: the nominee has answered, and this is not a referral.
        if (row && row.status !== 'pending') {
          const answered: Answered =
            row.status === 'declined' ? 'declined' : row.status === 'claimed' ? 'claimed' : 'referred';
          setSentTo({ email: address, outcome: answered });
          return;
        }
        setSentEmails(prev => (prev.includes(address) ? prev : [...prev, address]));
        setSentTo({ email: address, outcome: row && row.emailSent === false ? 'already-invited' : 'sent' });
      });
  };

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        accessibilityRole="button"
        accessibilityLabel={hint}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        className={className}
        style={{ zIndex: hovered ? 30 : undefined }}
      >
        <Ionicons
          name={pending ? 'mail' : 'alert-circle'}
          size={size}
          color={pending ? COLORS.brand.green : COLORS.brand.yellow}
        />
        {hovered && (
          <View
            className="absolute bg-slate-900 dark:bg-slate-700 rounded-lg px-2.5 py-1.5 shadow-lg"
            style={{ bottom: size + 10, left: -100, width: 220 }}
            pointerEvents="none"
          >
            <Text className="font-inter text-[11px] text-white text-center">{hint}</Text>
          </View>
        )}
      </Pressable>

      <Modal transparent visible={isOpen} animationType="fade" onRequestClose={close}>
        <Pressable className="flex-1 bg-slate-950/40 items-center justify-center p-6" onPress={close}>
          <Pressable
            className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-white/10 w-full max-w-md shadow-lg space-y-4"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="font-orbitron-bold text-[10px] text-brand-orange uppercase tracking-wider">
                  Invite Administrator
                </Text>
                <Text className="font-inter-bold text-base text-slate-850 dark:text-white mt-0.5">
                  {org.name}
                </Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {sentTo ? (
              <View className="items-center py-2 space-y-3">
                <Ionicons
                  name={sentTo.outcome === 'sent' || sentTo.outcome === 'already-invited' ? 'checkmark-circle' : 'information-circle'}
                  size={36}
                  color={sentTo.outcome === 'sent' || sentTo.outcome === 'already-invited' ? COLORS.brand.green : COLORS.brand.yellow}
                />
                <Text className="font-inter text-sm text-slate-600 dark:text-slate-400 text-center leading-5">
                  {sentTo.outcome === 'sent' && (
                    <>
                      An invitation to claim {org.name} has been sent to{' '}
                      <Text className="font-inter-bold text-slate-850 dark:text-white">{sentTo.email}</Text>.
                    </>
                  )}
                  {sentTo.outcome === 'already-invited' && (
                    <>
                      <Text className="font-inter-bold text-slate-850 dark:text-white">{sentTo.email}</Text>
                      {' '}was invited to claim {org.name} recently, so no second email was sent. Your referral has been recorded.
                    </>
                  )}
                  {sentTo.outcome !== 'sent' && sentTo.outcome !== 'already-invited' &&
                    ANSWERED_COPY[sentTo.outcome](sentTo.email, org.name)}
                </Text>
                {sentTo.outcome === 'sent' || sentTo.outcome === 'already-invited' || sentTo.outcome === 'claimed' ? (
                  <Button title="Done" variant="primary" onPress={close} className="w-full" />
                ) : (
                  <View className="w-full gap-2">
                    <Button title="Nominate a different contact" variant="primary" onPress={tryAnother} className="w-full" />
                    <Button title="Cancel" variant="ghost" onPress={close} className="w-full" />
                  </View>
                )}
              </View>
            ) : (
              <>
                <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-5">
                  {APPEAL(org.name)}
                </Text>
                {pending && (
                  <Text className="font-inter text-xs text-brand-green leading-5">
                    {`You have already invited ${mine.join(', ')}. You can invite another contact as well.`}
                  </Text>
                )}

                <View className="space-y-1.5">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Contact Email
                  </Text>
                  <TextInput
                    placeholder="contact@school.edu"
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    value={email}
                    onChangeText={setEmail}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!sending}
                    autoFocus
                  />
                  <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                    We only use this address to send the claim invitation.
                  </Text>
                </View>

                <View className="flex-row justify-end gap-2 pt-1">
                  <Button title="Cancel" variant="ghost" onPress={close} disabled={sending} />
                  <Button
                    title={sending ? 'Sending...' : 'Send Invitation'}
                    variant="primary"
                    isLoading={sending}
                    onPress={send}
                    disabled={!email.includes('@') || sending || !userId}
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
