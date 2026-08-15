import TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { calculateDistance, calculateAverageVelocity } from './locationUtils';
import {
  getAlarmState,
  getThresholdDistance,
  getTargetLocation,
  saveLastKnownLocation,
  saveLocationSample,
  getLocationSamples,
  getLastKnownLocation,
  wipeAllData,
} from './cacheManager';
import {
  triggerAlarm,
  isAlarmRunning,
  stopAlarm,
  sendNotification,
} from './alarmManager';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

let currentAlarmTriggered = false;
let cleanupTimeoutIds: ReturnType<typeof setTimeout>[] = [];

/**
 * Register background location task
 */
export const registerBackgroundLocationTask = async (): Promise<void> => {
  try {
    // Unregister existing task first
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_LOCATION_TASK
    );
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      TaskManager.unregisterTaskAsync(BACKGROUND_LOCATION_TASK);
    }

    // Define the task
    TaskManager.defineTask(
      BACKGROUND_LOCATION_TASK,
      async ({ data, error }: any) => {
        if (error) {
          if (__DEV__) console.error('Background location task error');
          return;
        }

        if (data) {
          const locations = data.locations as Location.LocationObject[];
          if (locations && locations.length > 0) {
            const location = locations[locations.length - 1];

            // Null safety check on location data
            if (!location || !location.coords) {
              if (__DEV__) console.warn('Invalid location data received');
              return;
            }

            try {
              // Get alarm configuration
              const alarmState = await getAlarmState();
              const targetLocation = await getTargetLocation();
              const thresholdDistance = await getThresholdDistance();

              if (
                !alarmState?.isActive ||
                !targetLocation ||
                !thresholdDistance
              ) {
                return;
              }

              // Validate coordinates before calculation
              const lat = location.coords.latitude;
              const lon = location.coords.longitude;

              if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                if (__DEV__) console.warn('Invalid coordinates received');
                return;
              }

              // Calculate distance to target
              const distance = calculateDistance(lat, lon, targetLocation.lat, targetLocation.lon);

              // Save location sample for velocity tracking
              await saveLocationSample({
                lat,
                lon,
                timestamp: Date.now(),
              });

              // Save last known location
              await saveLastKnownLocation(lat, lon);

              // Check if within threshold
              if (distance <= thresholdDistance && !currentAlarmTriggered) {
                currentAlarmTriggered = true;

                // Trigger alarm
                if (!isAlarmRunning()) {
                  await triggerAlarm();

                  // Schedule cleanup after alarm stops (8 seconds + buffer)
                  const timeoutId = setTimeout(async () => {
                    await stopAlarm();
                    await wipeAllData();
                    currentAlarmTriggered = false;
                    // Remove this timeout ID from tracking
                    cleanupTimeoutIds = cleanupTimeoutIds.filter(id => id !== timeoutId);
                  }, 9000);

                  cleanupTimeoutIds.push(timeoutId);
                }
              } else if (distance > thresholdDistance) {
                currentAlarmTriggered = false;
              }
            } catch (error) {
              if (__DEV__) console.error('Error processing background location');
            }
          }
        }
      }
    );
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

    console.log('Background location updates started');
    if (__DEV__) console.log('Background location updates started');
  } catch (error) {
    if (__DEV__) console.error('Failed to start background location updates');
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

/**
 * Handle GPS disabled fail-safe: use velocity-based estimation
 */
export const handleGPSDisabledFailsafe = async (): Promise<void> => {
  try {
    const locationSamples = await getLocationSamples();
    const targetLocation = await getTargetLocation();
    const lastKnownLocationData = await getLastKnownLocation();

    if (
      !locationSamples ||
      !targetLocation ||
      !lastKnownLocationData ||
      locationSamples.length < 2
    ) {
      if (__DEV__) console.log('Insufficient data for failsafe estimation');
      return;
    }

    // Calculate average velocity
    const avgVelocity = calculateAverageVelocity(locationSamples);

    if (avgVelocity <= 0) {
      if (__DEV__) console.log('Cannot calculate velocity');
      return;
    }

    // Calculate distance from last known location to target
    const remainingDistance = calculateDistance(
      lastKnownLocationData.lat,
      lastKnownLocationData.lon,
      targetLocation.lat,
      targetLocation.lon
    );

    // Estimate time to reach target
    const estimatedTimeSeconds = remainingDistance / avgVelocity;

    if (__DEV__) console.log('GPS failsafe: Estimated time to reach target');

    // Schedule alarm based on estimated time
    if (estimatedTimeSeconds > 0 && estimatedTimeSeconds < 3600) {
      // Only if estimated within 1 hour
      const timeoutMs = Math.max(estimatedTimeSeconds * 1000, 5000); // Minimum 5 seconds

      await sendNotification(
        'GPS Connection Lost',
        `Alarm will trigger in approximately ${Math.round(
          estimatedTimeSeconds
        )} seconds`
      );

      // Set failsafe alarm trigger
      const timeoutId = setTimeout(async () => {
        if (!isAlarmRunning() && !currentAlarmTriggered) {
          currentAlarmTriggered = true;
          if (__DEV__) console.log('Triggering failsafe alarm');
          await triggerAlarm();

          // Schedule cleanup
          const cleanupId = setTimeout(async () => {
            await stopAlarm();
            await wipeAllData();
            currentAlarmTriggered = false;
            cleanupTimeoutIds = cleanupTimeoutIds.filter(id => id !== cleanupId);
          }, 9000);

          cleanupTimeoutIds.push(cleanupId);
        }
      }, timeoutMs);

      cleanupTimeoutIds.push(timeoutId);
    }
  } catch (error) {
    if (__DEV__) console.error('Error in GPS failsafe handler');
  }
};

/**
 * Reset alarm trigger flag (useful for testing)
 */
export const resetAlarmTriggerFlag = (): void => {
  currentAlarmTriggered = false;
};
