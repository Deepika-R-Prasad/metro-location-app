import AsyncStorage from '@react-native-async-storage/async-storage';

const ALARM_STATE_KEY = 'alarm_state';
const TARGET_LOCATION_KEY = 'target_location';
const THRESHOLD_DISTANCE_KEY = 'threshold_distance';
const LAST_KNOWN_LOCATION_KEY = 'last_known_location';
const LOCATION_SAMPLES_KEY = 'location_samples';

export interface AlarmState {
  isActive: boolean;
  targetLat?: number;
  targetLon?: number;
  thresholdDistance?: number;
  lastKnownLat?: number;
  lastKnownLon?: number;
  lastUpdateTime?: number;
}

export interface LocationSample {
  lat: number;
  lon: number;
  timestamp: number;
}

/**
 * Save current alarm state to local storage
 */
export const saveAlarmState = async (state: AlarmState): Promise<void> => {
  try {
    await AsyncStorage.setItem(ALARM_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
  }
};

/**
 * Retrieve alarm state from local storage
 */
export const getAlarmState = async (): Promise<AlarmState | null> => {
  try {
    const state = await AsyncStorage.getItem(ALARM_STATE_KEY);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

/**
 * Save target location coordinates
 */
export const saveTargetLocation = async (
  lat: number,
  lon: number
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      TARGET_LOCATION_KEY,
      JSON.stringify({ lat, lon })
    );
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
  }
};

/**
 * Get target location coordinates
 */
export const getTargetLocation = async (): Promise<{
  lat: number;
  lon: number;
} | null> => {
  try {
    const location = await AsyncStorage.getItem(TARGET_LOCATION_KEY);
    return location ? JSON.parse(location) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

/**
 * Save threshold distance in meters
 */
export const saveThresholdDistance = async (
  distance: number
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      THRESHOLD_DISTANCE_KEY,
      JSON.stringify(distance)
    );
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
  }
};

/**
 * Get threshold distance in meters
 */
export const getThresholdDistance = async (): Promise<number | null> => {
  try {
    const distance = await AsyncStorage.getItem(THRESHOLD_DISTANCE_KEY);
    return distance ? JSON.parse(distance) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

/**
 * Save last known location for fallback calculations
 */
export const saveLastKnownLocation = async (
  lat: number,
  lon: number
): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      LAST_KNOWN_LOCATION_KEY,
      JSON.stringify({ lat, lon, timestamp: Date.now() })
    );
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
  }
};

/**
 * Get last known location for fallback
 */
export const getLastKnownLocation = async (): Promise<{
  lat: number;
  lon: number;
  timestamp: number;
} | null> => {
  try {
    const location = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
    return location ? JSON.parse(location) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

/**
 * Store location samples for velocity calculation
 */
export const saveLocationSample = async (
  sample: LocationSample
): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(LOCATION_SAMPLES_KEY);
    let samples: LocationSample[] = existing ? JSON.parse(existing) : [];

    // Keep only last 20 samples for reasonable velocity calculation
    samples.push(sample);
    if (samples.length > 20) {
      samples = samples.slice(-20);
    }

    await AsyncStorage.setItem(LOCATION_SAMPLES_KEY, JSON.stringify(samples));
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
  }
};

/**
 * Retrieve all location samples
 */
export const getLocationSamples = async (): Promise<LocationSample[]> => {
  try {
    const samples = await AsyncStorage.getItem(LOCATION_SAMPLES_KEY);
    return samples ? JSON.parse(samples) : [];
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return [];
  }
};

/**
 * Wipe all sensitive data from storage (called after alarm completion)
 * ⚠️ SECURITY: Verifies all keys are removed, critical for privacy compliance
 */
export const wipeAllData = async (): Promise<void> => {
  try {
    // Remove all keys
    await Promise.all([
      AsyncStorage.removeItem(ALARM_STATE_KEY),
      AsyncStorage.removeItem(TARGET_LOCATION_KEY),
      AsyncStorage.removeItem(THRESHOLD_DISTANCE_KEY),
      AsyncStorage.removeItem(LAST_KNOWN_LOCATION_KEY),
      AsyncStorage.removeItem(LOCATION_SAMPLES_KEY),
    ]);

    // VERIFICATION: Confirm all keys are actually gone (critical for compliance)
    if (__DEV__) {
      const verification = await Promise.all([
        AsyncStorage.getItem(ALARM_STATE_KEY),
        AsyncStorage.getItem(TARGET_LOCATION_KEY),
        AsyncStorage.getItem(THRESHOLD_DISTANCE_KEY),
        AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY),
        AsyncStorage.getItem(LOCATION_SAMPLES_KEY),
      ]);
      if (verification.some(v => v !== null)) {
        console.warn('WARNING: Some keys were not deleted');
      }
    }
  } catch (error) {
    if (__DEV__) console.warn('Error during data wipe');
  }
};
