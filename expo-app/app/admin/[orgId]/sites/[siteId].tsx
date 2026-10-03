import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { wsService } from '../../../../services/websocket';
import { sendAction } from '../../../../services/actions';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, Site, Facility, reseedDecision } from '@sk/shared';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { useUnsavedChanges } from '../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../store/unsavedChangesStore';
import { AddressInput, isAddressComplete } from '../../../../components/address/AddressInput';
import { facilityIcon, facilityMarkers } from '../../../../components/address/facilityMarker';
import { AddressDraft } from '../../../../services/places';

/** What the site form edits. `address` is `null` for a site with none yet. */
interface SiteForm {
  name: string;
  isActive: boolean;
  address: AddressDraft | null;
}

const EMPTY_FORM: SiteForm = { name: '', isActive: true, address: null };

const ADDRESS_FIELDS = ['fullAddress', 'building', 'addressLine1', 'addressLine2', 'city', 'province', 'postalCode', 'country'] as const;

/**
 * Equality over the form, and it has to name the address fields rather than compare the object:
 * the address arrives as a fresh object on every read, and a blank field may come back as `null`
 * or `''`. Drives both the save bar and the reseed (`UI-19`).
 */
const sameSiteForm = (a: SiteForm, b: SiteForm) =>
  a.name.trim() === b.name.trim() &&
  a.isActive === b.isActive &&
  !a.address === !b.address &&
  ADDRESS_FIELDS.every(f => (a.address?.[f] || '') === (b.address?.[f] || '')) &&
  (a.address?.latitude ?? null) === (b.address?.latitude ?? null) &&
  (a.address?.longitude ?? null) === (b.address?.longitude ?? null);

const draftOf = (site: Site): AddressDraft | null => {
  if (!site.address) return null;
  const { id: _id, ...rest } = site.address;
  return rest;
};

