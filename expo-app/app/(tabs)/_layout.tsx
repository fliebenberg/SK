import { Tabs } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  
  return (
    <Tabs screenOptions={{
      headerShown: true,
      tabBarStyle: {
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      },
      tabBarActiveTintColor: '#FF3E00',
      tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
      headerStyle: {
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        shadowOpacity: 0,
        elevation: 0,
      },
      headerTitleStyle: {
        color: isDark ? '#FFFFFF' : '#0F172A',
        fontFamily: 'Orbitron_700Bold',
      },
      headerTintColor: isDark ? '#FFFFFF' : '#0F172A',
    }}>
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Live',
          tabBarIcon: ({ color }) => <Ionicons name="pulse" size={24} color={color} />
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={24} color={color} />
        }} 
      />
    </Tabs>
  );
}
