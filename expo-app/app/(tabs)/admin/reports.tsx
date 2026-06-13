import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { GlassCard } from '../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../store/settingsStore';

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
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* HEADER SECTION */}
        <View className="mb-6">
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            Monitor automated accuracy audits, dispute reports, and double-booking warning logs.
          </Text>
        </View>

        {/* METRICS ROW */}
        <View className="flex-row gap-4 mb-6">
          <GlassCard className="flex-1 border border-slate-200 dark:border-white/5 p-4 items-center">
            <Text className="font-orbitron-bold text-lg text-rose-500">1</Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase mt-1 text-center font-semibold">
              Pending Disputes
            </Text>
          </GlassCard>
          <GlassCard className="flex-1 border border-slate-200 dark:border-white/5 p-4 items-center">
            <Text className="font-orbitron-bold text-lg text-emerald-500">99.8%</Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase mt-1 text-center font-semibold">
              Audit Accuracy
            </Text>
          </GlassCard>
          <GlassCard className="flex-1 border border-slate-200 dark:border-white/5 p-4 items-center">
            <Text className="font-orbitron-bold text-lg text-cyan-500">48h</Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 uppercase mt-1 text-center font-semibold">
              Avg Resolution
            </Text>
          </GlassCard>
        </View>

        {/* FILTER TABS */}
        <View className="flex-row bg-slate-200/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-1 mb-6">
          {(['all', 'pending', 'resolved'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setFilter(tab)}
              className={`flex-1 items-center py-2.5 rounded-lg active:opacity-90 ${
                filter === tab ? 'bg-white dark:bg-slate-800 shadow-sm' : ''
              }`}
            >
              <Text 
                className={`font-orbitron-bold text-[10px] uppercase tracking-wider ${
                  filter === tab 
                    ? 'text-brand-orange' 
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* LIST OF AUDIT ITEMS */}
        <View className="space-y-4">
          {filteredReports.map((report) => (
            <GlassCard 
              key={report.id} 
              className="border border-slate-200 dark:border-white/5 p-5"
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
                    color={
                      report.status === 'pending'
                        ? '#EF4444' 
                        : '#10B981'
                    } 
                  />
                  <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider">
                    {report.reason}
                  </Text>
                </View>
                <View 
                  className={`px-2 py-0.5 rounded-full border ${
                    report.status === 'resolved'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                  }`}
                >
                  <Text 
                    className="font-inter-bold text-[8px] uppercase tracking-widest"
                    style={{ color: report.status === 'resolved' ? '#10B981' : '#EF4444' }}
                  >
                    {report.status}
                  </Text>
                </View>
              </View>

              <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                {report.description}
              </Text>

              {/* DETAILS */}
              <View className="flex-row flex-wrap justify-between items-center pt-3 border-t border-slate-100 dark:border-white/5 gap-2">
                <View className="flex-row items-center gap-1 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-md">
                  <Ionicons name="construct-outline" size={10} color="#FF3E00" />
                  <Text className="font-mono text-[9px] text-slate-500 dark:text-slate-400">
                    Impact: {report.impact} • {report.entityType.toUpperCase()}:{report.entityId}
                  </Text>
                </View>
                <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500">
                  {new Date(report.createdAt).toLocaleDateString()}
                </Text>
              </View>

              {report.status === 'resolved' && report.resolvedAt && (
                <View className="mt-3 flex-row items-center gap-1">
                  <Ionicons name="checkmark-done" size={12} color="#10B981" />
                  <Text className="font-inter text-[9px] italic text-slate-400 dark:text-slate-500">
                    Resolved on {new Date(report.resolvedAt).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </GlassCard>
          ))}

          {filteredReports.length === 0 && (
            <View className="items-center justify-center py-12">
              <Ionicons name="checkmark-circle-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
              <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">
                All Clear!
              </Text>
              <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
                No system alerts match the selected filter.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
