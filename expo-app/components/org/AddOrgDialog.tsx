import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DEFAULT_ORG_PRIMARY_COLOR, DEFAULT_ORG_SECONDARY_COLOR, ORG_CUSTOM_TYPE_MAX_LENGTH, ORG_SHORT_CODE_MAX_LENGTH, Organization, OrganizationType, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import CustomSelect from '../CustomSelect';
import { TEXT_INPUT } from '../formStyles';
import { ReadFailure } from '../ReadFailure';
import { BrandColorsField, brandColorsProblem } from './BrandColorsField';
import { ORG_TYPES } from './orgTypes';
import { PossibleDuplicateOrgs, usePossibleDuplicateOrgs } from './PossibleDuplicateOrgs';
import { sendAction } from '../../services/actions';
import { readData } from '../../services/reads';
import { useOrgShortCode } from '../../hooks/useOrgShortCode';
import { useActiveTheme } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { deviceTimeZone } from '../../utils/dates';
import { themeColor } from '../../constants/Colors';

/**
 * The organisations directory's *Add organisation*: setting up an organisation you will run — you
 * become its admin. Registering somebody else's, unclaimed, is `RegisterOrgModal`; the two stay
 * apart on purpose (see there).
 *
 * The fields are entered as on the profile's Edit identity dialog — the same type picker, *Describe
 * it* beside Other, the same colour pair (design_system.md, rule 9). The sport is a choice of the
 * sports ScoreKeeper has, and may be left empty: a free-text box used to send whatever was typed as
 * a sport id. The dialog reads the sports itself each time it opens, rather than taking the page's
 * copy, which could be empty and left the picker saying "No options found" (2026-10-31).
 *
 * A name close to one already here has to be answered before Add: open that organisation, or tick
 * that this one is different (`PossibleDuplicateOrgs`, 2026-11-01).
 */
export interface AddOrgDialogProps {
  visible: boolean;
  onClose: () => void;
  /** Created, with the new organisation; the dialog has already closed. */
  onCreated: (org: Organization) => void;
}

const EMPTY_COLORS = { primary: DEFAULT_ORG_PRIMARY_COLOR, secondary: DEFAULT_ORG_SECONDARY_COLOR, tertiary: '' };

