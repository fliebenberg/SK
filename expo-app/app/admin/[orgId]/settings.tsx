import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_TIME_ZONE } from '@sk/shared';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { ReadCard } from '../../../components/ReadCard';
import { ReadRow } from '../../../components/EditDialog';
import { OrgMinorsSettingsCard } from '../../../components/guardians/OrgMinorsSettingsCard';
import { TimezoneDialog, TimezoneNote, addressTimeZoneNote } from '../../../components/org/TimezoneDialogs';
import { useOrgSummary } from '../../../hooks/useOrgSummary';
import { useSafeBack } from '../../../hooks/useSafeBack';
import { useAuthStore } from '../../../store/authStore';
import { timeZoneLabel } from '../../../utils/dates';
import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';

/**
 * How the org runs (docs/org-profile.md §5): one card per setting or group of related settings,
 * each saving itself. A switch saves when flipped; anything else opens its card's dialog.
 *
 * Split from the old org settings screen on 2026-10-01 — who the org *is* moved to the Profile
 * ([profile.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/profile.tsx)). New
 * settings join this page as further cards. Who may see and edit it is undecided (`ORG-13`).
 */
export default function OrgSettings() {
  const isDark = useActiveTheme() === 'dark';
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const safeBack = useSafeBack();
  const { width } = useWindowDimensions();
  const { org, isLoading } = useOrgSummary(orgId);
  const [editingTimezone, setEditingTimezone] = useState(false);
  // The minors settings are an Admin's alone — not Staff's (`MEMBER-3`).
  const isOrgAdminViewer = useAuthStore(state =>
    state.user?.globalRole === 'admin' ||
    state.orgMemberships.some((m: any) => m.orgId === orgId && m.roleId === 'role-org-admin' && !m.restrictedReason)
  );

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
          <View className="w-full gap-4 self-center" style={{ maxWidth: 720 }}>
            <OrgMinorsSettingsCard orgId={org.id} isOrgAdmin={isOrgAdminViewer} />

            <ReadCard
              label="Timezone"
              help="Kick-offs are entered in this time at sites without a map pin. A site with a pin uses the timezone where it is."
              onEdit={() => setEditingTimezone(true)}
            >
              <ReadRow label={timeZoneLabel(timezone)} sub={timezone} />
              {note ? <TimezoneNote text={note} /> : null}
            </ReadCard>
          </View>
          <TimezoneDialog org={org} visible={editingTimezone} onClose={() => setEditingTimezone(false)} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
