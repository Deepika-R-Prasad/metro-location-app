import React, { useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { getAlarmState, AlarmState } from '../utils/cacheManager';
import {
  cancelActiveTracking,
} from '../utils/backgroundLocationTask';

interface HomeScreenProps {
  navigation: any;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [isLoading, setIsLoading] = useState(false);
  const [activeState, setActiveState] = useState<AlarmState | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const refreshState = async () => {
        const state = await getAlarmState();
        setActiveState(state);
      };

      refreshState();
    }, [])
  );

  const handleSetLocationAlarm = () => {
    setIsLoading(true);
    // Navigate to configuration screen
    setTimeout(() => {
      navigation.navigate('Configuration');
      setIsLoading(false);
    }, 300);
  };

  const handleCancelTracking = async () => {
    await cancelActiveTracking();
    const state = await getAlarmState();
    setActiveState(state);
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' },
      ]}
    >
      <View style={styles.contentContainer}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Text
            style={[
              styles.title,
              { color: isDark ? '#ffffff' : '#1a1a1a' },
            ]}
          >
            Location Alarm
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: isDark ? '#b0b0b0' : '#666666' },
            ]}
          >
            Automatically notifies you when you reach your destination
          </Text>
        </View>

        {activeState?.isActive ? (
          <View
            style={[
              styles.featureSection,
              {
                backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
                borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
                borderWidth: 1,
                borderRadius: 12,
                padding: 16,
              },
            ]}
          >
            <Text
              style={[
                styles.featureTitle,
                { color: isDark ? '#ffffff' : '#1a1a1a' },
              ]}
            >
              Active tracking
            </Text>
            <Text
              style={[
                styles.featureDescription,
                { color: isDark ? '#b0b0b0' : '#666666' },
              ]}
            >
              Threshold: {activeState.thresholdDistance ?? 'N/A'} m
            </Text>
            <TouchableOpacity
              style={[styles.ctaButton, { marginTop: 12 }]}
              onPress={handleCancelTracking}
            >
              <Text style={styles.ctaButtonText}>Cancel Tracking</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.featureSection}>
            <FeatureCard
              icon="📍"
              title="Precise Location Tracking"
              description="Uses GPS to monitor your location in real-time"
              isDark={isDark}
            />
            <FeatureCard
              icon="🔔"
              title="Smart Notifications"
              description="Vibration and audio alerts when threshold is reached"
              isDark={isDark}
            />
            <FeatureCard
              icon="🔒"
              title="Privacy First"
              description="All data stored locally, no external tracking"
              isDark={isDark}
            />
            <FeatureCard
              icon="📡"
              title="Offline Ready"
              description="Works with or without internet connection"
              isDark={isDark}
            />
          </View>
        )}

        {/* CTA Button */}
        {!activeState?.isActive ? (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleSetLocationAlarm}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.ctaButtonText}>Set Location Alarm</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Footer Info */}
        <View style={styles.footerSection}>
          <Text
            style={[
              styles.footerText,
              { color: isDark ? '#888888' : '#999999' },
            ]}
          >
            Your location data is never shared and automatically deleted after
            use.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  isDark: boolean | null;
}

const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  isDark,
}) => (
  <View
    style={[
      styles.featureCard,
      {
        backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
        borderColor: isDark ? '#3a3a3a' : '#e0e0e0',
      },
    ]}
  >
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text
      style={[
        styles.featureTitle,
        { color: isDark ? '#ffffff' : '#1a1a1a' },
      ]}
    >
      {title}
    </Text>
    <Text
      style={[
        styles.featureDescription,
        { color: isDark ? '#b0b0b0' : '#666666' },
      ]}
    >
      {description}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  headerSection: {
    marginBottom: 40,
    marginTop: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  featureSection: {
    marginVertical: 20,
    gap: 12,
  },
  featureCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  ctaButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footerSection: {
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
