import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AgeGroupAdminView } from '@sk/shared';
import { apiService } from '../../../services/api';
import { useActiveTheme } from '../../../store/settingsStore';
import { GlassCard } from '../../GlassCard';
import { Button } from '../../Button';
import CustomSelect from '../../CustomSelect';
import { ConfirmationModal } from '../../ConfirmationModal';
import { EmptyHint, RowActions, SectionLabel } from './editorPrimitives';

/**
 * The Age Groups tab: the sport's official list, and the custom entries users have added to it.
 *
 * Unlike the other tabs this does not ride the sport's Save. Age groups are their own table, with
 * teams, divisions and leagues pointing into it, so every change here — add, rename, reorder,
 * promote, merge, delete — is written as it is made, and the list re-renders from the server's
 * answer. There is nothing for the floating save bar to hold.
 *
 * **Official** entries are what every picker offers first, in this order. **Custom** entries are
 * what users typed under "Other…"; reviewing them is the point of the second section. Each shows
 * who added it and what uses it, which is what choosing between the three actions turns on:
 * *promote* it when it deserves a place on the official list, *merge* it into the official entry
 * it duplicates (every team, division and league moves across), or *delete* it once nothing uses it.
 */

interface SportAgeGroupsTabProps {
  sportId: string;
  token: string;
  ageGroups: AgeGroupAdminView[];
  onChange: (ageGroups: AgeGroupAdminView[]) => void;
}

const usageCount = (group: AgeGroupAdminView) => group.teamCount + group.divisionCount + group.leagueCount;

