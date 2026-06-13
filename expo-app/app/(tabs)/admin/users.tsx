import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { useActiveTheme } from '../../../store/settingsStore';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { apiService, AdminSearchUserResult, getAvatarUrl } from '../../../services/api';

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
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

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

  const fetchResults = async (searchName: string, searchEmail: string, searchId: string, targetPage: number, targetLimit: number) => {
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
        targetLimit
      );
      setUsers(paginatedRes.results);
      setTotalCount(paginatedRes.totalCount);
      setTotalPages(paginatedRes.totalPages);
      setPage(paginatedRes.page);
      setPageSize(paginatedRes.limit);
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
    
    fetchResults(nameQuery, emailQuery, idQuery, 1, pageSize);
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
    setTotalPages(0);
    setPage(1);
    setExpandedIds({});
    setHasSearched(false);
    setError(null);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || isLoading) return;
    fetchResults(activeName, activeEmail, activeId, newPage, pageSize);
  };

  const handlePageSizeChange = (newSize: number) => {
    if (newSize === pageSize || isLoading) return;
    setPageSize(newSize);
    // Fetch page 1 with the new size
    fetchResults(activeName, activeEmail, activeId, 1, newSize);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER EXPLANATION */}
        <View className="mb-6">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            Search across registered application users and organization members. Enter one or more search criteria below.
          </Text>
        </View>

        {/* SEARCH CRITERIA CARD */}
        <GlassCard className="border border-slate-200 dark:border-white/5 p-5 mb-6 shadow-sm">
          <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
            Search Filters
          </Text>

          <View className="space-y-4">
            {/* NAME INPUT */}
            <View>
              <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Name (User Name or Member Name)
              </Text>
              <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg px-3 py-2.5">
                <Ionicons name="person-outline" size={16} color="#94A3B8" />
                <TextInput
                  placeholder="e.g. Sarah Connor"
                  placeholderTextColor="#94A3B8"
                  value={nameQuery}
                  onChangeText={(val) => {
                    setNameQuery(val);
                    setError(null);
                  }}
                  className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2 outline-none"
                />
                {nameQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setNameQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* EMAIL INPUT */}
            <View>
              <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                Email (Primary or Member Linked Email)
              </Text>
              <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg px-3 py-2.5">
                <Ionicons name="mail-outline" size={16} color="#94A3B8" />
                <TextInput
                  placeholder="e.g. sarah@cyberdyne.com"
                  placeholderTextColor="#94A3B8"
                  value={emailQuery}
                  onChangeText={(val) => {
                    setEmailQuery(val);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2 outline-none"
                />
                {emailQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setEmailQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ID INPUT */}
            <View>
              <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                ID (National ID or Org Specific ID)
              </Text>
              <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg px-3 py-2.5">
                <Ionicons name="card-outline" size={16} color="#94A3B8" />
                <TextInput
                  placeholder="e.g. ID-1234 or National ID"
                  placeholderTextColor="#94A3B8"
                  value={idQuery}
                  onChangeText={(val) => {
                    setIdQuery(val);
                    setError(null);
                  }}
                  className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2 outline-none"
                />
                {idQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setIdQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#94A3B8" />
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
                className="flex-1 shadow-md shadow-brand-orange/20"
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
          <GlassCard className="border border-red-500/20 bg-red-500/5 p-4 mb-6 rounded-xl">
            <View className="flex-row items-center gap-2.5">
              <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
              <Text className="font-inter text-sm text-red-500 flex-1">{error}</Text>
            </View>
          </GlassCard>
        )}

        {/* LOADING INDICATOR */}
        {isLoading && (
          <View className="py-8 justify-center items-center">
            <ActivityIndicator size="large" color="#FF3E00" />
            <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 mt-2.5">
              Searching user database...
            </Text>
          </View>
        )}

        {/* RESULTS SECTION */}
        {hasSearched && !isLoading && (
          <>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Results ({totalCount})
              </Text>
              {totalPages > 1 && (
                <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500">
                  Page {page} of {totalPages}
                </Text>
              )}
            </View>

            {/* EMPTY STATE */}
            {users.length === 0 && (
              <GlassCard className="border border-dashed border-slate-300 dark:border-white/10 p-8 items-center justify-center rounded-2xl">
                <Ionicons name="people-outline" size={40} color="#94A3B8" />
                <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 mt-4 text-center">
                  No Users or Members Found
                </Text>
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 mt-1 text-center max-w-[240px]">
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
                  className="border border-slate-200 dark:border-white/5 shadow-sm p-4 mb-4 relative overflow-hidden"
                >
                  {/* Top Accent Strip */}
                  <View
                    className={`absolute left-0 top-0 bottom-0 w-1 ${
                      item.type === 'user' ? 'bg-cyan-500' : 'bg-amber-500'
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
                        <View className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 items-center justify-center overflow-hidden border border-slate-300 dark:border-white/10">
                          {hasImage ? (
                            <Text className="hidden">{avatarUrl}</Text>
                          ) : null}
                          <Text className="font-orbitron-bold text-xs text-slate-600 dark:text-slate-300">
                            {initials}
                          </Text>
                        </View>

                        {/* Name & Primary Email */}
                        <View className="flex-1">
                          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white leading-tight">
                            {item.name}
                          </Text>
                          <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {item.email || 'No email registered'}
                          </Text>
                        </View>
                      </View>

                      {/* Badge & Dropdown Arrow */}
                      <View className="flex-row items-center gap-2.5">
                        <View className={`px-2 py-0.5 rounded-full ${
                          item.type === 'user' ? 'bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200/50 dark:border-cyan-800/20' : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/20'
                        }`}>
                          <Text className={`font-inter-bold text-[8px] uppercase tracking-wider ${
                            item.type === 'user' ? 'text-cyan-700 dark:text-cyan-400' : 'text-amber-700 dark:text-amber-400'
                          }`}>
                            {item.type === 'user' ? 'User' : 'Member'}
                          </Text>
                        </View>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color="#94A3B8"
                        />
                      </View>
                    </View>

                    {/* Score Indicator */}
                    {item.matchScore > 0 && (
                      <View className="mt-2.5 pl-13 flex-row items-center gap-1.5">
                        <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          Match Score: {item.matchScore.toFixed(2)}
                        </Text>
                      </View>
                    )}

                    {/* Expandable details area */}
                    {isExpanded && (
                      <View className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 space-y-3 pl-1.5">
                        {/* Basic details */}
                        <View className="flex-row flex-wrap gap-x-6 gap-y-2">
                          <View>
                            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                              System ID
                            </Text>
                            <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                              {item.id}
                            </Text>
                          </View>
                          {item.type === 'user' && (
                            <View>
                              <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                Global Role
                              </Text>
                              <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300 mt-0.5 uppercase">
                                {item.globalRole || 'user'}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Linked Emails */}
                        {item.linkedEmails && item.linkedEmails.length > 0 && (
                          <View>
                            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                              Linked Emails
                            </Text>
                            <View className="flex-row flex-wrap gap-1.5">
                              {item.linkedEmails.map((emailStr, idx) => (
                                <View key={idx} className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded border border-slate-200 dark:border-white/5">
                                  <Text className="font-inter text-[10px] text-slate-600 dark:text-slate-400">
                                    {emailStr}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Organization Profiles */}
                        <View>
                          <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Organization Membership Profiles
                          </Text>
                          {item.profiles && item.profiles.length > 0 ? (
                            <View className="space-y-2.5">
                              {item.profiles.map((profile) => (
                                <View
                                  key={profile.id}
                                  className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-lg p-3"
                                >
                                  <View className="flex-row justify-between items-start mb-2">
                                    <Text className="font-orbitron-bold text-xs text-slate-700 dark:text-slate-300">
                                      {profile.orgName}
                                    </Text>
                                    <View className="bg-brand-orange/10 px-1.5 py-0.5 rounded">
                                      <Text className="font-inter-bold text-[8px] text-brand-orange uppercase tracking-wider">
                                        Profile Name: {profile.name}
                                      </Text>
                                    </View>
                                  </View>

                                  <View className="flex-row gap-6 mt-1">
                                    <View className="flex-1">
                                      <Text className="font-inter text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                        Org specific ID (Identifier)
                                      </Text>
                                      <Text className="font-inter text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                                        {profile.identifier || 'Not set'}
                                      </Text>
                                    </View>
                                    <View className="flex-1">
                                      <Text className="font-inter text-[8px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                        National ID
                                      </Text>
                                      <Text className="font-inter text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                                        {profile.nationalId || 'Not set'}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text className="font-inter text-xs italic text-slate-400 dark:text-slate-500 pl-1">
                              No organization profiles linked yet.
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                </GlassCard>
              );
            })}

            {/* PAGINATION CONTROLS BAR */}
            <GlassCard className="border border-slate-200 dark:border-white/5 p-4 mt-6 flex-col md:flex-row items-center justify-between gap-4">
              {/* PAGE SIZE SELECTOR */}
              <View className="flex-row items-center gap-2">
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Page size:</Text>
                {[50, 100, 150, 200].map((size) => (
                  <TouchableOpacity
                    key={size}
                    onPress={() => handlePageSizeChange(size)}
                    className={`px-2.5 py-1 rounded border ${
                      pageSize === size
                        ? 'bg-brand-orange border-brand-orange text-white'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${
                      pageSize === size ? 'text-white font-inter-bold' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {size}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* PAGE NAVIGATION BUTTONS */}
              {totalPages > 1 && (
                <View className="flex-row items-center gap-3">
                  <TouchableOpacity
                    onPress={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className={`p-2 rounded-lg border ${
                      page === 1
                        ? 'opacity-40 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 active:opacity-80'
                    }`}
                  >
                    <Ionicons name="chevron-back" size={16} color={isDark ? "#FFFFFF" : "#0F172A"} />
                  </TouchableOpacity>

                  <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                    Page {page} of {totalPages}
                  </Text>

                  <TouchableOpacity
                    onPress={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className={`p-2 rounded-lg border ${
                      page === totalPages
                        ? 'opacity-40 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/5'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 active:opacity-80'
                    }`}
                  >
                    <Ionicons name="chevron-forward" size={16} color={isDark ? "#FFFFFF" : "#0F172A"} />
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>
          </>
        )}
      </ScrollView>
    </View>
  );
}
