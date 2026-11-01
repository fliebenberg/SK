import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { DEFAULT_ORG_PRIMARY_COLOR, DEFAULT_ORG_SECONDARY_COLOR, ORG_SHORT_CODE_MAX_LENGTH, Organization, SocketAction } from '@sk/shared';
import { EditDialog } from './EditDialog';
import { FieldLabel } from './FieldLabel';
import { TEXT_INPUT } from './formStyles';
import { sendAction } from '../services/actions';
import { useOrgShortCode } from '../hooks/useOrgShortCode';
import { useActiveTheme } from '../store/settingsStore';

import { deviceTimeZone } from '../utils/dates';
import { BrandColorsField, brandColorsProblem } from './org/BrandColorsField';
import { PossibleDuplicateOrgs, usePossibleDuplicateOrgs } from './org/PossibleDuplicateOrgs';
import { themeColor } from '../constants/Colors';

/**
 * Registering an organisation that is not on the system yet — somebody else's, unclaimed.
 *
 * **Wherever an organisation is chosen for something, it can be created there** (settled
 * 2026-09-21). An organiser putting a fixture or a tournament together who finds the visiting
 * school missing should not have to leave, create it somewhere else, and come back — that is the
 * friction that gets a feature abandoned on its first real use. Two screens did this with near
 * identical inline copies, and the tournament entrants screen, which chooses organisations too,
 * had none at all. This is the one component all three use.
 *
 * **It creates an unclaimed organisation, and that is not the same act as creating your own.**
 * The organisations directory's "Add organisation" makes *you* its admin — you run it. This one
 * records a school you do not run, so nobody is made an admin and it waits to be claimed. That is
 * why the directory keeps its own dialog rather than using this: merging them would blur "I run
 * this" with "somebody else runs this", which is exactly the line the claim process exists to hold.
 *
 * **Its colours can be given here** (2026-10-03): whoever registers a school usually knows its
 * colours, even as an outsider. They start as the app's two colours, so leaving them alone still
 * gives the new org two.
 *
 * **The contact email is handed back, not sent.** One caller invites the contact straight away;
 * another holds the invitation until the form around it is saved. Which is right depends on the
 * caller, so the dialog creates the organisation and returns the address, and the caller decides.
 *
 * **A name close to one already here is asked about** (`ORG-15`, 2026-11-01), as on *Add
 * organisation*. Whoever is here wants an organisation for their game or tournament, so a match is
 * simply used, in place of registering one. A private one is not offered: it plays nobody else.
 */
export interface RegisterOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fills the name — usually whatever was typed into the search that found nothing. */
  initialName?: string;
  /** The sport it plays, if the caller knows, so the new organisation is offered for it. */
  sportId?: string;
  /** Already where this is being chosen for, so shown but not offered: "Taking part". */
  alreadyInIds?: Set<string>;
  /**
   * The organisation to use: the one created, or an existing one picked instead, which brings no
   * `contactEmail`. That address is the caller's to invite now, later, or not at all.
   */
  onChosen: (org: Organization, contactEmail: string) => void;
}

export function RegisterOrgModal({ isOpen, onClose, initialName, sportId, alreadyInIds, onChosen }: RegisterOrgModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [colors, setColors] = useState({ primary: DEFAULT_ORG_PRIMARY_COLOR, secondary: DEFAULT_ORG_SECONDARY_COLOR, tertiary: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [seededName, setSeededName] = useState('');
  const shortCode = useOrgShortCode();
  const duplicates = usePossibleDuplicateOrgs(name, isOpen, { publicOnly: true });

  // Fresh each time it opens, seeded from the search that found nothing.
  useEffect(() => {
    if (!isOpen) return;
    const seeded = (initialName || '').trim();
    setName(seeded);
    setSeededName(seeded);
    setContactEmail('');
    setColors({ primary: DEFAULT_ORG_PRIMARY_COLOR, secondary: DEFAULT_ORG_SECONDARY_COLOR, tertiary: '' });
    shortCode.reset();
    if (seeded) shortCode.onNameChange(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isDirty =
    name.trim() !== seededName || !!contactEmail.trim() ||
    colors.primary !== DEFAULT_ORG_PRIMARY_COLOR || colors.secondary !== DEFAULT_ORG_SECONDARY_COLOR || !!colors.tertiary;

  const canSave = !!name.trim() && !!shortCode.shortCode && !brandColorsProblem(colors.primary, colors.secondary, colors.tertiary) && !isSaving && duplicates.answered;

  const handleSave = () => {
    if (!canSave) return;
    setIsSaving(true);
    sendAction(SocketAction.ADD_ORG, {
      name: name.trim(),
      shortName: shortCode.shortCode,
      primaryColor: colors.primary,
      // Cleared means "not set": painted as the primary.
      secondaryColor: colors.secondary || null,
      tertiaryColor: colors.tertiary || null,
      supportedSportIds: sportId ? [sportId] : [],
      // A guess until it is claimed: an organisation registered to play against is most likely
      // near whoever registered it (DATE-2). Its admins can change it in its settings.
      timezone: deviceTimeZone(),
    }).then(result => {
      setIsSaving(false);
      // A refusal is already toasted; the dialog stays open with what was typed.
      if (!result.ok) return;
      onChosen(result.data, contactEmail.trim());
      onClose();
    });
  };

  return (
    <EditDialog
      visible={isOpen}
      title="Register an organisation"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Register"
      saveDisabled={!canSave}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <Text className="font-inter text-sm text-ink-muted">
        For a school or club that is not on ScoreKeeper yet. It is added unclaimed — nobody runs it
        until somebody from there claims it.
      </Text>

      <View className="gap-1.5">
        <FieldLabel label="Full name" />
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            shortCode.onNameChange(text);
          }}
          placeholder="e.g. St John's College"
          placeholderTextColor={themeColor(isDark, 'ink-faint')}
          className={TEXT_INPUT}
        />
      </View>

      <PossibleDuplicateOrgs
        matches={duplicates.matches}
        chooseLabel="Use this"
        unavailable={org => (alreadyInIds?.has(org.id) ? 'Taking part' : undefined)}
        onOpen={org => {
          onChosen(org, '');
          onClose();
        }}
        confirmedNew={duplicates.confirmedNew}
        onConfirmNew={duplicates.setConfirmedNew}
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
          placeholder="SJC"
          placeholderTextColor={themeColor(isDark, 'ink-faint')}
          className={`${TEXT_INPUT} w-36`}
        />
      </View>

      <BrandColorsField
        primary={colors.primary}
        secondary={colors.secondary}
        tertiary={colors.tertiary}
        onChange={setColors}
      />

      <View className="gap-1.5">
        <FieldLabel
          label="Contact email"
          optional
          help="If you know who runs this school or club — the head of sport, the club secretary — we can invite them to claim it and take over their teams and schedules."
        />
        <TextInput
          value={contactEmail}
          onChangeText={setContactEmail}
          placeholder="contact@school.edu"
          placeholderTextColor={themeColor(isDark, 'ink-faint')}
          keyboardType="email-address"
          autoCapitalize="none"
          className={TEXT_INPUT}
        />
      </View>
    </EditDialog>
  );
}
