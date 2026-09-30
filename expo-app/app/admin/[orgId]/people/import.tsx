import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  SocketAction,
  type PeopleImportOutcome,
  type PeopleImportReport,
  type PeopleImportRowResult,
  type SheetReadResult,
} from '@sk/shared';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { SegmentedControl } from '../../../../components/SegmentedControl';
import { PaginatedList } from '../../../../components/PaginatedList';
import { getThemeColor } from '../../../../constants/Colors';
import { useActiveTheme } from '../../../../store/settingsStore';
import { useAuthStore } from '../../../../store/authStore';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { useUnsavedChanges } from '../../../../hooks/useUnsavedChanges';
import { useRequestScope } from '../../../../hooks/useRequestScope';
import { requestKeyFor, sendAction } from '../../../../services/actions';
import {
  PEOPLE_TEMPLATE_FILE_NAME,
  buildPeopleTemplate,
  pickPeopleSheet,
  saveWorkbook,
} from '../../../../utils/peopleSpreadsheet';

/**
 * Importing people and their guardians from a spreadsheet (docs/identity_structure.md §8).
 *
 * Choose a file → the server previews every row → the admin imports the rows it can take. Rows with
 * problems are left out rather than blocking the rest; fixing one means fixing the file and
 * choosing it again, because the file is the record of what was imported. The apply sends only the
 * new and changed rows, and the server plans them again before writing, so a person someone else
 * added in the meantime is matched rather than added twice.
 *
 * Nothing is saved until Import, so a previewed file counts as unsaved work (`useUnsavedChanges`).
 */

type Filter = 'all' | 'new' | 'update' | 'error' | 'unchanged';

/** Preview and apply are one plan over up to 2,000 rows; the socket's 7 seconds is not enough. */
const IMPORT_TIMEOUT_MS = 60000;

interface Loaded {
  fileName: string;
  sheet: SheetReadResult;
  report: PeopleImportReport | null;
}

