import { Tabs } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  const activeTheme = useActiveTheme();
  
  return (
    <Tabs screenOptions={{
      headerShown: true,
      tabBarStyle: {
        backgroundColor: activeTheme === 'dark' ? '#0F172A' : '#FFFFFF',
        borderTopColor: 'rgba(255,255,255,0.1)'
      },
      tabBarActiveTintColor: '#FF3E00',
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
