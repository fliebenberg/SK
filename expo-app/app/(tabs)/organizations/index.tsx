import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OrgDirectoryEntry, orgColors } from '@sk/shared';
import { BrandedListCard } from '../../../components/BrandedListCard';
import { GlassCard } from '../../../components/GlassCard';
import { ListPager } from '../../../components/ListPager';
import { OrgLogo } from '../../../components/OrgLogo';
import { PageBody } from '../../../components/PageBody';
import { SignInPrompt } from '../../../components/SignInPrompt';
import { AddOrgDialog } from '../../../components/org/AddOrgDialog';
import { orgTypeIcon, orgTypeLabel } from '../../../components/org/orgTypes';
import { themeColor } from '../../../constants/Colors';
import { usePagedList } from '../../../hooks/usePagedList';
import { wsService } from '../../../services/websocket';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme, useSettingsStore } from '../../../store/settingsStore';
import { inkOnBrand } from '../../../utils/colorUtils';
import { orgAccess } from '../../../utils/orgAccess';

/** The viewer's choice of My Organisations or All Organisations, remembered on this device. */
const TAB_KEY = 'organisationsDirectoryTab';

/**
 * The public Organisations tab: every organisation in one list, static and paged on the server
 * (okf/live_rooms.md). A card opens the organisation's workspace for those who run it, and otherwise
 * its public page, which offers a team duty its part of the workspace.
 */
