import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Organization, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { AddressInput, isAddressComplete } from '../address/AddressInput';
import { AddressDraft } from '../../services/places';
import { sendAction } from '../../services/actions';

const draftOf = (org: Organization): AddressDraft | null => {
  if (!org.address) return null;
  const { id: _id, ...rest } = org.address;
  return rest;
};

const sameAddress = (a: AddressDraft | null, b: AddressDraft | null) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The org's address, through the shared address input. Saves `address` alone; `null` removes it.
 *
 * `onSaved` hears the saved org, which carries the timezone at the new pin (`addressTimeZone`), so
 * the profile can ask whether the org's timezone setting should follow it.
 */
export function AddressDialog({ org, visible, onClose, onSaved }: {
  org: Organization; visible: boolean; onClose: () => void; onSaved?: (saved: Organization) => void;
}) {
  const [draft, setDraft] = useState<AddressDraft | null>(() => draftOf(org));
  const [removing, setRemoving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Remounts the input on open, so it starts in the right state (picked or search).
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (visible) {
      setDraft(draftOf(org));
      setRemoving(false);
      setOpenCount(c => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty = removing || !sameAddress(draft, draftOf(org));
  const canSave = removing || isAddressComplete(draft);

  const save = () => {
    setIsSaving(true);
    const address = removing
      ? null
      : {
          ...draft!,
          // A hand-typed address with no pin sends nulls, so an old pin does not survive the edit.
          latitude: draft!.latitude ?? null,
          longitude: draft!.longitude ?? null,
        };
    sendAction(SocketAction.UPDATE_ORG, { id: org.id, data: { address: address as any } }).then(result => {
      setIsSaving(false);
      if (!result.ok) return;
      onClose();
      onSaved?.(result.data);
    });
  };

  return (
    <EditDialog
      visible={visible}
      title={org.address ? 'Edit address' : 'Add address'}
      onClose={onClose}
      onSave={save}
      saveDisabled={!isDirty || !canSave}
      isSaving={isSaving}
      isDirty={isDirty}
      footerLeft={org.address && !removing ? (
        <TouchableOpacity onPress={() => setRemoving(true)} hitSlop={8} accessibilityRole="button" className="justify-center">
          <Text className="font-inter-bold text-sm text-red-700 dark:text-red-400">Remove address</Text>
        </TouchableOpacity>
      ) : null}
    >
      {removing ? (
        <View className="gap-2">
          <Text className="font-inter text-sm text-slate-700 dark:text-slate-200">
            The address will be removed from the profile when you save.
          </Text>
          <TouchableOpacity onPress={() => setRemoving(false)} hitSlop={8} accessibilityRole="button">
            <Text className="font-inter-bold text-sm text-orange-700 dark:text-brand-orange">Keep the address</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <AddressInput
          key={openCount}
          value={draft}
          onChange={setDraft}
          pinTitle={org.name}
          pinHelp="Drag the pin to the main entrance. The pin is also where the organisation's address timezone comes from."
        />
      )}
    </EditDialog>
  );
}
