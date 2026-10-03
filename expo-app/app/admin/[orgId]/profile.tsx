import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Organization, SocketAction } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { ReadCard, ReadCardEmpty } from '../../../components/ReadCard';
import { OrgProfileBanner } from '../../../components/org/OrgProfileBanner';
import { IdentityDialog } from '../../../components/org/IdentityDialog';
import { AboutDialog } from '../../../components/org/AboutDialog';
import { SportsDialog } from '../../../components/org/SportsDialog';
import { AddressDialog } from '../../../components/org/AddressDialog';
import { FollowAddressTimezoneDialog } from '../../../components/org/TimezoneDialogs';
import { AddressMap } from '../../../components/address/AddressMap';
import { AddressLines } from '../../../components/address/AddressInput';
import { ImageEditor } from '../../../components/ImageEditor';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useSocketQuery } from '../../../hooks/useSocketQuery';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { sendAction } from '../../../services/actions';
import { getOrgLogoUrl } from '../../../services/assets';
import { hasPin } from '../../../services/places';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';

type Dialog = 'identity' | 'about' | 'sports' | 'address' | null;

/**
 * The org's profile: who it is and how everyone else sees it (docs/org-profile.md).
 *
 * Read-first — values as text, one card per group, each card's Edit opening its own dialog that
 * saves only its own fields (design_system.md, *Read-first record pages*). There is no form and no
 * save bar on the page itself. Everything comes from the org's summary room (`useOrgSummary`), so a
 * save anywhere — here or on another device — shows up without a refetch.
 *
 * Split from the old org settings screen on 2026-10-01; how the org *runs* (timezone, minors) is on
 * [settings.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/settings.tsx). Who may edit
 * what is undecided (`ORG-13`): everyone who reaches the workspace can, as on the old screen.
 */
