import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { ListPager } from '../../../components/ListPager';
import { Ionicons } from '@expo/vector-icons';
import { apiService, AdminSearchUserResult } from '../../../services/api';
import { getAvatarUrl } from '../../../services/assets';
import { themeColor } from '../../../constants/Colors';

const PAGE_SIZE = 100;

export default function UserManagement() {
  const token = useAuthStore(state => state.token);
  const isDark = useActiveTheme() === 'dark';

  // Input states (what the user is currently typing)
  const [nameQuery, setNameQuery] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [idQuery, setIdQuery] = useState('');

  // Active filters (what was actually searched)
  const [activeName, setActiveName] = useState('');
  const [activeEmail, setActiveEmail] = useState('');
  const [activeId, setActiveId] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Results & UI states
  const [users, setUsers] = useState<AdminSearchUserResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expandable list items state (keeps track of expanded user IDs)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const fetchResults = async (searchName: string, searchEmail: string, searchId: string, targetPage: number) => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const paginatedRes = await apiService.searchAdminUsers(
        token,
        searchName.trim(),
        searchEmail.trim(),
        searchId.trim(),
        targetPage,
        PAGE_SIZE
      );
      setUsers(paginatedRes.results);
      setTotalCount(paginatedRes.totalCount);
      setPage(paginatedRes.page);
      setHasSearched(true);
    } catch (err: any) {
      console.error('[UserManagement] Search failed:', err);
      setError(err.message || 'Failed to retrieve users.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    if (!nameQuery.trim() && !emailQuery.trim() && !idQuery.trim()) {
      setError('Please enter at least one search criteria.');
      return;
    }
    // Capture the inputs as active search filters
    setActiveName(nameQuery);
    setActiveEmail(emailQuery);
    setActiveId(idQuery);
    setExpandedIds({});
    
    fetchResults(nameQuery, emailQuery, idQuery, 1);
  };

  const handleClear = () => {
    setNameQuery('');
    setEmailQuery('');
    setIdQuery('');
    setActiveName('');
    setActiveEmail('');
    setActiveId('');
    setUsers([]);
    setTotalCount(0);
    setPage(1);
    setExpandedIds({});
    setHasSearched(false);
    setError(null);
  };

  const handlePageChange = (newPage: number) => {
    if (isLoading) return;
    fetchResults(activeName, activeEmail, activeId, newPage);
  };

  const pager = (where: string) => (
    <View className={where === 'top' ? 'mb-4' : 'mt-2'}>
      <ListPager testID={`users-pager-${where}`} page={page} limit={PAGE_SIZE} total={totalCount} noun="results" onPageChange={handlePageChange} disabled={isLoading} />
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER EXPLANATION */}
        <View className="mb-6">
          <Text className="font-inter text-sm text-ink-muted">
            Search across registered application users and organisation members. Enter one or more search criteria below.
          </Text>
        </View>

        {/* SEARCH CRITERIA CARD */}
        <GlassCard className="border border-line p-5 mb-6 shadow-sm">
          <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">
            Search Filters
          </Text>

          <View className="gap-4">
            {/* NAME INPUT */}
            <View>
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase tracking-wider mb-1.5">
                Name (User Name or Member Name)
              </Text>
              <View className="flex-row items-center bg-card border border-line rounded-lg px-3 py-2.5">
                <Ionicons name="person-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
                <TextInput
                  placeholder="e.g. Sarah Connor"
                  placeholderTextColor={themeColor(isDark, 'ink-muted')}
                  value={nameQuery}
                  onChangeText={(val) => {
                    setNameQuery(val);
                    setError(null);
                  }}
                  className="flex-1 font-inter text-ink text-sm ml-2 outline-none"
                />
                {nameQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setNameQuery('')}>
                    <Ionicons name="close-circle" size={16} color={themeColor(isDark, 'ink-muted')} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* EMAIL INPUT */}
            <View>
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase tracking-wider mb-1.5">
                Email (Primary or Member Linked Email)
              </Text>
              <View className="flex-row items-center bg-card border border-line rounded-lg px-3 py-2.5">
                <Ionicons name="mail-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
                <TextInput
                  placeholder="e.g. sarah@cyberdyne.com"
                  placeholderTextColor={themeColor(isDark, 'ink-muted')}
                  value={emailQuery}
                  onChangeText={(val) => {
                    setEmailQuery(val);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="flex-1 font-inter text-ink text-sm ml-2 outline-none"
                />
                {emailQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setEmailQuery('')}>
                    <Ionicons name="close-circle" size={16} color={themeColor(isDark, 'ink-muted')} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ID INPUT */}
            <View>
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase tracking-wider mb-1.5">
                ID (National ID or Org Specific ID)
              </Text>
              <View className="flex-row items-center bg-card border border-line rounded-lg px-3 py-2.5">
                <Ionicons name="card-outline" size={16} color={themeColor(isDark, 'ink-muted')} />
                <TextInput
                  placeholder="e.g. ID-1234 or National ID"
                  placeholderTextColor={themeColor(isDark, 'ink-muted')}
                  value={idQuery}
                  onChangeText={(val) => {
                    setIdQuery(val);
                    setError(null);
                  }}
                  className="flex-1 font-inter text-ink text-sm ml-2 outline-none"
                />
                {idQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setIdQuery('')}>
                    <Ionicons name="close-circle" size={16} color={themeColor(isDark, 'ink-muted')} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* BUTTONS CONTAINER */}
            <View className="flex-row gap-3 pt-2">
              <Button
                title="Search"
                variant="primary"
                onPress={handleSearch}
                className="flex-1 shadow-md shadow-primary/20"
                isLoading={isLoading}
              />
              <Button
                title="Clear"
                variant="ghost"
                onPress={handleClear}
                className="flex-1"
                disabled={isLoading}
              />
            </View>
          </View>
        </GlassCard>

        {/* ERROR STATE */}
        {error && (
          <GlassCard className="border border-danger-line bg-danger-soft p-4 mb-6 rounded-xl">
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="alert-circle-outline" size={20} color={themeColor(isDark, 'danger')} />
              <Text className="font-inter text-sm text-danger-ink flex-1">{error}</Text>
            </View>
          </GlassCard>
        )}

        {/* LOADING INDICATOR */}
        {isLoading && (
          <View className="py-8 justify-center items-center">
            <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
            <Text className="font-inter text-xs text-ink-muted mt-2.5">
              Searching user database...
            </Text>
          </View>
        )}

        {/* RESULTS SECTION */}
        {hasSearched && !isLoading && (
          <>
            <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">
              Results ({totalCount})
            </Text>
            {pager('top')}

            {/* EMPTY STATE */}
            {users.length === 0 && (
              <GlassCard className="border border-dashed border-line-strong p-8 items-center justify-center rounded-2xl">
                <Ionicons name="people-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
                <Text className="font-orbitron-bold text-base text-ink-soft mt-4 text-center">
                  No Users or Members Found
                </Text>
                <Text className="font-inter text-xs text-ink-muted mt-1 text-center max-w-[240px]">
                  No matching entries met your criteria. Adjust your filters and try again.
                </Text>
              </GlassCard>
            )}

            {/* RESULTS LIST */}
            {users.map((item) => {
              const isExpanded = !!expandedIds[item.id];
              const hasImage = !!item.image;
              const avatarUrl = hasImage ? getAvatarUrl(item.image || undefined) : '';
              const initials = item.name ? item.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '?';

              return (
                <GlassCard
                  key={`${item.type}-${item.id}`}
                  className="border border-line shadow-sm p-4 mb-4 relative overflow-hidden"
                >
                  {/* Top Accent Strip */}
                  <View
                    className={`absolute left-0 top-0 bottom-0 w-1 ${
                      item.type === 'user' ? 'bg-accent' : 'bg-warning'
                    }`}
                  />

                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => toggleExpand(item.id)}
                    className="pl-1.5"
                  >
                    {/* Header Information */}
                    <View className="flex-row items-center justify-between gap-3">
                      <View className="flex-row items-center gap-3 flex-1">
                        {/* Avatar / Placeholder */}
                        <View className="w-10 h-10 rounded-full bg-line items-center justify-center overflow-hidden border border-line-strong">
                          {hasImage ? (
                            <Text className="hidden">{avatarUrl}</Text>
                          ) : null}
                          <Text className="font-orbitron-bold text-xs text-ink-soft">
                            {initials}
                          </Text>
                        </View>

                        {/* Name & Primary Email */}
                        <View className="flex-1">
                          <Text className="font-orbitron-bold text-sm text-ink leading-tight">
                            {item.name}
                          </Text>
                          <Text className="font-inter text-[11px] text-ink-muted mt-0.5">
                            {item.email || 'No email registered'}
                          </Text>
                        </View>
                      </View>

                      {/* Badge & Dropdown Arrow */}
                      <View className="flex-row items-center gap-2.5">
                        <View className={`px-2 py-0.5 rounded-full ${
                          item.type === 'user' ? 'bg-accent-soft border border-accent-line' : 'bg-warning-soft border border-warning-line'
                        }`}>
                          <Text className={`font-inter-bold text-[8px] uppercase tracking-wider ${
                            item.type === 'user' ? 'text-accent-ink' : 'text-warning-ink'
                          }`}>
                            {item.type === 'user' ? 'User' : 'Member'}
                          </Text>
                        </View>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={themeColor(isDark, 'ink-muted')}
                        />
                      </View>
                    </View>

                    {/* Score Indicator */}
                    {item.matchScore > 0 && (
                      <View className="mt-2.5 pl-13 flex-row items-center gap-1.5">
                        <View className="w-1.5 h-1.5 rounded-full bg-success" />
                        <Text className="font-inter text-[9px] text-ink-muted uppercase tracking-wider">
                          Match Score: {item.matchScore.toFixed(2)}
                        </Text>
                      </View>
                    )}

                    {/* Expandable details area */}
                    {isExpanded && (
                      <View className="mt-4 pt-4 border-t border-line-soft gap-3 pl-1.5">
                        {/* Basic details */}
                        <View className="flex-row flex-wrap gap-x-6 gap-y-2">
                          <View>
                            <Text className="font-inter text-[9px] text-ink-muted uppercase tracking-wider">
                              System ID
                            </Text>
                            <Text className="font-orbitron-bold text-xs text-ink-soft mt-0.5">
                              {item.id}
                            </Text>
                          </View>
                          {item.type === 'user' && (
                            <View>
                              <Text className="font-inter text-[9px] text-ink-muted uppercase tracking-wider">
                                Global Role
                              </Text>
                              <Text className="font-orbitron-bold text-xs text-ink-soft mt-0.5 uppercase">
                                {item.globalRole || 'user'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Linked Emails */}
                        {item.linkedEmails && item.linkedEmails.length > 0 && (
                          <View>
                            <Text className="font-inter text-[9px] text-ink-muted uppercase tracking-wider mb-1">
                              Linked Emails
                            </Text>
                            <View className="flex-row flex-wrap gap-1.5">
                              {item.linkedEmails.map((emailStr, idx) => (
                                <View key={idx} className="bg-sunken px-2 py-0.5 rounded border border-line">
                                  <Text className="font-inter text-[10px] text-ink-muted">
                                    {emailStr}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Organization Profiles */}
                        <View>
                          <Text className="font-inter-bold text-[10px] text-ink-muted uppercase tracking-wider mb-2">
                            Organisation Membership Profiles
                          </Text>
                          {item.profiles && item.profiles.length > 0 ? (
                            <View className="gap-2.5">
                              {item.profiles.map((profile) => (
                                <View
                                  key={profile.id}
                                  className="bg-sunken border border-line rounded-lg p-3"
                                >
                                  <View className="flex-row justify-between items-start mb-2">
                                    <Text className="font-orbitron-bold text-xs text-ink-soft">
                                      {profile.orgName}
                                    </Text>
                                    <View className="bg-primary-soft px-1.5 py-0.5 rounded">
                                      <Text className="font-inter-bold text-[8px] text-primary-ink uppercase tracking-wider">
                                        Profile Name: {profile.name}
                                      </Text>
                                    </View>
                                  </View>

                                  <View className="flex-row gap-6 mt-1">
                                    <View className="flex-1">
                                      <Text className="font-inter text-[8px] text-ink-muted uppercase tracking-wider">
                                        Org specific ID (Identifier)
                                      </Text>
                                      <Text className="font-inter text-[11px] text-ink-muted mt-0.5">
                                        {profile.identifier || 'Not set'}
                                      </Text>
                                    </View>
                                    <View className="flex-1">
                                      <Text className="font-inter text-[8px] text-ink-muted uppercase tracking-wider">
                                        National ID
                                      </Text>
                                      <Text className="font-inter text-[11px] text-ink-muted mt-0.5">
                                        {profile.nationalId || 'Not set'}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text className="font-inter text-xs italic text-ink-muted pl-1">
                              No organisation profiles linked yet.
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                </GlassCard>
              );
            })}

            {pager('bottom')}
          </>
        )}
      </ScrollView>
    </View>
  );
}
