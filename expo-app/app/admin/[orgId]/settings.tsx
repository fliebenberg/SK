import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_TIME_ZONE } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { ReadCard } from '../../../components/ReadCard';
import { ReadRow } from '../../../components/EditDialog';
import { OrgMinorsSettingsCard } from '../../../components/guardians/OrgMinorsSettingsCard';
import { OrgPrivacyCard } from '../../../components/org/OrgPrivacyCard';
import { TimezoneDialog, TimezoneNote, addressTimeZoneNote } from '../../../components/org/TimezoneDialogs';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { useOrgAccess } from '../../../hooks/useOrgAccess';
import { timeZoneLabel } from '../../../utils/dates';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';
import { PageBody } from '../../../components/PageBody';

/**
 * How the org runs (docs/org-profile.md §5): one card per setting or group of related settings,
 * each saving itself. A switch saves when flipped; anything else opens its card's dialog.
 *
 * Split from the old org settings screen on 2026-10-01 — who the org *is* moved to the Profile
 * ([profile.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/profile.tsx)). New
 * settings join this page as further cards.
 *
 * Everyone who opens the workspace sees it; only the org's admins change it, and nobody else is
 * shown an Edit link or a switch (`ORG-13`, docs/permissions.md P2 and P3).
 */
export default function OrgSettings() {
  const isDark = useActiveTheme() === 'dark';
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const safeBack = useSafeBack();
  const { width } = useWindowDimensions();
  const { org, isLoading } = useOrgSummary(orgId);
  const [editingTimezone, setEditingTimezone] = useState(false);
  const { isAdmin: isOrgAdminViewer } = useOrgAccess(orgId);

  const timezone = org?.timezone || DEFAULT_TIME_ZONE;
  const note = addressTimeZoneNote(org?.addressTimeZone, timezone);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Settings" onBack={() => safeBack(`/admin/${orgId}`)} />
      {isLoading || !org ? (
        <View className="flex-1 items-center justify-center">
          {isLoading ? <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} /> : (
            <Text className="font-inter text-sm text-ink-muted">This organisation could not be found.</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: width >= 768 ? 24 : 12, paddingBottom: 60 }}>
          <PageBody form className="gap-4">
            <OrgPrivacyCard org={org} isOrgAdmin={isOrgAdminViewer} />
            <OrgMinorsSettingsCard orgId={org.id} isOrgAdmin={isOrgAdminViewer} />

            <ReadCard
              label="Timezone"
              help="Kick-offs are entered in this time at sites without a map pin. A site with a pin uses the timezone where it is."
              onEdit={isOrgAdminViewer ? () => setEditingTimezone(true) : undefined}
            >
              <ReadRow label={timeZoneLabel(timezone)} sub={timezone} />
              {note ? <TimezoneNote text={note} /> : null}
            </ReadCard>
          </PageBody>
          <TimezoneDialog org={org} visible={editingTimezone} onClose={() => setEditingTimezone(false)} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
