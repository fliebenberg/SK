import { View, Text, Switch, ScrollView, TextInput, ActivityIndicator, Alert, Platform, TouchableOpacity, Image } from 'react-native';
import { useSettingsStore, ThemePreference } from '../../store/settingsStore';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { useAuthStore } from '../../store/authStore';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { apiService, API_BASE_URL } from '../../services/api';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, token, isAuthenticated, logout, updateUser } = useAuthStore();

  const localOverrides = useSettingsStore(state => state.localOverrides);
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const removeLocalOverride = useSettingsStore(state => state.removeLocalOverride);
  const globalTheme = useSettingsStore(state => state.globalPreferences.theme);

  const currentTheme = localOverrides.theme ?? globalTheme;
  const isLocal = localOverrides.theme !== undefined;

  // Form states
  const [name, setName] = useState('');
  const [avatarSource, setAvatarSource] = useState('custom');
  const [customImage, setCustomImage] = useState('');
  const [socialAccounts, setSocialAccounts] = useState<Array<{ provider: string; provider_image: string }>>([]);
  const [emails, setEmails] = useState<Array<{ email: string; isPrimary: boolean; verifiedAt: string | null }>>([]);
  
  // UI states
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'emails'>('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isOldPasswordVerified, setIsOldPasswordVerified] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Initialize and fetch extended profile data
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setCustomImage(user.customImage || '');
      setAvatarSource(user.avatarSource || 'custom');
    }

    if (isAuthenticated && token) {
      setIsLoading(true);
      apiService.getProfile(token)
        .then(res => {
          setSocialAccounts(res.socialAccounts || []);
          setEmails(res.emails || []);
          if (res.user) {
            setAvatarSource(res.user.avatarSource || 'custom');
            setCustomImage(res.user.customImage || '');
            updateUser({
              avatarSource: res.user.avatarSource,
              customImage: res.user.customImage,
              hasPassword: res.user.hasPassword,
              picture: res.user.picture
            });
          }
        })
        .catch(err => console.error('[Settings] Error fetching profile data:', err))
        .finally(() => setIsLoading(false));
    }
  }, [user?.id, isAuthenticated, token]);

  const toggleLocalOverride = (value: boolean) => {
    if (value) {
      setLocalOverride('theme', globalTheme);
    } else {
      removeLocalOverride('theme');
    }
  };

  const setTheme = (theme: ThemePreference) => {
    setLocalOverride('theme', theme);
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  const handleLogin = () => {
    router.push('/(auth)/login');
  };

  // Profile save (Name + Avatar Source)
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiService.updateProfile(token!, {
        name: name.trim(),
        avatarSource: avatarSource
      });
      if (response.success) {
        updateUser(response.user);
        Alert.alert('Success', 'Profile updated successfully!');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Image upload handler
  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions to change your avatar.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsSaving(true);
        const base64Str = `data:image/webp;base64,${result.assets[0].base64}`;
        
        const response = await apiService.updateProfile(token!, {
          customImage: base64Str,
          avatarSource: 'custom'
        });

        if (response.success) {
          setCustomImage(response.user.customImage || '');
          setAvatarSource('custom');
          updateUser(response.user);
          Alert.alert('Success', 'Profile image uploaded successfully!');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to process avatar upload');
    } finally {
      setIsSaving(false);
    }
  };

  // Password verification
  const handleVerifyPassword = async () => {
    if (!oldPassword) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiService.verifyPassword(token!, oldPassword);
      if (res.success) {
        setIsOldPasswordVerified(true);
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Incorrect password.');
    } finally {
      setIsSaving(false);
    }
  };

  // Password update
  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiService.updatePassword(token!, {
        password: newPassword,
        oldPassword: oldPassword
      });

      if (res.success) {
        Alert.alert('Success', user?.hasPassword ? 'Password updated!' : 'Password set!');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setIsOldPasswordVerified(false);
        setIsEditingPassword(false);
        updateUser({ hasPassword: true });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "Empty", color: "bg-slate-200 dark:bg-slate-800" };
    if (pass.length < 6) return { score: 1, label: "Too Short", color: "bg-red-500" };
    
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    
    const labels = ["Weak", "Fair", "Good", "Strong", "Excellent"];
    const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-brand-blue", "bg-green-500"];
    
    return {
      score: score + 1,
      label: labels[score],
      color: colors[score]
    };
  };

  const strength = getPasswordStrength(newPassword);

  const getInitials = (userName: string) => {
    if (!userName) return 'U';
    return userName
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const getAvatarUri = () => {
    if (avatarSource === 'custom' && customImage) {
      return `${API_BASE_URL}/uploads/profiles/${customImage}_medium.webp`;
    }
    
    if (avatarSource !== 'custom') {
      const active = socialAccounts.find(a => a.provider === avatarSource);
      if (active?.provider_image) return active.provider_image;
    }

    if (user?.picture) return user.picture;
    return null;
  };

  const isProfileDirty = user && (name !== user.name || avatarSource !== (user.avatarSource || 'custom'));

  return (
    <ScrollView 
      className="flex-1 bg-slate-50 dark:bg-slate-900" 
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="w-full max-w-6xl mx-auto">
        <Text className="font-orbitron-bold text-2xl text-brand-orange mb-6 tracking-widest text-center md:text-left">
          SETTINGS
        </Text>

        {!isAuthenticated ? (
          <GlassCard className="mb-6 max-w-xl mx-auto">
            <Text className="font-inter-bold text-lg text-slate-900 dark:text-white mb-4">Account Settings</Text>
            <Text className="font-inter text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">
              You are currently browsing as a guest. Log in to manage your profile, customize your avatar, set a direct password, and link multiple emails.
            </Text>
            <Button 
              title="Log In / Sign Up" 
              variant="primary" 
              onPress={handleLogin}
              className="w-full md:w-auto md:self-start md:px-8"
            />
          </GlassCard>
        ) : isLoading ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color="#FF3E00" />
            <Text className="font-inter text-slate-600 dark:text-slate-400 mt-4">Loading profile details...</Text>
          </View>
        ) : (
          <View className="flex-col md:flex-row gap-6 w-full items-start">
            {/* LEFT COLUMN (Summary Panel - Tablets/Web) */}
            <View className="w-full md:w-80 shrink-0 gap-6">
              <GlassCard className="items-center py-8">
                {/* Responsive Avatar display */}
                <View className="relative mb-4">
                  <View className="w-24 h-24 rounded-full border-2 border-brand-orange/40 bg-slate-200 dark:bg-slate-800 items-center justify-center overflow-hidden shadow-lg">
                    {getAvatarUri() ? (
                      <Image 
                        source={{ uri: getAvatarUri()! }} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Text className="font-orbitron-bold text-3xl text-slate-700 dark:text-slate-200">
                        {getInitials(user?.name || '')}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    onPress={handlePickAvatar}
                    className="absolute bottom-0 right-0 bg-brand-orange w-8 h-8 rounded-full items-center justify-center border-2 border-white dark:border-slate-950 active:scale-95"
                  >
                    <Ionicons name="camera" size={16} color="white" />
                  </TouchableOpacity>
                </View>

                <Text className="font-inter-bold text-xl text-slate-900 dark:text-white mb-1 text-center">
                  {user?.name}
                </Text>
                <Text className="font-inter text-slate-500 dark:text-slate-400 text-sm mb-4 text-center">
                  {user?.email}
                </Text>

                <View className="bg-brand-blue/10 border border-brand-blue/30 rounded-full px-4 py-1 mb-6">
                  <Text className="font-orbitron-bold text-xs text-brand-blue uppercase tracking-wider">
                    {user?.globalRole}
                  </Text>
                </View>

                {/* Left Navigation Rails for Desktop/Tablets */}
                <View className="hidden md:flex w-full border-t border-slate-200 dark:border-white/10 pt-4 gap-2">
                  <TouchableOpacity 
                    onPress={() => setActiveTab('profile')}
                    className={`flex-row items-center gap-3 p-3 rounded-lg ${activeTab === 'profile' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
                  >
                    <Ionicons name="person" size={18} color={activeTab === 'profile' ? '#FF3E00' : '#64748B'} />
                    <Text className={`font-inter-bold text-sm ${activeTab === 'profile' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>Edit Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setActiveTab('security')}
                    className={`flex-row items-center gap-3 p-3 rounded-lg ${activeTab === 'security' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
                  >
                    <Ionicons name="shield-checkmark" size={18} color={activeTab === 'security' ? '#FF3E00' : '#64748B'} />
                    <Text className={`font-inter-bold text-sm ${activeTab === 'security' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>Security & Password</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setActiveTab('emails')}
                    className={`flex-row items-center gap-3 p-3 rounded-lg ${activeTab === 'emails' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
                  >
                    <Ionicons name="mail" size={18} color={activeTab === 'emails' ? '#FF3E00' : '#64748B'} />
                    <Text className={`font-inter-bold text-sm ${activeTab === 'emails' ? 'text-slate-950 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>Linked Accounts</Text>
                  </TouchableOpacity>
                </View>

                {/* Log Out at bottom of card */}
                <Button 
                  title="Log Out" 
                  variant="danger" 
                  onPress={handleLogout}
                  className="w-full mt-6"
                />
              </GlassCard>

              {/* Theme Settings (always visible in Left column on desktop, stacked on mobile) */}
              <GlassCard className="hidden md:flex">
                <Text className="font-inter-bold text-base text-slate-900 dark:text-white mb-4">Appearance</Text>
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="font-inter text-sm text-slate-600 dark:text-slate-400">Local Override</Text>
                  <Switch 
                    value={isLocal} 
                    onValueChange={toggleLocalOverride} 
                    trackColor={{ true: '#FF3E00' }}
                  />
                </View>

                {isLocal && (
                  <View className="flex-row gap-1">
                    <TouchableOpacity 
                      onPress={() => setTheme('system')}
                      className={`flex-1 items-center justify-center p-2 border rounded-md ${currentTheme === 'system' ? 'border-brand-orange bg-brand-orange/5' : 'border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-950'}`}
                    >
                      <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">Auto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setTheme('dark')}
                      className={`flex-1 items-center justify-center p-2 border rounded-md ${currentTheme === 'dark' ? 'border-brand-orange bg-brand-orange/5' : 'border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-950'}`}
                    >
                      <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">Dark</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setTheme('light')}
                      className={`flex-1 items-center justify-center p-2 border rounded-md ${currentTheme === 'light' ? 'border-brand-orange bg-brand-orange/5' : 'border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-950'}`}
                    >
                      <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">Light</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </GlassCard>
            </View>

            {/* RIGHT COLUMN (Edit Panels - Tablet split view, stacked on mobile) */}
            <View className="flex-1 w-full gap-6">
              
              {/* MOBILE TABS SELECTOR (Only shown on small screens) */}
              <View className="flex-row md:hidden bg-slate-200 dark:bg-slate-800 rounded-lg p-1 mb-2">
                <TouchableOpacity 
                  onPress={() => setActiveTab('profile')}
                  className={`flex-1 items-center py-2.5 rounded-md ${activeTab === 'profile' ? 'bg-white dark:bg-slate-950 shadow-sm' : ''}`}
                >
                  <Text className={`font-inter-bold text-xs ${activeTab === 'profile' ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'}`}>Edit Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setActiveTab('security')}
                  className={`flex-1 items-center py-2.5 rounded-md ${activeTab === 'security' ? 'bg-white dark:bg-slate-950 shadow-sm' : ''}`}
                >
                  <Text className={`font-inter-bold text-xs ${activeTab === 'security' ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'}`}>Security</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setActiveTab('emails')}
                  className={`flex-1 items-center py-2.5 rounded-md ${activeTab === 'emails' ? 'bg-white dark:bg-slate-950 shadow-sm' : ''}`}
                >
                  <Text className={`font-inter-bold text-xs ${activeTab === 'emails' ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'}`}>Accounts</Text>
                </TouchableOpacity>
              </View>

              {/* 1. EDIT PROFILE TAB */}
              {activeTab === 'profile' && (
                <GlassCard className="gap-6 animate-fadeIn">
                  <View className="flex-row items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
                    <Ionicons name="person-circle" size={20} color="#FF3E00" />
                    <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white">EDIT PROFILE</Text>
                  </View>

                  <View className="gap-4">
                    <View>
                      <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Display Name</Text>
                      <TextInput 
                        className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 font-inter"
                        placeholder="Your full name"
                        value={name}
                        onChangeText={setName}
                        editable={!isSaving}
                      />
                    </View>

                    {/* Avatar sources selector (e.g. toggling custom vs Google pics) */}
                    {socialAccounts.length > 0 && (
                      <View className="pt-2 border-t border-slate-200 dark:border-white/5">
                        <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Profile Image Source</Text>
                        <View className="flex-row gap-2">
                          <TouchableOpacity 
                            onPress={() => setAvatarSource('custom')}
                            className={`flex-1 flex-row items-center gap-2 p-3 border rounded-lg ${avatarSource === 'custom' ? 'border-brand-orange bg-brand-orange/5' : 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-950'}`}
                          >
                            <Ionicons name="image" size={16} color={avatarSource === 'custom' ? '#FF3E00' : '#64748B'} />
                            <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">Custom Upload</Text>
                          </TouchableOpacity>

                          {socialAccounts.map((acc) => (
                            <TouchableOpacity 
                              key={acc.provider}
                              onPress={() => setAvatarSource(acc.provider)}
                              className={`flex-1 flex-row items-center gap-2 p-3 border rounded-lg capitalize ${avatarSource === acc.provider ? 'border-brand-orange bg-brand-orange/5' : 'border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-950'}`}
                            >
                              <Ionicons name="logo-google" size={16} color={avatarSource === acc.provider ? '#FF3E00' : '#64748B'} />
                              <Text className="font-inter-bold text-xs text-slate-800 dark:text-white">{acc.provider}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    <Button 
                      title={isSaving ? 'Saving...' : 'Save Profile'} 
                      variant="primary"
                      onPress={handleSaveProfile}
                      disabled={isSaving || !isProfileDirty}
                      className="mt-2"
                    />
                  </View>
                </GlassCard>
              )}

              {/* 2. SECURITY & PASSWORD TAB */}
              {activeTab === 'security' && (
                <GlassCard className="gap-6 animate-fadeIn">
                  <View className="flex-row items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
                    <Ionicons name="lock-closed" size={20} color="#FF3E00" />
                    <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white">SECURITY & PASSWORD</Text>
                  </View>

                  {!isEditingPassword ? (
                    <View className="p-4 rounded-xl bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 items-center md:items-start gap-4">
                      <View className="flex-row items-center gap-3">
                        <Ionicons 
                          name={user?.hasPassword ? "shield-checkmark" : "warning"} 
                          size={24} 
                          color={user?.hasPassword ? "#FF3E00" : "#EAB308"} 
                        />
                        <View>
                          <Text className="font-inter-bold text-base text-slate-900 dark:text-white">
                            {user?.hasPassword ? 'Password Status Active' : 'No Password Established'}
                          </Text>
                          <Text className="font-inter text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                            {user?.hasPassword ? 'Secure email/password logins enabled' : 'Setup a password for direct logins'}
                          </Text>
                        </View>
                      </View>

                      <Button 
                        title={user?.hasPassword ? 'Change password' : 'Create a Password'} 
                        variant="secondary"
                        onPress={() => setIsEditingPassword(true)}
                        className="w-full md:w-auto md:px-8 mt-2"
                      />
                    </View>
                  ) : (
                    <View className="gap-4">
                      {/* STEP 1: Verify current password */}
                      {user?.hasPassword && !isOldPasswordVerified && (
                        <View className="gap-4">
                          <Text className="font-inter text-slate-600 dark:text-slate-400 text-sm">
                            Confirm your current password to update security settings.
                          </Text>
                          <View>
                            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Current Password</Text>
                            <View className="relative justify-center">
                              <TextInput 
                                className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 pr-12 font-inter"
                                placeholder="••••••••"
                                secureTextEntry={!showOldPassword}
                                value={oldPassword}
                                onChangeText={setOldPassword}
                                editable={!isSaving}
                              />
                              <TouchableOpacity 
                                onPress={() => setShowOldPassword(!showOldPassword)}
                                className="absolute right-4"
                              >
                                <Ionicons name={showOldPassword ? "eye-off" : "eye"} size={20} color="#64748B" />
                              </TouchableOpacity>
                            </View>
                          </View>

                          <View className="flex-row gap-2 mt-2">
                            <Button 
                              title="Cancel" 
                              variant="ghost"
                              onPress={() => {
                                setIsEditingPassword(false);
                                setOldPassword('');
                              }}
                              className="flex-1"
                            />
                            <Button 
                              title={isSaving ? 'Verifying...' : 'Verify'} 
                              variant="primary"
                              onPress={handleVerifyPassword}
                              disabled={isSaving || !oldPassword}
                              className="flex-1"
                            />
                          </View>
                        </View>
                      )}

                      {/* STEP 2: Input new password credentials */}
                      {(!user?.hasPassword || isOldPasswordVerified) && (
                        <View className="gap-4">
                          <Text className="font-inter text-slate-600 dark:text-slate-400 text-sm">
                            Define your secure email/password credential details.
                          </Text>
                          <View>
                            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">New Password</Text>
                            <View className="relative justify-center">
                              <TextInput 
                                className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 pr-12 font-inter"
                                placeholder="••••••••"
                                secureTextEntry={!showNewPassword}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                editable={!isSaving}
                              />
                              <TouchableOpacity 
                                onPress={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-4"
                              >
                                <Ionicons name={showNewPassword ? "eye-off" : "eye"} size={20} color="#64748B" />
                              </TouchableOpacity>
                            </View>

                            {/* Strength indicator */}
                            {newPassword.length > 0 && (
                              <View className="mt-2 bg-slate-100 dark:bg-slate-950 p-3 rounded-lg gap-2">
                                <View className="flex-row justify-between items-center">
                                  <Text className="font-orbitron-bold text-[10px] text-slate-500">Strength: {strength.label}</Text>
                                  <Text className="font-orbitron-bold text-[10px] text-slate-500">{strength.score}/5</Text>
                                </View>
                                <View className="flex-row gap-1 h-1">
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <View 
                                      key={s} 
                                      className={`flex-1 rounded-full ${s <= strength.score ? strength.color : 'bg-slate-200 dark:bg-slate-800'}`} 
                                    />
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>

                          <View>
                            <Text className="text-slate-600 dark:text-slate-400 font-inter mb-2">Confirm New Password</Text>
                            <View className="relative justify-center">
                              <TextInput 
                                className="bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-lg p-4 pr-12 font-inter"
                                placeholder="••••••••"
                                secureTextEntry={!showConfirmPassword}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                editable={!isSaving}
                              />
                              <TouchableOpacity 
                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-4"
                              >
                                <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={20} color="#64748B" />
                              </TouchableOpacity>
                            </View>

                            {confirmPassword.length > 0 && (
                              <View className="mt-1 flex-row items-center gap-1">
                                <Ionicons 
                                  name={confirmPassword === newPassword ? "checkmark-circle" : "close-circle"} 
                                  size={14} 
                                  color={confirmPassword === newPassword ? "#10B981" : "#EF4444"} 
                                />
                                <Text className={`font-inter-bold text-[10px] ${confirmPassword === newPassword ? 'text-green-500' : 'text-red-500'}`}>
                                  {confirmPassword === newPassword ? 'Passwords match' : 'Passwords do not match'}
                                </Text>
                              </View>
                            )}
                          </View>

                          <View className="flex-row gap-2 mt-2">
                            <Button 
                              title="Cancel" 
                              variant="ghost"
                              onPress={() => {
                                setIsOldPasswordVerified(false);
                                setIsEditingPassword(false);
                                setNewPassword('');
                                setConfirmPassword('');
                              }}
                              className="flex-1"
                            />
                            <Button 
                              title={isSaving ? 'Updating...' : 'Save Password'} 
                              variant="primary"
                              onPress={handleUpdatePassword}
                              disabled={isSaving || !newPassword || newPassword !== confirmPassword}
                              className="flex-1"
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </GlassCard>
              )}

              {/* 3. LINKED ACCOUNTS & EMAILS TAB */}
              {activeTab === 'emails' && (
                <GlassCard className="gap-6 animate-fadeIn">
                  <View className="flex-row items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
                    <Ionicons name="mail-open" size={20} color="#FF3E00" />
                    <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white">LINKED EMAILS</Text>
                  </View>

                  <View className="gap-4">
                    {emails.map((e) => (
                      <View 
                        key={e.email}
                        className="flex-row items-center justify-between p-4 bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 rounded-xl"
                      >
                        <View className="flex-row items-center gap-3">
                          <Ionicons name="mail" size={20} color="#64748B" />
                          <View>
                            <Text className="font-inter-bold text-slate-900 dark:text-white text-sm">{e.email}</Text>
                            {e.isPrimary && (
                              <Text className="font-orbitron-bold text-[9px] text-brand-orange uppercase tracking-wider mt-0.5">Primary Contact</Text>
                            )}
                          </View>
                        </View>
                        
                        <View className="flex-row items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                          <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                          <Text className="font-orbitron-bold text-[9px] text-green-500 uppercase tracking-widest">Verified</Text>
                        </View>
                      </View>
                    ))}

                    <View className="p-4 rounded-xl bg-brand-orange/5 border border-brand-orange/10">
                      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic text-center">
                        Link separate organization, school, or personal emails to easily consolidate statistics across multiple teams and host matches seamlessly.
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              )}

              {/* MOBILE APPEARANCE (Only shown stacked on mobile) */}
              <View className="flex md:hidden">
                <GlassCard>
                  <Text className="font-inter-bold text-base text-slate-900 dark:text-white mb-4">Appearance</Text>
                  <View className="flex-row items-center justify-between mb-4">
                    <Text className="font-inter text-slate-600 dark:text-slate-400">Local Override</Text>
                    <Switch 
                      value={isLocal} 
                      onValueChange={toggleLocalOverride} 
                      trackColor={{ true: '#FF3E00' }}
                    />
                  </View>

                  {isLocal && (
                    <View className="flex-row gap-2">
                      <Button 
                        title="Auto" 
                        variant={currentTheme === 'system' ? 'primary' : 'secondary'}
                        onPress={() => setTheme('system')}
                        className="flex-1"
                      />
                      <Button 
                        title="Dark" 
                        variant={currentTheme === 'dark' ? 'primary' : 'secondary'}
                        onPress={() => setTheme('dark')}
                        className="flex-1"
                      />
                      <Button 
                        title="Light" 
                        variant={currentTheme === 'light' ? 'primary' : 'secondary'}
                        onPress={() => setTheme('light')}
                        className="flex-1"
                      />
                    </View>
                  )}
                </GlassCard>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
