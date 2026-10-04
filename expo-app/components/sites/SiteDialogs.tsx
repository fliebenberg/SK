import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Facility, Site, SocketAction, Sport } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import CustomSelect from '../CustomSelect';
import { AddressInput, isAddressComplete } from '../address/AddressInput';
import { AddressMap, MapMarker } from '../address/AddressMap';
import { facilityIcon } from '../address/facilityMarker';
import { AddressDraft, hasPin } from '../../services/places';
import { sendAction } from '../../services/actions';
import { FACILITY_CATEGORIES, isPlayingArea } from './SiteBits';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The dialogs of the Sites list and the site page (docs/sites.md). Each saves only its own fields
 * (design_system.md, *Read-first record pages*); a failed save keeps it open and says why.
 */

const PIN_HELP = 'Drag the pin to the main entrance. The pin also sets the site\'s timezone, which kick-offs here are shown in.';

const draftOf = (site?: Site | null): AddressDraft | null => {
  if (!site?.address) return null;
  const { id: _id, ...rest } = site.address;
  return rest;
};

/** An address ready to send: a hand-typed one with no pin sends nulls, so an old pin does not survive. */
const addressPayload = (draft: AddressDraft) => ({
  ...draft,
  latitude: draft.latitude ?? null,
  longitude: draft.longitude ?? null,
});

/* ------------------------------------------------------------------------------------------------
 * Add site / Edit site
 * --------------------------------------------------------------------------------------------- */

/**
 * Add site on the list — a name and, optionally, the address — and the banner's Edit on the site
 * page, which is the name alone: the address is the Location card's. The address is the one
 * optional field, so it is the one marked.
 */