export default function OrganizationsPage() {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const columns = width >= 1280 ? 3 : isLargeScreen ? 2 : 1;

  const { isAuthenticated, user, orgMemberships, teamMemberships, setMemberships } = useAuthStore();
  const saved = useSettingsStore(state => state.localOverrides[TAB_KEY]) as 'my' | 'all' | undefined;
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  // Until they choose, they start on their own organisations if they have any.
  const tab = isAuthenticated ? (saved ?? ((orgMemberships || []).length > 0 ? 'my' : 'all')) : 'all';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { items: orgs, total, limit, isLoading, error, isSettled, term, retry } = usePagedList<OrgDirectoryEntry>({
    type: 'org_directory', noun: 'organisations', params: { mine: tab === 'my' }, search, page,
  });

  // A new search or tab starts again from the first page.
  useEffect(() => setPage(1), [term, tab]);

  const scroller = useRef<ScrollView>(null);
  const goToPage = (next: number) => {
    setPage(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const [modalVisible, setModalVisible] = useState(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);

  const accessTo = (org: OrgDirectoryEntry) => orgAccess(org.id, user?.globalRole === 'admin', orgMemberships, teamMemberships);

  const flagsFor = (org: OrgDirectoryEntry) => {
    const access = accessTo(org);
    const flags: string[] = [];
    if (org.isPrivate) flags.push('Private');
    if (!org.isActive) flags.push('Inactive');
    // Only a role they hold there: a system admin reads as Admin everywhere, which tells them nothing.
    if (access.membership && access.role) flags.push(access.role);
    return flags;
  };

  // The new org is theirs, and setting it up is what comes next: its workspace opens (2026-10-31).
  // The list reads again when they come back to this page; their memberships are read now.
  const handleOrgCreated = (org: { id: string }) => {
    router.push(`/admin/${org.id}` as any);
    if (user?.id) {
      wsService.emit('get_data', { type: 'user_memberships', id: user.id }, (membershipRes: any) => {
        if (membershipRes) {
          setMemberships(membershipRes.orgs, membershipRes.teams);
        }
      });
    }
  };

  // The page's add action sits in its header, as on every list page — never at the end of the list.
  // A signed-out visitor sees it too, and is told to sign in, so they know it is there.
  const addButton = (
    <TouchableOpacity
      onPress={() => (isAuthenticated ? setModalVisible(true) : setSignInPromptVisible(true))}
      accessibilityRole="button"
      accessibilityLabel="Add organisation"
      className={`flex-row items-center gap-1.5 rounded-xl bg-primary ${isLargeScreen ? 'px-3.5 py-2' : 'w-9 h-9 justify-center mr-4'}`}
    >
      <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
      {isLargeScreen ? <Text className="font-inter-bold text-sm text-on-primary">Add organisation</Text> : null}
    </TouchableOpacity>
  );

  // On a phone the header is the tab navigator's, one level up from this page's stack.
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.getParent()?.setOptions({ headerRight: isLargeScreen ? undefined : () => addButton });
  }, [navigation, isAuthenticated, isLargeScreen, isDark]);

  const pager = (where: string) => (
    <View className={where === 'top' ? 'mb-3' : 'mt-3'}>
      <ListPager testID={`orgs-pager-${where}`} page={page} limit={limit} total={total} noun="organisations" onPageChange={goToPage} disabled={isLoading} />
    </View>
  );

  const message = (title: string, text: string, action?: { label: string; onPress: () => void }) => (
    <GlassCard className="border border-line p-6 items-center">
      <Ionicons name="business-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="mb-3" />
      <Text className="font-orbitron-bold text-sm text-ink-soft text-center mb-1 uppercase tracking-wide">{title}</Text>
      <Text className="font-inter text-xs text-ink-muted text-center leading-4">{text}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" className="mt-3 px-4 py-2 rounded-xl bg-primary">
          <Text className="font-inter-bold text-xs text-on-primary">{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </GlassCard>
  );

  const body = () => {
    if (error) return message('Organisations did not load', error, { label: 'Try again', onPress: retry });
    if (isLoading && !orgs.length) {
      return <View className="py-20 items-center"><Text className="font-inter text-ink-muted">Loading organisations...</Text></View>;
    }
    if (!orgs.length && !isSettled) return null;
    if (!orgs.length) {
      if (term.trim()) return message('No matching organisations', `No organisations found matching "${term.trim()}".`);
      return tab === 'my'
        ? message('No organisations yet', "You're not part of any organisations yet. Set one up with Add organisation.")
        : message('No organisations', 'There are no organisations on ScoreKeeper yet.');
    }
    return (
      <View style={{ opacity: isLoading ? 0.6 : 1 }}>
        {pager('top')}
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
          {orgs.map(org => {
            const { primary } = orgColors(org);
            const ink = inkOnBrand(primary);
            const flags = flagsFor(org);
            const type = orgTypeLabel(org.type, org.customType);
            return (
              <View key={org.id} style={{ width: `${100 / columns}%`, paddingHorizontal: 6, paddingBottom: 12 }}>
                <BrandedListCard
                  testID={`org-card-${org.id}`}
                  primaryColor={org.primaryColor}
                  secondaryColor={org.secondaryColor}
                  tertiaryColor={org.tertiaryColor}
                  title={org.name}
                  subtitle={org.town}
                  flags={flags}
                  accessibilityLabel={[org.name, org.town, type, ...flags].filter(Boolean).join(', ')}
                  onPress={() => router.push((accessTo(org).canManage ? `/admin/${org.id}` : `/organizations/${org.id}`) as any)}
                  mark={<OrgLogo logo={org.logo ?? undefined} size={44} className="border bg-logo-plate" style={{ borderColor: ink.border }} />}
                  detail={type ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name={orgTypeIcon(org.type)} size={14} color={ink.text} />
                      <Text numberOfLines={1} style={{ color: ink.text }} className="font-inter-semibold text-xs leading-4">{type}</Text>
                    </View>
                  ) : null}
                />
              </View>
            );
          })}
        </View>
        {pager('bottom')}
      </View>
    );
  };

  const tabButton = (key: 'my' | 'all', label: string) => (
    <TouchableOpacity
      onPress={() => setLocalOverride(TAB_KEY, key)}
      accessibilityRole="tab"
      accessibilityState={{ selected: tab === key }}
      className={`flex-1 pb-3 items-center border-b-2 ${tab === key ? 'border-ink' : 'border-transparent'}`}
    >
      <Text className={`font-orbitron-bold text-xs uppercase tracking-wider ${tab === key ? 'text-ink' : 'text-ink-muted'}`}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView ref={scroller} className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <PageBody>
          {isLargeScreen && (
            <View className="mb-6 flex-row items-start gap-4">
              <View className="flex-1">
                <Text className="font-orbitron-bold text-2xl tracking-widest text-ink uppercase mb-2">Organisations</Text>
                <Text className="font-inter text-sm text-ink-muted">Find an organisation and see its teams, games and results.</Text>
              </View>
              {addButton}
            </View>
          )}

          <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
            <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
            <TextInput
              placeholder="Search by name, town, type or sport..."
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              accessibilityLabel="Search organisations"
              className="flex-1 font-inter text-ink text-sm ml-2.5 outline-none"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {isAuthenticated && (
            <View className="flex-row border-b border-line mb-5">
              {tabButton('my', 'My Organisations')}
              {tabButton('all', 'All Organisations')}
            </View>
          )}

          {body()}
        </PageBody>
      </ScrollView>

      <SignInPrompt
        isOpen={signInPromptVisible}
        onClose={() => setSignInPromptVisible(false)}
        title="Sign in to add an organisation"
        description="Set up your school, club or league on ScoreKeeper, and run its teams, fixtures and results."
      />

      <AddOrgDialog
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onCreated={handleOrgCreated}
      />
    </View>
  );
}