export default function OrgProfile() {
  const isDark = useActiveTheme() === 'dark';
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const { org, isLoading } = useOrgSummary(orgId);
  const { data: sports } = useSocketQuery<any[]>('sports');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [isEditingLogo, setIsEditingLogo] = useState(false);
  /** The org as just saved with a new address, while asking whether the timezone should follow it. */
  const [askTimezoneFor, setAskTimezoneFor] = useState<Organization | null>(null);

  const sportNames = useMemo(() => {
    const ids = org?.supportedSportIds || [];
    return ids
      .map(id => (sports || []).find(s => s.id === id)?.name)
      .filter(Boolean)
      .sort() as string[];
  }, [org?.supportedSportIds, sports]);

  const close = () => setDialog(null);

  const applyLogo = (uri: string, config: { scale: number; x: number; y: number }) => {
    if (!org) return;
    setIsEditingLogo(false);
    sendAction(SocketAction.UPDATE_ORG, {
      id: org.id,
      data: {
        // Sent only when it changed, so moving the logo inside its frame does not re-upload it.
        ...(uri !== (org.logo || '') ? { logo: uri } : {}),
        settings: { ...(org.settings || {}), logoConfig: config },
      },
    });
  };

  const afterAddressSaved = (saved: Organization) => {
    if (saved.addressTimeZone && saved.addressTimeZone !== saved.timezone) setAskTimezoneFor(saved);
  };

  const openAddressPage = () => router.push(`/admin/${orgId}/address` as any);

  if (isLoading || !org) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Profile" onBack={() => safeBack(`/admin/${orgId}`)} />
        <View className="flex-1 items-center justify-center">
          {isLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted">This organisation could not be found.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const about = (
    <ReadCard label="About" onEdit={org.description ? () => setDialog('about') : undefined}>
      {org.description ? (
        <Text className="font-inter text-sm leading-relaxed text-ink">{org.description}</Text>
      ) : (
        <ReadCardEmpty text="No description yet. It shows on the public profile." action="Add one" onPress={() => setDialog('about')} />
      )}
    </ReadCard>
  );

  const sportsCard = (
    <ReadCard
      label="Sports"
      help="The sports this organisation plays. Teams and fixtures can only be created for these. Removing a sport deactivates its teams."
      onEdit={sportNames.length ? () => setDialog('sports') : undefined}
    >
      {sportNames.length ? (
        <View className="flex-row flex-wrap gap-2">
          {sportNames.map(name => (
            <View key={name} className="px-3 py-1 rounded-full bg-sunken border border-line">
              <Text className="font-inter-semibold text-sm text-ink-soft">{name}</Text>
            </View>
          ))}
        </View>
      ) : (
        <ReadCardEmpty text="No sports yet." action="Add sports" onPress={() => setDialog('sports')} />
      )}
    </ReadCard>
  );

  const pinned = hasPin(org.address) ? org.address : null;
  const addressCard = (
    <ReadCard label="Address" onEdit={org.address ? () => setDialog('address') : undefined}>
      {org.address ? (
        isWide ? (
          <View className="gap-2.5">
            {pinned ? (
              <View>
                <AddressMap latitude={pinned.latitude} longitude={pinned.longitude} title={org.name} interactive={false} height={130} />
                <MapOverlay onPress={openAddressPage} label="Open map" />
              </View>
            ) : null}
            <AddressLines address={org.address} />
          </View>
        ) : (
          <View className="flex-row items-start gap-3">
            <View className="flex-1 min-w-0"><AddressLines address={org.address} /></View>
            {pinned ? (
              <View style={{ width: 72, height: 72 }}>
                <AddressMap latitude={pinned.latitude} longitude={pinned.longitude} interactive={false} height={72} />
                <MapOverlay onPress={openAddressPage} />
              </View>
            ) : null}
          </View>
        )
      ) : (
        <ReadCardEmpty text="No address yet." action="Add address" onPress={() => setDialog('address')} />
      )}
    </ReadCard>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Profile" onBack={() => safeBack(`/admin/${orgId}`)} />
      <ScrollView contentContainerStyle={{ padding: isWide ? 24 : 12, paddingBottom: 60 }}>
        <View className="w-full gap-4 self-center" style={{ maxWidth: 960 }}>
          <OrgProfileBanner org={org} onEdit={() => setDialog('identity')} onEditLogo={() => setIsEditingLogo(true)} />
          {isWide ? (
            <View className="flex-row gap-4 items-start">
              <View className="gap-4" style={{ flex: 1.6 }}>{about}{sportsCard}</View>
              <View className="gap-4" style={{ flex: 1 }}>{addressCard}</View>
            </View>
          ) : (
            <View className="gap-3">{about}{addressCard}{sportsCard}</View>
          )}
        </View>
      </ScrollView>

      <IdentityDialog org={org} visible={dialog === 'identity'} onClose={close} />
      <AboutDialog org={org} visible={dialog === 'about'} onClose={close} />
      <SportsDialog org={org} visible={dialog === 'sports'} onClose={close} />
      <AddressDialog org={org} visible={dialog === 'address'} onClose={close} onSaved={afterAddressSaved} />
      <FollowAddressTimezoneDialog org={askTimezoneFor} visible={!!askTimezoneFor} onClose={() => setAskTimezoneFor(null)} />
      <ImageEditor
        visible={isEditingLogo}
        imageUri={getOrgLogoUrl(org.logo, 'large')}
        config={org.settings?.logoConfig || { scale: 1, x: 0, y: 0 }}
        title="Adjust Logo Placement"
        allowRemove
        onApply={applyLogo}
        onCancel={() => setIsEditingLogo(false)}
      />
    </SafeAreaView>
  );
}

/** A transparent layer over a map preview, so a tap anywhere on it opens the address page. */
function MapOverlay({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel="Open the address on a map" className="absolute inset-0 rounded-xl">
      {label ? (
        <View className="absolute top-2 right-2 px-2 py-1 rounded-md bg-card border border-line">
          <Text className="font-inter-bold text-xs text-primary-ink">{label} ↗</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
