import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { HomeScreen } from './src/screens/HomeScreen';
import { ConfigurationScreen } from './src/screens/ConfigurationScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      // Request location permission
      const locationStatus =
        await Location.requestForegroundPermissionsAsync();
      if (locationStatus.status !== 'granted') {
        console.warn('Location permission denied');
      }

      // Request notification permission
      const notificationStatus =
        await Notifications.requestPermissionsAsync();
      if (notificationStatus.status !== 'granted') {
        console.warn('Notification permission denied');
      }

      console.log('Permissions requested');
    } catch (error) {
      console.error('Error requesting permissions:', error);
    }
  };

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Configuration" component={ConfigurationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
