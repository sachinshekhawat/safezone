import { Tabs } from 'expo-router';
import { useTheme } from 'react-native-paper';
import MaterialIcon from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Signed-in shell.
 *
 * SOS sits in the centre so it stays within thumb reach, and keeps the error
 * colour in every state so it is never mistaken for an ordinary tab.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
          height: 62,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Zones',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcon name="map-marker-radius" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          title: 'SOS',
          tabBarIcon: ({ size }) => (
            <MaterialIcon name="alert-octagon" color={theme.colors.error} size={size + 4} />
          ),
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', color: theme.colors.error },
        }}
      />
      <Tabs.Screen
        name="advisor"
        options={{
          title: 'Advisor',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcon name="message-text" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcon name="cog-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
