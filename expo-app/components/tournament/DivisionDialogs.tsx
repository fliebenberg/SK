import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  EventFormat,
  Facility,
  Site,
  SocketAction,
  Sport,
  TournamentDivision,
  TournamentEntrant,
  TournamentOrganizer,
  TournamentStage,
  divisionAutoName,
  findTakenDivisionName,
  isAutomaticDivisionName,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { AgeGroupPicker } from '../AgeGroupPicker';
import { OrganizerPicker } from '../OrganizerPicker';
import { SegmentedControl } from '../SegmentedControl';
import CustomSelect from '../CustomSelect';
import { TEXT_INPUT } from '../formStyles';
import { FacilityPicker } from './FacilityPicker';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The division page's dialogs (`FIX-27`, docs/events.md §8): its details, how it is played, and
 * adding a division — which the tournament page opens too.
 */

/* ---------------------------------------------------------------------------------------------
 * How it's played
 * ------------------------------------------------------------------------------------------- */

/** As much of a stage as says how it is played — a stage, or a division's `stageShapes`. */
type StageShape = Pick<TournamentStage, 'name' | 'format' | 'sequence' | 'settings'>;

/** What the format picker can set. `Festival` is "set fixtures by hand": no draw is made. */
export interface FormatSetting {
  format: EventFormat;
  legs: number;
  thirdPlacePlayoff: boolean;
}

export const DEFAULT_FORMAT: FormatSetting = { format: 'RoundRobin', legs: 1, thirdPlacePlayoff: false };

const FORMAT_CHOICES: Array<{ format: EventFormat; label: string; description: string }> = [
  { format: 'RoundRobin', label: 'Round robin', description: 'Everyone plays everyone. Every team gets the same number of games.' },
  { format: 'PoolsKnockout', label: 'Pools & knockout', description: 'Round robin in pools, then the top teams play a knockout.' },
  { format: 'Knockout', label: 'Knockout', description: "Lose and you're out. The fewest games." },
  { format: 'Festival', label: 'Set fixtures by hand', description: 'No draw — add each fixture yourself. For a day where each team plays arranged games.' },
];

/**
 * How a division is played, read off its stages — the reverse of `stagePlanForFormat`. A shape the
 * picker did not make (stages added by hand before `FIX-27`) reads as `null`, and is shown by its
 * stages' names instead.
 */
