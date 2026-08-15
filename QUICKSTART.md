# Quick Start Guide - Metro Location Alarm App

## 📱 Getting Started (5 minutes)

### 1. Prerequisites
```bash
# Verify Node.js version
node --version  # Should be 18+

# Install Expo CLI globally
npm install -g expo-cli

# Verify installation
expo --version
```

### 2. Run the App

**On Android Device/Emulator:**
```bash
npm run android
```
- Opens Expo Go app on device (if using managed workflow)
- Or bundles APK for direct installation

**On iOS (macOS only):**
```bash
npm run ios
```

**On Web (limited - missing native features):**
```bash
npm install react-dom react-native-web
npm run web
```

### 3. First Time Setup
1. App opens → Permissions dialog appears
2. Grant permissions: Location, Notifications
3. Home screen displays with "Set Location Alarm" button
4. Tap button → Configuration screen opens
5. Enter target location and threshold distance
6. Tap "Start Tracking" → Background task activates

## 🎯 Feature Walkthrough

### Home Screen
```
┌─────────────────────────────────┐
│      Location Alarm             │
│  Automatically notifies you      │
│  when you reach your destination │
│                                 │
│  📍 Precise Location Tracking   │
│  🔔 Smart Notifications          │
│  🔒 Privacy First               │
│  📡 Offline Ready               │
│                                 │
│  [Set Location Alarm]           │
│                                 │
│  Your location data is never    │
│  shared and automatically       │
│  deleted after use.             │
└─────────────────────────────────┘
```

### Configuration Screen
```
┌─────────────────────────────────┐
│  ← Back                          │
│  Configure Alarm                │
│  Set your destination and        │
│  preferred distance threshold    │
│                                 │
│  📍 Current Location            │
│  40.712776, -74.005974         │
│                                 │
│  Target Destination             │
│  Latitude: [40.758896      ]   │
│  Longitude: [-73.985130     ]  │
│  [📍 Use Current Location]      │
│                                 │
│  Trigger Threshold              │
│  Distance in Meters: [100   ]  │
│  💡 Recommended: 100-500m       │
│                                 │
│  [Start Tracking]               │
└─────────────────────────────────┘
```

### Background Tracking
- GPS updates every 5 seconds
- Distance calculated continuously
- When distance ≤ threshold → Alarm triggers

### Alarm (8 seconds)
```
🔔 Notification: "You have reached your destination!"
📳 Vibration pattern: 200ms on, 100ms off (repeating)
🔊 System notification sound: 8-second loop
⏹️ Auto-stops after exactly 8 seconds
🗑️ All data automatically wiped
```

## 🔧 Configuration & Customization

### Adjust Alarm Duration
**File**: `src/utils/alarmManager.ts`
```typescript
const ALARM_DURATION_MS = 8000;  // Change 8000 to desired milliseconds
```

### Change GPS Update Frequency
**File**: `src/utils/backgroundLocationTask.ts`
```typescript
await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
  accuracy: Location.Accuracy.Highest,
  timeInterval: 5000,      // Change: milliseconds between updates
  distanceInterval: 5,     // Change: meters moved to trigger update
  // ...
});
```

### Modify Vibration Pattern
**File**: `src/utils/alarmManager.ts`
```typescript
const vibratePattern = [200, 100, 200, 100, 200, 100, 200, 100];
// Format: [on_ms, off_ms, on_ms, off_ms, ...]
```

### Change Default Threshold
**File**: `src/screens/ConfigurationScreen.tsx`
```typescript
const [thresholdDistance, setThresholdDistance] = useState<string>('100');
// Change '100' to desired default in meters
```

## 📊 Testing Checklist

### Functionality Tests
- [ ] App starts without crashing
- [ ] Permissions dialog appears on first launch
- [ ] Home screen displays all feature cards
- [ ] "Set Location Alarm" button navigates to Configuration
- [ ] Configuration screen shows current location button
- [ ] Target location input accepts decimal coordinates
- [ ] Threshold input accepts numbers 10-100000
- [ ] "Start Tracking" button activates background task
- [ ] "Back" button navigates to Home screen

### Permissions Tests
- [ ] Deny Location → App handles gracefully
- [ ] Deny Notifications → App handles gracefully
- [ ] Revoke permissions after startup → App responds correctly

### Background Task Tests
- [ ] Close app → Background task continues
- [ ] Device screen off → Task runs normally
- [ ] Disable screen timeout → Task still runs
- [ ] Reach destination → Alarm triggers
- [ ] Don't reach destination → Alarm doesn't trigger

### Alarm Tests
- [ ] Audio plays for 8 seconds
- [ ] Vibration occurs during alarm
- [ ] Notification appears
- [ ] Alarm stops exactly after 8 seconds
- [ ] Data is wiped after alarm

### Privacy Tests
- [ ] No network requests in logs
- [ ] AsyncStorage contains only current alarm data
- [ ] After alarm, AsyncStorage is empty
- [ ] No analytics library initialized

### Offline Failsafe Tests
- [ ] Disable GPS → App shows failsafe message
- [ ] Calculate velocity from 2+ location samples
- [ ] Trigger alarm based on estimated time
- [ ] Failsafe alarm also runs for 8 seconds