export function AddOrgDialog({ visible, onClose, onCreated }: AddOrgDialogProps) {
  const isDark = useActiveTheme() === 'dark';
  const userId = useAuthStore(state => state.user?.id);
  const [name, setName] = useState('');
  const [sportId, setSportId] = useState('');
  const [type, setType] = useState<OrganizationType | ''>('');
  const [customType, setCustomType] = useState('');
  // The app's two colours until changed, so a new org has two either way (2026-10-03).
  const [colors, setColors] = useState(EMPTY_COLORS);
  const [isSaving, setIsSaving] = useState(false);
  const [sports, setSports] = useState<{ id: string; name: string }[] | null>(null);
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [sportsAttempt, setSportsAttempt] = useState(0);
  const shortCode = useOrgShortCode();
  const router = useRouter();
  const duplicates = usePossibleDuplicateOrgs(name, visible);

  // Fresh each time it opens.
  useEffect(() => {
    if (!visible) return;
    setName('');
    setSportId('');
    setType('');
    setCustomType('');
    setColors(EMPTY_COLORS);
    setIsSaving(false);
    shortCode.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setSportsError(null);
    void readData<{ id: string; name: string }[]>('sports', {}, { suppressToast: true, stillWanted: () => active }).then(result => {
      if (!active) return;
      if (result.ok) setSports(Array.isArray(result.data) ? result.data : []);
      else setSportsError(result.message);
    });
    return () => { active = false; };
  }, [visible, sportsAttempt]);

  /** With no list to choose from, an organisation would be added without its sport. */
  const sportsFailed = !!sportsError && !sports;

  const isDirty =
    !!name.trim() || !!shortCode.shortCode || !!sportId || !!type ||
    colors.primary !== EMPTY_COLORS.primary || colors.secondary !== EMPTY_COLORS.secondary || !!colors.tertiary;

  const canSave =
    !!name.trim() && !!shortCode.shortCode && !!type &&
    !(type === 'OTHER' && !customType.trim()) &&
    !brandColorsProblem(colors.primary, colors.secondary, colors.tertiary) &&
    duplicates.answered &&
    !sportsFailed;

  const handleSave = () => {
    if (!canSave || isSaving || !userId) return;
    setIsSaving(true);
    sendAction(SocketAction.ADD_ORG, {
      name: name.trim(),
      shortName: shortCode.shortCode,
      supportedSportIds: sportId ? [sportId] : [],
      // What makes the creator its admin (`DataManager.addOrganization`). Without it the org is created
      // unclaimed, with no members — which is what RegisterOrgModal wants, and this dialog does not.
      creatorId: userId,
      isActive: true,
      type,
      customType: type === 'OTHER' ? customType.trim() : undefined,
      primaryColor: colors.primary,
      // Cleared means "not set": painted as the primary.
      secondaryColor: colors.secondary || null,
      tertiaryColor: colors.tertiary || null,
      // Whoever sets an organisation up is most likely where it plays (DATE-2); changeable in its settings.
      timezone: deviceTimeZone(),
    }).then(result => {
      setIsSaving(false);
      // A refusal is already toasted; the dialog stays open with what was typed.
      if (!result.ok) return;
      onClose();
      onCreated(result.data);
    });
  };

  const sportOptions = (sports || [])
    .map(s => ({ value: s.id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <EditDialog
      visible={visible}
      title="Add organisation"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Add"
      saveDisabled={!canSave}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            shortCode.onNameChange(text);
          }}
          placeholder="e.g. Springvale High"
          placeholderTextColor={themeColor(isDark, 'ink-faint')}
          accessibilityLabel="Name"
          className={TEXT_INPUT}
          autoFocus
        />
      </View>

      <PossibleDuplicateOrgs
        matches={duplicates.matches}
        onOpen={org => {
          onClose();
          router.push(`/organizations/${org.id}` as any);
        }}
        confirmedNew={duplicates.confirmedNew}
        onConfirmNew={duplicates.setConfirmedNew}
        failure={duplicates.failure}
        onRetry={duplicates.retry}
      />

      {/* Required, but filled in from the name as it is typed — see `useOrgShortCode`. */}
      <View className="gap-1.5">
        <FieldLabel label="Short code" help="Used wherever the full name will not fit — tabs, columns and team flags." />
        <TextInput
          value={shortCode.shortCode}
          onChangeText={shortCode.onShortCodeChange}
          maxLength={ORG_SHORT_CODE_MAX_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          placeholder="SVH"
          placeholderTextColor={themeColor(isDark, 'ink-faint')}
          accessibilityLabel="Short code"
          className={`${TEXT_INPUT} w-36`}
        />
      </View>

      <View className="flex-row flex-wrap gap-3">
        <View className="gap-1.5" style={{ flexGrow: 1, flexBasis: 180 }}>
          <FieldLabel label="Organisation type" />
          <CustomSelect
            value={type}
            onChange={(value: string) => {
              setType(value as OrganizationType);
              if (value !== 'OTHER') setCustomType('');
            }}
            options={ORG_TYPES.map(t => ({ value: t.value, label: t.label }))}
            placeholder="Choose a type"
            accessibilityLabel="Organisation type"
          />
        </View>
        {type === 'OTHER' ? (
          <View className="gap-1.5" style={{ flexGrow: 1.3, flexBasis: 200 }}>
            <FieldLabel label="Describe it" />
            <TextInput
              value={customType}
              onChangeText={setCustomType}
              placeholder="e.g. Charity"
              placeholderTextColor={themeColor(isDark, 'ink-faint')}
              autoFocus
              maxLength={ORG_CUSTOM_TYPE_MAX_LENGTH}
              accessibilityLabel="Describe the kind of organisation"
              className={TEXT_INPUT}
            />
          </View>
        ) : null}
      </View>

      <View className="gap-1.5">
        <FieldLabel label="Main sport" optional help="More sports can be added later, from the organisation's profile." />
        {sportsFailed ? (
          <ReadFailure title="The organisation cannot be added until the sports have loaded." reason={sportsError!} onRetry={() => setSportsAttempt(n => n + 1)} />
        ) : (
          <CustomSelect
            value={sportId}
            onChange={setSportId}
            options={sportOptions}
            placeholder={sports ? 'Choose a sport' : 'Loading sports…'}
            showSearch={sportOptions.length > 8}
            searchPlaceholder="Search sports"
            clearable
            accessibilityLabel="Main sport"
          />
        )}
      </View>

      <BrandColorsField primary={colors.primary} secondary={colors.secondary} tertiary={colors.tertiary} onChange={setColors} />
    </EditDialog>
  );
}
