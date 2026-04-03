import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { getNearbyAnchors, unlockAnchor } from './anchorService';
import { getDistanceFromLatLonInM } from '../utils/distance';

export const LOCATION_TASK_NAME = 'background-location-task';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error("[BG_TASK] Error: ", error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    if (!location) return;

    const lat = location.coords.latitude;
    const lon = location.coords.longitude;

    console.log(`\n================================`);
    console.log(`[BG_TASK] Polled Location: Lat ${lat}, Lon ${lon}`);
    console.log(`================================`);

    // Stop execution if app is in foreground and we only want background logs
    if (AppState.currentState === 'active') {
      console.log("[BG_TASK] App is actively open on screen. Skipping background notification checks to avoid spam.");
      return;
    }

    try {
      const sessionStr = await AsyncStorage.getItem("anchor.auth.session.v1");
      if (!sessionStr) return;
      const session = JSON.parse(sessionStr);
      if (!session?.access_token) return;

      console.log("[BG_TASK] Fetching live data from API for coordinates...");
      const anchors = await getNearbyAnchors({
        lat, lon, radiusKm: 2,
      }, session.access_token, true);

      let newlyDiscoveredCount = 0;
      let firstName = "";
      let firstAnchorId = "";

      for (const anchor of anchors) {
        if (anchor.status !== 'ACTIVE') continue;

        const dist = getDistanceFromLatLonInM(lat, lon, anchor.latitude, anchor.longitude);
        console.log(`[BG_TASK] -> EVALUATING '${anchor.title}' | Dist: ${dist.toFixed(2)}m (Radius: ${anchor.unlock_radius}m)`);

        if (dist <= anchor.unlock_radius + 5) {
          console.log(`[BG_TASK]   +++ '${anchor.title}' IS IN RANGE! +++`);
          newlyDiscoveredCount++;
          if (!firstName) {
            firstName = anchor.title;
            firstAnchorId = anchor.anchor_id;
          }
          try {
            unlockAnchor(anchor.anchor_id, session.access_token);
          } catch (e) { }
        }
      }

      if (newlyDiscoveredCount > 0) {
        console.log("[BG_TASK] MATCH FOUND! TRIGGERING PUSH NOTIFICATION...");
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "New Anchors Nearby (BG Trigger)",
            body: `You passed by ${newlyDiscoveredCount} anchors! Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`,
            sound: false,
            data: { anchor_id: firstAnchorId },
          },
          trigger: null,
        });
      } else {
        console.log("[BG_TASK] No anchors in range. Notification skipped.");
      }

    } catch (err) {
      console.error("[BG_TASK] Fatal Error =>", err);
    }
  }
});

export async function startBackgroundLocationTracking() {
  console.log("Checking permissions for completely revamped background task...");
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return;

  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return;

  console.log("Registering proper Android Event Hook with Max Hardware Accuracy...");
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Highest,
      distanceInterval: 1,
      timeInterval: 2000,
      deferredUpdatesInterval: 2000,
      showsBackgroundLocationIndicator: true, // Must be true on Android
      foregroundService: {
        notificationTitle: "Location Tracking",
        notificationBody: "Monitoring location in background",
      }
    });
    console.log("Successfully registered Background Task Event Listener!");
  } catch (e) {
    console.error("Failed to register:", e);
  }
}
