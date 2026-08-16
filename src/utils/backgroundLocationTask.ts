import TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import {
  calculateDistance,
  calculateAverageVelocity,
  getEstimatedTimeToTarget,
  shouldTriggerFromGPS,
} from './locationUtils';
import {
  getAlarmState,
  getThresholdDistance,
  getTargetLocation,
  saveLastKnownLocation,
  saveLocationSample,
  getLocationSamples,
  getLastKnownLocation,
  updateAlarmPhase,
} from './cacheManager';
import { triggerAlarm, isAlarmRunning, stopAlarm, sendNotification } from './alarmManager';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const GPS_STALE_TIMEOUT_MS = 30000;

let gpsStaleTimeoutId: ReturnType<typeof setTimeout> | null = null;
let failsafeTimeoutId: ReturnType<typeof setTimeout> | null = null;

type ActivePhase = 'IDLE' | 'TRACKING' | 'GPS_LOST' | 'FAILSAFE' | 'TRIGGERED' | 'CLEANUP';

const setBackgroundAlarmState = async (nextState: ActivePhase): Promise<void> => {
  await updateAlarmPhase(nextState, nextState !== 'IDLE' && nextState !== 'CLEANUP');
};

const clearGpsStaleTimer = (): void => {
  if (gpsStaleTimeoutId) {
    clearTimeout(gpsStaleTimeoutId);
    gpsStaleTimeoutId = null;
  }
};

const clearFailsafeTimer = (): void => {
  if (failsafeTimeoutId) {
    clearTimeout(failsafeTimeoutId);
    failsafeTimeoutId = null;
  }
};

const scheduleGpsStaleCheck = async (): Promise<void> => {
  clearGpsStaleTimer();
  const state = await getAlarmState();
  if (!state?.isActive || state.phase === 'TRIGGERED' || state.phase === 'CLEANUP') return;

  const lastUpdateTime = typeof state.lastUpdateTime === 'number' ? state.lastUpdateTime : Date.now();
  const delay = Math.max(0, GPS_STALE_TIMEOUT_MS - (Date.now() - lastUpdateTime));

  gpsStaleTimeoutId = setTimeout(() => {
    void (async () => {
      const latest = await getAlarmState();
      if (!latest?.isActive || latest.phase === 'TRIGGERED' || latest.phase === 'CLEANUP') return;

      const latestTime = typeof latest.lastUpdateTime === 'number' ? latest.lastUpdateTime : Date.now();
      if (Date.now() - latestTime >= GPS_STALE_TIMEOUT_MS) {
        await setBackgroundAlarmState('GPS_LOST');
        await handleGPSDisabledFailsafe();
      } else {
        await setBackgroundAlarmState('TRACKING');
        await scheduleGpsStaleCheck();
      }
    })();
  }, delay);
};

export const defineBackgroundLocationTask = (): void => {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async (body) => {
    const { data, error } = body as {
      data?: { locations?: Location.LocationObject[] };
      error?: Error | null;
    };

    if (error || !data?.locations?.length) return;

    const location = data.locations[data.locations.length - 1];
    if (!location?.coords) return;

    try {
      const alarmState = await getAlarmState();
      const targetLocation = await getTargetLocation();
      const thresholdDistance = await getThresholdDistance();
      if (!alarmState?.isActive || !targetLocation || !thresholdDistance) return;

      const { latitude: lat, longitude: lon, accuracy } = location.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const distance = calculateDistance(lat, lon, targetLocation.lat, targetLocation.lon);
      if (distance === null) return;

      // Re-read state immediately before changing anything so a concurrent alarm
      // or cleanup cannot be overwritten by a stale callback.
      const latestState = await getAlarmState();
      if (!latestState?.isActive || latestState.phase === 'TRIGGERED' || latestState.phase === 'CLEANUP' || isAlarmRunning()) {
        return;
      }

      clearFailsafeTimer();
      await setBackgroundAlarmState('TRACKING');
      await saveLocationSample({ lat, lon, timestamp: Date.now() });
      await saveLastKnownLocation(lat, lon);
      await scheduleGpsStaleCheck();

      if (isAlarmRunning()) return;

      const shouldAlarm = shouldTriggerFromGPS(
        distance,
        thresholdDistance,
        Number.isFinite(accuracy) ? accuracy : null
      );

      if (!shouldAlarm) return;

      const beforeTrigger = await getAlarmState();
      if (beforeTrigger?.phase === 'TRIGGERED' || beforeTrigger?.phase === 'CLEANUP' || isAlarmRunning()) {
        return;
      }

      await triggerAlarm();
    } catch (processingError) {
      if (__DEV__) console.error('Location processing error');
    }
  });
};

