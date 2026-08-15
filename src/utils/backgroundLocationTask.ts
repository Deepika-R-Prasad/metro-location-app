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
let backgroundAlarmState: 'IDLE' | 'TRACKING' | 'GPS_LOST' | 'FAILSAFE' | 'TRIGGERED' | 'CLEANUP' = 'IDLE';

const setBackgroundAlarmState = async (
  nextState: 'IDLE' | 'TRACKING' | 'GPS_LOST' | 'FAILSAFE' | 'TRIGGERED' | 'CLEANUP'
): Promise<void> => {
  backgroundAlarmState = nextState;
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

  const alarmState = await getAlarmState();
  if (!alarmState?.isActive || alarmState.phase === 'TRIGGERED' || alarmState.phase === 'CLEANUP') {
    return;
  }

  const lastUpdateTime = typeof alarmState.lastUpdateTime === 'number' ? alarmState.lastUpdateTime : Date.now();
  const remainingDelay = Math.max(0, GPS_STALE_TIMEOUT_MS - (Date.now() - lastUpdateTime));

  gpsStaleTimeoutId = setTimeout(async () => {
    const latestAlarmState = await getAlarmState();
    if (!latestAlarmState?.isActive || latestAlarmState.phase === 'TRIGGERED' || latestAlarmState.phase === 'CLEANUP') {
      return;
    }

    const latestLastUpdateTime = typeof latestAlarmState.lastUpdateTime === 'number'
      ? latestAlarmState.lastUpdateTime
      : Date.now();

    if (Date.now() - latestLastUpdateTime >= GPS_STALE_TIMEOUT_MS) {
      await setBackgroundAlarmState('GPS_LOST');
      await handleGPSDisabledFailsafe();
    } else {
      await setBackgroundAlarmState('TRACKING');
    }
  }, remainingDelay);
};

export const defineBackgroundLocationTask = (): void => {
  TaskManager.defineTask(
    BACKGROUND_LOCATION_TASK,
    async (body) => {
      const { data, error } = body as {
        data?: { locations?: Location.LocationObject[] };
        error?: Error | null;
      };

      if (error) {
        if (__DEV__) console.error('Background location task error');
        return;
      }

      if (!data?.locations || data.locations.length === 0) {
        return;
      }

      const location = data.locations[data.locations.length - 1];
      if (!location || !location.coords) {
        if (__DEV__) console.warn('Invalid location data received');
        return;
      }

      try {
        const alarmState = await getAlarmState();
        const targetLocation = await getTargetLocation();
        const thresholdDistance = await getThresholdDistance();

        if (!alarmState?.isActive || !targetLocation || !thresholdDistance) {
          return;
        }

        const lat = location.coords.latitude;
        const lon = location.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          if (__DEV__) console.warn('Invalid coordinates received');
          return;
        }

        const distance = calculateDistance(lat, lon, targetLocation.lat, targetLocation.lon);
        if (distance === null) {
          return;
        }

        const accuracyMeters = Number.isFinite(location.coords.accuracy) ? location.coords.accuracy : 0;

        await setBackgroundAlarmState('TRACKING');
        await saveLocationSample({ lat, lon, timestamp: Date.now() });
        await saveLastKnownLocation(lat, lon);
        await scheduleGpsStaleCheck();

        if (alarmState.phase === 'TRIGGERED' || isAlarmRunning()) {
          return;
        }

        clearFailsafeTimer();

        const shouldAlarm = shouldTriggerFromGPS(distance, thresholdDistance, accuracyMeters);

        if (shouldAlarm) {
          const latestState = await getAlarmState();
          if (latestState?.phase === 'TRIGGERED' || isAlarmRunning()) {
            return;
          }

          await setBackgroundAlarmState('TRIGGERED');
          if (!isAlarmRunning()) {
            await triggerAlarm();
          }
          return;
        }
      } catch (error) {
        if (__DEV__) console.error('Location processing error');
      }
    }
  );
};

