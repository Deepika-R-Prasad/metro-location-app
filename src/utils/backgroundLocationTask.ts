import TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { calculateDistance, calculateAverageVelocity, getEstimatedTimeToTarget, shouldTriggerFromGPS } from './locationUtils';
import { getAlarmState, getThresholdDistance, getTargetLocation, saveLastKnownLocation, saveLocationSample, getLocationSamples, getLastKnownLocation, updateAlarmPhase } from './cacheManager';
import { triggerAlarm, isAlarmRunning, stopAlarm, sendNotification } from './alarmManager';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const GPS_STALE_TIMEOUT_MS = 30000;

let gpsStaleTimeoutId: ReturnType<typeof setTimeout> | null = null;
let failsafeTimeoutId: ReturnType<typeof setTimeout> | null = null;

const setBackgroundAlarmState = async (nextState: 'IDLE' | 'TRACKING' | 'GPS_LOST' | 'FAILSAFE' | 'TRIGGERED' | 'CLEANUP'): Promise<void> => {
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
  if (!alarmState?.isActive || alarmState.phase === 'TRIGGERED' || alarmState.phase === 'CLEANUP') return;

  const lastUpdateTime = typeof alarmState.lastUpdateTime === 'number' ? alarmState.lastUpdateTime : Date.now();
  const remainingDelay = Math.max(0, GPS_STALE_TIMEOUT_MS - (Date.now() - lastUpdateTime));

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
  }, remainingDelay);
};

export const defineBackgroundLocationTask = (): void => {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async (body) => {
    const { data, error } = body as { data?: { locations?: Location.LocationObject[] }; error?: Error | null };
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

      clearFailsafeTimer();
      await setBackgroundAlarmState('TRACKING');
      await saveLocationSample({ lat, lon, timestamp: Date.now() });
      await saveLastKnownLocation(lat, lon);
      await scheduleGpsStaleCheck();

      if (alarmState.phase === 'TRIGGERED' || isAlarmRunning()) return;

      if (shouldTriggerFromGPS(distance, thresholdDistance, Number.isFinite(accuracy) ? accuracy : null)) {
        const latestState = await getAlarmState();
        if (latestState?.phase === 'TRIGGERED' || isAlarmRunning()) return;
        await setBackgroundAlarmState('TRIGGERED');
        await triggerAlarm();
      }
    } catch (processingError) {
      if (__DEV__) console.error('Location processing error');
    }
  });
};

export const registerBackgroundLocationTask = async (): Promise<void> => {
  if (__DEV__) console.log('Background location task ready');
};

export const startBackgroundLocationUpdates = async (): Promise<void> => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

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
    await scheduleGpsStaleCheck();
  } catch (error) {
    if (__DEV__) console.error('Location permission error');
    throw error;
  }
};

export const stopBackgroundLocationUpdates = async (): Promise<void> => {
  try {
    clearGpsStaleTimer();
    clearFailsafeTimer();
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch (error) {
    if (__DEV__) console.error('Failed to stop background location updates');
  }
};

export const cancelActiveTracking = async (): Promise<void> => {
  try { await stopAlarm(); } catch (error) { if (__DEV__) console.warn('Alarm stop during cancel failed'); }
  await stopBackgroundLocationUpdates();
  resetAlarmTriggerFlag();
};

export const handleGPSDisabledFailsafe = async (): Promise<void> => {
  try {
    clearFailsafeTimer();
    const currentState = await getAlarmState();
    if (!currentState?.isActive || currentState.phase === 'TRIGGERED' || currentState.phase === 'CLEANUP') return;

    const locationSamples = await getLocationSamples();
    const targetLocation = await getTargetLocation();
    const lastKnownLocationData = await getLastKnownLocation();
    if (!locationSamples || !targetLocation || !lastKnownLocationData || locationSamples.length < 2) return;

    const avgVelocity = calculateAverageVelocity(locationSamples);
    if (avgVelocity <= 0) return;

    const remainingDistance = calculateDistance(lastKnownLocationData.lat, lastKnownLocationData.lon, targetLocation.lat, targetLocation.lon);
    if (remainingDistance === null) return;

    const estimatedTimeSeconds = getEstimatedTimeToTarget(remainingDistance, avgVelocity);
    if (!Number.isFinite(estimatedTimeSeconds) || estimatedTimeSeconds <= 0 || estimatedTimeSeconds > 3600) return;

    await setBackgroundAlarmState('FAILSAFE');
    await sendNotification('GPS Connection Lost', `Estimated trigger time: about ${Math.round(estimatedTimeSeconds)} seconds remaining`);

    failsafeTimeoutId = setTimeout(() => {
      void (async () => {
        const latest = await getAlarmState();
        if (!latest?.isActive || latest.phase === 'TRIGGERED' || latest.phase === 'CLEANUP') return;
        await setBackgroundAlarmState('TRIGGERED');
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