// Expo requires the task definition at module scope for background/headless invocation.
defineBackgroundLocationTask();

// Compatibility API for existing callers; the task is already defined above.
export const registerBackgroundLocationTask = async (): Promise<void> => {};

export const startBackgroundLocationUpdates = async (): Promise<void> => {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (registered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Highest,
      timeInterval: 5000,
      distanceInterval: 5,
      foregroundService: {
        notificationTitle: 'Location Alarm Active',
        notificationBody: 'Tracking your location for alarm trigger',
        notificationColor: '#FF6B6B',
      },
    });

    const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!started) {
      throw new Error('Background location updates did not start');
    }

    await scheduleGpsStaleCheck();
  } catch (error) {
    try {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      // Best-effort rollback; preserve the original startup error.
    }
    if (__DEV__) console.error('Failed to start location updates');
    throw error;
  }
};

export const stopBackgroundLocationUpdates = async (): Promise<void> => {
  clearGpsStaleTimer();
  clearFailsafeTimer();

  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (registered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (error) {
    if (__DEV__) console.error('Failed to stop background location updates');
  }
};

export const cancelActiveTracking = async (): Promise<void> => {
  clearGpsStaleTimer();
  clearFailsafeTimer();
  try {
    await stopBackgroundLocationUpdates();
  } catch (error) {
    if (__DEV__) console.warn('Background tracking stop failed');
  }
  await stopAlarm();
};

export const handleGPSDisabledFailsafe = async (): Promise<void> => {
  try {
    clearFailsafeTimer();

    const currentState = await getAlarmState();
    if (!currentState?.isActive || currentState.phase === 'TRIGGERED' || currentState.phase === 'CLEANUP') return;

    const samples = await getLocationSamples();
    const target = await getTargetLocation();
    const lastKnown = await getLastKnownLocation();
    if (!samples || samples.length < 2 || !target || !lastKnown) return;

    const velocity = calculateAverageVelocity(samples);
    if (velocity <= 0) return;

    const remainingDistance = calculateDistance(lastKnown.lat, lastKnown.lon, target.lat, target.lon);
    if (remainingDistance === null) return;

    const estimatedTimeSeconds = getEstimatedTimeToTarget(remainingDistance, velocity);
    if (!Number.isFinite(estimatedTimeSeconds) || estimatedTimeSeconds <= 0 || estimatedTimeSeconds > 3600) return;

    await setBackgroundAlarmState('FAILSAFE');
    await sendNotification(
      'GPS Connection Lost',
      `Estimated trigger time: about ${Math.round(estimatedTimeSeconds)} seconds remaining`
    );

    failsafeTimeoutId = setTimeout(() => {
      void (async () => {
        const latest = await getAlarmState();
        if (!latest?.isActive || latest.phase === 'TRIGGERED' || latest.phase === 'CLEANUP') return;
        await triggerAlarm();
      })();
    }, Math.max(estimatedTimeSeconds * 1000, 5000));
  } catch (error) {
    if (__DEV__) console.error('GPS failsafe error');
  }
};

export const resetAlarmTriggerFlag = (): void => {
  clearGpsStaleTimer();
  clearFailsafeTimer();
};