/**
 * Register background location task
 */
export const registerBackgroundLocationTask = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK
    );
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      await TaskManager.unregisterTaskAsync(BACKGROUND_LOCATION_TASK);
    }

    if (__DEV__) console.log('Background location task registered');
  } catch (error) {
    if (__DEV__) console.error('Failed to register background location task');
  }
};

/**
 * Start background location updates with high accuracy
 */
export const startBackgroundLocationUpdates = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK
    );

    if (!isRegistered) {
      await registerBackgroundLocationTask();
    }

    // Start location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Highest,
      timeInterval: 5000, // Update every 5 seconds
      distanceInterval: 5, // Or when moved 5 meters
      foregroundService: {
        notificationTitle: 'Location Alarm Active',
        notificationBody: 'Tracking your location for alarm trigger',
        notificationColor: '#FF6B6B',
      },
    });

    if (__DEV__) console.log('Background location updates started');
  } catch (error) {
    if (__DEV__) console.error('Location permission error');
  }
};

/**
 * Stop background location updates
 */
export const stopBackgroundLocationUpdates = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK
    );

    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (__DEV__) console.log('Background location updates stopped');
    }
  } catch (error) {
    if (__DEV__) console.error('Failed to stop background location updates');
  }
};

export const cancelActiveTracking = async (): Promise<void> => {
  try {
    await stopAlarm();
  } catch (error) {
    if (__DEV__) console.warn('Alarm stop during cancel failed');
  }

  await stopBackgroundLocationUpdates();
  resetAlarmTriggerFlag();
};

/**
 * Handle GPS disabled fail-safe: use velocity-based estimation
 */
export const handleGPSDisabledFailsafe = async (): Promise<void> => {
  try {
    if (failsafeTimeoutId) {
      clearTimeout(failsafeTimeoutId);
      failsafeTimeoutId = null;
    }

    const locationSamples = await getLocationSamples();
    const targetLocation = await getTargetLocation();
    const lastKnownLocationData = await getLastKnownLocation();

    if (!locationSamples || !targetLocation || !lastKnownLocationData || locationSamples.length < 2) {
      if (__DEV__) console.warn('GPS failsafe requires recent samples');
      return;
    }

    const avgVelocity = calculateAverageVelocity(locationSamples);
    if (avgVelocity <= 0) {
      if (__DEV__) console.warn('GPS failsafe cannot estimate velocity');
      return;
    }

    const remainingDistance = calculateDistance(
      lastKnownLocationData.lat,
      lastKnownLocationData.lon,
      targetLocation.lat,
      targetLocation.lon
    );

    if (remainingDistance === null) {
      return;
    }

    const estimatedTimeSeconds = getEstimatedTimeToTarget(remainingDistance, avgVelocity);

    if (!Number.isFinite(estimatedTimeSeconds) || estimatedTimeSeconds <= 0 || estimatedTimeSeconds > 3600) {
      return;
    }

    await setBackgroundAlarmState('FAILSAFE');
    clearFailsafeTimer();

    await sendNotification(
      'GPS Connection Lost',
      `Estimated trigger time: about ${Math.round(estimatedTimeSeconds)} seconds remaining`
    );

    const timeoutMs = Math.max(estimatedTimeSeconds * 1000, 5000);
    failsafeTimeoutId = setTimeout(async () => {
      const currentState = await getAlarmState();
      if (!currentState?.isActive || currentState.phase === 'TRIGGERED' || currentState.phase === 'CLEANUP') {
        return;
      }

      await setBackgroundAlarmState('TRIGGERED');
      if (!isAlarmRunning()) {
        await triggerAlarm();
      }
    }, timeoutMs);
  } catch (error) {
    if (__DEV__) console.error('GPS failsafe error');
  }
};

/**
 * Reset state used by background task monitoring.
 */
export const resetAlarmTriggerFlag = (): void => {
  clearGpsStaleTimer();
  clearFailsafeTimer();
  backgroundAlarmState = 'IDLE';
};
