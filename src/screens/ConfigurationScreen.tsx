import React, { useRef, useState } from 'react';
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
  Modal,
  Pressable,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import {
  saveTargetLocation,
  saveThresholdDistance,
  saveAlarmState,
  wipeAllData,
} from '../utils/cacheManager';
import {
  registerBackgroundLocationTask,
  startBackgroundLocationUpdates,
} from '../utils/backgroundLocationTask';
import { initializeNotifications } from '../utils/alarmManager';

interface ConfigurationScreenProps {
  navigation: any;
}

interface DestinationResult {
  latitude: number;
  longitude: number;
  label: string;
}

const MIN_SEARCH_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 800;
const MAX_RESULTS = 5;

// Fixed, simple distance choices. The underlying alarm remains metres-based.
const DISTANCE_OPTIONS = [50, 100, 200, 300, 500, 1000, 2000];

export const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({ navigation }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DestinationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<DestinationResult | null>(null);
  const [thresholdDistance, setThresholdDistance] = useState<number>(100);
  const [isDistancePickerVisible, setIsDistancePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('');
  const searchRequestId = useRef(0);

  const searchDestination = async (text: string): Promise<void> => {
    const query = text.trim();
    const requestId = ++searchRequestId.current;

    if (query.length < MIN_SEARCH_LENGTH) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);

      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        const requested = await Location.requestForegroundPermissionsAsync();
        if (requested.status !== 'granted') {
          if (requestId === searchRequestId.current) {
            setSearchResults([]);
            setIsSearching(false);
          }
          return;
        }
      }

      const geocodedLocations = await Location.geocodeAsync(query);

      if (requestId !== searchRequestId.current) return;

      const seen = new Set<string>();
      const mapped: DestinationResult[] = geocodedLocations
        .filter(
          (location) =>
            Number.isFinite(location.latitude) &&
            Number.isFinite(location.longitude)
        )
        .map((location) => ({
          latitude: location.latitude,
          longitude: location.longitude,
          label: query,
        }))
        .filter((location) => {
          const key = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, MAX_RESULTS);

      setSearchResults(mapped);
    } catch (error) {
      if (requestId === searchRequestId.current) setSearchResults([]);
      if (__DEV__) console.warn('Destination search failed');
    } finally {
      if (requestId === searchRequestId.current) setIsSearching(false);
    }
  };

  const handleSearchChange = (text: string): void => {
    searchRequestId.current += 1;
    setSearchQuery(text);
    setSelectedDestination(null);
    setSearchResults([]);
    setIsSearching(false);

    const query = text.trim();
    if (query.length < MIN_SEARCH_LENGTH) return;

    const requestId = searchRequestId.current;
    setIsSearching(true);

    setTimeout(() => {
      if (requestId !== searchRequestId.current) return;
      void searchDestination(query);
    }, SEARCH_DEBOUNCE_MS);
  };

  const selectDestination = (result: DestinationResult): void => {
    searchRequestId.current += 1;
    setSelectedDestination(result);
    setSearchQuery(result.label);
    setSearchResults([]);
    setIsSearching(false);
  };

  const getCurrentLocation = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location permission needed',
          'Allow location access to select your current position as the destination.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const destination: DestinationResult = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        label: 'Current location',
      };

      setSelectedDestination(destination);
      setSearchQuery(destination.label);
      setSearchResults([]);
      setCurrentLocation(
        `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location');
      if (__DEV__) console.error('Current location error');
    } finally {
      setIsLoading(false);
    }
  };

  const validateInputs = (): boolean => {
    if (!selectedDestination) {
      Alert.alert(
        'Select a destination',
        'Search for a place and select a result before setting the alarm.'
      );
      return false;
    }

    if (
      !Number.isFinite(selectedDestination.latitude) ||
      !Number.isFinite(selectedDestination.longitude)
    ) {
      Alert.alert('Invalid Destination', 'Please select a valid destination.');
      return false;
    }

    if (!DISTANCE_OPTIONS.includes(thresholdDistance)) {
      Alert.alert('Invalid Distance', 'Please select a valid alert distance.');
      return false;
    }

    return true;
  };

  const handleStartTracking = async (): Promise<void> => {
    if (!validateInputs()) return;

    let sessionDataPersisted = false;

    try {
      setIsLoading(true);

      const lat = selectedDestination!.latitude;
      const lon = selectedDestination!.longitude;

      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== 'granted') {
        Alert.alert(
          'Location permission required',
          'Location access is required to monitor your trip.'
        );
        return;
      }

      const notifications = await Notifications.requestPermissionsAsync();
      if (notifications.status !== 'granted') {
        Alert.alert(
          'Notifications required',
          'Notifications are required so the app can alert you near your destination.'
        );
        return;
      }

      await initializeNotifications();

      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== 'granted') {
        Alert.alert(
          'Background location required',
          'Allow background location so the alarm can continue working when the screen is off or the app is minimized.'
        );
        return;
      }

      await saveTargetLocation(lat, lon);
      await saveThresholdDistance(thresholdDistance);
      await saveAlarmState({
        isActive: true,
        phase: 'TRACKING',
        targetLat: lat,
        targetLon: lon,
        thresholdDistance,
        lastUpdateTime: Date.now(),
      });
      sessionDataPersisted = true;

      await registerBackgroundLocationTask();
      await startBackgroundLocationUpdates();

      Alert.alert(
        'Alarm active',
        'You will be notified when you are nearing your destination.',
        [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
      );
    } catch (error) {
      if (sessionDataPersisted) await wipeAllData();
      if (__DEV__) console.error('Error starting tracking');
      Alert.alert('Error', 'Failed to start location tracking. Please try again.');
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
          keyboardShouldPersistTaps="handled"
        >
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
              style={[styles.title, { color: isDark ? '#ffffff' : '#1a1a1a' }]}
            >
              Configure Alarm
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: isDark ? '#b0b0b0' : '#666666' },
              ]}
            >
              Search for your destination and choose when to be notified.
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Destination
            </Text>

            <TextInput
              style={[
                styles.textInput,
                styles.searchInput,
                {
                  backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                  color: isDark ? '#ffffff' : '#1a1a1a',
                  borderColor: isDark ? '#3a3a3a' : '#ddd',
                },
              ]}
              placeholder="Search a place, station or city"
              placeholderTextColor={isDark ? '#777777' : '#999999'}
              value={searchQuery}
              onChangeText={handleSearchChange}
              editable={!isLoading}
              autoCorrect={false}
              returnKeyType="search"
            />

            {isSearching && (
              <View style={styles.searchStatus}>
                <ActivityIndicator size="small" color="#FF6B6B" />
                <Text
                  style={[
                    styles.searchStatusText,
                    { color: isDark ? '#b0b0b0' : '#666666' },
                  ]}
                >
                  Searching…
                </Text>
              </View>
            )}

            {searchResults.length > 0 && !selectedDestination && (
              <View
                style={[
                  styles.resultsCard,
                  {
                    backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                    borderColor: isDark ? '#3a3a3a' : '#ddd',
                  },
                ]}
              >
                {searchResults.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.latitude}-${item.longitude}-${index}`}
                    style={[
                      styles.resultItem,
                      {
                        borderBottomColor: isDark ? '#3a3a3a' : '#eeeeee',
                      },
                    ]}
                    onPress={() => selectDestination(item)}
                  >
                    <Text
                      style={[
                        styles.resultTitle,
                        { color: isDark ? '#ffffff' : '#1a1a1a' },
                      ]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.resultCoordinates,
                        { color: isDark ? '#999999' : '#777777' },
                      ]}
                    >
                      {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedDestination && (
              <View
                style={[
                  styles.selectedCard,
                  {
                    backgroundColor: isDark ? '#2a2a2a' : '#eef8f2',
                    borderColor: isDark ? '#3a3a3a' : '#b7ddc3',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.selectedLabel,
                    { color: isDark ? '#ffffff' : '#1a1a1a' },
                  ]}
                >
                  ✓ Destination selected
                </Text>
                <Text
                  style={[
                    styles.selectedName,
                    { color: isDark ? '#b0b0b0' : '#555555' },
                  ]}
                >
                  {selectedDestination.label}
                </Text>
                <Text
                  style={[
                    styles.resultCoordinates,
                    { color: isDark ? '#999999' : '#777777' },
                  ]}
                >
                  {selectedDestination.latitude.toFixed(5)},{' '}
                  {selectedDestination.longitude.toFixed(5)}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.useCurrentButton,
                { opacity: isLoading ? 0.5 : 1 },
              ]}
              onPress={getCurrentLocation}
              disabled={isLoading}
            >
              <Text style={styles.useCurrentButtonText}>
                📍 Use Current Location
              </Text>
            </TouchableOpacity>

            {currentLocation && (
              <Text
                style={[
                  styles.currentLocationText,
                  { color: isDark ? '#888888' : '#777777' },
                ]}
              >
                Current device location: {currentLocation}
              </Text>
            )}

            <Text
              style={[
                styles.helperText,
                { color: isDark ? '#888888' : '#777777' },
              ]}
            >
              The app saves only the selected latitude/longitude for the active
              alarm. Network access is not required once the alarm is set.
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Trigger Distance
            </Text>
            <Text
              style={[
                styles.inputLabel,
                { color: isDark ? '#b0b0b0' : '#666666' },
              ]}
            >
              Notify me when I am this far from the destination
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.dropdownButton,
                {
                  backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                  borderColor: isDark ? '#3a3a3a' : '#ddd',
                },
              ]}
              onPress={() => setIsDistancePickerVisible(true)}
              disabled={isLoading}
            >
              <Text
                style={[
                  styles.dropdownButtonText,
                  { color: isDark ? '#ffffff' : '#1a1a1a' },
                ]}
              >
                {thresholdDistance >= 1000
                  ? `${thresholdDistance / 1000} km`
                  : `${thresholdDistance} m`}
              </Text>
              <Text
                style={[
                  styles.dropdownArrow,
                  { color: isDark ? '#b0b0b0' : '#666666' },
                ]}
              >
                ▼
              </Text>
            </TouchableOpacity>

            <Text
              style={[
                styles.helperText,
                { color: isDark ? '#888888' : '#777777' },
              ]}
            >
              Choose a fixed distance; the alarm will trigger when GPS reports
              that you are within this distance.
            </Text>
          </View>

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
              <Text style={styles.startButtonText}>Set Alarm</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={isDistancePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDistancePickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsDistancePickerVisible(false)}
        >
          <Pressable
            style={[
              styles.pickerCard,
              { backgroundColor: isDark ? '#222222' : '#ffffff' },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text
              style={[
                styles.pickerTitle,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Trigger Distance
            </Text>

            {DISTANCE_OPTIONS.map((distance) => (
              <TouchableOpacity
                key={distance}
                style={[
                  styles.pickerOption,
                  {
                    backgroundColor:
                      thresholdDistance === distance
                        ? isDark
                          ? '#3a2a2a'
                          : '#fff1f1'
                        : 'transparent',
                  },
                ]}
                onPress={() => {
                  setThresholdDistance(distance);
                  setIsDistancePickerVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    {
                      color:
                        thresholdDistance === distance
                          ? '#FF6B6B'
                          : isDark
                          ? '#ffffff'
                          : '#1a1a1a',
                    },
                  ]}
                >
                  {distance >= 1000 ? `${distance / 1000} km` : `${distance} m`}
                </Text>
                {thresholdDistance === distance && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardAvoidingView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  headerSection: { marginBottom: 30 },
  backButton: { paddingVertical: 10, marginBottom: 16 },
  backButtonText: { fontSize: 16, fontWeight: '500' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  formSection: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  searchInput: { minHeight: 50 },
  searchStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  searchStatusText: { fontSize: 13 },
  resultsCard: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  resultItem: { padding: 14, borderBottomWidth: 1 },
  resultTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  resultCoordinates: { fontSize: 12 },
  selectedCard: {
    borderRadius: 8,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
  },
  selectedLabel: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  selectedName: { fontSize: 14, marginBottom: 4 },
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
  currentLocationText: {
    fontSize: 12,
    marginTop: 8,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  dropdownButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownButtonText: { fontSize: 16, fontWeight: '600' },
  dropdownArrow: { fontSize: 14 },
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  pickerCard: {
    borderRadius: 16,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pickerOption: {
    minHeight: 50,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerOptionText: { fontSize: 16 },
  checkmark: { color: '#FF6B6B', fontSize: 18, fontWeight: '700' },
});
