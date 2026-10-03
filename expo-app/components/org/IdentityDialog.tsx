import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ORG_SHORT_CODE_MAX_LENGTH, Organization, OrganizationType, SocketAction, normalizeOrgShortCode, orgColors } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import CustomSelect from '../CustomSelect';
import { BrandColorsField, brandColorsProblem } from './BrandColorsField';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { ORG_TYPES } from './orgTypes';

interface Draft {
  name: string;
  shortName: string;
  type: OrganizationType | '';
  customType: string;
  primaryColor: string;
  secondaryColor: string;
}

const draftOf = (org: Organization): Draft => ({
  name: org.name || '',
  shortName: org.shortName || '',
  type: org.type || '',
  customType: org.customType || '',
  primaryColor: orgColors(org).primary,
  // Empty means "not set": painted as the primary colour, and saved as null.
  secondaryColor: (org.secondaryColor || '').trim(),
});

/**
 * The org's identity: name, short code, type and brand colours — what the profile banner shows.
 * Every field is required except the secondary colour, which is the one marked Optional; when it
 * is not set the org is painted in its primary colour alone (`orgColors`). Type "Other" needs a description, which appears
 * beside the type only while Other is chosen. Saves those fields alone (`UPDATE_ORG` is a patch).
 */
export function IdentityDialog({ org, visible, onClose }: { org: Organization; visible: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(org));
  const [isSaving, setIsSaving] = useState(false);

  // A fresh draft each time it opens; never re-seeded while open, so a colleague's save cannot
  // overwrite what is being typed.
  useEffect(() => {
    if (visible) {
      setDraft(draftOf(org));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const baseline = useMemo(() => draftOf(org), [org]);
  const isDirty = (Object.keys(draft) as (keyof Draft)[]).some(k => draft[k].trim() !== baseline[k].trim());

  const blocked =
    !draft.name.trim() ? 'The organisation needs a name.'
    : !draft.shortName.trim() ? 'The organisation needs a short code.'
    : !draft.type ? 'Choose what kind of organisation this is.'
    : draft.type === 'OTHER' && !draft.customType.trim() ? 'Describe the kind of organisation.'
    : brandColorsProblem(draft.primaryColor, draft.secondaryColor);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(prev => ({ ...prev, [key]: value }));

  const save = () => {
    if (blocked || !draft.type) return;
    setIsSaving(true);
    sendAction(SocketAction.UPDATE_ORG, {
      id: org.id,
      data: {
        name: draft.name.trim(),
        shortName: draft.shortName.trim(),
        type: draft.type,
        // null clears the column; undefined would leave it as it was.
        customType: draft.type === 'OTHER' ? draft.customType.trim() : null,
        primaryColor: draft.primaryColor,
        secondaryColor: draft.secondaryColor || null,
      },
    }).then(result => {
      setIsSaving(false);
      if (result.ok) onClose();
    });
  };

  return (
    <EditDialog
      visible={visible}
      title="Edit identity"
      onClose={onClose}
      onSave={save}
      saveDisabled={!!blocked || !isDirty}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput value={draft.name} onChangeText={t => set('name', t)} className={TEXT_INPUT} accessibilityLabel="Name" />
      </View>

      <View className="gap-1.5">
        <FieldLabel label="Short code" help="Stands in for the name wherever the full name will not fit, such as fixtures and score cards. Up to six letters or numbers." />
        <TextInput
          value={draft.shortName}
          onChangeText={t => set('shortName', normalizeOrgShortCode(t))}
          maxLength={ORG_SHORT_CODE_MAX_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          accessibilityLabel="Short code"
          className={`${TEXT_INPUT} w-36`}
        />
      </View>

      <View className="flex-row flex-wrap gap-3">
        <View className="gap-1.5" style={{ flexGrow: 1, flexBasis: 180 }}>
          <FieldLabel label="Type" />
          <CustomSelect
            value={draft.type}
            onChange={(value: string) => set('type', value as OrganizationType)}
            options={ORG_TYPES.map(t => ({ value: t.value, label: t.label }))}
            placeholder="Choose a type"
          />
        </View>
        {draft.type === 'OTHER' ? (
          <View className="gap-1.5" style={{ flexGrow: 1.3, flexBasis: 200 }}>
            <FieldLabel label="Describe it" />
            <TextInput
              value={draft.customType}
              onChangeText={t => set('customType', t)}
              placeholder="e.g. Charity"
              autoFocus
              accessibilityLabel="Describe the kind of organisation"
              className={TEXT_INPUT}
            />
          </View>
        ) : null}
      </View>

      <BrandColorsField
        primary={draft.primaryColor}
        secondary={draft.secondaryColor}
        onChange={({ primary, secondary }) => setDraft(prev => ({ ...prev, primaryColor: primary, secondaryColor: secondary }))}
      />

      {blocked && isDirty ? <Text className="font-inter text-xs text-amber-800 dark:text-amber-300">{blocked}</Text> : null}
    </EditDialog>
  );
}
