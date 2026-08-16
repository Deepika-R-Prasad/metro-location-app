import AsyncStorage from '@react-native-async-storage/async-storage';

const ALARM_STATE_KEY = 'alarm_state';
const TARGET_LOCATION_KEY = 'target_location';
const THRESHOLD_DISTANCE_KEY = 'threshold_distance';
const LAST_KNOWN_LOCATION_KEY = 'last_known_location';
const LOCATION_SAMPLES_KEY = 'location_samples';

export type AlarmPhase =
  | 'IDLE'
  | 'TRACKING'
  | 'GPS_LOST'
  | 'FAILSAFE'
  | 'TRIGGERED'
  | 'CLEANUP';

export interface AlarmState {
  isActive: boolean;
  phase?: AlarmPhase;
  targetLat?: number;
  targetLon?: number;
  targetLabel?: string;
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

export const saveAlarmState = async (state: AlarmState): Promise<void> => {
  try {
    await AsyncStorage.setItem(ALARM_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    throw new Error('Unable to save alarm state locally');
  }
};

export const getAlarmState = async (): Promise<AlarmState | null> => {
  try {
    const state = await AsyncStorage.getItem(ALARM_STATE_KEY);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

export const updateAlarmPhase = async (
  phase: AlarmPhase,
  isActive = phase !== 'IDLE' && phase !== 'CLEANUP'
): Promise<AlarmState | null> => {
  const currentState = (await getAlarmState()) ?? { isActive: false };
  const nextState: AlarmState = {
    ...currentState,
    isActive,
    phase,
    lastUpdateTime: Date.now(),
  };
  await saveAlarmState(nextState);
  return nextState;
};

export const saveTargetLocation = async (lat: number, lon: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(TARGET_LOCATION_KEY, JSON.stringify({ lat, lon }));
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    throw new Error('Unable to save local session data');
  }
};

export const getTargetLocation = async (): Promise<{ lat: number; lon: number } | null> => {
  try {
    const location = await AsyncStorage.getItem(TARGET_LOCATION_KEY);
    return location ? JSON.parse(location) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

export const saveThresholdDistance = async (distance: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(THRESHOLD_DISTANCE_KEY, JSON.stringify(distance));
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    throw new Error('Unable to save local session data');
  }
};

export const getThresholdDistance = async (): Promise<number | null> => {
  try {
    const distance = await AsyncStorage.getItem(THRESHOLD_DISTANCE_KEY);
    return distance ? JSON.parse(distance) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

export const saveLastKnownLocation = async (lat: number, lon: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      LAST_KNOWN_LOCATION_KEY,
      JSON.stringify({ lat, lon, timestamp: Date.now() })
    );
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    throw new Error('Unable to save local session data');
  }
};

export const getLastKnownLocation = async (): Promise<{ lat: number; lon: number; timestamp: number } | null> => {
  try {
    const location = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
    return location ? JSON.parse(location) : null;
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return null;
  }
};

export const saveLocationSample = async (sample: LocationSample): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(LOCATION_SAMPLES_KEY);
    let samples: LocationSample[] = existing ? JSON.parse(existing) : [];
    samples.push(sample);
    if (samples.length > 20) samples = samples.slice(-20);
    await AsyncStorage.setItem(LOCATION_SAMPLES_KEY, JSON.stringify(samples));
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    throw new Error('Unable to save local session data');
  }
};

export const getLocationSamples = async (): Promise<LocationSample[]> => {
  try {
    const samples = await AsyncStorage.getItem(LOCATION_SAMPLES_KEY);
    return samples ? JSON.parse(samples) : [];
  } catch (error) {
    if (__DEV__) console.warn('Storage error');
    return [];
  }
};

export const wipeAllData = async (): Promise<void> => {
  const keys = [ALARM_STATE_KEY, TARGET_LOCATION_KEY, THRESHOLD_DISTANCE_KEY, LAST_KNOWN_LOCATION_KEY, LOCATION_SAMPLES_KEY];
  const results = await Promise.allSettled(keys.map((key) => AsyncStorage.removeItem(key)));
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Unable to remove all local session data');
  }
  const remaining = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)));
  if (remaining.some((value) => value !== null)) {
    throw new Error('Local session cleanup could not be verified');
  }
};