export default function ImportPeople() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const safeBack = useSafeBack();
  const scope = useRequestScope();

  const user = useAuthStore(state => state.user);
  const orgMemberships = useAuthStore(state => state.orgMemberships || []);
  const membership = orgMemberships.find(m => m.orgId === orgId);
  const canImport = Boolean(
    user?.globalRole === 'admin' ||
    (membership && (membership.roleId === 'role-org-admin' || membership.roleId === 'role-org-staff'))
  );

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [done, setDone] = useState<PeopleImportReport | null>(null);
  const [busy, setBusy] = useState<'template' | 'reading' | 'previewing' | 'applying' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const report = loaded?.report ?? null;
  const toImport = useMemo(
    () => report ? report.rows.filter(r => r.outcome === 'new' || r.outcome === 'update') : [],
    [report]
  );

  const reset = useCallback(() => {
    setLoaded(null);
    setProblem(null);
    setFilter('all');
    scope.renew();
  }, [scope]);

  // A previewed file is work the admin has not saved; a finished import is not.
  const { confirmThenNavigate } = useUnsavedChanges(!!report && toImport.length > 0 && !done, reset);
  const goBack = () => confirmThenNavigate(() => safeBack(`/admin/${orgId}/people`));

  const downloadTemplate = async () => {
    setBusy('template');
    setProblem(null);
    try {
      await saveWorkbook(buildPeopleTemplate(), PEOPLE_TEMPLATE_FILE_NAME);
    } catch (err: any) {
      setProblem(err?.message || 'The template could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const preview = async (fileName: string, sheet: SheetReadResult) => {
    setBusy('previewing');
    const result = await sendAction(
      SocketAction.IMPORT_ORG_PEOPLE,
      { orgId, rows: sheet.rows, mode: 'preview' },
      { suppressToast: true, timeoutMs: IMPORT_TIMEOUT_MS }
    );
    setBusy(null);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    setLoaded({ fileName, sheet, report: result.data });
  };

  const chooseFile = async () => {
    setProblem(null);
    setDone(null);
    setBusy('reading');
    let picked;
    try {
      picked = await pickPeopleSheet();
    } catch (err: any) {
      setBusy(null);
      setProblem(err?.message || 'The file could not be opened.');
      return;
    }
    setBusy(null);
    if (!picked) return;
    // A new file replaces the last one's preview even if its own preview then fails.
    setLoaded(null);
    scope.renew();
    setFilter('all');
    if (picked.sheet.errors.length) {
      setLoaded({ fileName: picked.fileName, sheet: picked.sheet, report: null });
      return;
    }
    await preview(picked.fileName, picked.sheet);
  };

  const apply = async () => {
    if (!loaded || !report) return;
    // Only what changes. The server matches every row again, so leaving out the unchanged ones
    // cannot turn a later row into a duplicate.
    const rows = toImport.map(r => loaded.sheet.rows[r.index]);
    const payload = { orgId, rows, mode: 'apply' as const, idempotencyKey: scope.current() };
    setBusy('applying');
    const result = await sendAction(SocketAction.IMPORT_ORG_PEOPLE, payload, {
      suppressToast: true,
      timeoutMs: IMPORT_TIMEOUT_MS,
      requestId: requestKeyFor(scope.current(), SocketAction.IMPORT_ORG_PEOPLE, payload),
    });
    setBusy(null);
    setConfirmOpen(false);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    scope.renew();
    setDone(result.data);
    setLoaded(null);
    setProblem(null);
  };

  const shownRows = useMemo(
    () => (report?.rows || []).filter(r => filter === 'all' || r.outcome === filter),
    [report, filter]
  );

  const header = (
    <ScreenHeader title="Import people" onBack={goBack} />
  );

  if (!canImport) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        {header}
        <View className="p-6">
          <GlassCard className="p-6">
            <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
              Only this organisation's admins and staff can import people.
            </Text>
          </GlassCard>
        </View>
      </SafeAreaView>
    );
  }

  const counts = report?.counts;
  const importLabel = `Import ${toImport.length} ${toImport.length === 1 ? 'person' : 'people'}`;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {header}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {problem && <Notice tone="danger" isDark={isDark} lines={[problem]} />}

        {done && <DoneCard report={done} isDark={isDark} onAnother={() => setDone(null)} onBack={() => safeBack(`/admin/${orgId}/people`)} />}

        {!report && !done && (
          <>
            <GlassCard className="p-6 gap-4">
              <StepTitle n={1} title="Get the template" />
              <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
                One row per person, with up to two parents or guardians each. The Instructions sheet
                in the file explains every column. You can also use your own spreadsheet, as long as
                its first row has the same column names.
              </Text>
              <Button
                title="Download the template"
                variant="secondary"
                onPress={downloadTemplate}
                isLoading={busy === 'template'}
                disabled={!!busy}
              />
            </GlassCard>

            <GlassCard className="p-6 gap-4">
              <StepTitle n={2} title="Choose your file" />
              <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
                An .xlsx or .csv file. Nothing is saved yet: you will see what each row would do first.
              </Text>
              <Button
                title={busy === 'previewing' ? 'Checking every row…' : 'Choose a file'}
                onPress={chooseFile}
                isLoading={busy === 'reading' || busy === 'previewing'}
                disabled={!!busy}
              />
              {loaded && loaded.sheet.errors.length > 0 && (
                <Notice
                  tone="danger"
                  isDark={isDark}
                  title={`${loaded.fileName} could not be imported`}
                  lines={loaded.sheet.errors}
                />
              )}
            </GlassCard>
          </>
        )}

        {report && loaded && counts && (
          <>
            <GlassCard className="p-6 gap-3">
              <Text className="font-inter-bold text-base text-slate-900 dark:text-white" numberOfLines={1}>
                {loaded.fileName}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <CountChip label="new" value={counts.new} outcome="new" />
                <CountChip label="to update" value={counts.update} outcome="update" />
                <CountChip label="no change" value={counts.unchanged} outcome="unchanged" />
                <CountChip label="with problems" value={counts.error} outcome="error" />
              </View>
              {(counts.newGuardians > 0 || counts.newGuardianLinks > 0) && (
                <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
                  {counts.newGuardianLinks} guardian {counts.newGuardianLinks === 1 ? 'link' : 'links'} to add
                  {counts.newGuardians > 0 ? `, ${counts.newGuardians} of them new to your organisation` : ''}.
                </Text>
              )}
              {counts.error > 0 && (
                <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
                  Rows with problems are left out. To include them, fix them in the file and choose it again.
                </Text>
              )}
              {loaded.sheet.warnings.length > 0 && <Notice tone="warning" isDark={isDark} lines={loaded.sheet.warnings} />}
              <View className="flex-row flex-wrap gap-3 pt-2">
                <Button
                  title={importLabel}
                  onPress={() => setConfirmOpen(true)}
                  disabled={toImport.length === 0 || !!busy}
                  isLoading={busy === 'applying'}
                />
                <Button title="Choose another file" variant="secondary" onPress={chooseFile} disabled={!!busy} />
                {problem && (
                  <Button title="Check again" variant="ghost" onPress={() => { setProblem(null); void preview(loaded.fileName, loaded.sheet); }} disabled={!!busy} />
                )}
              </View>
              {toImport.length === 0 && (
                <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
                  Nothing in this file would change anything, so there is nothing to import.
                </Text>
              )}
            </GlassCard>

            <SegmentedControl<Filter>
              options={[
                { key: 'all', label: `All ${report.rows.length}` },
                { key: 'new', label: `New ${counts.new}` },
                { key: 'update', label: `Updates ${counts.update}` },
                { key: 'error', label: `Problems ${counts.error}` },
                { key: 'unchanged', label: `No change ${counts.unchanged}` },
              ]}
              value={filter}
              onChange={setFilter}
            />

            <PaginatedList<PeopleImportRowResult>
              data={shownRows}
              pageSize={25}
              keyExtractor={row => String(row.index)}
              renderItem={row => <RowCard row={row} isDark={isDark} />}
              itemSpacingClassName="mb-3"
              emptyState={
                <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                  No rows here.
                </Text>
              }
            />
          </>
        )}
      </ScrollView>

      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`${importLabel}?`}
        description={confirmDescription(counts)}
        confirmText="Import"
        variant="primary"
        onConfirm={apply}
        isProcessing={busy === 'applying'}
      />
    </SafeAreaView>
  );
}

