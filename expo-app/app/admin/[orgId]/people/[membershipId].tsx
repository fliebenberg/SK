import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../../../store/settingsStore';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, OrgMember } from '@sk/types';
import { ImageEditor, ImageConfig } from '../../../../components/ImageEditor';
import { getAvatarUrl } from '../../../../services/api';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { useUnsavedChanges } from '../../../../hooks/useUnsavedChanges';

const parseImageConfig = (config: any): ImageConfig => {
  if (!config) return { scale: 1, x: 0, y: 0 };
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (e) {
      return { scale: 1, x: 0, y: 0 };
    }
  }
  return {
    scale: config.scale ?? 1,
    x: config.x ?? 0,
    y: config.y ?? 0
  };
};

export default function EditMember() {
  const router = useRouter();
  const { orgId, membershipId } = useLocalSearchParams<{ orgId: string; membershipId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore(state => state.isConnected);

  const { data: membersData, isLoading: isMembersLoading, refetch: refetchMembers, setData: setMembersData } = useSocketQuery<OrgMember[]>('org_members', { orgId });
  const { data: rolesData, isLoading: isRolesLoading } = useSocketQuery<any>('roles');

  const availableRoles: any[] = rolesData?.org || [];
  const member = useMemo(() => membersData?.find(m => m.membershipId === membershipId), [membersData, membershipId]);

  // Form State
  const [form, setForm] = useState<{
    id: string;
    membershipId: string;
    name: string;
    email: string;
    cellphone: string;
    birthdate: string;
    nationalId: string;
    personOrgId: string;
    roleId: string;
    image: string;
    imageConfig: { scale: number; x: number; y: number };
  } | null>(null);

  const [originalData, setOriginalData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [imageEditorVisible, setImageEditorVisible] = useState(false);

  useEffect(() => {
    if (member && !form) {
      const lConfig = parseImageConfig(member.imageConfig || (member as any).settings?.logoConfig);
      const initialData = {
        id: member.id,
        membershipId: member.membershipId,
        name: member.name,
        email: member.email || '',
        cellphone: member.cellphone || '',
        birthdate: member.birthdate || '',
        nationalId: member.nationalId || '',
        personOrgId: member.personOrgId || '',
        roleId: member.roleId,
        image: member.image || '',
        imageConfig: lConfig,
      };
      setForm(initialData);
      setOriginalData(JSON.stringify(initialData));
    }
  }, [member, form]);

  // Subscribe to updates
  useEffect(() => {
    if (!isConnected || !orgId) return;

    const room = `org:${orgId}:members`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (!event) return;
      if (event.type === 'ORG_MEMBERS_SYNC') {
        setMembersData(event.data);
      } else if (event.type === 'ORG_MEMBER_UPDATED') {
        const updatedData = event.data;
        if (updatedData) {
          if (updatedData.endDate) {
            // Member was removed
            setMembersData(prev => {
              if (!prev) return null;
              return prev.filter(m => m.membershipId !== updatedData.id && m.membershipId !== updatedData.membershipId);
            });
          } else if (updatedData.id) {
            setMembersData(prev => {
              if (!prev) return null;
              const idx = prev.findIndex(m => m.id === updatedData.id);
              if (idx !== -1) {
                // Update existing member
                const copy = [...prev];
                copy[idx] = { ...copy[idx], ...updatedData };
                return copy;
              } else if (updatedData.membershipId) {
                // Add new member to list
                return [...prev, updatedData];
              }
              return prev;
            });
          }
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, setMembersData]);

  const hasChanges = useMemo(() => {
    if (!form || !originalData) return false;
    return JSON.stringify(form) !== originalData;
  }, [form, originalData]);

  const handleCancel = useCallback(() => {
    if (originalData) {
      setForm(JSON.parse(originalData));
    }
  }, [originalData]);

  useUnsavedChanges(hasChanges && !isProcessing, handleCancel);

  const handleSave = async () => {
    if (!form || !form.name.trim()) return;

    setIsProcessing(true);
    try {
      // 1. Update Profile
      await new Promise((resolve, reject) => {
        wsService.emit('action', {
          type: SocketAction.UPDATE_ORG_PROFILE,
          payload: {
            id: form.id,
            data: {
              name: form.name,
              email: form.email || undefined,
              cellphone: form.cellphone || undefined,
              birthdate: form.birthdate || undefined,
              nationalId: form.nationalId || undefined,
              image: form.image || undefined,
              imageConfig: form.imageConfig,
              identifier: form.personOrgId || undefined,
            }
          }
        }, (res: any) => {
          if (res.status === 'ok') resolve(res.data);
          else reject(new Error(res.message || 'Failed to update profile'));
        });
      });

      // 2. Update Member Role
      await new Promise((resolve, reject) => {
        wsService.emit('action', {
          type: SocketAction.UPDATE_ORG_MEMBER,
          payload: {
            id: form.membershipId,
            roleId: form.roleId
          }
        }, (res: any) => {
          if (res.status === 'ok') resolve(res.data);
          else reject(new Error(res.message || 'Failed to update role'));
        });
      });

      router.back();
    } catch (err: any) {
      console.error(err);
      Alert.alert('Save Failed', err.message || 'Failed to save changes');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!form) return;

    setIsProcessing(true);
    setDeleteError(null);
    try {
      await new Promise((resolve, reject) => {
        wsService.emit('action', {
          type: SocketAction.REMOVE_ORG_MEMBER,
          payload: { id: form.membershipId }
        }, (res: any) => {
          if (res.status === 'ok') resolve(res);
          else reject(new Error(res.message || 'Failed to remove member'));
        });
      });
      setIsDeleteModalOpen(false);
      router.back();
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || 'Failed to remove member');
    } finally {
      setIsProcessing(false);
    }
  };

  const getEditorImage = () => {
    if (!form) return '';
    return getAvatarUrl(form.image, 'large') || form.image;
  };

  const handleImageEditorApply = (uri: string, config: ImageConfig) => {
    if (form) {
      setForm(prev => prev ? ({ ...prev, image: uri, imageConfig: config }) : null);
    }
    setImageEditorVisible(false);
  };

  const isLoading = isMembersLoading || isRolesLoading || !form;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 items-center justify-center">
        <ActivityIndicator size="large" color="#FF3E00" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
          Edit Member Details
        </Text>
        <View className="w-8" />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        className="flex-1 px-6 py-6"
        contentContainerStyle={{ paddingBottom: hasChanges ? 140 : 60 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="space-y-6">
          {/* Avatar and Name row */}
          <View className="flex-row gap-6 items-center">
            <View className="items-center">
              <TouchableOpacity
                onPress={() => setImageEditorVisible(true)}
                className="w-20 h-20 rounded-full overflow-hidden items-center justify-center bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-white/10"
              >
                {form.image ? (
                  <View className="w-20 h-20 overflow-hidden">
                    <View
                      style={{
                        width: '100%',
                        height: '100%',
                        transform: [
                          { scale: form.imageConfig.scale },
                          { translateX: form.imageConfig.x * 80 },
                          { translateY: form.imageConfig.y * 80 },
                        ],
                      }}
                    >
                      <Image
                        source={{ uri: getAvatarUrl(form.image, 'medium') }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                ) : (
                  <Ionicons name="camera-outline" size={28} color="#94A3B8" />
                )}
              </TouchableOpacity>
              <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase mt-1.5">
                Avatar
              </Text>
            </View>

            {/* Name Input */}
            <View className="flex-1">
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Name
              </Text>
              <TextInput
                value={form.name}
                onChangeText={(text) => setForm(prev => prev ? ({ ...prev, name: text }) : null)}
                placeholder="e.g. John Doe"
                placeholderTextColor="#94A3B8"
                className="font-orbitron-bold text-lg text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
              />
            </View>
          </View>

          {/* Email Address & Cell Number */}
          <View className="flex-row gap-4 flex-wrap md:flex-nowrap">
            <View className="flex-1 min-w-[200px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Email Address
              </Text>
              <TextInput
                placeholder="email@example.com"
                placeholderTextColor="#94A3B8"
                value={form.email}
                onChangeText={(text) => setForm(prev => prev ? ({ ...prev, email: text }) : null)}
                className="font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none"
              />
            </View>

            <View className="flex-1 min-w-[200px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Cell Number
              </Text>
              <TextInput
                placeholder="e.g. +1 234 567 8900"
                placeholderTextColor="#94A3B8"
                value={form.cellphone}
                onChangeText={(text) => setForm(prev => prev ? ({ ...prev, cellphone: text }) : null)}
                className="font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none"
              />
            </View>
          </View>

          {/* Org ID & Birthdate */}
          <View className="flex-row gap-4 flex-wrap md:flex-nowrap">
            <View className="flex-1 min-w-[200px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Org ID (e.g. Student #)
              </Text>
              <TextInput
                placeholder="ID number"
                placeholderTextColor="#94A3B8"
                value={form.personOrgId}
                onChangeText={(text) => setForm(prev => prev ? ({ ...prev, personOrgId: text }) : null)}
                className="font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none"
              />
            </View>

            <View className="flex-1 min-w-[200px]">
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5">
                Birthdate
              </Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
                value={form.birthdate}
                onChangeText={(text) => setForm(prev => prev ? ({ ...prev, birthdate: text }) : null)}
                className="font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 outline-none"
              />
            </View>
          </View>

          {/* Assigned Role */}
          <View>
            <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-3">
              Assigned Role
            </Text>
            <View className="flex-row flex-wrap gap-2.5">
              {availableRoles.map(role => (
                <TouchableOpacity
                  key={role.id}
                  onPress={() => setForm(prev => prev ? ({ ...prev, roleId: role.id }) : null)}
                  style={{
                    borderWidth: 1,
                    borderColor: form.roleId === role.id ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1'),
                    backgroundColor: form.roleId === role.id ? '#FF3E00' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(241,245,249,0.3)'),
                  }}
                  className="px-4 py-2.5 rounded-xl active:scale-95"
                >
                  <Text
                    style={{
                      color: form.roleId === role.id ? '#fff' : (isDark ? '#94A3B8' : '#64748B')
                    }}
                    className="font-orbitron-bold text-[10px] text-center uppercase tracking-widest"
                  >
                    {role.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Danger Zone */}
          <View className="border-t border-red-500/20 pt-6 mt-6">
            <Text className="font-orbitron-bold text-[9px] text-red-500/80 uppercase tracking-widest mb-3">
              Danger Zone
            </Text>
            <View className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 flex-row items-center justify-between">
              <View className="flex-1 mr-4">
                <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Remove Member</Text>
                <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Remove this person from the organization. They will also be removed from all teams in this organization.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setIsDeleteModalOpen(true); setDeleteError(null); }}
                className="bg-red-500 px-4 py-2.5 rounded-xl items-center justify-center active:opacity-85"
              >
                <Text className="font-inter-bold text-xs text-white uppercase tracking-wider">Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              Unsaved Changes
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              You have modified this member's details.
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
              onPress={handleSave}
              disabled={isProcessing || !form.name.trim()}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
                    Save
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
        title="Remove Member?"
        description={
          form 
            ? `Are you sure you want to remove "${form.name}" from the organization? This action is irreversible.${deleteError ? '\n\nError: ' + deleteError : ''}` 
            : ''
        }
        onConfirm={handleDelete}
        confirmText={isProcessing ? 'Removing...' : 'Remove'}
        variant="danger"
        isProcessing={isProcessing}
      />

      {/* IMAGE EDITOR */}
      <ImageEditor
        visible={imageEditorVisible}
        imageUri={getEditorImage()}
        config={form.imageConfig}
        title="Edit Avatar"
        allowRemove
        onApply={handleImageEditorApply}
        onCancel={() => setImageEditorVisible(false)}
      />
    </SafeAreaView>
  );
}