export default function SiteDetailScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, siteId } = useLocalSearchParams<{ orgId: string, siteId: string }>();
  const isNew = siteId === 'new';
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Loading States
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [facilityToDelete, setFacilityToDelete] = useState<Facility | null>(null);
  const [facilityDeleteError, setFacilityDeleteError] = useState<string | null>(null);

  // Data State
  const { data: sitesData, isLoading: isSitesLoading, setData: setSitesData } = useSocketQuery<Site[]>('sites', { orgId });
  const { data: sportsData } = useSocketQuery<any[]>('sports');

  const sports = sportsData || [];

  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const [siteForm, setSiteForm] = useState<SiteForm>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<SiteForm | null>(isNew ? EMPTY_FORM : null);
  // Remounts the address input whenever the form is reset under it, so it reopens showing the
  // address rather than staying in whatever search or edit it was left in.
  const [addressKey, setAddressKey] = useState(0);

  const hasChanges = useMemo(
    () => (originalData ? !sameSiteForm(siteForm, originalData) : false),
    [siteForm, originalData]
  );

  const siteFacilities = useMemo(
    () => (editingSite ? facilities.filter(f => f.siteId === editingSite.id) : []),
    [facilities, editingSite]
  );
  const markers = useMemo(() => facilityMarkers(siteFacilities, sports), [siteFacilities, sports]);

  const safeGoBack = useCallback(() => {
    safeBack(`/admin/${orgId}/sites`);
  }, [safeBack, orgId]);

  const handleCancel = useCallback(() => {
    if (isNew) {
      safeGoBack();
    } else if (originalData) {
      setSiteForm(originalData);
      setAddressKey(k => k + 1);
    }
  }, [isNew, originalData, safeGoBack]);

  useUnsavedChanges(hasChanges && !isProcessing, handleCancel);

  // Reactively populate editing site and form when sitesData loads
  useEffect(() => {
    if (sitesData && !isNew) {
      const site = sitesData.find(s => s.id === siteId);
      if (site) {
        setEditingSite(site);
        /*
          `UI-19`. The form and its baseline move together or not at all.

          They used to move separately: `setSiteForm` kept what had been typed, while
          `setOriginalData` took the incoming values unconditionally. That does not lose the
          typing, which is what made it hard to see — it corrupts the *comparison*. `hasChanges`
          then measured an edit in progress against somebody else's values, so a remote change that
          happened to match what was being typed dropped the save bar over work that was never
          saved, and Cancel restored to a version the organiser had never seen.
        */
        const incoming: SiteForm = {
          name: site.name,
          isActive: site.isActive !== false,
          address: draftOf(site),
        };
        const decision = reseedDecision({
          baseline: originalData,
          drafts: siteForm,
          incoming,
          same: sameSiteForm,
        });
        if (decision === 'adopt') {
          setSiteForm(incoming);
          setOriginalData(incoming);
          setAddressKey(k => k + 1);
        }
        setIsProcessing(false);
      } else {
        Alert.alert('Error', 'Site not found');
        safeGoBack();
      }
    }
  }, [sitesData, siteId, isNew, editingSite, safeGoBack]);

  // Subscribe to updates for Sites & Facilities rooms
  useEffect(() => {
    if (!isConnected || !orgId) return;

    const sitesRoom = `org:${orgId}:sites`;
    const facilitiesRoom = `org:${orgId}:facilities`;

    const handleUpdate = (event: any) => {
      if (!event) return;

      if (!isNew && (event.type === 'SITES_SYNC' || event.type === 'SITE_ADDED' || event.type === 'SITE_UPDATED' || event.type === 'SITE_DELETED')) {
        if (event.type === 'SITES_SYNC' && Array.isArray(event.data)) {
          setSitesData(event.data);
        } else if (event.type === 'SITE_ADDED') {
          setSitesData(prev => prev ? [...prev, event.data] : [event.data]);
        } else if (event.type === 'SITE_UPDATED') {
          setSitesData(prev => prev ? prev.map(s => s.id === event.data.id ? event.data : s) : [event.data]);
        } else if (event.type === 'SITE_DELETED') {
          setSitesData(prev => prev ? prev.filter(s => s.id !== event.data.id) : []);
        }
      }
      
      if (event.type === 'FACILITIES_SYNC' || event.type === 'FACILITY_ADDED' || event.type === 'FACILITY_UPDATED' || event.type === 'FACILITY_DELETED') {
        if (event.type === 'FACILITIES_SYNC' && Array.isArray(event.data)) {
          setFacilities(event.data);
        } else if (event.type === 'FACILITY_ADDED') {
          setFacilities(prev => [...prev, event.data]);
        } else if (event.type === 'FACILITY_UPDATED') {
          setFacilities(prev => prev.map(f => f.id === event.data.id ? event.data : f));
        } else if (event.type === 'FACILITY_DELETED') {
          setFacilities(prev => prev.filter(f => f.id !== event.data.id));
        }
      }
    };

    // Listen first, then hold both rooms with the reducer as their replay handler — a room either
    // of them already holds pushed its state to whoever joined first (`LIVE-9`). The raw
    // `join_room` that used to force a re-push here bypassed the ledger's count (`LIVE-17`).
    wsService.on('update', handleUpdate);
    const unsubscribeSites = wsService.subscribeToRoom(sitesRoom, handleUpdate);
    const unsubscribeFacilities = wsService.subscribeToRoom(facilitiesRoom, handleUpdate);

    return () => {
      unsubscribeSites();
      unsubscribeFacilities();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, isNew, setSitesData]);

  const isLoading = !isNew && (isSitesLoading || !sportsData || !editingSite);

  // Resolve Sport-Specific Facility Term
  const getFacilityTerm = (supportedSportIds?: string[]) => {
    if (!supportedSportIds || supportedSportIds.length === 0) return 'Facility';
    if (supportedSportIds.length === 1) {
      const sport = sports.find(s => s.id === supportedSportIds[0]);
      return sport?.facilityTerm || 'Facility';
    }
    const terms = supportedSportIds
      .map(id => sports.find(s => s.id === id)?.facilityTerm)
      .filter(Boolean) as string[];
    const uniqueTerms = Array.from(new Set(terms));
    if (uniqueTerms.length === 1) return uniqueTerms[0];
    return 'Field/Court';
  };

  // Save Site Details
  const handleSaveSite = () => {
    if (!siteForm.name.trim()) {
      Alert.alert('Validation Error', 'Site Name is required');
      return;
    }
    if (siteForm.address && !isAddressComplete(siteForm.address)) {
      Alert.alert('Address incomplete', 'Add at least the street, the town and the country, or search for the address.');
      return;
    }
    setIsProcessing(true);

    const address = siteForm.address
      ? {
          ...siteForm.address,
          // A hand-typed address with no pin sends nulls, so an old pin does not survive the edit.
          latitude: siteForm.address.latitude ?? null,
          longitude: siteForm.address.longitude ?? null,
        }
      : undefined;
    const payload = {
      name: siteForm.name,
      isActive: siteForm.isActive,
      address: address as any,
    };

    if (editingSite) {
      sendAction(SocketAction.UPDATE_SITE, { id: editingSite.id, data: payload }).then(result => {
        setIsProcessing(false);
        if (result.ok) {
          setOriginalData({ ...siteForm, name: siteForm.name.trim() });
          useUnsavedChangesStore.getState().clear();
        } else {
          Alert.alert('Save Failed', result.message || 'Could not update site');
        }
      });
    } else {
      sendAction(SocketAction.ADD_SITE, { ...payload, orgId }).then(result => {
        if (result.ok) {
          useUnsavedChangesStore.getState().clear();
          router.replace({
            pathname: '/admin/[orgId]/sites/[siteId]',
            params: { orgId: orgId!, siteId: result.data.id }
          });
        } else {
          setIsProcessing(false);
          Alert.alert('Save Failed', result.message || 'Could not create site');
        }
      });
    }
  };

  // Delete Site
  const handleDeleteSite = () => {
    if (!editingSite) return;
    setIsProcessing(true);
    setDeleteError(null);
    // Shown inline in the confirmation modal, so no toast.
    sendAction(SocketAction.DELETE_SITE, { id: editingSite.id }, { suppressToast: true }).then(result => {
      setIsProcessing(false);
      if (result.ok) {
        setIsDeleteModalOpen(false);
        router.replace(`/admin/${orgId}/sites` as any);
      } else {
        setDeleteError(result.message || 'Site is currently linked to events or games and cannot be deleted.');
      }
    });
  };

  // Open Facility Editor
  const handleOpenFacilityModal = (facility: Facility | null) => {
    if (facility) {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]',
        params: { orgId: orgId!, siteId: siteId!, facilityId: facility.id }
      });
    } else {
      router.push({
        pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]',
        params: { orgId: orgId!, siteId: siteId!, facilityId: 'new' }
      });
    }
  };

  // Delete Facility Confirmation
  const handleDeleteFacility = (facility: Facility) => {
    setFacilityToDelete(facility);
    setFacilityDeleteError(null);
  };

  const confirmDeleteFacility = () => {
    if (!facilityToDelete) return;
    setIsProcessing(true);
    setFacilityDeleteError(null);
    // Shown inline in the confirmation modal, so no toast.
    sendAction(SocketAction.DELETE_FACILITY, { id: facilityToDelete.id }, { suppressToast: true }).then(result => {
      setIsProcessing(false);
      if (result.ok) {
        setFacilityToDelete(null);
      } else {
        setFacilityDeleteError(result.message || 'Facility is used in games and cannot be deleted.');
      }
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeGoBack()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          {isNew ? 'Add New Site' : 'Edit Site Details'}
        </Text>
        <View className="w-8" />
      </View>

      {/* BODY CONTENT */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
          <Text className="font-orbitron text-xs text-slate-500 dark:text-slate-400 mt-3">Loading site details...</Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          className="flex-1 px-6 py-6"
          contentContainerStyle={{ paddingBottom: hasChanges ? 140 : 60 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="space-y-4">
            {/* Site Name */}
            <View>
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Site Name
              </Text>
              <TextInput
                value={siteForm.name}
                onChangeText={(val) => setSiteForm(prev => ({ ...prev, name: val }))}
                placeholder="e.g. Melkbos High Sports Grounds"
                placeholderTextColor="#94A3B8"
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
              />
            </View>

            {/* Address */}
            <View className="border-t border-slate-200/50 dark:border-white/5 pt-4">
              <AddressInput
                key={addressKey}
                value={siteForm.address}
                onChange={address => setSiteForm(prev => ({ ...prev, address }))}
                pinTitle={siteForm.name || 'Site location'}
                pinHelp="Drag the pin to the main entrance. The pin also sets the site's timezone, which kick-offs here are shown in."
                markers={markers}
              />
            </View>

            {/* FACILITIES SECTION (ONLY WHEN EDITING EXISTING SITE) */}
            {editingSite && (
              <View className="border-t border-slate-200/50 dark:border-white/5 pt-6">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Facilities ({siteFacilities.length})
                  </Text>
                  <TouchableOpacity 
                    onPress={() => handleOpenFacilityModal(null)}
                    className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-3 py-1.5 rounded-lg"
                  >
                    <Ionicons name="add" size={12} color="#FF3E00" />
                    <Text className="text-[10px] font-bold text-brand-orange uppercase">Add Facility</Text>
                  </TouchableOpacity>
                </View>

                {/* Facilities Table list */}
                <View className="border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                  {siteFacilities.length === 0 ? (
                    <View className="p-6 items-center justify-center">
                      <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 italic">No facilities added yet.</Text>
                    </View>
                  ) : (
                    siteFacilities.map((fac) => {
                      const term = getFacilityTerm(fac.supportedSportIds);
                      const activeSports = fac.supportedSportIds?.map(id => sports.find(s => s.id === id)?.name).filter(Boolean).join(', ') || 'None';
                      return (
                        <TouchableOpacity 
                          key={fac.id}
                          onPress={() => handleOpenFacilityModal(fac)}
                          activeOpacity={0.85}
                          className="flex-row justify-between items-center px-4 py-3 border-b border-slate-200/30 dark:border-white/5"
                        >
                          <View className="flex-1 mr-4">
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              <Ionicons name={facilityIcon(fac, sports).icon as any} size={12} color="#FF3E00" />
                              <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">{fac.name}</Text>
                              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 italic">({term})</Text>
                              {fac.isActive === false && (
                                <View className="bg-slate-200 dark:bg-slate-800 px-1 py-0.2 rounded">
                                  <Text className="text-[6px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Inactive</Text>
                                </View>
                              )}
                            </View>
                            <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Sports: {activeSports}
                            </Text>
                          </View>

                          <View className="flex-row gap-2">
                            <TouchableOpacity 
                              onPress={(e: any) => {
                                if (e && e.stopPropagation) e.stopPropagation();
                                router.push({
                                  pathname: '/admin/[orgId]/sites/[siteId]/facilities/[facilityId]/view',
                                  params: { orgId: orgId!, siteId: siteId!, facilityId: fac.id }
                                });
                              }}
                              className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 items-center justify-center active:opacity-85"
                            >
                              <Ionicons name="eye-outline" size={13} color={isDark ? "#E2E8F0" : "#475569"} />
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* Danger Zone */}
            {editingSite && (
              <View className="border-t border-red-500/20 pt-6 mt-6">
                <Text className="font-orbitron-bold text-[9px] text-red-500/80 uppercase tracking-widest mb-3">
                  Danger Zone
                </Text>
                <View className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 flex-row items-center justify-between">
                  <View className="flex-1 mr-4">
                    <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Site</Text>
                    <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Permanently delete this site and all associated facilities. This action is irreversible.
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setIsDeleteModalOpen(true); setDeleteError(null); }}
                    className="bg-red-500 px-4 py-2.5 rounded-xl items-center justify-center active:opacity-85"
                  >
                    <Text className="font-inter-bold text-xs text-white uppercase tracking-wider">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </ScrollView>
      )}

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              {isNew ? "New Site" : "Unsaved Changes"}
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              {isNew ? "You are creating a new site." : "You have modified this site's details."}
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isProcessing}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveSite}
              disabled={isProcessing}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
                    {isNew ? "Create" : "Save"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Site?"
        description={
          editingSite 
            ? `Are you sure you want to delete "${editingSite.name}"? This will permanently delete all associated facilities.${deleteError ? '\n\nError: ' + deleteError : ''}` 
            : ''
        }
        onConfirm={handleDeleteSite}
        confirmText={isProcessing ? 'Deleting...' : 'Delete'}
        variant="danger"
        isProcessing={isProcessing}
      />

      {/* DELETE FACILITY CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={facilityToDelete !== null}
        onClose={() => setFacilityToDelete(null)}
        title="Delete Facility"
        description={
          facilityToDelete 
            ? `Are you sure you want to delete "${facilityToDelete.name}"? This action cannot be undone.${facilityDeleteError ? '\n\nError: ' + facilityDeleteError : ''}` 
            : ''
        }
        onConfirm={confirmDeleteFacility}
        confirmText={isProcessing ? 'Deleting...' : 'Delete'}
        variant="danger"
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