export function formatOfStages(stages: StageShape[]): FormatSetting | null {
  const ordered = [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const legs = ordered.find(s => s.format === 'RoundRobin')?.settings?.legs || 1;
  const thirdPlacePlayoff = !!ordered.find(s => s.format === 'Knockout')?.settings?.thirdPlacePlayoff;
  const shape = ordered.map(s => s.format).join(',');
  const format: EventFormat | null =
    shape === 'RoundRobin' ? 'RoundRobin'
      : shape === 'Knockout' ? 'Knockout'
        : shape === 'RoundRobin,Knockout' ? 'PoolsKnockout'
          : shape === 'Festival' ? 'Festival'
            : null;
  return format ? { format, legs, thirdPlacePlayoff } : null;
}

/** "Round robin, twice" — what the banner and the card say. */
export function formatLabel(setting: FormatSetting | null, stages: StageShape[] = []): string {
  if (!setting) return stages.length ? [...stages].sort((a, b) => a.sequence - b.sequence).map(s => s.name).join(' then ') : 'Not set';
  const base = FORMAT_CHOICES.find(c => c.format === setting.format)?.label || setting.format;
  if (setting.format === 'RoundRobin' && setting.legs > 1) return `${base}, twice`;
  return base;
}

/** One line on what the format means for this many teams — the card's second line. */
export function formatDetail(setting: FormatSetting | null, teams: number): string {
  if (!setting) return '';
  if (setting.format === 'Festival') return 'No draw — fixtures are added by hand';
  if (teams < 2) return 'The fixtures follow once there are teams';
  if (setting.format === 'RoundRobin') {
    const fixtures = (teams * (teams - 1)) / 2 * setting.legs;
    const rounds = (teams % 2 ? teams : teams - 1) * setting.legs;
    return `Everyone plays everyone${setting.legs > 1 ? ' twice' : ' once'} · ${fixtures} fixtures in ${rounds} rounds`;
  }
  if (setting.format === 'Knockout') return `${teams - 1 + (setting.thirdPlacePlayoff ? 1 : 0)} fixtures${setting.thirdPlacePlayoff ? ', with a game for third place' : ''}`;
  return `Pools first, then a knockout${setting.thirdPlacePlayoff ? ' with a game for third place' : ''}`;
}

/** What a draw will make, for "The draw makes …" — "the round robin's 15 fixtures". */
export function drawSummary(setting: FormatSetting | null, teams: number): string {
  if (!setting || teams < 2) return 'the fixtures';
  if (setting.format === 'RoundRobin') return `the round robin's ${(teams * (teams - 1)) / 2 * setting.legs} fixtures`;
  if (setting.format === 'Knockout') return `a knockout of ${teams - 1 + (setting.thirdPlacePlayoff ? 1 : 0)} fixtures`;
  if (setting.format === 'PoolsKnockout') return "the pools' fixtures";
  return 'the fixtures';
}

/** The four choices as a list, each with its settings under it when chosen. */
function FormatPicker({ value, onChange, disabled }: { value: FormatSetting; onChange: (next: FormatSetting) => void; disabled?: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className="gap-2">
      {FORMAT_CHOICES.map(choice => {
        const on = value.format === choice.format;
        return (
          <TouchableOpacity
            key={choice.format}
            onPress={() => onChange({ ...value, format: choice.format })}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            className={`rounded-xl border px-3 py-2.5 flex-row gap-3 ${on ? 'border-line-selected bg-raised' : 'border-line'} ${disabled ? 'opacity-60' : ''}`}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={themeColor(isDark, on ? 'ink' : 'ink-faint')} />
            <View className="flex-1 gap-0.5">
              <Text className="font-inter-bold text-sm text-ink">{choice.label}</Text>
              <Text className="font-inter text-xs text-ink-muted">{choice.description}</Text>
              {on && choice.format === 'RoundRobin' ? (
                <View className="mt-2 self-start">
                  <SegmentedControl
                    fit
                    isCompact
                    value={value.legs > 1 ? 'twice' : 'once'}
                    onChange={key => onChange({ ...value, legs: key === 'twice' ? 2 : 1 })}
                    options={[{ key: 'once', label: 'Once' }, { key: 'twice', label: 'Twice (home and away)' }]}
                  />
                </View>
              ) : null}
              {on && (choice.format === 'Knockout' || choice.format === 'PoolsKnockout') ? (
                <TouchableOpacity
                  onPress={() => onChange({ ...value, thirdPlacePlayoff: !value.thirdPlacePlayoff })}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: value.thirdPlacePlayoff }}
                  className="mt-2 flex-row items-center gap-2 self-start"
                >
                  <Ionicons name={value.thirdPlacePlayoff ? 'checkbox' : 'square-outline'} size={18} color={themeColor(isDark, value.thirdPlacePlayoff ? 'ink' : 'ink-faint')} />
                  <Text className="font-inter text-[13px] text-ink-soft">A game for third place</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** A warning line inside a dialog, in the warning colours. */
function DialogWarning({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-xl bg-warning-soft border border-warning-line px-3 py-2">
      <Text className="font-inter text-[13px] text-warning-ink">{children}</Text>
    </View>
  );
}

/**
 * *How it's played*. Before the draw it simply sets the format; after the draw it warns that a
 * change redoes the draw; **once a game has started it is read-only** — the format is fixed and
 * fixtures change by hand (`FIX-27`; the server refuses the same).
 */
export function FormatDialog({ visible, divisionId, orgId, stages, fixtureCount, started, onClose, onAddFixture }: {
  visible: boolean;
  divisionId: string;
  orgId: string;
  stages: TournamentStage[];
  fixtureCount: number;
  started: boolean;
  onClose: () => void;
  onAddFixture: () => void;
}) {
  const current = formatOfStages(stages);
  const [draft, setDraft] = useState<FormatSetting>(current || DEFAULT_FORMAT);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) setDraft(formatOfStages(stages) || DEFAULT_FORMAT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const dirty = !current || draft.format !== current.format || draft.legs !== current.legs || draft.thirdPlacePlayoff !== current.thirdPlacePlayoff;

  if (started) {
    return (
      <EditDialog visible={visible} title="How it's played" onClose={onClose} doneLabel="Close">
        <View className="rounded-xl border border-line px-3 py-2.5 gap-0.5">
          <Text className="font-inter-bold text-sm text-ink">{formatLabel(current, stages)}</Text>
          <Text className="font-inter text-xs text-ink-muted">{fixtureCount} fixtures</Text>
        </View>
        <DialogWarning>Games have started, so the format is fixed and the draw cannot be redone. Fixtures can still be moved, added and deleted by hand.</DialogWarning>
        <TouchableOpacity onPress={onAddFixture} accessibilityRole="button" className="self-start">
          <Text className="font-inter-bold text-sm text-primary-ink">＋ Add a fixture</Text>
        </TouchableOpacity>
      </EditDialog>
    );
  }

  const save = async () => {
    setSaving(true);
    const result = await sendAction(SocketAction.SET_DIVISION_FORMAT, {
      divisionId,
      orgId,
      format: draft.format,
      settings: { legs: draft.legs, thirdPlacePlayoff: draft.thirdPlacePlayoff },
    });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title="How it's played"
      onClose={onClose}
      onSave={save}
      saveLabel={fixtureCount > 0 ? 'Save and redo the draw' : 'Save'}
      saveDisabled={!dirty}
      isSaving={saving}
      isDirty={dirty}
    >
      {fixtureCount > 0 ? (
        <DialogWarning>The draw has been made. Changing the format replaces its {fixtureCount === 1 ? 'fixture' : `${fixtureCount} fixtures`} — none has started yet. Once a game has started, the format cannot change.</DialogWarning>
      ) : null}
      <FormatPicker value={draft} onChange={setDraft} />
    </EditDialog>
  );
}

/* ---------------------------------------------------------------------------------------------
 * The division's details
 * ------------------------------------------------------------------------------------------- */

/**
 * Name, sport, age group, organisers and courts, from the banner's Edit.
 *
 * **Who may change what** follows the server (`tournamentGate.ts`): the name, sport and age group
 * are the tournament's and the sport's organisers' (`canEditRecord`), and read-only to a division
 * organiser; the organisers and the courts are anyone's who runs the division (`canEdit`).
 *
 * **The name can be left to the app** (U50, `FIX-27`): a name nobody typed follows the age group —
 * "U14", "Open" — and is lettered when the sport already has one ("U14 B"). Typing takes it over;
 * emptying the field hands it back.
 *
 * **Courts** are chips with **＋ after them**, which opens the facility picker in place. A court the
 * tournament does not use yet joins the tournament too — the server does it (`FIX-27`).
 */
export function DivisionDetailsDialog({
  visible, onClose, orgId, eventId, event, division, sports, siblings, entrants, fixtureCount,
  canEditRecord, canEdit, canChangeSport, organizers, onOrganizersChange, sites, facilities,
}: {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  event: Event;
  division: TournamentDivision;
  sports: Sport[];
  /** The tournament's other divisions. */
  siblings: TournamentDivision[];
  entrants: TournamentEntrant[];
  fixtureCount: number;
  canEditRecord: boolean;
  canEdit: boolean;
  /** Moving a division between sports is the tournament organisers' alone. */
  canChangeSport: boolean;
  organizers: TournamentOrganizer[];
  onOrganizersChange: (next: TournamentOrganizer[]) => void;
  sites: Site[];
  facilities: Facility[];
}) {
  const isDark = useActiveTheme() === 'dark';
  const sportName = (id?: string | null) => sports.find(s => s.id === id)?.name;
  const savedCustom = isAutomaticDivisionName(division.name, { sportName: sportName(division.sportId), ageGroup: division.ageGroup, eventName: event.name })
    ? null
    : division.name;

  const [customName, setCustomName] = useState<string | null>(savedCustom);
  const [sportId, setSportId] = useState(division.sportId || '');
  const [ageGroupId, setAgeGroupId] = useState<string | null>(division.ageGroupId || null);
  const [ageGroupName, setAgeGroupName] = useState(division.ageGroup || '');
  const [courtIds, setCourtIds] = useState<string[]>(division.facilityIds || []);
  const [pickingCourts, setPickingCourts] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seeded each time it opens, from the division as it is then.
  useEffect(() => {
    if (!visible) return;
    setCustomName(savedCustom);
    setSportId(division.sportId || '');
    setAgeGroupId(division.ageGroupId || null);
    setAgeGroupName(division.ageGroup || '');
    setCourtIds(division.facilityIds || []);
    setPickingCourts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const namesInSport = (id: string) => siblings.filter(d => (d.sportId || '') === id).map(d => d.name);
  // An automatic name follows the age group — but until the age group or sport changes it is the
  // name the division has now, which may be one given the old way ("Rugby U14").
  const unchanged = sportId === (division.sportId || '') && ageGroupId === (division.ageGroupId || null);
  const derivedName = unchanged ? division.name : divisionAutoName(ageGroupName || undefined, namesInSport(sportId), division.name);
  const name = customName?.trim() || derivedName;
  const nameClash = findTakenDivisionName(name, namesInSport(sportId));

  /* The sport is fixed once a team is entered or a fixture exists (`FIX-17`); a placeholder has no
     team and contradicts no sport. */
  const enteredTeams = entrants.filter(e => !!e.teamId).length;
  const sportFixed = enteredTeams > 0 || fixtureCount > 0;
  const sportChoices = sports.filter(s => (event.sportIds || []).includes(s.id) || s.id === division.sportId);
  const sportChanging = !!sportId && sportId !== (division.sportId || '');
  const lastOfSport = !!division.sportId && !siblings.some(d => d.sportId === division.sportId);

  // Entered teams the new age group would turn into overrides — said, not refused.
  const overrides = ageGroupId ? entrants.filter(e => !!e.teamId && e.status !== 'withdrawn' && e.teamAgeGroupId !== ageGroupId).length : 0;
  const ageChanging = ageGroupId !== (division.ageGroupId || null);

  const recordDirty = canEditRecord && (customName !== savedCustom || sportChanging || ageChanging);
  const courtsDirty = canEdit && [...courtIds].sort().join() !== [...(division.facilityIds || [])].sort().join();

  const save = async () => {
    setSaving(true);
    if (recordDirty) {
      const result = await sendAction(SocketAction.UPDATE_DIVISION, {
        id: division.id,
        orgId,
        data: { name, ...(sportId ? { sportId } : {}), ageGroupId },
      });
      if (!result.ok) { setSaving(false); return; }
    }
    if (courtsDirty) {
      const result = await sendAction(SocketAction.SET_DIVISION_FACILITIES, { divisionId: division.id, orgId, facilityIds: courtIds });
      if (!result.ok) { setSaving(false); return; }
    }
    setSaving(false);
    onClose();
  };

  const courtName = (id: string) => facilities.find(f => f.id === id)?.name || 'A court';
  // A sport may name its playing surface — "Court" — and the field takes the plural.
  const singular = sports.find(s => s.id === division.sportId)?.facilityTerm?.trim();
  const term = singular ? `${singular}s` : 'Facilities';

  return (
    <EditDialog
      visible={visible}
      title="Division details"
      onClose={onClose}
      onSave={canEditRecord || canEdit ? save : undefined}
      saveLabel={sportChanging && lastOfSport ? `Save and remove ${sportName(division.sportId) || 'the sport'}` : 'Save'}
      saveDisabled={(!recordDirty && !courtsDirty) || !name || !!nameClash}
      isSaving={saving}
      isDirty={recordDirty || courtsDirty}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" help="Leave it to fill itself in from the age group — U14, or Open with none — and it follows the age group if it changes. Or type your own, such as Girls' Cup; clear it to go back to the automatic name." />
        {canEditRecord ? (
          <>
            <TextInput
              value={customName ?? derivedName}
              onChangeText={setCustomName}
              placeholder={`${derivedName} (automatic)`}
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              accessibilityLabel="Division name"
              className={`${TEXT_INPUT} ${nameClash ? 'border-danger' : ''}`}
            />
            {nameClash ? (
              <Text accessibilityLiveRegion="polite" className="font-inter text-xs text-danger-ink">
                Another {sportName(sportId) || ''} division is already called "{nameClash}". Capitals do not count as a difference.
              </Text>
            ) : null}
          </>
        ) : (
          <Text className="font-inter text-sm text-ink">{division.name}</Text>
        )}
      </View>

      <View className="gap-1.5">
        <FieldLabel
          label="Sport"
          help={sportFixed
            ? `Fixed now that ${enteredTeams ? `${enteredTeams} ${enteredTeams === 1 ? 'team is' : 'teams are'} entered` : `it has ${fixtureCount} ${fixtureCount === 1 ? 'fixture' : 'fixtures'}`}. To play another sport, add a division for it.`
            : 'Can be changed until a team is entered or a fixture made.'}
        />
        {canEditRecord && canChangeSport && !sportFixed && sportChoices.length > 1 ? (
          /* A dropdown: a division plays one sport, chosen when it is added and rarely changed. */
          <CustomSelect
            value={sportId}
            onChange={id => { if (id !== sportId) { setAgeGroupId(null); setAgeGroupName(''); } setSportId(id); }}
            options={sportChoices.map(s => ({ value: s.id, label: s.name }))}
          />
        ) : (
          <Text className="font-inter text-sm text-ink">{sportName(division.sportId) || 'No sport set'}</Text>
        )}
        {sportChanging && lastOfSport ? (
          <DialogWarning>This is the last {sportName(division.sportId)} division, so moving it takes {sportName(division.sportId)} out of the tournament.</DialogWarning>
        ) : null}
      </View>

      <View className="gap-1.5">
        <FieldLabel label="Age group" optional help="From the sport's list. Teams of this age group are the ones offered for entry; others can still be added, as playing up or down." />
        {canEditRecord ? (
          <AgeGroupPicker
            sportId={sportId}
            ageGroups={sports.find(s => s.id === sportId)?.ageGroups}
            value={ageGroupId}
            onChange={(id, group) => { setAgeGroupId(id); setAgeGroupName(group?.name || ''); }}
            noneLabel="Any age"
            orgId={orgId}
            variant="dropdown"
          />
        ) : (
          <Text className="font-inter text-sm text-ink">{division.ageGroup || 'Any age'}</Text>
        )}
        {ageChanging && overrides > 0 ? (
          <DialogWarning>{overrides} entered {overrides === 1 ? 'team is' : 'teams are'} not {ageGroupName || 'that age group'}. They stay in the division, marked as playing up or down.</DialogWarning>
        ) : null}
      </View>

      {canEdit ? (
        <OrganizerPicker
          eventId={eventId}
          divisionId={division.id}
          hostOrgId={event.orgId}
          actingOrgId={orgId}
          organizers={organizers}
          onChange={onOrganizersChange}
          canManage={canEdit}
          label="Division organisers"
          help="People who run this division: its teams, how it is played, the draw and the fixtures. Added and removed at once, not with Save."
          optional
        />
      ) : null}

      <View className="gap-1.5">
        <FieldLabel label={term} optional help={`Where this division plays. None chosen means any of the tournament's. One the tournament does not use yet is added to the tournament as well, so it shows on the map.`} />
        <View className="flex-row flex-wrap items-center gap-1.5">
          {courtIds.map(id => (
            <View key={id} className="flex-row items-center gap-1.5 rounded-xl border border-line bg-sunken px-3 py-1.5">
              <Text className="font-inter-semibold text-[13px] text-ink">{courtName(id)}</Text>
              {canEdit ? (
                <TouchableOpacity onPress={() => setCourtIds(prev => prev.filter(c => c !== id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${courtName(id)}`}>
                  <Ionicons name="close" size={14} color={themeColor(isDark, 'ink-muted')} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {!courtIds.length ? <Text className="font-inter text-[13px] text-ink-muted">Any of the tournament's.</Text> : null}
          {canEdit ? (
            <TouchableOpacity
              onPress={() => setPickingCourts(p => !p)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${term.toLowerCase()}`}
              className="rounded-xl border border-dashed border-line-strong px-3 py-1.5"
            >
              <Text className="font-inter-bold text-[13px] text-primary-ink">{pickingCourts ? 'Done' : '＋'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {pickingCourts ? (
          <View className="rounded-xl border border-line p-3">
            <FacilityPicker sites={sites} facilities={facilities} value={courtIds} onChange={setCourtIds} baseSiteId={event.siteId || undefined} />
          </View>
        ) : null}
      </View>
    </EditDialog>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Adding a division
 * ------------------------------------------------------------------------------------------- */

/**
 * *＋ Add a {sport} division* (`FIX-27`): asks first — the age group, a name filled in from it,
 * and how it is played — rather than creating a division called after the sport and opening it.
 *
 * With `existing`, it is the **first division of a sport just added**: the server has already made
 * it, called "Open", and this names it; *Skip — name it later* leaves it as it is.
 */
export function AddDivisionDialog({ visible, onClose, onAdded, orgId, event, sport, divisions, existing }: {
  visible: boolean;
  onClose: () => void;
  onAdded?: (divisionId: string) => void;
  orgId: string;
  event: Event;
  sport: Sport | null;
  /** The tournament's divisions. */
  divisions: TournamentDivision[];
  existing?: TournamentDivision | null;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [ageGroupName, setAgeGroupName] = useState('');
  const [customName, setCustomName] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatSetting>(DEFAULT_FORMAT);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setAgeGroupId(existing?.ageGroupId || null);
    setAgeGroupName(existing?.ageGroup || '');
    setCustomName(null);
    setFormat(DEFAULT_FORMAT);
  }, [visible, existing?.id]);

  const taken = useMemo(
    () => divisions.filter(d => d.sportId === sport?.id && d.id !== existing?.id).map(d => d.name),
    [divisions, sport?.id, existing?.id]
  );
  const derived = divisionAutoName(ageGroupName || undefined, taken);
  const name = customName?.trim() || derived;
  const clash = findTakenDivisionName(name, taken);
  if (!sport) return null;

  const save = async () => {
    setSaving(true);
    let divisionId = existing?.id;
    if (existing) {
      const updated = await sendAction(SocketAction.UPDATE_DIVISION, { id: existing.id, orgId, data: { name, ageGroupId } });
      if (!updated.ok) { setSaving(false); return; }
    } else {
      const added = await sendAction(SocketAction.ADD_DIVISION, {
        eventId: event.id,
        orgId,
        sportId: sport.id,
        name,
        ageGroupId,
        format: format.format,
      });
      if (!added.ok) { setSaving(false); return; }
      divisionId = added.data.id;
    }
    // The settings under a format, and an existing division's format, need the format action.
    if (divisionId && (existing || format.legs > 1 || format.thirdPlacePlayoff)) {
      const formatted = await sendAction(SocketAction.SET_DIVISION_FORMAT, {
        divisionId,
        orgId,
        format: format.format,
        settings: { legs: format.legs, thirdPlacePlayoff: format.thirdPlacePlayoff },
      });
      if (!formatted.ok) { setSaving(false); return; }
    }
    setSaving(false);
    onClose();
    if (divisionId) onAdded?.(divisionId);
  };

  return (
    <EditDialog
      visible={visible}
      title={existing ? `${sport.name}'s first division` : `Add a ${sport.name} division`}
      onClose={onClose}
      onSave={save}
      saveLabel={existing ? 'Save' : 'Add division'}
      saveDisabled={!name || !!clash}
      isSaving={saving}
      footerLeft={existing ? (
        <TouchableOpacity onPress={onClose} accessibilityRole="button" className="justify-center py-2">
          <Text className="font-inter-semibold text-sm text-ink-muted">Skip — name it later</Text>
        </TouchableOpacity>
      ) : undefined}
    >
      {existing ? (
        <Text className="font-inter text-sm text-ink-soft">{sport.name} has been added. Every sport is played in at least one division — what is this one?</Text>
      ) : null}
      <View className="gap-1.5">
        <FieldLabel label="Age group" optional help={`${sport.name}'s age groups. Teams of another age can still be entered — they are marked as playing up or down.`} />
        <AgeGroupPicker
          sportId={sport.id}
          ageGroups={sport.ageGroups}
          value={ageGroupId}
          onChange={(id, group) => { setAgeGroupId(id); setAgeGroupName(group?.name || ''); }}
          noneLabel="Any age"
          orgId={orgId}
          variant="chips"
        />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Name" help={`Filled in from the age group until you type your own — Open with none. Shown under ${sport.name}, so it does not repeat the sport.`} />
        <TextInput
          value={customName ?? derived}
          onChangeText={setCustomName}
          placeholder={`${derived} (automatic)`}
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Division name"
          className={`${TEXT_INPUT} ${clash ? 'border-danger' : ''}`}
        />
        {clash ? <Text className="font-inter text-xs text-danger-ink">Another {sport.name} division is already called "{clash}".</Text> : null}
      </View>
      <View className="gap-1.5">
        <FieldLabel label="How it's played" help="Can be changed on the division's page until a game has started." />
        <FormatPicker value={format} onChange={setFormat} />
      </View>
    </EditDialog>
  );
}
