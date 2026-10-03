import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GameDispute, SocketAction } from '@sk/shared';
import { wsService } from '../../../services/websocket';
import { sendAction } from '../../../services/actions';
import { Ionicons } from '@expo/vector-icons';
import { useOptionalSharedDynamicScoring } from './DynamicScoringContext';
import { useAuthStore } from '../../../store/authStore';


import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';
interface ActiveDisputesPanelProps {
  gameId: string;
}

function DisputeActionButton({
  label,
  onClick,
  active,
  sublabel,
  voteCount,
  type,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  sublabel?: string;
  voteCount?: string;
  type: 'APPROVE' | 'REJECT';
}) {
  const isApprove = type === 'APPROVE';

  return (
    <TouchableOpacity
      onPress={onClick}
      activeOpacity={0.8}
      className={`relative flex-col items-center justify-center rounded-xl border-2 px-3 py-2 min-w-[110px] flex-1 ${
        active
          ? isApprove
            ? 'bg-success border-success shadow-md'
            : 'bg-danger border-danger shadow-md'
          : isApprove
          ? 'bg-success-soft border-success-line'
          : 'bg-danger-soft border-danger-line'
      }`}
    >
      {active && (
        <View className="absolute -top-2.5 right-1.5 bg-card px-1.5 py-0.5 rounded-full border border-line shadow-sm">
          <Text className="text-[8px] font-inter-black text-ink uppercase tracking-tighter">
            Your Vote
          </Text>
        </View>
      )}

      {!!sublabel && (
        <Text
          numberOfLines={1}
          className={`text-[9px] font-inter-bold uppercase tracking-wide mb-0.5 ${
            active ? 'text-on-fill/80' : 'text-ink-muted'
          }`}
        >
          {sublabel}
        </Text>
      )}

      <Text
        numberOfLines={1}
        className={`font-orbitron-bold text-xs uppercase tracking-tight ${
          active
            ? 'text-on-fill'
            : isApprove
            ? 'text-success-ink'
            : 'text-danger-ink'
        }`}
      >
        {label}
      </Text>

      {!!voteCount && (
        <Text
          numberOfLines={1}
          className={`text-[9px] font-inter-semibold uppercase tracking-wide mt-0.5 ${
            active ? 'text-on-fill/80' : 'text-ink-muted'
          }`}
        >
          {voteCount}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function ActiveDisputesPanel({ gameId }: ActiveDisputesPanelProps) {
  const isDark = useActiveTheme() === 'dark';
  const scoringCtx = useOptionalSharedDynamicScoring();
  const disputes = scoringCtx?.disputes || [];
  const events = scoringCtx?.events || [];
  const user = useAuthStore((state) => state.user);

  const [activeDisputeTarget, setActiveDisputeTarget] = useState<GameDispute | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const gameDisputes = disputes.filter(
    (d) => d.gameId === gameId && (!d.status || d.status === 'OPEN')
  );

  // Trigger JIT resolution on server when countdown reaches 0
  useEffect(() => {
    gameDisputes.forEach((d) => {
      const expiresAt = d.expiresAt ? new Date(d.expiresAt).getTime() : 0;
      if (expiresAt > 0 && Date.now() >= expiresAt) {
        wsService.emit('get_data', { type: 'active_disputes', id: gameId }, () => {});
      }
    });
  }, [now, gameDisputes.length, gameId]);

  if (gameDisputes.length === 0) return null;

  const handleCastVote = (dispute: GameDispute, vote: 'APPROVE' | 'REJECT') => {
    const orgMemberships = useAuthStore.getState().orgMemberships || [];
    const officialId = orgMemberships[0]?.orgProfileId;

    if (!officialId) {
      setErrorMessage('Registered Profile Required: You must be logged in with a valid organization profile to vote.');
      return;
    }

    setErrorMessage(null);
    const actionType =
      dispute.type === 'UNDO' || (dispute.type as string) === 'REMOVE_EVENT'
        ? SocketAction.CAST_UNDO_VOTE
        : SocketAction.CAST_UPDATE_VOTE;

    // A refused vote is shown in this panel's own error banner, so no toast as well.
    sendAction(
      actionType,
      {
        gameId,
        disputeId: dispute.id,
        officialId,
        vote,
      },
      { suppressToast: true }
    ).then((result) => {
      if (!result.ok) setErrorMessage(result.message);
    });
  };

  return (
    <View className="mb-3 px-1 flex-col gap-2">
      {errorMessage && (
        <View className="bg-danger-soft border border-danger-line rounded-xl p-2.5 flex-row items-center justify-between">
          <Text className="text-xs font-inter-semibold text-danger-ink flex-1">
            {errorMessage}
          </Text>
          <TouchableOpacity onPress={() => setErrorMessage(null)} activeOpacity={0.8} className="ml-2">
            <Ionicons name="close-circle" size={18} color={themeColor(isDark, 'danger')} />
          </TouchableOpacity>
        </View>
      )}

      {gameDisputes.map((dispute) => {
        const targetEvent = events.find((e) => e.id === dispute.gameEventId);
        const rawLabel = targetEvent?.subType || targetEvent?.type;
        const eventLabel = rawLabel
          ? rawLabel.toUpperCase()
          : dispute.type === 'UNDO' || (dispute.type as string) === 'REMOVE_EVENT'
          ? 'EVENT REMOVAL'
          : 'EVENT UPDATE';

        const pointsDelta =
          targetEvent?.eventData?.pointsDelta || (targetEvent?.eventData as any)?.points || 0;

        const expiresAt = dispute.expiresAt ? new Date(dispute.expiresAt).getTime() : 0;
        const timeLeft = expiresAt > 0 ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

        const approveCount = dispute.approveCount || 0;
        const rejectCount = dispute.rejectCount || 0;
        const totalEligible = dispute.totalEligibleVoters || 1;

        const config = dispute.disputeConfig ?? {
          heading:
            dispute.type === 'UNDO' || (dispute.type as string) === 'REMOVE_EVENT'
              ? 'Remove Event'
              : 'Update Event',
          approveLabel: 'Approve',
          rejectLabel: 'Reject',
        };

        const approveLabel = config.approveLabel || 'Approve';
        const rejectLabel = config.rejectLabel || 'Reject';
        const approveSublabel = (config as any).approveSublabel;
        const rejectSublabel = (config as any).rejectSublabel;

        const hasVotes = approveCount > 0 || rejectCount > 0;
        let winningText = 'WAITING FOR VOTES';
        if (approveCount > rejectCount) {
          winningText = `WINNING: ${approveLabel.toUpperCase()}`;
        } else if (rejectCount > approveCount) {
          winningText = `WINNING: ${rejectLabel.toUpperCase()}`;
        } else if (hasVotes) {
          winningText = 'CURRENTLY TIED';
        }

        const orgMemberships = useAuthStore.getState().orgMemberships || [];
        const myProfileIds = orgMemberships.map((m: any) => m.orgProfileId).filter(Boolean);

        const mySlotVote = dispute.votes?.find(
          (v: any) => myProfileIds.includes(v.voterId)
        );
        const myVote = mySlotVote?.vote;

        return (
          <View
            key={dispute.id}
            className="bg-warning-soft border-2 border-warning-line rounded-2xl p-3 shadow-sm"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-warning-line">
              <View className="flex-row items-center gap-2">
                <Ionicons name="warning-outline" size={16} color={themeColor(isDark, 'warning-ink')} />
                <Text className="font-orbitron-bold text-xs text-warning-ink uppercase tracking-widest">
                  {config.heading}
                </Text>
              </View>
              <Text
                className={`font-mono font-bold text-xs ${
                  timeLeft <= 30 && timeLeft > 0 ? 'text-danger-ink' : 'text-warning-ink'
                }`}
              >
                {timeLeft > 0 ? timeStr : 'Resolving...'}
              </Text>
            </View>

            {/* Content & Action Buttons */}
            <View className="flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <View className="flex-1 flex-col">
                <Text
                  numberOfLines={1}
                  className="font-inter-black text-sm text-ink uppercase tracking-tight"
                >
                  {eventLabel}
                </Text>

                {pointsDelta > 0 && (
                  <Text className="text-[11px] font-mono font-semibold text-ink-muted mt-0.5">
                    VALUE: {pointsDelta} PTS
                  </Text>
                )}

                <View className="flex-row items-center gap-1.5 mt-2 py-1 px-2.5 rounded-md bg-sunken border border-line self-start">
                  {hasVotes && <View className="w-1.5 h-1.5 rounded-full bg-success" />}
                  <Text className="text-[10px] font-inter-bold text-ink-soft uppercase tracking-tight">
                    {winningText}
                  </Text>
                </View>
              </View>

              {/* Vote Buttons */}
              <View className="flex-row gap-2 w-full sm:w-auto mt-1 sm:mt-0">
                <DisputeActionButton
                  onClick={() => handleCastVote(dispute, 'REJECT')}
                  active={myVote === 'REJECT'}
                  type="REJECT"
                  label={rejectLabel}
                  sublabel={rejectSublabel}
                  voteCount={`${rejectCount}/${totalEligible}`}
                />
                <DisputeActionButton
                  onClick={() => handleCastVote(dispute, 'APPROVE')}
                  active={myVote === 'APPROVE'}
                  type="APPROVE"
                  label={approveLabel}
                  sublabel={approveSublabel}
                  voteCount={`${approveCount}/${totalEligible}`}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

