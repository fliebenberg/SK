import { Tabs } from 'expo-router';
import { useActiveTheme } from '../../store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import { useWindowDimensions, View } from 'react-native';
import { LeftNavigationRail } from '../../components/LeftNavigationRail';

export default function TabLayout() {
  const activeTheme = useActiveTheme();
  const isDark = activeTheme === 'dark';
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  
  const content = (
    <Tabs screenOptions={{
      headerShown: !isLargeScreen, // Left rail handles navigation and branding on desktop
      tabBarStyle: {
        display: isLargeScreen ? 'none' : 'flex',
        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
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
        fontSize: 16,
      },
      headerTintColor: isDark ? '#FFFFFF' : '#0F172A',
    }}>
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Live',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "pulse" : "pulse-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="organizations" 
        options={{ 
          title: 'Orgs',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "business" : "business-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="teams" 
        options={{ 
          title: 'Teams',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="sites" 
        options={{ 
          title: 'Sites',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "map" : "map-outline"} size={22} color={color} />
          )
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          )
        }} 
      />
    </Tabs>
  );

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-slate-50 dark:bg-slate-950">
        <LeftNavigationRail />
        <View className="flex-grow h-full bg-slate-50 dark:bg-slate-950">
          {content}
        </View>
      </View>
    );
  }

  return content;
}
