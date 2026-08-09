import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GameDispute, SocketAction } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { Ionicons } from '@expo/vector-icons';
import { useOptionalSharedDynamicScoring } from './DynamicScoringContext';
import { useAuthStore } from '../../../store/authStore';

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
            ? 'bg-emerald-600 border-emerald-500 shadow-md'
            : 'bg-rose-600 border-rose-500 shadow-md'
          : isApprove
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-rose-500/10 border-rose-500/30'
      }`}
    >
      {active && (
        <View className="absolute -top-2.5 right-1.5 bg-white px-1.5 py-0.5 rounded-full border border-slate-200 shadow-sm">
          <Text className="text-[8px] font-inter-black text-slate-900 uppercase tracking-tighter">
            Your Vote
          </Text>
        </View>
      )}

      {!!sublabel && (
        <Text
          numberOfLines={1}
          className={`text-[9px] font-inter-bold uppercase tracking-wide mb-0.5 ${
            active ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {sublabel}
        </Text>
      )}

      <Text
        numberOfLines={1}
        className={`font-orbitron-bold text-xs uppercase tracking-tight ${
          active
            ? 'text-white'
            : isApprove
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400'
        }`}
      >
        {label}
      </Text>

      {!!voteCount && (
        <Text
          numberOfLines={1}
          className={`text-[9px] font-inter-semibold uppercase tracking-wide mt-0.5 ${
            active ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {voteCount}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function ActiveDisputesPanel({ gameId }: ActiveDisputesPanelProps) {
  const scoringCtx = useOptionalSharedDynamicScoring();
  const disputes = scoringCtx?.disputes || [];
  const events = scoringCtx?.events || [];
  const user = useAuthStore((state) => state.user);

  const [activeDisputeTarget, setActiveDisputeTarget] = useState<GameDispute | null>(null);
  const [voteAction, setVoteAction] = useState<'APPROVE' | 'REJECT' | null>(null);
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
    const officialId = user?.id || 'official';
    const actionType =
      dispute.type === 'UNDO' || (dispute.type as string) === 'REMOVE_EVENT'
        ? 'CAST_UNDO_VOTE'
        : 'CAST_UPDATE_VOTE';

    wsService.emit(
      'action',
      {
        type: actionType,
        payload: {
          gameId,
          disputeId: dispute.id,
          officialId,
          vote,
        },
      },
      () => {}
    );
  };

  return (
    <View className="mb-3 px-1 flex-col gap-2">
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

        const myProfileId = user?.id;
        const mySlotVote = dispute.votes?.find(
          (v: any) => v.voterId === myProfileId || (v.voterId && v.voterId === user?.id)
        );
        const myVote = mySlotVote?.vote;

        return (
          <View
            key={dispute.id}
            className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-3 dark:bg-slate-900/90 shadow-sm"
          >
            {/* Header */}
            <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-amber-500/20">
              <View className="flex-row items-center gap-2">
                <Ionicons name="warning-outline" size={16} color="#F59E0B" />
                <Text className="font-orbitron-bold text-xs text-amber-500 uppercase tracking-widest">
                  {config.heading}
                </Text>
              </View>
              <Text
                className={`font-mono font-bold text-xs ${
                  timeLeft <= 30 && timeLeft > 0 ? 'text-red-500' : 'text-amber-500'
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
                  className="font-inter-black text-sm text-slate-800 dark:text-white uppercase tracking-tight"
                >
                  {eventLabel}
                </Text>

                {pointsDelta > 0 && (
                  <Text className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                    VALUE: {pointsDelta} PTS
                  </Text>
                )}

                <View className="flex-row items-center gap-1.5 mt-2 py-1 px-2.5 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 self-start">
                  {hasVotes && <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  <Text className="text-[10px] font-inter-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">
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

