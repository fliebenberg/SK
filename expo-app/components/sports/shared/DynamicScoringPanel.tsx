import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Game } from '@sk/types';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { ScoringActionButton } from './ScoringActionButton';
import { wsService } from '../../../services/websocket';
import { Button } from '../../Button';

interface DynamicScoringPanelProps {
  section: 'Scoring' | 'Game Events' | 'General Play';
  role?: string;
}

export function DynamicScoringPanel({ section, role }: DynamicScoringPanelProps) {
  const { game, templates, scoringState, startDynamicFlow, updateFinalScore } = useSharedDynamicScoring();
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);
  const [isFinalScoreOpen, setIsFinalScoreOpen] = useState(false);
  const [finalScores, setFinalScores] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  const homeParticipant = game.participants?.[0];
  const awayParticipant = game.participants?.[1];

  useEffect(() => {
    if (homeParticipant?.teamId) {
      wsService.emit('get_data', { type: 'team', id: homeParticipant.teamId }, (t: any) => {
        if (t) setHomeTeam(t);
      });
    }
    if (awayParticipant?.teamId) {
      wsService.emit('get_data', { type: 'team', id: awayParticipant.teamId }, (t: any) => {
        if (t) setAwayTeam(t);
      });
    }
  }, [homeParticipant?.teamId, awayParticipant?.teamId]);

  const isFinished = game.status === 'Finished';
  const isScheduled = game.status === 'Scheduled';
  const isScoringDisabled = isScheduled;

  const relevantTemplates = templates.filter(
    (t) => t.section === section && t.id !== 'conversion'
  );

  if (relevantTemplates.length === 0) return null;

  const handleOpenFinalScore = () => {
    const initial: { [key: string]: string } = {};
    game.participants?.forEach((p) => {
      initial[p.id] = (game.liveState?.scores?.[p.id] || 0).toString();
    });
    setFinalScores(initial);
    setIsFinalScoreOpen(true);
  };

  const handleSaveFinalScore = async () => {
    if (!game.participants) return;
    setIsSaving(true);
    try {
      const scores: { [key: string]: number } = {};
      game.participants.forEach((p) => {
        scores[p.id] = parseInt(finalScores[p.id] || '0', 10);
      });
      await updateFinalScore(scores);
      setIsFinalScoreOpen(false);
    } catch (e) {
      console.error('Failed to save final score:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const renderSideButtons = (side: 'home' | 'away') => {
    const isHome = side === 'home';
    const sideVariant = isHome ? 'blue' : 'red';
    const teamName = isHome ? homeTeam?.name || 'Home' : awayTeam?.name || 'Away';
    const isInactiveSide = scoringState.status !== 'IDLE' && scoringState.side !== side;
    const disabled = isScoringDisabled || isInactiveSide;

    return (
      <View
        className={`flex-1 p-2 rounded-xl border transition-all ${
          isHome
            ? 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20'
            : 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20'
        } ${isInactiveSide ? 'opacity-40' : ''}`}
      >
        {/* TEAM HEADER BADGE */}
        <View className="flex-row items-center justify-center gap-1.5 mb-2 pb-1.5 border-b border-slate-200/50 dark:border-white/10">
          <View className={`w-2 h-2 rounded-full ${isHome ? 'bg-blue-500' : 'bg-rose-500'}`} />
          <Text
            className={`font-orbitron-bold text-[11px] uppercase tracking-wider text-center ${
              isHome ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
            }`}
            numberOfLines={1}
          >
            {teamName}
          </Text>
        </View>

        {/* 2-COLUMN COMPACT GRID */}
        <View className="flex-row flex-wrap gap-1.5 justify-between">
          {relevantTemplates.map((template) => (
            <View key={template.id} className="w-[48%] mb-1">
              <ScoringActionButton
                label={template.name}
                mobileLabel={template.mobileLabel}
                variant={sideVariant}
                onClick={() => startDynamicFlow(template.id, side)}
                disabled={disabled}
              />
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-3 shadow-sm mb-3">
      {/* SECTION TITLE & FINAL SCORE OVERRIDE BANNER */}
      {section === 'Scoring' && isFinished && (
        <View className="mb-3">
          <TouchableOpacity
            onPress={handleOpenFinalScore}
            activeOpacity={0.8}
            className="w-full py-2.5 px-4 bg-brand-orange/10 border border-brand-orange/30 rounded-xl items-center justify-center"
          >
            <Text className="font-orbitron-bold text-xs text-brand-orange uppercase tracking-wider">
              ENTER FINAL SCORE OVERRIDE
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SIDE-BY-SIDE SIDE PANELS */}
      <View className="flex-row gap-2">
        {renderSideButtons('home')}
        {renderSideButtons('away')}
      </View>

      {/* FINAL SCORE CUSTOM OVERLAY MODAL */}
      {isFinalScoreOpen && (
        <Modal
          visible={isFinalScoreOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsFinalScoreOpen(false)}
        >
          <View className="flex-1 bg-black/60 justify-center items-center px-6">
            <View className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-white/10 w-full max-w-md shadow-2xl space-y-4">
              <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider text-center">
                Final Score Override
              </Text>

              <Text className="font-inter text-xs text-amber-600 dark:text-amber-400 text-center uppercase tracking-tight font-bold">
                Warning: Manually setting the final score will override the live scoreboard.
              </Text>

              <View className="flex-row gap-4 pt-2">
                {game.participants?.slice(0, 2).map((p, idx) => {
                  const name = idx === 0 ? homeTeam?.name || 'Home' : awayTeam?.name || 'Away';
                  return (
                    <View key={p.id} className="flex-1 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-white/10 items-center">
                      <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300 uppercase mb-2">
                        {name}
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        value={finalScores[p.id] || '0'}
                        onChangeText={(txt) => setFinalScores({ ...finalScores, [p.id]: txt })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/20 rounded-lg h-11 text-center font-orbitron-bold text-lg text-slate-900 dark:text-white"
                      />
                    </View>
                  );
                })}
              </View>

              <View className="flex-row gap-3 pt-4">
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setIsFinalScoreOpen(false)}
                  className="flex-1 py-2.5 rounded-xl"
                />
                <Button
                  title={isSaving ? 'Saving...' : 'Apply Final Score'}
                  onPress={handleSaveFinalScore}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl"
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
