import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Pressable, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { useAuthStore } from '../store/authStore';
import { useActiveTheme } from '../store/settingsStore';
import { wsService } from '../services/websocket';
import { SocketAction } from '@sk/shared';
import { getThemeColor } from '../constants';

interface NominationModalProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  onSuccess?: () => void;
}

export function NominationModal({ visible, onClose, orgId, orgName, onSuccess }: NominationModalProps) {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { user } = useAuthStore();
  const placeholderColor = isDark ? '#94A3B8' : '#64748B';

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleNominate = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!user?.id) {
      Alert.alert('Authentication Required', 'You must be logged in to nominate an administrator.');
      return;
    }

    setSubmitting(true);
    
    wsService.emit('action', {
      type: 'REFER_ORG_CONTACT',
      payload: { 
        orgId, 
        contactEmails: [email.trim().toLowerCase()], 
        referredByUserId: user.id 
      }
    }, (res: any) => {
      setSubmitting(false);
      if (res && res.error) {
        Alert.alert('Nomination Error', res.error || 'Failed to submit nomination invitation.');
      } else {
        setSuccess(true);
        if (onSuccess) onSuccess();
      }
    });
  };

  const handleClose = () => {
    setEmail('');
    setSuccess(false);
    onClose();
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <Pressable 
        className="flex-1 justify-center items-center bg-black/60 p-4"
        onPress={handleClose}
      >
        <Pressable 
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-lg border border-slate-200/50 dark:border-slate-800/50"
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView bounces={false} contentContainerStyle={{ padding: 24 }}>
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <View className="flex-row items-center gap-2">
                <Ionicons name="people-circle" size={28} color="#F97316" />
                <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white tracking-wider">
                  NOMINATE MANAGER
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.6} className="p-1">
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {success ? (
              <View className="items-center py-6">
                <View className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 items-center justify-center mb-4">
                  <Ionicons name="checkmark-circle" size={36} color="#10B981" />
                </View>
                <Text className="font-orbitron-bold text-xl text-slate-900 dark:text-white mb-2 text-center">
                  INVITATION SENT!
                </Text>
                <Text className="font-inter text-slate-600 dark:text-slate-400 text-sm text-center mb-6 leading-5">
                  We have sent a one-time claim invitation to <Text className="font-inter-bold">{email}</Text>. Thank you for helping build our community!
                </Text>
                <Button 
                  title="Done" 
                  variant="primary" 
                  onPress={handleClose} 
                  className="w-full"
                />
              </View>
            ) : (
              <View className="space-y-4">
                {/* Value Appeal */}
                <Text className="font-inter-medium text-slate-600 dark:text-slate-400 text-sm leading-5 mb-3">
                  ScoreKeeper works best when each school or club manages their own teams and events. By nominating the right administrator (e.g. school head of sports or club secretary), you ensure schedules are kept up to date and rosters stay accurate!
                </Text>

                {/* Gamified Reward Info */}
                <View className="bg-brand-orange/10 dark:bg-brand-orange/5 border border-brand-orange/20 p-3.5 rounded-xl flex-row items-start gap-3 mb-4">
                  <Ionicons name="trophy" size={20} color="#F97316" className="mt-0.5" />
                  <View className="flex-1">
                    <Text className="font-inter-bold text-xs text-brand-orange uppercase tracking-wider mb-0.5">
                      Earn Rewards
                    </Text>
                    <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-4">
                      You'll earn the <Text className="font-inter-bold text-slate-900 dark:text-white">Community Builder Badge</Text> on your first successful claim, and work towards <Text className="font-inter-bold text-slate-900 dark:text-white">Community Champion</Text> on your fifth!
                    </Text>
                  </View>
                </View>

                {/* Input */}
                <View className="mb-4">
                  <Text className="text-slate-600 dark:text-slate-400 font-inter-semibold text-xs mb-2">
                    Who coordinates sports or scheduling for {orgName}?
                  </Text>
                  <TextInput
                    className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-3.5 font-inter text-base"
                    placeholder="manager@school.edu"
                    placeholderTextColor={placeholderColor}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!submitting}
                  />
                </View>

                {/* Process & Privacy Info */}
                <View className="bg-brand-blue/10 dark:bg-brand-blue/5 border border-brand-blue/20 p-3.5 rounded-xl mb-6">
                  <Text className="font-inter-bold text-xs text-brand-blue uppercase tracking-wider mb-1">
                    How it works & Privacy Guarantee:
                  </Text>
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 leading-4">
                    1. We'll send a clean, one-time invitation to claim ownership.{"\n"}
                    2. They can set up teams, add coaches, and manage rosters.{"\n"}
                    3. <Text className="font-inter-semibold">We only use this email to send the claim invitation and absolutely nothing else.</Text>
                  </Text>
                </View>

                {/* Action buttons */}
                <View className="flex-col gap-3">
                  <Button
                    title={submitting ? "Sending..." : "Invite Manager & Support Org"}
                    variant="primary"
                    isLoading={submitting}
                    disabled={!email.includes('@')}
                    onPress={handleNominate}
                    className="w-full shadow-md shadow-brand-orange/20"
                  />
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={handleClose}
                    className="w-full"
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
