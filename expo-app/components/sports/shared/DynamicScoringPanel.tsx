import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Game, findEventSection } from '@sk/shared';
import { useSharedDynamicScoring, ScoringSection } from './DynamicScoringContext';
import { ScoringActionButton } from './ScoringActionButton';
import { wsService } from '../../../services/websocket';
import { Button } from '../../Button';

interface DynamicScoringPanelProps {
  section: ScoringSection;
  role?: string;
}

export function DynamicScoringPanel({ section, role }: DynamicScoringPanelProps) {
  const { game, homeTeam, awayTeam, sport, templates, scoringState, startDynamicFlow, updateFinalScore } = useSharedDynamicScoring();
  const [isFinalScoreOpen, setIsFinalScoreOpen] = useState(false);
  const [finalScores, setFinalScores] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  const homeParticipant = game.participants?.[0];
  const awayParticipant = game.participants?.[1];

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
    const isInactiveSide = scoringState.status !== 'IDLE' && scoringState.side !== side;
    const disabled = isScoringDisabled || isInactiveSide;

    return (
      <View
        className={`flex-1 p-1 rounded-xl border ${
          isHome
            ? 'bg-info-soft border-info-line'
            : 'bg-danger-soft border-danger-line'
        } ${isInactiveSide ? 'opacity-40' : ''}`}
      >
        {/* 2-COLUMN COMPACT GRID */}
        <View className="flex-row flex-wrap gap-1 justify-between">
          {relevantTemplates.map((template) => (
            <View key={template.id} className="w-[48.5%] mb-0.5">
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

  // The heading and whether this panel offers the final-score override are the sport's to
  // decide — both used to be hardcoded against the four sections that no longer exist.
  const sectionDefinition = findEventSection(sport, section);
  const sectionTitle = sectionDefinition?.name || section;
  const affectsScore = !!sectionDefinition?.affectsScore;

  return (
    <View className="bg-card border border-line rounded-2xl p-1.5 pt-2.5 shadow-sm mb-1.5 relative">
      {/* COMPACT SECTION OVERLAY BADGE */}
      <View className="absolute -top-2.5 left-4 bg-sunken px-2 py-0.5 rounded-md border border-line-strong z-10">
        <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest">
          {sectionTitle}
        </Text>
      </View>

      {/* FINAL SCORE OVERRIDE BANNER */}
      {affectsScore && isFinished && (
        <View className="mb-2 mt-1">
          <TouchableOpacity
            onPress={handleOpenFinalScore}
            activeOpacity={0.8}
            className="w-full py-2 px-3 bg-primary-soft border border-primary-line rounded-xl items-center justify-center"
          >
            <Text className="font-orbitron-bold text-[11px] text-primary-ink uppercase tracking-wider">
              ENTER FINAL SCORE OVERRIDE
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SIDE-BY-SIDE SIDE PANELS */}
      <View className="flex-row gap-1.5 mt-0.5">
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
          <View className="flex-1 bg-overlay/60 justify-center items-center px-6">
            <View className="bg-card rounded-2xl p-6 border border-line w-full max-w-md shadow-lg gap-4">
              <Text className="font-orbitron-bold text-base text-ink uppercase tracking-wider text-center">
                Final Score Override
              </Text>

              <Text className="font-inter text-xs text-warning-ink text-center uppercase tracking-tight font-bold">
                Warning: Manually setting the final score will override the live scoreboard.
              </Text>

              <View className="flex-row gap-4 pt-2">
                {game.participants?.slice(0, 2).map((p, idx) => {
                  const name = idx === 0 ? homeTeam?.name || 'Home' : awayTeam?.name || 'Away';
                  return (
                    <View key={p.id} className="flex-1 p-3 bg-sunken rounded-xl border border-line items-center">
                      <Text className="font-orbitron-bold text-xs text-ink-soft uppercase mb-2">
                        {name}
                      </Text>
                      <TextInput
                        keyboardType="numeric"
                        value={finalScores[p.id] || '0'}
                        onChangeText={(txt) => setFinalScores({ ...finalScores, [p.id]: txt })}
                        className="w-full bg-card border border-line-strong rounded-lg h-11 text-center font-orbitron-bold text-lg text-ink"
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
