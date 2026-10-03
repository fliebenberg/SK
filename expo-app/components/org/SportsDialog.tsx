import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Organization, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { useSocketQuery } from '../../hooks/useSocketQuery';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';


/**
 * Which sports the org plays. Saves the set alone (`UPDATE_ORG` with `supportedSportIds`).
 *
 * Removing a sport deactivates the org's teams in it — the server does that in the same write — so
 * when any removed sport still has active teams, Save first shows which teams, and saving again
 * confirms. The old screen did the same with two extra modals.
 */
export function SportsDialog({ org, visible, onClose }: { org: Organization; visible: boolean; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const { data: sports } = useSocketQuery<any[]>('sports', {}, { enabled: visible });
  const { data: teams } = useSocketQuery<any[]>('teams', { orgId: org.id }, { enabled: visible });
  const [selected, setSelected] = useState<string[]>(org.supportedSportIds || []);
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelected(org.supportedSportIds || []);
      setSearch('');
      setConfirming(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const original = org.supportedSportIds || [];
  const isDirty = [...selected].sort().join() !== [...original].sort().join();

  const affected = useMemo(() => {
    const removed = original.filter(id => !selected.includes(id));
    return removed
      .map(id => ({
        name: (sports || []).find(s => s.id === id)?.name || 'A sport',
        teams: (teams || []).filter(t => t.sportId === id && t.isActive),
      }))
      .filter(item => item.teams.length > 0);
  }, [original, selected, sports, teams]);

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const save = () => {
    if (affected.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setIsSaving(true);
    sendAction(SocketAction.UPDATE_ORG, { id: org.id, data: { supportedSportIds: selected } }).then(result => {
      setIsSaving(false);
      if (result.ok) onClose();
    });
  };

  const shown = (sports || []).filter(s => s.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <EditDialog
      visible={visible}
      title="Edit sports"
      onClose={onClose}
      onSave={save}
      saveLabel={confirming ? 'Remove and deactivate' : 'Save'}
      saveDisabled={!isDirty || !sports}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className={`flex-row items-center gap-2 ${TEXT_INPUT}`}>
        <Ionicons name="search" size={16} color={themeColor(isDark, 'ink-muted')} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search sports"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Search sports"
          className="flex-1 font-inter text-base text-ink outline-none"
        />
      </View>

      <View className="gap-1.5">
        {shown.map(sport => {
          const on = selected.includes(sport.id);
          return (
            <TouchableOpacity
              key={sport.id}
              onPress={() => toggle(sport.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${
                on ? 'border-primary-line bg-primary-soft' : 'border-line'
              }`}
            >
              <Text className="font-inter-semibold text-sm text-ink">{sport.name}</Text>
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={20}
                color={on ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')}
              />
            </TouchableOpacity>
          );
        })}
        {sports && shown.length === 0 ? (
          <Text className="font-inter text-sm text-ink-muted">No sport matches "{search.trim()}".</Text>
        ) : null}
      </View>

      {confirming ? (
        <View className="rounded-xl border border-danger-line bg-danger-soft p-3 gap-1.5">
          <Text className="font-inter-bold text-sm text-danger-ink">These teams will be deactivated</Text>
          {affected.map(item => (
            <View key={item.name}>
              <Text className="font-inter-semibold text-xs text-danger-ink">{item.name}</Text>
              {item.teams.map((t: any) => (
                <Text key={t.id} className="font-inter text-xs text-danger-ink pl-3">• {t.name}</Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </EditDialog>
  );
}
