import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getAlarmState, saveAlarmState, updateAlarmPhase, wipeAllData } from './cacheManager';

const ALARM_DURATION_MS = 8000;

let alarmSoundObject: { unloadAsync?: () => Promise<void> } | null = null;
let isAlarmActive = false;
let alarmTimeoutId: ReturnType<typeof setTimeout> | null = null;
let vibrationIntervalIds: ReturnType<typeof setTimeout>[] = [];

const clearAlarmTimeouts = (): void => {
  if (alarmTimeoutId) {
    clearTimeout(alarmTimeoutId);
    alarmTimeoutId = null;
  }
  vibrationIntervalIds.forEach((id) => clearTimeout(id));
  vibrationIntervalIds = [];
};

const stopTrackingForAlarmEnd = async (): Promise<void> => {
  try {
    const { stopBackgroundLocationUpdates, resetAlarmTriggerFlag } = await import('./backgroundLocationTask');
    await stopBackgroundLocationUpdates();
    resetAlarmTriggerFlag();
  } catch (error) {
    if (__DEV__) console.warn('Tracking cleanup after alarm end failed');
  }
};

export const initializeNotifications = async (): Promise<void> => {
  try {
    if (Platform.OS === 'android' && typeof Notifications.setNotificationChannelAsync === 'function') {
      await Notifications.setNotificationChannelAsync('wake-me-there-alarm', {
        name: 'WakeMeThere alarm',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 100, 250, 100, 250],
      });
    }

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (error) {
    if (__DEV__) console.warn('Failed to initialize notifications');
  }
};

export const sendNotification = async (title: string, body: string): Promise<void> => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        badge: 1,
        channelId: 'wake-me-there-alarm',
      },
      trigger: null,
    });
  } catch (error) {
    if (__DEV__) console.warn('Failed to send notification');
  }
};

const playAlarmSound = async (): Promise<void> => {
  try {
    await alarmSoundObject?.unloadAsync?.();
    // Android notification-channel sound provides the audio cue without adding an audio package.
  } catch (error) {
    if (__DEV__) console.warn('Failed to prepare alarm sound');
  }
};

export const triggerAlarm = async (): Promise<void> => {
  if (isAlarmActive) return;

  const currentState = await getAlarmState();
  if (currentState?.phase === 'TRIGGERED') return;

  isAlarmActive = true;
  try {
    await updateAlarmPhase('TRIGGERED', true);
    await sendNotification('Almost there!', 'You are nearing your destination — please get ready.');
    await playAlarmSound();

    const vibratePattern = [200, 100, 200, 100, 200, 100, 200, 100];
    const startTime = Date.now();

    const vibrationLoop = (): void => {
      if (isAlarmActive && Date.now() - startTime < ALARM_DURATION_MS) {
        Vibration.vibrate(vibratePattern);
        vibrationIntervalIds.push(setTimeout(vibrationLoop, 1000));
      }
    };

    clearAlarmTimeouts();
    vibrationLoop();
    alarmTimeoutId = setTimeout(() => void stopAlarm(), ALARM_DURATION_MS);
  } catch (error) {
    isAlarmActive = false;
    clearAlarmTimeouts();
    Vibration.cancel();
    try {
      await stopTrackingForAlarmEnd();
      await wipeAllData();
    } catch (cleanupError) {
      if (__DEV__) console.warn('Alarm failure cleanup error');
    }
    if (__DEV__) console.error('Alarm error');
  }
};

export const stopAlarm = async (): Promise<void> => {
  const persistedState = await getAlarmState();

  isAlarmActive = false;
  clearAlarmTimeouts();
  Vibration.cancel();

  try {
    if (alarmSoundObject?.unloadAsync) {
      await alarmSoundObject.unloadAsync();
      alarmSoundObject = null;
    }

    if (persistedState?.isActive || persistedState?.phase === 'TRIGGERED') {
      const existingState = (await getAlarmState()) ?? { isActive: false };
      await saveAlarmState({
        ...existingState,
        isActive: false,
        phase: 'CLEANUP',
        lastUpdateTime: Date.now(),
      });
    }

    await stopTrackingForAlarmEnd();
    await wipeAllData();
  } catch (error) {
    if (__DEV__) console.warn('Alarm cleanup error');
    throw error instanceof Error ? error : new Error('Alarm cleanup failed');
  }
};

export const isAlarmRunning = (): boolean => isAlarmActive;
