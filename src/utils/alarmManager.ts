import { Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';

const ALARM_DURATION_MS = 8000; // 8 seconds

let alarmSoundObject: any = null;
let isAlarmActive = false;
let alarmTimeoutId: ReturnType<typeof setTimeout> | null = null;
let vibrationIntervalIds: ReturnType<typeof setTimeout>[] = [];

/**
 * Initialize notifications handler
 */
export const initializeNotifications = async (): Promise<void> => {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (error) {
    if (__DEV__) console.warn('Failed to initialize notifications:', error);
  }
};

/**
 * Send local notification
 */
export const sendNotification = async (
  title: string,
  body: string
): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        badge: 1,
      },
      trigger: null, // Send immediately
    });
  } catch (error) {
    if (__DEV__) console.warn('Failed to send notification:', error);
  }
};

/**
 * Play alarm sound in a loop
 */
const playAlarmSound = async (): Promise<void> => {
  try {
    if (alarmSoundObject) {
      await alarmSoundObject.unloadAsync?.();
    }
    // System notification sound will play via Notifications API
  } catch (error) {
    // Fail silently for production
    if (__DEV__) console.warn('Failed to play alarm sound:', error);
  }
};

/**
 * Trigger alarm with vibration and audio
 * Runs for exactly 8 seconds then stops automatically
 */
export const triggerAlarm = async (): Promise<void> => {
  if (isAlarmActive) {
    return; // Already active, ignore duplicate
  }

  isAlarmActive = true;

  try {
    // Send notification
    await sendNotification(
      'Location Alarm',
      'You have reached your destination!'
    );

    // Start vibration pattern: 200ms on, 100ms off, repeated
    const vibratePattern = [200, 100, 200, 100, 200, 100, 200, 100];
    const startTime = Date.now();

    // Schedule vibration loop with tracked IDs
    const vibrationLoop = () => {
      if (
        isAlarmActive &&
        Date.now() - startTime < ALARM_DURATION_MS
      ) {
        Vibration.vibrate(vibratePattern);
        const timeoutId = setTimeout(vibrationLoop, 1000);
        vibrationIntervalIds.push(timeoutId);
      }
    };

    vibrationLoop();

    // Auto-stop after 8 seconds (hard timeout)
    // Add extra safety margin and force stop
    alarmTimeoutId = setTimeout(async () => {
      await stopAlarm();
    }, ALARM_DURATION_MS);
  } catch (error) {
    isAlarmActive = false;
    if (__DEV__) console.error('Error triggering alarm:', error);
  }
};

/**
 * Stop alarm (called automatically after 8 seconds or manually)
 */
export const stopAlarm = async (): Promise<void> => {
  isAlarmActive = false;

  try {
    // Stop vibration immediately
    Vibration.cancel();

    // Stop audio if loaded
    if (alarmSoundObject?.unloadAsync) {
      await alarmSoundObject.unloadAsync();
      alarmSoundObject = null;
    }

    // Clear main alarm timeout
    if (alarmTimeoutId) {
      clearTimeout(alarmTimeoutId);
      alarmTimeoutId = null;
    }

    // Clear all vibration interval IDs (CRITICAL: prevents orphaned timeouts)
    vibrationIntervalIds.forEach(id => clearTimeout(id));
    vibrationIntervalIds = [];
  } catch (error) {
    // Fail silently for production
    if (__DEV__) console.warn('Error stopping alarm:', error);
  }
};

/**
 * Check if alarm is currently active
 */
export const isAlarmRunning = (): boolean => {
  return isAlarmActive;
};
