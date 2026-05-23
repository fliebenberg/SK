import { View, Text, Switch, ScrollView } from 'react-native';
import { useSettingsStore, ThemePreference } from '../../store/settingsStore';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { useAuthStore } from '../../store/authStore';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();

  const localOverrides = useSettingsStore(state => state.localOverrides);
  const setLocalOverride = useSettingsStore(state => state.setLocalOverride);
  const removeLocalOverride = useSettingsStore(state => state.removeLocalOverride);
  const globalTheme = useSettingsStore(state => state.globalPreferences.theme);

  const currentTheme = localOverrides.theme ?? globalTheme;
  const isLocal = localOverrides.theme !== undefined;

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

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <ScrollView 
      className="flex-1 bg-slate-50 dark:bg-slate-900" 
      contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="font-orbitron text-2xl text-slate-900 dark:text-white mb-6">Settings</Text>
      
      <GlassCard className="mb-6">
        <Text className="font-inter font-bold text-lg text-slate-900 dark:text-white mb-4">Account</Text>
        
        {isAuthenticated && user ? (
          <View className="gap-4">
            <View className="flex-row items-center gap-4">
              <View className="w-14 h-14 bg-brand-orange rounded-full items-center justify-center border border-brand-orange/30 shadow-lg shadow-brand-orange/20">
                <Text className="font-orbitron font-bold text-xl text-white">
                  {getInitials(user.name)}
                </Text>
              </View>
              
              <View className="flex-1 justify-center">
                <Text className="font-inter font-bold text-slate-900 dark:text-white text-lg">
                  {user.name}
                </Text>
                <Text className="font-inter text-slate-600 dark:text-slate-400 text-sm">
                  {user.email}
                </Text>
                <View className="flex-row mt-1">
                  <View className="bg-brand-blue/10 border border-brand-blue/30 rounded px-2 py-0.5">
                    <Text className="font-orbitron text-[10px] font-bold text-brand-blue uppercase tracking-wider">
                      {user.globalRole}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            
            <Button 
              title="Log Out" 
              variant="danger" 
              onPress={handleLogout}
              className="w-full mt-2"
            />
          </View>
        ) : (
          <View className="gap-4">
            <Text className="font-inter text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
              You are currently browsing as a guest. Log in to manage your organizations, follow premium leagues, and host matches.
            </Text>
            <Button 
              title="Log In / Sign Up" 
              variant="primary" 
              onPress={handleLogin}
              className="w-full mt-2"
            />
          </View>
        )}
      </GlassCard>

      <GlassCard className="mb-6">
        <Text className="font-inter font-bold text-lg text-slate-900 dark:text-white mb-4">Appearance</Text>
        
        <View className="flex-row items-center justify-between mb-6">
          <Text className="font-inter text-slate-600 dark:text-slate-400">Use Device Local Override</Text>
          <Switch 
            value={isLocal} 
            onValueChange={toggleLocalOverride} 
            trackColor={{ true: '#FF3E00' }}
          />
        </View>

        {isLocal && (
          <View className="flex-row gap-2">
            <Button 
              title="System" 
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
    </ScrollView>
  );
}