## 🚀 Build for Google Play Store

### Step 1: Prepare
```bash
# Update version number
# Edit: package.json → version
# Edit: app.json → version

# Ensure code is clean
npx tsc --noEmit  # Should show 0 errors
```

### Step 2: Sign App
```bash
# Generate keystore (do once, save securely)
keytool -genkey -v -keystore ./my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias

# Configure signing in app.json:
"android": {
  "release": {
    "signingConfig": "release"
  }
}
```

### Step 3: Build APK
```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

### Step 4: Upload to Google Play Console
1. Create Play Console account
2. Create new app entry
3. Fill in store listing details
4. Upload APK to Internal Testing
5. Test on real devices
6. Promote to Production

### Step 5: App Description
```
Simple, private location alarm app. Get notified when you arrive 
at your destination without any cloud tracking or analytics.

✨ Features:
• Set location alarms with custom distance threshold
• Get notified with vibration and audio when you arrive
• Background tracking even with app closed
• Zero cloud tracking - 100% on-device processing
• Automatic data cleanup after alarm
• Works offline with velocity-based fallback
• Dark/Light theme support

🔒 Privacy First:
• No analytics or telemetry
• No cloud servers
• No data sharing
• All data automatically deleted
• GDPR and Indian privacy compliant

🚀 Perfect for:
• Commuters (wake up at destination)
• Travelers (arrival notifications)
• Delivery personnel (destination alerts)
• Any location-based reminder needs
```

### Step 6: Privacy Policy
```
PRIVACY POLICY

This app collects NO personal data and does NOT:
- Track your location beyond on-device calculations
- Send data to external servers
- Use analytics or telemetry
- Share data with third parties
- Store data after alarm completion

All location data remains on your device and is automatically 
deleted immediately after the alarm completes.

GDPR Compliant ✓
Indian Privacy Laws Compliant ✓
No Data Retention ✓
```

## 📋 Deployment Checklist

Before submitting to Play Store:

**Code Quality**
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] No console errors in development
- [ ] No API keys or secrets in code
- [ ] No external API calls
- [ ] All strings are hardcoded or from i18n

**Functionality**
- [ ] All screens render correctly
- [ ] All buttons work as expected
- [ ] Permissions request works
- [ ] Background task activates
- [ ] Alarm triggers at correct distance
- [ ] Alarm lasts exactly 8 seconds
- [ ] Cache is wiped after alarm
- [ ] Offline mode works

**Performance**
- [ ] App starts in < 3 seconds
- [ ] Background task doesn't drain battery excessively
- [ ] Memory usage is reasonable (< 100MB)
- [ ] No memory leaks on repeated alarm cycles

**Security & Privacy**
- [ ] No credentials in code
- [ ] No sensitive data logged
- [ ] No external API calls
- [ ] All data stays on device
- [ ] Cache wiping implemented
- [ ] Permissions are minimal and necessary

**User Experience**
- [ ] Dark/Light theme works
- [ ] Text is readable
- [ ] Buttons are tappable
- [ ] Error messages are clear
- [ ] Navigation is intuitive
- [ ] No technical jargon

**Android Requirements**
- [ ] Targets API 31+ (recommended API 34+)
- [ ] Supports Android 8.0+ (API 26+)
- [ ] Uses proper permissions model
- [ ] Handles permission denials gracefully
- [ ] Uses Material Design guidelines

## 🐛 Debugging

### View Logs
```bash
# From Expo CLI
npx expo logs

# Or from Android Studio
adb logcat
```

### Common Issues

**Issue**: "Failed to get location"
```
Solution: Check Location permission in Android settings
Settings → Apps → Metro Location Alarm → Permissions → Location → Allow all the time
```

**Issue**: "Alarm doesn't trigger"
```
Solution: Verify:
1. Background location permission granted
2. Target coordinates are correct
3. Threshold distance is reasonable (test with 100m)
4. Device GPS is enabled and has signal
```

**Issue**: "Background task keeps stopping"
```
Solution: 
1. Check battery saver isn't enabled
2. Disable battery optimization for app:
   Settings → Battery → Battery saver → Apps (remove this app)
3. Enable "Background location" in app settings
```

**Issue**: "AsyncStorage access errors"
```
Solution: Clear app data and restart
Settings → Apps → Metro Location Alarm → Storage → Clear Data
```

## 📞 Support Resources

- **Expo Docs**: https://docs.expo.dev/
- **React Native Docs**: https://reactnative.dev/docs/
- **React Navigation**: https://reactnavigation.org/
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/

## 🎓 Learning Resources

### Understand Location Tracking
- React Native Location API: https://docs.expo.dev/versions/latest/sdk/location/
- Background Tasks: https://docs.expo.dev/versions/latest/sdk/background-fetch/

### Understand Haversine Formula
- https://en.wikipedia.org/wiki/Haversine_formula
- https://www.movable-type.co.uk/scripts/latlong.html

### Local Storage
- AsyncStorage Docs: https://react-native-async-storage.github.io/

---

**Ready to build your location alarm app! 🎯**