function usageText(group: AgeGroupAdminView): string {
  const parts = [
    group.teamCount ? `${group.teamCount} team${group.teamCount === 1 ? '' : 's'}` : '',
    group.divisionCount ? `${group.divisionCount} division${group.divisionCount === 1 ? '' : 's'}` : '',
    group.leagueCount ? `${group.leagueCount} league${group.leagueCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.length ? `Used by ${parts.join(', ')}` : 'Not used yet';
}

const inputClass =
  'bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-white/5 px-3 py-2.5 rounded-xl font-inter text-sm text-slate-800 dark:text-white';

export function SportAgeGroupsTab({ sportId, token, ageGroups, onChange }: SportAgeGroupsTabProps) {
  const isDark = useActiveTheme() === 'dark';
  const [isBusy, setIsBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [mergeFrom, setMergeFrom] = useState<AgeGroupAdminView | null>(null);
  const [mergeIntoId, setMergeIntoId] = useState('');
  const [deleting, setDeleting] = useState<AgeGroupAdminView | null>(null);

  const official = useMemo(() => ageGroups.filter(g => g.isOfficial), [ageGroups]);
  const custom = useMemo(() => ageGroups.filter(g => !g.isOfficial), [ageGroups]);

  /** Runs one write and adopts the list it answers with. Errors are toasted by `apiFetch`. */
  const run = async (write: () => Promise<AgeGroupAdminView[]>): Promise<boolean> => {
    setIsBusy(true);
    try {
      onChange(await write());
      return true;
    } catch {
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await run(() => apiService.addAdminAgeGroup(token, sportId, name))) setNewName('');
  };

  const handleRename = async (group: AgeGroupAdminView) => {
    const name = editingName.trim();
    if (!name || name === group.name) {
      setEditingId(null);
      return;
    }
    if (await run(() => apiService.updateAdminAgeGroup(token, group.id, { name }))) setEditingId(null);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= official.length) return;
    const ids = official.map(g => g.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => apiService.reorderAdminAgeGroups(token, sportId, ids));
  };

  /** Deleting something in use is not possible, so the delete control offers the merge instead. */
  const requestDelete = (group: AgeGroupAdminView) => {
    if (usageCount(group) > 0) openMerge(group);
    else setDeleting(group);
  };

  const openMerge = (group: AgeGroupAdminView) => {
    setMergeFrom(group);
    setMergeIntoId('');
  };

  const handleMerge = async () => {
    if (!mergeFrom || !mergeIntoId) return;
    const ok = await run(async () => (await apiService.mergeAdminAgeGroup(token, mergeFrom.id, mergeIntoId)).ageGroups);
    if (ok) setMergeFrom(null);
  };

  const mergeTargets = mergeFrom ? ageGroups.filter(g => g.id !== mergeFrom.id) : [];
  const mergeInto = ageGroups.find(g => g.id === mergeIntoId);

  const renderName = (group: AgeGroupAdminView) =>
    editingId === group.id ? (
      <View className="flex-row items-center gap-2">
        <TextInput
          value={editingName}
          onChangeText={setEditingName}
          onSubmitEditing={() => handleRename(group)}
          autoFocus
          maxLength={40}
          className={`flex-1 ${inputClass}`}
        />
        <TouchableOpacity onPress={() => handleRename(group)} disabled={isBusy} className="p-2 bg-brand-orange rounded-lg">
          <Ionicons name="checkmark" size={14} color="white" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setEditingId(null)} className="p-2 bg-slate-100 dark:bg-white/5 rounded-lg">
          <Ionicons name="close" size={14} color="#94A3B8" />
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity
        onPress={() => {
          setEditingId(group.id);
          setEditingName(group.name);
        }}
        className="flex-row items-center gap-1.5"
      >
        <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">{group.name}</Text>
        <Ionicons name="pencil" size={11} color="#94A3B8" />
      </TouchableOpacity>
    );

  return (
    <View>
      {/* OFFICIAL */}
      <View className="flex-row items-center justify-between mb-3">
        <SectionLabel>Official Age Groups</SectionLabel>
        {isBusy && <ActivityIndicator size="small" color="#FF3E00" />}
      </View>
      <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        What every team, division and league of this sport chooses from, offered in this order.
        Changes on this tab save as you make them. Renaming one renames it everywhere it is used.
      </Text>

      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
        {official.length === 0 ? (
          <EmptyHint icon="people-outline" text="No official age groups. Add one below." />
        ) : (
          <View className="space-y-3">
            {official.map((group, index) => (
              <View key={group.id} className="flex-row items-center gap-2.5">
                <View className="flex-1">
                  {renderName(group)}
                  <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{usageText(group)}</Text>
                </View>
                <RowActions
                  canMoveUp={index > 0 && !isBusy}
                  canMoveDown={index < official.length - 1 && !isBusy}
                  onMoveUp={() => move(index, -1)}
                  onMoveDown={() => move(index, 1)}
                  onDelete={() => requestDelete(group)}
                />
              </View>
            ))}
          </View>
        )}

        <View className="flex-row items-center gap-2 mt-4 pt-4 border-t border-slate-200/60 dark:border-white/5">
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={handleAdd}
            placeholder="Add an official age group, e.g. U8"
            placeholderTextColor="#94A3B8"
            maxLength={40}
            className={`flex-1 ${inputClass}`}
          />
          <TouchableOpacity
            onPress={handleAdd}
            disabled={!newName.trim() || isBusy}
            className={`px-3.5 py-2.5 rounded-xl bg-brand-orange flex-row items-center gap-1 ${!newName.trim() ? 'opacity-50' : ''}`}
          >
            <Ionicons name="add" size={14} color="white" />
            <Text className="font-inter-bold text-xs text-white">Add</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>

      {/* CUSTOM */}
      <SectionLabel className="mb-3">Custom Age Groups</SectionLabel>
      <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
        Added by users under "Other…" when the official list had nothing that fitted. Everyone who
        plays this sport can pick them. Promote one that belongs on the official list, or merge one
        into the official age group it duplicates — everything using it moves across.
      </Text>

      <GlassCard className="border border-slate-200 dark:border-white/5 p-4 rounded-xl mb-6">
        {custom.length === 0 ? (
          <EmptyHint icon="checkmark-circle-outline" text="No custom age groups — nobody has needed one yet." />
        ) : (
          <View className="space-y-4">
            {custom.map(group => (
              <View key={group.id}>
                {renderName(group)}
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {group.createdOrgName ? `Added by ${group.createdOrgName} · ` : ''}
                  {usageText(group)}
                </Text>
                <View className="flex-row flex-wrap gap-2 mt-2">
                  <Button
                    title="Promote"
                    variant="secondary"
                    disabled={isBusy}
                    onPress={() => run(() => apiService.updateAdminAgeGroup(token, group.id, { isOfficial: true }))}
                    className="px-3 py-1.5 rounded-lg"
                  />
                  <Button
                    title="Merge into…"
                    variant="secondary"
                    disabled={isBusy}
                    onPress={() => openMerge(group)}
                    className="px-3 py-1.5 rounded-lg"
                  />
                  {usageCount(group) === 0 && (
                    <Button
                      title="Delete"
                      variant="secondary"
                      disabled={isBusy}
                      onPress={() => setDeleting(group)}
                      className="px-3 py-1.5 rounded-lg"
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </GlassCard>

      {/* MERGE */}
      <Modal transparent visible={!!mergeFrom} animationType="fade" onRequestClose={() => setMergeFrom(null)}>
        <View className="flex-1 bg-slate-950/75 items-center justify-center p-6">
          <GlassCard
            className="w-full max-w-sm border border-slate-200 dark:border-white/10 p-6 space-y-4 shadow-lg"
            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
          >
            <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white uppercase tracking-wider">
              Merge "{mergeFrom?.name}"
            </Text>
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {mergeFrom && usageCount(mergeFrom) > 0
                ? `${usageText(mergeFrom)}. Merging moves all of them to the age group you choose, then removes "${mergeFrom.name}".`
                : `Nothing uses "${mergeFrom?.name}" yet. Merging removes it, as deleting would.`}
            </Text>
            <CustomSelect
              value={mergeIntoId}
              onChange={setMergeIntoId}
              placeholder="Merge into…"
              options={mergeTargets.map(g => ({ value: g.id, label: g.isOfficial ? g.name : `${g.name} (custom)` }))}
            />
            {!!mergeInto && !!mergeFrom && (
              <Text className="font-inter text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                "{mergeFrom.name}" will be gone and everything that used it will show "{mergeInto.name}".
                This cannot be undone.
              </Text>
            )}
            <View className="flex-row gap-3 pt-2">
              <Button title="Cancel" variant="secondary" onPress={() => setMergeFrom(null)} className="flex-1 py-2.5 rounded-lg" />
              <Button
                title={isBusy ? 'Merging…' : 'Merge'}
                onPress={handleMerge}
                disabled={!mergeIntoId || isBusy}
                className="flex-1 py-2.5 rounded-lg"
              />
            </View>
          </GlassCard>
        </View>
      </Modal>

      <ConfirmationModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete age group"
        description={`Delete "${deleting?.name}"? Nothing uses it, so nothing else changes.`}
        confirmText="Delete"
        isProcessing={isBusy}
        onConfirm={async () => {
          if (!deleting) return;
          if (await run(() => apiService.deleteAdminAgeGroup(token, deleting.id))) setDeleting(null);
        }}
      />
    </View>
  );
}
