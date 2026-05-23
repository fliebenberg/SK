import { View, Text, Switch } from 'react-native';
import { useSettingsStore, ThemePreference } from '../../store/settingsStore';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';

export default function SettingsScreen() {
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

  return (
    <View className="flex-1 bg-background p-6">
      <Text className="font-orbitron text-2xl text-textPrimary mb-6">Settings</Text>
      
      <GlassCard className="mb-6">
        <Text className="font-inter font-bold text-lg text-textPrimary mb-4">Appearance</Text>
        
        <View className="flex-row items-center justify-between mb-6">
          <Text className="font-inter text-textSecondary">Use Device Local Override</Text>
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
    </View>
  );
}