export function SiteDialog({ visible, onClose, orgId, site, onAdded }: {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  /** The site being renamed; absent to add one. */
  site?: Site | null;
  /** After a new site is saved — the list opens it. */
  onAdded?: (site: Site) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [address, setAddress] = useState<AddressDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Remounts the address input on open, so it starts on the search box.
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setName(site?.name || '');
    setAddress(null);
    setError(null);
    setOpenCount(c => c + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, site?.id]);

  const isDirty = site ? name.trim() !== site.name : !!(name.trim() || address);
  const addressOk = !address || isAddressComplete(address);

  const save = async () => {
    setError(null);
    if (site && name.trim() === site.name) return onClose();
    setIsSaving(true);
    const result = site
      ? await sendAction(SocketAction.UPDATE_SITE, { id: site.id, data: { name: name.trim() } }, { suppressToast: true })
      : await sendAction(SocketAction.ADD_SITE, {
          name: name.trim(),
          orgId,
          isActive: true,
          ...(address ? { address: addressPayload(address) as any } : {}),
        } as any, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || (site ? 'The name was not saved.' : 'The site was not added.'));
    onClose();
    if (!site) onAdded?.(result.data);
  };

  return (
    <EditDialog
      visible={visible}
      title={site ? 'Edit site' : 'Add site'}
      onClose={onClose}
      onSave={save}
      saveLabel={site ? 'Save' : 'Add site'}
      saveDisabled={!name.trim() || !addressOk}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Main campus, Sports club grounds"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Name"
          className={TEXT_INPUT}
        />
      </View>
      {!site ? (
        <>
          <AddressInput
            key={openCount}
            value={address}
            onChange={setAddress}
            pinTitle={name || 'Site'}
            pinHelp={PIN_HELP}
            optional
            help="Where the site is, for its map and for directions. It can be added later."
            autoFocus={false}
          />
          {address && !addressOk ? (
            <Text className="font-inter text-sm text-warning-ink">Add at least the street, the town and the country, or search for the address.</Text>
          ) : null}
          <Text className="font-inter text-xs text-ink-muted">Add its fields, courts and other facilities from the site's page once it is created.</Text>
        </>
      ) : null}
      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Edit location
 * --------------------------------------------------------------------------------------------- */

/**
 * The Location card's Edit, and its Add address while the site has none: the shared address input,
 * with the facilities' pins fixed on its map so the site pin can be put where it belongs among
 * them. Saves `address` alone.
 */
export function LocationDialog({ visible, onClose, site, markers }: {
  visible: boolean;
  onClose: () => void;
  site: Site;
  markers: MapMarker[];
}) {
  const [draft, setDraft] = useState<AddressDraft | null>(() => draftOf(site));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setDraft(draftOf(site));
    setError(null);
    setOpenCount(c => c + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isDirty = JSON.stringify(draft ?? null) !== JSON.stringify(draftOf(site));

  const save = async () => {
    if (!draft) return;
    setError(null);
    setIsSaving(true);
    const result = await sendAction(SocketAction.UPDATE_SITE, { id: site.id, data: { address: addressPayload(draft) as any } }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'The address was not saved.');
    onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title={site.address ? 'Edit location' : 'Add address'}
      onClose={onClose}
      onSave={save}
      saveDisabled={!isDirty || !isAddressComplete(draft)}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <AddressInput key={openCount} value={draft} onChange={setDraft} pinTitle={site.name} pinHelp={PIN_HELP} markers={markers} />
      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Add facility / Edit facility
 * --------------------------------------------------------------------------------------------- */

interface FacilityForm {
  name: string;
  category: string;
  sportIds: string[];
  primarySportId: string | null;
  surface: string;
  latitude: number | null;
  longitude: number | null;
}

const formOf = (facility: Facility | null | undefined, site: Site): FacilityForm => ({
  name: facility?.name || '',
  category: facility?.category || 'sport_field',
  sportIds: facility?.supportedSportIds || [],
  primarySportId: facility?.primarySportId || null,
  surface: facility?.surfaceType || '',
  // A new facility's pin starts on the site's.
  latitude: facility ? facility.latitude ?? null : site.address?.latitude ?? null,
  longitude: facility ? facility.longitude ?? null : site.address?.longitude ?? null,
});

/**
 * One facility: its name, what it is, the sports played on it, its surface and its pin. Replaces
 * the two full-screen facility screens (docs/sites.md).
 *
 * A facility has no address of its own — it is a pin at its site — so it gets a map and no address
 * input: its own pin to drag, drawn with its own icon, and the site's pin fixed beside it
 * (`VENUE-3`). The starred sport is the one whose icon marks it on the map (`primarySportId`); a
 * chosen sport is starred by tapping it again. Sports and surface are for playing areas only.
 */
export function FacilityDialog({ visible, onClose, site, facility, others, sports, orgSportIds }: {
  visible: boolean;
  onClose: () => void;
  site: Site;
  /** The facility being edited; absent to add one. */
  facility?: Facility | null;
  /** The site's other facilities, shown fixed on the map. */
  others: MapMarker[];
  sports: Sport[];
  /** The sports the organisation plays — the ones offered, with any already on the facility. */
  orgSportIds?: string[];
}) {
  const isDark = useActiveTheme() === 'dark';
  const [form, setForm] = useState<FacilityForm>(() => formOf(facility, site));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm(formOf(facility, site));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, facility?.id]);

  const set = (patch: Partial<FacilityForm>) => setForm(prev => ({ ...prev, ...patch }));
  const playing = isPlayingArea(form);

  const offered = useMemo(() => {
    const ids = new Set([...(orgSportIds?.length ? orgSportIds : sports.map(s => s.id)), ...(facility?.supportedSportIds || [])]);
    return sports.filter(s => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [sports, orgSportIds, facility?.supportedSportIds]);

  /** Tap an unchosen sport to choose it, a chosen one to star it, the starred one to drop it. */
  const tapSport = (id: string) => {
    if (!form.sportIds.includes(id)) {
      // The first sport chosen is starred, so a facility with sports always has its map icon.
      set({ sportIds: [...form.sportIds, id], primarySportId: form.primarySportId || id });
    } else if (form.primarySportId !== id) {
      set({ primarySportId: id });
    } else {
      const rest = form.sportIds.filter(s => s !== id);
      set({ sportIds: rest, primarySportId: rest[0] || null });
    }
  };

  const original = formOf(facility, site);
  const isDirty = JSON.stringify(form) !== JSON.stringify(original);

  const sitePin = hasPin(site.address) ? site.address : null;
  const markers = useMemo<MapMarker[]>(
    () => sitePin
      ? [{ id: 'site', latitude: sitePin.latitude!, longitude: sitePin.longitude!, title: site.name, icon: 'location', color: themeColor(isDark, 'primary') }, ...others]
      : others,
    [sitePin?.latitude, sitePin?.longitude, site.name, others, isDark]
  );
  const pinIcon = facilityIcon({ category: form.category, primarySportId: playing ? form.primarySportId || undefined : undefined }, sports, isDark);

  const save = async () => {
    setError(null);
    setIsSaving(true);
    const data = {
      name: form.name.trim(),
      category: form.category,
      // A facility that is not a playing area keeps no sports or surface.
      supportedSportIds: playing ? form.sportIds : [],
      primarySportId: playing ? form.primarySportId : null,
      surfaceType: playing ? form.surface.trim() || null : null,
      latitude: form.latitude,
      longitude: form.longitude,
    };
    const result = facility
      ? await sendAction(SocketAction.UPDATE_FACILITY, { id: facility.id, data: data as any }, { suppressToast: true })
      : await sendAction(SocketAction.ADD_FACILITY, { ...data, siteId: site.id, isActive: true } as any, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || (facility ? 'The changes were not saved.' : 'The facility was not added.'));
    onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title={facility ? 'Edit facility' : 'Add facility'}
      onClose={onClose}
      onSave={save}
      saveLabel={facility ? 'Save' : 'Add facility'}
      saveDisabled={!form.name.trim() || (facility ? !isDirty : false)}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput
          value={form.name}
          onChangeText={name => set({ name })}
          placeholder="e.g. A field, Netball court 2, Tuck shop"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Name"
          className={TEXT_INPUT}
        />
      </View>

      <View className="gap-1.5">
        <FieldLabel label="What it is" />
        <CustomSelect
          value={form.category}
          onChange={category => set({ category })}
          options={FACILITY_CATEGORIES.map(c => ({ value: c.key, label: c.label }))}
        />
      </View>

      {playing ? (
        <>
          <View className="gap-1.5">
            <FieldLabel
              label="Sports played here"
              help="The sports this can be picked for when a game or tournament is set up. The starred one sets its icon on the map: tap a chosen sport to star it."
            />
            {offered.length ? (
              <View className="flex-row flex-wrap gap-1.5">
                {offered.map(s => {
                  const on = form.sportIds.includes(s.id);
                  const starred = on && form.primarySportId === s.id;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => tapSport(s.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={starred ? `${s.name}, marks it on the map` : s.name}
                      className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${on ? 'bg-primary-soft border-primary-line' : 'bg-card border-line'}`}
                    >
                      {starred ? <Ionicons name="star" size={12} color={themeColor(isDark, 'primary')} /> : null}
                      <Text className={`font-inter text-sm ${on ? 'font-inter-semibold text-primary-ink' : 'text-ink-soft'}`}>{s.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text className="font-inter text-sm text-ink-muted">This organisation plays no sports yet. Choose them in Settings first.</Text>
            )}
          </View>

          <View className="gap-1.5">
            <FieldLabel label="Surface" optional />
            <TextInput
              value={form.surface}
              onChangeText={surface => set({ surface })}
              placeholder="e.g. Grass, Astro, Hard court, Wooden floor"
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              accessibilityLabel="Surface"
              className={TEXT_INPUT}
            />
          </View>
        </>
      ) : null}

      <View className="gap-1.5">
        <FieldLabel label="Where it is" help="Drag the pin onto the facility, so it shows in the right place on the site's map. The site's own pin stays where it is." />
        {form.latitude != null && form.longitude != null ? (
          <AddressMap
            latitude={form.latitude}
            longitude={form.longitude}
            title={form.name || 'Facility'}
            draggable
            onPinMoved={(latitude, longitude) => set({ latitude, longitude })}
            height={200}
            markers={markers}
            pinIcon={pinIcon}
          />
        ) : sitePin ? (
          <TouchableOpacity onPress={() => set({ latitude: sitePin.latitude!, longitude: sitePin.longitude! })} accessibilityRole="button">
            <Text className="font-inter text-sm text-ink-muted">
              No pin yet. <Text className="font-inter-bold text-primary-ink">Place it on the map</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <Text className="font-inter text-sm text-ink-muted">Add the site's address first: a facility's pin is placed on the site's map.</Text>
        )}
      </View>

      {error ? <Text className="font-inter text-sm text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}
