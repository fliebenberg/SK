import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { GAME_OFFICIAL_LABELS, GameOfficialEntry, GameOfficialRole, OrgProfile, SocketAction } from '@sk/shared';
import { ReadCard, ReadCardEmpty } from '../ReadCard';
import { ReadFailure } from '../ReadFailure';
import { EditDialog, ReadRow } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { SegmentedControl } from '../SegmentedControl';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { sendAction } from '../../services/actions';
import { useSocketQuery } from '../../hooks/useSocketQuery';

const ROLE_OPTIONS: { key: GameOfficialRole; label: string }[] = [
  { key: 'SCORER', label: GAME_OFFICIAL_LABELS.SCORER },
  { key: 'REFEREE', label: GAME_OFFICIAL_LABELS.REFEREE },
  { key: 'TIMEKEEPER', label: GAME_OFFICIAL_LABELS.TIMEKEEPER },
];

const ROLE_HELP = 'A scorer and a match official may score the game. A timekeeper keeps its time — the clock, sin-bins and substitutions — and nothing else.';

/**
 * Who officiates this game (`PERM-7`, docs/permissions.md §2.2): its appointed scorers, match
 * officials and timekeepers. Shown to whoever may edit the fixture, who appoints them from the host's
 * people; nobody else sees the card. Appointing is what lets a person with no other role there score
 * or keep time.
 */
export function GameOfficialsCard({ gameId, hostOrgId }: { gameId: string; hostOrgId: string }) {
  const { data, isLoading, error: readError, refetch: load } = useSocketQuery<GameOfficialEntry[]>('game_officials', { gameId }, { suppressToast: true });
  const officials = Array.isArray(data) ? data : [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [person, setPerson] = useState<OrgProfile | null>(null);
  const [role, setRole] = useState<GameOfficialRole>('SCORER');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => { setName(''); setPerson(null); setRole('SCORER'); setError(null); setAdding(true); };

  const save = async () => {
    if (!person) return;
    setIsSaving(true);
    const result = await sendAction(SocketAction.ADD_GAME_OFFICIAL, { gameId, orgProfileId: person.id, role }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'They were not appointed.');
    setAdding(false);
    load();
  };

  const remove = async (official: GameOfficialEntry) => {
    const result = await sendAction(SocketAction.REMOVE_GAME_OFFICIAL, { id: official.id });
    if (result.ok) load();
  };

  return (
    <ReadCard label="Officials" onEdit={officials.length ? open : undefined} editLabel="Add" editIcon="add">
      {readError ? <ReadFailure what="Officials" reason={readError} onRetry={load} stale={officials.length > 0} /> : null}
      {officials.length ? (
        <View>
          {officials.map((o, i) => (
            <View key={o.id}>
              {i > 0 ? <View className="h-px bg-line" /> : null}
              <ReadRow
                label={o.name}
                sub={GAME_OFFICIAL_LABELS[o.role] || o.role}
                right={
                  <TouchableOpacity onPress={() => remove(o)} accessibilityRole="button" accessibilityLabel={`Remove ${o.name}`}>
                    <Text className="font-inter-bold text-sm text-danger-ink">Remove</Text>
                  </TouchableOpacity>
                }
              />
            </View>
          ))}
        </View>
      ) : readError ? null : isLoading ? (
        <ReadCardEmpty text="Loading…" />
      ) : (
        <ReadCardEmpty text="Nobody appointed. Its teams' coaches and scorers can score it." action="Appoint someone" onPress={open} />
      )}

      <EditDialog
        visible={adding}
        title="Appoint an official"
        onClose={() => setAdding(false)}
        onSave={save}
        saveLabel="Appoint"
        saveDisabled={!person}
        isSaving={isSaving}
        isDirty={!!person}
      >
        <View className="gap-1.5">
          <FieldLabel label="Person" />
          <PersonnelAutocomplete
            orgId={hostOrgId}
            value={name}
            placeholder="Search the organisation"
            onChangeText={text => { setName(text); setPerson(null); }}
            onSelectPerson={p => { setPerson(p); if (p) setName(p.name); }}
          />
        </View>
        <View className="gap-1.5">
          <FieldLabel label="As" help={ROLE_HELP} />
          <SegmentedControl options={ROLE_OPTIONS} value={role} onChange={setRole} isCompact={false} />
        </View>
        {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
      </EditDialog>
    </ReadCard>
  );
}
