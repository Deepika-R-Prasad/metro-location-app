import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  useColorScheme,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import {
  saveTargetLocation,
  saveThresholdDistance,
  saveAlarmState,
} from '../utils/cacheManager';
import {
  registerBackgroundLocationTask,
  startBackgroundLocationUpdates,
} from '../utils/backgroundLocationTask';
import { initializeNotifications } from '../utils/alarmManager';

interface ConfigurationScreenProps {
  navigation: any;
}

export const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({
  navigation,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [thresholdDistance, setThresholdDistance] = useState<string>('100');
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<string>('');

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to set current location as target'
        );
        return;
      }

      setIsLoading(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const lat = location.coords.latitude.toFixed(6);
      const lon = location.coords.longitude.toFixed(6);

      setLatitude(lat);
      setLongitude(lon);
      setCurrentLocation(`${lat}, ${lon}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateInputs = (): boolean => {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const threshold = parseFloat(thresholdDistance);

    if (isNaN(lat) || isNaN(lon) || isNaN(threshold)) {
      Alert.alert('Invalid Input', 'Please enter valid numbers');
      return false;
    }

    if (lat < -90 || lat > 90) {
      Alert.alert('Invalid Latitude', 'Latitude must be between -90 and 90');
      return false;
    }

    if (lon < -180 || lon > 180) {
      Alert.alert(
        'Invalid Longitude',
        'Longitude must be between -180 and 180'
      );
      return false;
    }

    if (threshold < 10 || threshold > 100000) {
      Alert.alert(
        'Invalid Threshold',
        'Distance must be between 10m and 100km'
      );
      return false;
    }

    return true;
  };

  const handleStartTracking = async () => {
    if (!validateInputs()) {
      return;
    }

    try {
      setIsLoading(true);

      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const threshold = parseFloat(thresholdDistance);

      // Save configuration
      await saveTargetLocation(lat, lon);
      await saveThresholdDistance(threshold);

      // Initialize notifications
      await initializeNotifications();

      // Request background location permission first, before marking alarm active.
      const { status } =
        await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Background location permission is required for the alarm to work'
        );
        setIsLoading(false);
        return;
      }

      await saveAlarmState({
        isActive: true,
        targetLat: lat,
        targetLon: lon,
        thresholdDistance: threshold,
      });

      // Register and start background location tracking
      await registerBackgroundLocationTask();
      await startBackgroundLocationUpdates();

      Alert.alert('Success', 'Location alarm is now active!', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('Home'),
        },
      ]);
    } catch (error) {
      console.error('Error starting tracking:', error);
      Alert.alert('Error', 'Failed to start location tracking');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' },
      ]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.headerSection}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text
                style={[
                  styles.backButtonText,
                  { color: isDark ? '#ffffff' : '#1a1a1a' },
                ]}
              >
                ← Back
              </Text>
            </TouchableOpacity>

            <Text
              style={[
                styles.title,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Configure Alarm
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: isDark ? '#b0b0b0' : '#666666' },
              ]}
            >
              Set your destination and preferred distance threshold
            </Text>
          </View>

          {/* Current Location Card */}
          {currentLocation && (
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: isDark ? '#2a2a2a' : '#e8f4f8',
                  borderColor: isDark ? '#3a3a3a' : '#b3d9e8',
                },
              ]}
            >
              <Text
                style={[
                  styles.infoCardLabel,
                  { color: isDark ? '#b0b0b0' : '#666666' },
                ]}
              >
                📍 Current Location
              </Text>
              <Text
                style={[
                  styles.infoCardValue,
                  { color: isDark ? '#ffffff' : '#1a1a1a' },
                ]}
              >
                {currentLocation}
              </Text>
            </View>
          )}

          {/* Target Location Section */}
          <View style={styles.formSection}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Target Destination
            </Text>

            <View style={styles.coordinateInputGroup}>
              <View style={styles.coordinateInputContainer}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: isDark ? '#b0b0b0' : '#666666' },
                  ]}
                >
                  Latitude
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                      color: isDark ? '#ffffff' : '#1a1a1a',
                      borderColor: isDark ? '#3a3a3a' : '#ddd',
                    },
                  ]}
                  placeholder="e.g., 40.7128"
                  placeholderTextColor={isDark ? '#666666' : '#999999'}
                  value={latitude}
                  onChangeText={setLatitude}
                  keyboardType="decimal-pad"
                  editable={!isLoading}
                />
              </View>

              <View style={styles.coordinateInputContainer}>
                <Text
                  style={[
                    styles.inputLabel,
                    { color: isDark ? '#b0b0b0' : '#666666' },
                  ]}
                >
                  Longitude
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                      color: isDark ? '#ffffff' : '#1a1a1a',
                      borderColor: isDark ? '#3a3a3a' : '#ddd',
                    },
                  ]}
                  placeholder="e.g., -74.0060"
                  placeholderTextColor={isDark ? '#666666' : '#999999'}
                  value={longitude}
                  onChangeText={setLongitude}
                  keyboardType="decimal-pad"
                  editable={!isLoading}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.useCurrentButton,
                { opacity: isLoading ? 0.5 : 1 },
              ]}
              onPress={getCurrentLocation}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator
                  size="small"
                  color="#FF6B6B"
                />
              ) : (
                <Text style={styles.useCurrentButtonText}>
                  📍 Use Current Location
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Threshold Distance Section */}
          <View style={styles.formSection}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Trigger Threshold
            </Text>

            <Text
              style={[
                styles.inputLabel,
                { color: isDark ? '#b0b0b0' : '#666666' },
              ]}
            >
              Distance in Meters
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                  color: isDark ? '#ffffff' : '#1a1a1a',
                  borderColor: isDark ? '#3a3a3a' : '#ddd',
                },
              ]}
              placeholder="e.g., 100"
              placeholderTextColor={isDark ? '#666666' : '#999999'}
              value={thresholdDistance}
              onChangeText={setThresholdDistance}
              keyboardType="decimal-pad"
              editable={!isLoading}
            />

            <View
              style={[
                styles.thresholdHelper,
                {
                  backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
                  borderColor: isDark ? '#3a3a3a' : '#ddd',
                },
              ]}
            >
              <Text
                style={[
                  styles.thresholdHelperText,
                  { color: isDark ? '#b0b0b0' : '#666666' },
                ]}
              >
                💡 Recommended: 100-500m for most use cases
              </Text>
            </View>
          </View>

          {/* Start Button */}
          <TouchableOpacity
            style={[
              styles.startButton,
              { opacity: isLoading ? 0.6 : 1 },
            ]}
            onPress={handleStartTracking}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.startButtonText}>Start Tracking</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  headerSection: {
    marginBottom: 30,
  },
  backButton: {
    paddingVertical: 10,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  infoCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardValue: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Courier New',
  },
  formSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  coordinateInputGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  coordinateInputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  useCurrentButton: {
    borderWidth: 1.5,
    borderColor: '#FF6B6B',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  useCurrentButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  thresholdHelper: {
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  thresholdHelperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  startButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
