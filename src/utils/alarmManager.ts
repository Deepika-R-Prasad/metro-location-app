import { Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  getAlarmState,
  saveAlarmState,
  updateAlarmPhase,
  wipeAllData,
} from './cacheManager';

const ALARM_DURATION_MS = 8000; // 8 seconds

let alarmSoundObject: { unloadAsync?: () => Promise<void> } | null = null;
let isAlarmActive = false;
let alarmTimeoutId: ReturnType<typeof setTimeout> | null = null;
let vibrationIntervalIds: ReturnType<typeof setTimeout>[] = [];

const clearAlarmTimeouts = (): void => {
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }

  if (vibrationIntervalIds.length > 0) {
    vibrationIntervalIds.forEach((id) => clearTimeout(id));
    vibrationIntervalIds = [];
  }
};

const stopTrackingForAlarmEnd = async (): Promise<void> => {
  try {
    const { stopBackgroundLocationUpdates, resetAlarmTriggerFlag } = await import(
      './backgroundLocationTask'
    );
    await stopBackgroundLocationUpdates();
    resetAlarmTriggerFlag();
  } catch (error) {
    if (__DEV__) console.warn('Tracking cleanup after alarm end failed');
  }
};

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
  const currentState = await getAlarmState();
  if (isAlarmActive || currentState?.phase === 'TRIGGERED' || currentState?.isActive) {
    return;
  }

  isAlarmActive = true;
  await updateAlarmPhase('TRIGGERED', true);

  try {
    await sendNotification('Almost there!', 'You are nearing your destination — please get ready.');

    const vibratePattern = [200, 100, 200, 100, 200, 100, 200, 100];
    const startTime = Date.now();

    const vibrationLoop = (): void => {
      if (isAlarmActive && Date.now() - startTime < ALARM_DURATION_MS) {
        Vibration.vibrate(vibratePattern);
        const timeoutId = setTimeout(vibrationLoop, 1000);
        vibrationIntervalIds.push(timeoutId);
      }
    };

    clearAlarmTimeouts();
    vibrationLoop();

    alarmTimeoutId = setTimeout(async () => {
      await stopAlarm();
    }, ALARM_DURATION_MS);
  } catch (error) {
    isAlarmActive = false;
    await updateAlarmPhase('CLEANUP', false);
    if (__DEV__) console.error('Alarm error');
  }
};

/**
 * Stop alarm (called automatically after 8 seconds or manually)
 */
export const stopAlarm = async (): Promise<void> => {
  const persistedState = await getAlarmState();
  if (!isAlarmActive && !(persistedState?.isActive || persistedState?.phase === 'TRIGGERED')) {
    clearAlarmTimeouts();
    await updateAlarmPhase('CLEANUP', false);
    await wipeAllData();
    return;
  }

  isAlarmActive = false;
  clearAlarmTimeouts();

  try {
    Vibration.cancel();

    if (alarmSoundObject?.unloadAsync) {
      await alarmSoundObject.unloadAsync();
      alarmSoundObject = null;
    }

    const existingState = (await getAlarmState()) ?? { isActive: false };
    await saveAlarmState({
      ...existingState,
      isActive: false,
      phase: 'CLEANUP',
      lastUpdateTime: Date.now(),
    });
    await stopTrackingForAlarmEnd();
    await wipeAllData();
  } catch (error) {
    if (__DEV__) console.warn('Alarm cleanup error');
  }
};

/**
 * Check if alarm is currently active
 */
export const isAlarmRunning = (): boolean => {
  return isAlarmActive;
};
