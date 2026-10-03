import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Organization, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';

/** The org's description, shown on its public profile. Optional, so saving it empty clears it. */
export function AboutDialog({ org, visible, onClose }: { org: Organization; visible: boolean; onClose: () => void }) {
  const [text, setText] = useState(org.description || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) setText(org.description || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty = text.trim() !== (org.description || '').trim();

  const save = () => {
    setIsSaving(true);
    sendAction(SocketAction.UPDATE_ORG, { id: org.id, data: { description: text.trim() } }).then(result => {
      setIsSaving(false);
      if (result.ok) onClose();
    });
  };

  return (
    <EditDialog visible={visible} title="Edit about" onClose={onClose} onSave={save} saveDisabled={!isDirty} isSaving={isSaving} isDirty={isDirty}>
      <View className="gap-1.5">
        <FieldLabel label="About" help="Shown on the organisation's public profile. A sentence or two on who you are and where you play is plenty." />
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          textAlignVertical="top"
          accessibilityLabel="About the organisation"
          className={`${TEXT_INPUT} min-h-[140px]`}
        />
      </View>
    </EditDialog>
  );
}