function confirmDescription(counts: PeopleImportReport['counts'] | undefined): string {
  if (!counts) return '';
  const parts = [
    counts.new ? `add ${counts.new} ${counts.new === 1 ? 'person' : 'people'}` : '',
    counts.update ? `update ${counts.update}` : '',
    counts.newGuardianLinks ? `link ${counts.newGuardianLinks} ${counts.newGuardianLinks === 1 ? 'guardian' : 'guardians'}` : '',
  ].filter(Boolean);
  const skipped = counts.error ? ` The ${counts.error} ${counts.error === 1 ? 'row' : 'rows'} with problems will be left out.` : '';
  return `This will ${parts.join(', ')}. Anyone whose email is already on ScoreKeeper gets access straight away.${skipped}`;
}

// -------------------------------------------------------------------------------------------------

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-8 h-8 rounded-full bg-brand-orange items-center justify-center">
        <Text className="font-orbitron-bold text-sm text-white">{n}</Text>
      </View>
      <Text className="font-inter-bold text-base text-slate-900 dark:text-white">{title}</Text>
    </View>
  );
}

const OUTCOME_LABEL: Record<PeopleImportOutcome, string> = {
  new: 'New',
  update: 'Update',
  unchanged: 'No change',
  error: 'Problem',
};

/** Badge classes per outcome. Light mode uses the deep variants (design_system.md, AAA rules). */
const OUTCOME_CLASSES: Record<PeopleImportOutcome, { box: string; text: string }> = {
  new: { box: 'bg-cyan-50 dark:bg-brand-blue/10 border-cyan-800/20 dark:border-brand-blue/30', text: 'text-cyan-800 dark:text-brand-blue' },
  update: { box: 'bg-orange-50 dark:bg-brand-orange/10 border-brand-orange/30', text: 'text-orange-800 dark:text-brand-orange' },
  unchanged: { box: 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10', text: 'text-slate-600 dark:text-slate-400' },
  error: { box: 'bg-red-50 dark:bg-brand-red/10 border-red-700/20 dark:border-brand-red/30', text: 'text-red-700 dark:text-brand-red' },
};

function OutcomeBadge({ outcome }: { outcome: PeopleImportOutcome }) {
  const classes = OUTCOME_CLASSES[outcome];
  return (
    <View className={`px-2 py-0.5 rounded-md border ${classes.box}`}>
      <Text className={`font-inter-bold text-[10px] uppercase tracking-wider ${classes.text}`}>{OUTCOME_LABEL[outcome]}</Text>
    </View>
  );
}

function CountChip({ label, value, outcome }: { label: string; value: number; outcome: PeopleImportOutcome }) {
  const classes = OUTCOME_CLASSES[outcome];
  return (
    <View className={`flex-row items-baseline gap-1 px-3 py-1.5 rounded-lg border ${classes.box}`}>
      <Text className={`font-orbitron-bold text-sm ${classes.text}`}>{value}</Text>
      <Text className={`font-inter text-xs ${classes.text}`}>{label}</Text>
    </View>
  );
}

function Notice({ tone, lines, title, isDark }: { tone: 'danger' | 'warning'; lines: string[]; title?: string; isDark: boolean }) {
  const color = getThemeColor(isDark, tone);
  const box = tone === 'danger'
    ? 'bg-red-50 dark:bg-brand-red/10 border-red-700/20 dark:border-brand-red/30'
    : 'bg-amber-50 dark:bg-brand-yellow/10 border-amber-700/20 dark:border-brand-yellow/30';
  return (
    <View className={`p-4 rounded-xl border gap-2 ${box}`}>
      {title && <Text className="font-inter-bold text-sm" style={{ color }}>{title}</Text>}
      {lines.map((line, i) => (
        <View key={i} className="flex-row gap-2">
          <Ionicons name={tone === 'danger' ? 'alert-circle-outline' : 'information-circle-outline'} size={16} color={color} />
          <Text className="flex-1 font-inter text-sm" style={{ color }}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function RowCard({ row, isDark }: { row: PeopleImportRowResult; isDark: boolean }) {
  const muted = getThemeColor(isDark, 'textSecondary');
  const warning = getThemeColor(isDark, 'warning');
  const danger = getThemeColor(isDark, 'danger');
  return (
    <GlassCard className="p-4 gap-2">
      <View className="flex-row items-center gap-3">
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 w-14">Row {row.rowNumber}</Text>
        <Text className="flex-1 font-inter-bold text-sm text-slate-900 dark:text-white" numberOfLines={1}>
          {row.name || 'No name'}
        </Text>
        <OutcomeBadge outcome={row.outcome} />
      </View>

      {row.errors.map((line, i) => (
        <Line key={`e${i}`} icon="alert-circle-outline" color={danger} text={line} />
      ))}
      {row.changes.map((change, i) => (
        <Line
          key={`c${i}`}
          icon="create-outline"
          color={muted}
          text={`${change.field}: ${change.from ?? 'none'} → ${change.to ?? 'none'}`}
        />
      ))}
      {row.guardians.map(g => (
        <Line
          key={`g${g.position}`}
          icon="people-outline"
          color={muted}
          text={`Guardian ${g.position}: ${g.name}${guardianNote(g.profile, g.link)}`}
        />
      ))}
      {row.warnings.map((line, i) => (
        <Line key={`w${i}`} icon="information-circle-outline" color={warning} text={line} />
      ))}
    </GlassCard>
  );
}

function guardianNote(profile: 'new' | 'existing', link: 'new' | 'existing'): string {
  if (link === 'existing') return ', already linked';
  return profile === 'new' ? ', new, to be linked' : ', on record, to be linked';
}

function Line({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View className="flex-row gap-2 pl-[68px]">
      <Ionicons name={icon} size={14} color={color} style={{ marginTop: 2 }} />
      <Text className="flex-1 font-inter text-sm" style={{ color }}>{text}</Text>
    </View>
  );
}

function DoneCard({ report, isDark, onAnother, onBack }: { report: PeopleImportReport; isDark: boolean; onAnother: () => void; onBack: () => void }) {
  const { counts } = report;
  const parts = [
    counts.new ? `${counts.new} added` : '',
    counts.update ? `${counts.update} updated` : '',
    counts.newGuardianLinks ? `${counts.newGuardianLinks} ${counts.newGuardianLinks === 1 ? 'guardian' : 'guardians'} linked` : '',
  ].filter(Boolean);
  return (
    <GlassCard className="p-6 gap-4">
      <View className="flex-row items-center gap-3">
        <Ionicons name="checkmark-circle" size={24} color={getThemeColor(isDark, 'success')} />
        <Text className="font-inter-bold text-base text-slate-900 dark:text-white">Import finished</Text>
      </View>
      <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
        {parts.length ? `${parts.join(', ')}.` : 'Nothing needed changing.'} New people are not sent an
        invite by the import; invite them from the People list when you are ready.
      </Text>
      <View className="flex-row flex-wrap gap-3">
        <Button title="Back to People" onPress={onBack} />
        <Button title="Import another file" variant="secondary" onPress={onAnother} />
      </View>
    </GlassCard>
  );
}
