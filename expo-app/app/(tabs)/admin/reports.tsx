import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';

import { formatInstantDate } from '../../../utils/dates';
import { themeColor } from '../../../constants/Colors';

export default function SystemReports() {
  const isDark = useActiveTheme() === 'dark';
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  const reportItems = [
    {
      id: 'rep-1',
      reason: 'Score Discrepancy Alert',
      description: 'Audit discrepancy detected in Rugby Union match (Cape Town RFC vs Durban Rovers). Scorers submitted mismatching scores (24-17 vs 24-20). Requires admin review.',
      createdAt: '2026-05-31T09:12:00Z',
      status: 'pending',
      entityType: 'game',
      entityId: 'game-104',
      impact: 'High',
    },
    {
      id: 'rep-2',
      reason: 'Automated Facility Audit',
      description: 'Site schedule collision flagged: Site A (Main Gym) is double-booked for Durban Rovers practices on Monday evenings.',
      createdAt: '2026-05-30T14:45:00Z',
      status: 'resolved',
      resolvedAt: '2026-05-31T08:00:00Z',
      entityType: 'facility',
      entityId: 'facility-2',
      impact: 'Medium',
    },
    {
      id: 'rep-3',
      reason: 'Coaching Roster Verification',
      description: 'A coach assignment was changed for Premier Rugby Union. Verified user with ID role-coach. Audit successful.',
      createdAt: '2026-05-29T11:20:00Z',
      status: 'resolved',
      resolvedAt: '2026-05-29T11:21:00Z',
      entityType: 'org',
      entityId: 'org-1',
      impact: 'Low',
    },
  ];

  const filteredReports = reportItems.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          <Text className="font-inter text-sm text-ink-muted">
            Monitor automated accuracy audits, dispute reports, and double-booking warning logs.
          </Text>
        </View>

        {/* METRICS ROW */}
        <View className="flex-row gap-4 mb-6">
          <GlassCard className="flex-1 border border-line p-4 items-center">
            <Text className="font-orbitron-bold text-lg text-danger-ink">1</Text>
            <Text className="font-inter text-[9px] text-ink-muted uppercase mt-1 text-center font-semibold">
              Pending Disputes
            </Text>
          </GlassCard>
          <GlassCard className="flex-1 border border-line p-4 items-center">
            <Text className="font-orbitron-bold text-lg text-success-ink">99.8%</Text>
            <Text className="font-inter text-[9px] text-ink-muted uppercase mt-1 text-center font-semibold">
              Audit Accuracy
            </Text>
          </GlassCard>
          <GlassCard className="flex-1 border border-line p-4 items-center">
            <Text className="font-orbitron-bold text-lg text-accent-ink">48h</Text>
            <Text className="font-inter text-[9px] text-ink-muted uppercase mt-1 text-center font-semibold">
              Avg Resolution
            </Text>
          </GlassCard>
        </View>

        {/* FILTER BAR */}
        <View className="flex-row bg-sunken p-1 rounded-xl border border-line-soft mb-6">
          {(['all', 'pending', 'resolved'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              className="flex-1 items-center py-2.5 rounded-lg active:opacity-90"
              style={{
                backgroundColor: filter === tab ? themeColor(isDark, 'raised') : 'transparent',
              }}
            >
              <Text 
                className="font-orbitron-bold text-[10px] uppercase tracking-wider"
                style={{
                  color: themeColor(isDark, filter === tab ? 'primary-ink' : 'ink-muted'),
                }}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* LIST OF AUDIT ITEMS */}
        <View className="gap-4">
          {filteredReports.map((report) => (
            <GlassCard 
              key={report.id} 
              className="border border-line p-5"
            >
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons 
                    name={
                      report.reason.includes('Alert') || report.reason.includes('Collision')
                        ? 'alert-circle-outline' 
                        : 'checkmark-circle-outline'
                    } 
                    size={16} 
                    color={themeColor(isDark, report.status === 'pending' ? 'danger-ink' : 'success-ink')}
                  />
                  <Text className="font-orbitron-bold text-xs text-ink uppercase tracking-wider">
                    {report.reason}
                  </Text>
                </View>
                <View 
                  className={`px-2 py-0.5 rounded-full border ${
                    report.status === 'resolved'
                      ? 'bg-success-soft border-success-line text-success-ink'
                      : 'bg-danger-soft border-danger-line text-danger-ink'
                  }`}
                >
                  <Text 
                    className="font-inter-bold text-[8px] uppercase tracking-widest"
                    style={{ color: themeColor(isDark, report.status === 'resolved' ? 'success-ink' : 'danger-ink') }}
                  >
                    {report.status}
                  </Text>
                </View>
              </View>

              <Text className="font-inter text-xs text-ink-muted leading-relaxed mb-4">
                {report.description}
              </Text>

              {/* DETAILS */}
              <View className="flex-row flex-wrap justify-between items-center pt-3 border-t border-line-soft gap-2">
                <View className="flex-row items-center gap-1 bg-sunken px-2.5 py-1 rounded-md">
                  <Ionicons name="construct-outline" size={10} color={themeColor(isDark, 'primary')} />
                  <Text className="font-mono text-[9px] text-ink-muted">
                    Impact: {report.impact} • {report.entityType.toUpperCase()}:{report.entityId}
                  </Text>
                </View>
                <Text className="font-inter text-[9px] text-ink-muted">
                  {formatInstantDate(report.createdAt)}
                </Text>
              </View>

              {report.status === 'resolved' && report.resolvedAt && (
                <View className="mt-3 flex-row items-center gap-1">
                  <Ionicons name="checkmark-done" size={12} color={themeColor(isDark, 'success')} />
                  <Text className="font-inter text-[9px] italic text-ink-muted">
                    Resolved on {formatInstantDate(report.resolvedAt)}
                  </Text>
                </View>
              )}
            </GlassCard>
          ))}

          {filteredReports.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="checkmark-circle-outline" size={48} color={themeColor(isDark, 'ink-muted')} style={{ opacity: 0.4, marginBottom: 12 }} />
              <Text className="font-orbitron-bold text-base text-ink-soft">
                All Clear!
              </Text>
              <Text className="font-inter text-xs text-ink-muted text-center mt-1">
                No system alerts match the selected filter.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
