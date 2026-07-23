import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { GameDispute } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../ConfirmationModal';

interface ActiveDisputesPanelProps {
  gameId: string;
}

export function ActiveDisputesPanel({ gameId }: ActiveDisputesPanelProps) {
  const [disputes, setDisputes] = useState<GameDispute[]>([]);
  const [activeDisputeTarget, setActiveDisputeTarget] = useState<GameDispute | null>(null);
  const [voteAction, setVoteAction] = useState<'APPROVE' | 'REJECT' | null>(null);

  const fetchDisputes = () => {
    wsService.emit('get_data', { type: 'active_disputes', id: gameId }, (data: GameDispute[]) => {
      if (data) setDisputes(data);
    });
  };

  useEffect(() => {
    fetchDisputes();

    const handleUpdate = (evt: { type: string; data: any }) => {
      if (evt.type === 'DISPUTE_STARTED' && evt.data?.dispute) {
        setDisputes(prev => [evt.data.dispute, ...prev.filter(d => d.id !== evt.data.dispute.id)]);
      } else if (evt.type === 'DISPUTE_VOTE_UPDATED' && evt.data?.dispute) {
        setDisputes(prev => prev.map(d => d.id === evt.data.dispute.id ? { ...d, ...evt.data.dispute } : d));
      } else if (evt.type === 'DISPUTE_RESOLVED' && evt.data?.disputeId) {
        setDisputes(prev => prev.filter(d => d.id !== evt.data.disputeId));
      } else if (evt.type === 'ACTIVE_DISPUTES_SYNC' && Array.isArray(evt.data)) {
        setDisputes(evt.data);
      }
    };

    wsService.on('update', handleUpdate);
    return () => {
      wsService.off('update', handleUpdate);
    };
  }, [gameId]);

  if (disputes.length === 0) return null;

  const handleCastVote = () => {
    if (!activeDisputeTarget || !voteAction) return;
    wsService.emit(
      'action',
      {
        type: 'CAST_UPDATE_VOTE',
        payload: {
          gameId,
          disputeId: activeDisputeTarget.id,
          officialId: 'official',
          vote: voteAction,
        },
      },
      () => {
        setActiveDisputeTarget(null);
        setVoteAction(null);
        fetchDisputes();
      }
    );
  };

  return (
    <View className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
      <View className="flex-row items-center gap-2">
        <Ionicons name="warning-outline" size={18} color="#F59E0B" />
        <Text className="font-orbitron-bold text-xs text-amber-500 uppercase tracking-wider">
          Active Dispute Resolution ({disputes.length})
        </Text>
      </View>

      {disputes.map((dispute) => (
        <View
          key={dispute.id}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg p-3 flex-row items-center justify-between"
        >
          <View className="flex-1 pr-2">
            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white uppercase">
              {dispute.type === 'UNDO' ? 'Event Removal Request' : 'Event Update Request'}
            </Text>
            <Text className="font-inter text-[10px] text-slate-400">
              Votes: {dispute.votes?.length || 0} cast
            </Text>
          </View>

          <View className="flex-row gap-1.5">
            <TouchableOpacity
              onPress={() => {
                setActiveDisputeTarget(dispute);
                setVoteAction('APPROVE');
              }}
              className="px-2.5 py-1 bg-emerald-500 rounded-md"
            >
              <Text className="font-orbitron-bold text-[10px] text-white">Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setActiveDisputeTarget(dispute);
                setVoteAction('REJECT');
              }}
              className="px-2.5 py-1 bg-red-500 rounded-md"
            >
              <Text className="font-orbitron-bold text-[10px] text-white">Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {activeDisputeTarget && voteAction && (
        <ConfirmationModal
          isOpen={!!activeDisputeTarget}
          onClose={() => setActiveDisputeTarget(null)}
          title={`${voteAction === 'APPROVE' ? 'Approve' : 'Reject'} Dispute?`}
          description={`Are you sure you want to ${voteAction.toLowerCase()} this event consensus dispute?`}
          confirmText={`${voteAction} Dispute`}
          cancelText="Cancel"
          onConfirm={handleCastVote}
          variant={voteAction === 'REJECT' ? 'danger' : 'primary'}
        />
      )}
    </View>
  );
}
