import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  useColorScheme,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import {
  getAlarmState,
  AlarmState,
  getTargetLocation,
  getLocationSamples,
} from '../utils/cacheManager';
import { calculateDistance, calculateAverageVelocity, getEstimatedTimeToTarget } from '../utils/locationUtils';

type HomeScreenNavigationProp = {
  navigate: (screen: 'Configuration') => void;
};

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

const formatDistance = (distance: number | null): string => {
  if (distance === null || !Number.isFinite(distance)) return 'Calculating…';
  if (distance >= 1000) return `${(distance / 1000).toFixed(1)} km`;
  return `${Math.round(distance)} m`;
};

const formatEta = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return 'Calculating…';
  const rounded = Math.ceil(seconds);
  if (rounded < 60) return `about ${rounded} sec`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `about ${minutes} min` : `about ${minutes} min ${remainder} sec`;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isLoading, setIsLoading] = useState(false);
  const [activeState, setActiveState] = useState<AlarmState | null>(null);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const refreshAlarmSummary = useCallback(async (): Promise<void> => {
    const state = await getAlarmState();
    setActiveState(state);

    if (!state?.isActive || !state.targetLat || !state.targetLon) {
      setDistanceToDestination(null);
      setEtaSeconds(null);
      return;
    }

    const lastKnown = state.lastKnownLat !== undefined && state.lastKnownLon !== undefined
      ? { lat: state.lastKnownLat, lon: state.lastKnownLon }
      : await (async () => {
          const targetSamples = await getLocationSamples();
          const latest = targetSamples.length ? targetSamples[targetSamples.length - 1] : null;
          return latest ? { lat: latest.lat, lon: latest.lon } : null;
        })();

    if (!lastKnown) {
      setDistanceToDestination(null);
      setEtaSeconds(null);
      return;
    }

    const distance = calculateDistance(lastKnown.lat, lastKnown.lon, state.targetLat, state.targetLon);
    setDistanceToDestination(distance);

    if (distance !== null) {
      const samples = await getLocationSamples();
      const velocity = calculateAverageVelocity(samples);
      const threshold = state.thresholdDistance ?? 0;
      const remaining = Math.max(0, distance - threshold);
      const eta = velocity > 0 ? getEstimatedTimeToTarget(remaining, velocity) : null;
      setEtaSeconds(Number.isFinite(eta) ? eta : null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshAlarmSummary();
      const intervalId = setInterval(() => void refreshAlarmSummary(), 10000);
      return () => clearInterval(intervalId);
    }, [refreshAlarmSummary])
  );

  const handleSetLocationAlarm = (): void => {
    setIsLoading(true);
    setTimeout(() => {
      navigation.navigate('Configuration');
      setIsLoading(false);
    }, 200);
  };

  const handleCancelTracking = async (): Promise<void> => {
    try {
      setIsCancelling(true);
      const { cancelActiveTracking } = await import('../utils/backgroundLocationTask');
      await cancelActiveTracking();
      setIsDetailsVisible(false);
      await refreshAlarmSummary();
    } catch (error) {
      Alert.alert('Unable to cancel', 'The alarm could not be cancelled completely. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
      <View style={styles.contentContainer}>
        <View style={styles.headerSection}>
          <Text style={[styles.title, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>Location Alarm</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#b0b0b0' : '#666666' }]}>Automatically notifies you when you reach your destination</Text>
        </View>

        {activeState?.isActive ? (
          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.activeCard,
              { backgroundColor: isDark ? '#2a2a2a' : '#ffffff', borderColor: isDark ? '#3a3a3a' : '#e0e0e0' },
            ]}
            onPress={() => setIsDetailsVisible(true)}
          >
            <View style={styles.activeHeaderRow}>
              <View style={styles.activeIndicator} />
              <View style={styles.activeHeaderText}>
                <Text style={[styles.activeTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>Alarm is active</Text>
                <Text style={[styles.activeHint, { color: isDark ? '#a7a7a7' : '#707070' }]}>Tap for details or cancel</Text>
              </View>
            </View>

            <Text style={[styles.destinationLabel, { color: isDark ? '#a7a7a7' : '#707070' }]}>Destination</Text>
            <Text style={[styles.destinationName, { color: isDark ? '#ffffff' : '#1a1a1a' }]} numberOfLines={2}>
              {activeState.targetLabel ?? 'Saved destination'}
            </Text>

            <View style={styles.summaryRow}>
              <SummaryItem label="Distance" value={formatDistance(distanceToDestination)} isDark={isDark} />
              <SummaryItem label="Alarm at" value={`≤ ${formatDistance(activeState.thresholdDistance ?? null)}`} isDark={isDark} />
              <SummaryItem label="ETA" value={formatEta(etaSeconds)} isDark={isDark} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.featureSection}>
            <FeatureCard icon="📍" title="Precise Location Tracking" description="Uses GPS to monitor your location in real-time" isDark={isDark} />
            <FeatureCard icon="🔔" title="Smart Notifications" description="Vibration and audio alerts when threshold is reached" isDark={isDark} />
            <FeatureCard icon="🔒" title="Privacy First" description="All data stored locally, no external tracking" isDark={isDark} />
            <FeatureCard icon="📡" title="Offline Ready" description="Works with or without internet connection" isDark={isDark} />
          </View>
        )}

        {!activeState?.isActive && (
          <TouchableOpacity style={styles.ctaButton} onPress={handleSetLocationAlarm} disabled={isLoading}>
            {isLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.ctaButtonText}>Set Location Alarm</Text>}
          </TouchableOpacity>
        )}

        <View style={styles.footerSection}>
          <Text style={[styles.footerText, { color: isDark ? '#888888' : '#999999' }]}>Your location data stays on the device and is automatically deleted after use.</Text>
        </View>
      </View>

      <Modal visible={isDetailsVisible} transparent animationType="fade" onRequestClose={() => setIsDetailsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsDetailsVisible(false)}>
          <Pressable style={[styles.detailsCard, { backgroundColor: isDark ? '#222222' : '#ffffff' }]} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.detailsTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>Active Location Alarm</Text>
            <Text style={[styles.detailsDestination, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>{activeState?.targetLabel ?? 'Saved destination'}</Text>
            <Text style={[styles.detailsText, { color: isDark ? '#b0b0b0' : '#666666' }]}>Current distance: {formatDistance(distanceToDestination)}</Text>
            <Text style={[styles.detailsText, { color: isDark ? '#b0b0b0' : '#666666' }]}>Alarm distance: ≤ {formatDistance(activeState?.thresholdDistance ?? null)}</Text>
            <Text style={[styles.detailsText, { color: isDark ? '#b0b0b0' : '#666666' }]}>Estimated time: {formatEta(etaSeconds)}</Text>
            <Text style={[styles.detailsHint, { color: isDark ? '#888888' : '#777777' }]}>Tracking is running in the background. Tap Cancel Tracking to stop it.</Text>

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTracking} disabled={isCancelling}>
              {isCancelling ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.cancelButtonText}>Cancel Tracking</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.keepButton} onPress={() => setIsDetailsVisible(false)} disabled={isCancelling}>
              <Text style={[styles.keepButtonText, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>Keep Alarm</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const SummaryItem: React.FC<{ label: string; value: string; isDark: boolean }> = ({ label, value, isDark }) => (
  <View style={styles.summaryItem}>
    <Text style={[styles.summaryLabel, { color: isDark ? '#888888' : '#777777' }]}>{label}</Text>
    <Text style={[styles.summaryValue, { color: isDark ? '#ffffff' : '#1a1a1a' }]} numberOfLines={2}>{value}</Text>
  </View>
);

interface FeatureCardProps { icon: string; title: string; description: string; isDark: boolean | null; }

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, isDark }) => (
  <View style={[styles.featureCard, { backgroundColor: isDark ? '#2a2a2a' : '#ffffff', borderColor: isDark ? '#3a3a3a' : '#e0e0e0' }]}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={[styles.featureTitle, { color: isDark ? '#ffffff' : '#1a1a1a' }]}>{title}</Text>
    <Text style={[styles.featureDescription, { color: isDark ? '#b0b0b0' : '#666666' }]}>{description}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { flex: 1, padding: 20, justifyContent: 'space-between' },
  headerSection: { marginBottom: 28, marginTop: 10 },
  title: { fontSize: 36, fontWeight: 'bold', marginBottom: 10 },
  subtitle: { fontSize: 16, lineHeight: 24 },
  featureSection: { marginVertical: 20, gap: 12 },
  activeCard: { marginVertical: 24, borderWidth: 1, borderRadius: 16, padding: 18, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  activeIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF6B6B', marginRight: 10 },
  activeHeaderText: { flex: 1 },
  activeTitle: { fontSize: 18, fontWeight: '700' },
  activeHint: { fontSize: 12, marginTop: 3 },
  destinationLabel: { fontSize: 12, marginBottom: 4 },
  destinationName: { fontSize: 19, fontWeight: '700', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: 'rgba(255,107,107,0.08)' },
  summaryLabel: { fontSize: 11, marginBottom: 4 },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  featureCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  featureIcon: { fontSize: 24, marginBottom: 8 },
  featureTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  featureDescription: { fontSize: 14, lineHeight: 20 },
  ctaButton: { backgroundColor: '#FF6B6B', borderRadius: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  ctaButtonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  footerSection: { marginTop: 20 },
  footerText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  detailsCard: { borderRadius: 18, padding: 22 },
  detailsTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  detailsDestination: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  detailsText: { fontSize: 14, marginBottom: 7 },
  detailsHint: { fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 18 },
  cancelButton: { backgroundColor: '#D94C4C', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancelButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  keepButton: { paddingVertical: 14, alignItems: 'center' },
  keepButtonText: { fontSize: 16, fontWeight: '600' },
});
