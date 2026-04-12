import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { getNearbyAnchors, unlockAnchor } from './anchorService';
import { getDistanceFromLatLonInM } from '../utils/distance';

export const LOCATION_TASK_NAME = 'background-location-task';
export const GHOST_MODE_STORAGE_KEY = 'anchor.user.ghost_mode.v1';
const AUTH_SESSION_STORAGE_KEY = 'anchor.auth.session.v1';
const LAST_NOTIF_TIME_KEY = 'anchor.notif.last_time';
const LAST_POS_KEY = 'anchor.notif.last_pos';
const PENDING_ANCHORS_KEY = 'anchor.notif.pending';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
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
    const ghostModeEnabled = (await AsyncStorage.getItem(GHOST_MODE_STORAGE_KEY)) === 'true';
    if (ghostModeEnabled) {
      console.log("[BG_TASK] Ghost mode is enabled. Skipping background location work.");
      return;
    }

    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    if (!location) return;

    const lat = location.coords.latitude;
    const lon = location.coords.longitude;

    console.log(`\n================================`);
    console.log(`[BG_TASK] Polled Location: Lat ${lat}, Lon ${lon}`);
    console.log(`================================`);

    // 1. Distance Throttling (100m)
    const lastPosStr = await AsyncStorage.getItem(LAST_POS_KEY);
    if (lastPosStr) {
      const { lat: lastLat, lon: lastLon } = JSON.parse(lastPosStr);
      const distFromLast = getDistanceFromLatLonInM(lat, lon, lastLat, lastLon);
      if (distFromLast < 100) {
        console.log(`[BG_TASK] Moved only ${distFromLast.toFixed(1)}m. Skipping nearby check (Threshold: 100m).`);
        return;
      }
    }

    // Stop execution if app is in foreground and we only want background logs
    if (AppState.currentState === 'active') {
      console.log("[BG_TASK] App is actively open on screen. Skipping background notification checks to avoid spam.");
      return;
    }

    try {
      const sessionStr = await AsyncStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!sessionStr) return;
      const session = JSON.parse(sessionStr);
      if (!session?.access_token) return;

      console.log("[BG_TASK] Fetching live data from API for coordinates...");
      const anchors = await getNearbyAnchors({
        lat, lon, radiusKm: 2,
      }, session.access_token, true);

      const pendingStr = await AsyncStorage.getItem(PENDING_ANCHORS_KEY);
      let pendingAnchors: { id: string, title: string, dist: number }[] = pendingStr ? JSON.parse(pendingStr) : [];

      for (const anchor of anchors) {
        if (anchor.status !== 'ACTIVE') continue;

        const dist = getDistanceFromLatLonInM(lat, lon, anchor.latitude, anchor.longitude);
        console.log(`[BG_TASK] -> EVALUATING '${anchor.title}' | Dist: ${dist.toFixed(2)}m (Radius: ${anchor.unlock_radius}m)`);

        if (dist <= anchor.unlock_radius + 5) {
          console.log(`[BG_TASK]   +++ '${anchor.title}' IS IN RANGE! +++`);
          
          // Only add if not already in pending
          if (!pendingAnchors.find(p => p.id === anchor.anchor_id)) {
            pendingAnchors.push({ id: anchor.anchor_id, title: anchor.title, dist });
          }

          try {
            unlockAnchor(anchor.anchor_id, session.access_token);
          } catch (e) { }
        }
      }

      // Save new position as the last triggered position
      await AsyncStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat, lon }));

      if (pendingAnchors.length > 0) {
        const lastNotifStr = await AsyncStorage.getItem(LAST_NOTIF_TIME_KEY);
        const lastNotifTime = lastNotifStr ? parseInt(lastNotifStr, 10) : 0;
        const now = Date.now();
        const twentyMins = 20 * 60 * 1000;

        if (now - lastNotifTime >= twentyMins) {
          console.log("[BG_TASK] 20 MINUTE SPAN REACHED! TRIGGERING SUMMARY PUSH NOTIFICATION...");
          
          const first = pendingAnchors[0];
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Discoveries Nearby!",
              body: `You found ${pendingAnchors.length} new anchors. Tap to view '${first.title}'.`,
              sound: false,
              data: { anchor_id: first.id }, // App.tsx looks for anchor_id
            },
            trigger: null,
          });

          await AsyncStorage.setItem(LAST_NOTIF_TIME_KEY, String(now));
          await AsyncStorage.removeItem(PENDING_ANCHORS_KEY);
        } else {
          console.log(`[BG_TASK] ${pendingAnchors.length} anchors pending. Waiting for 20min window...`);
          await AsyncStorage.setItem(PENDING_ANCHORS_KEY, JSON.stringify(pendingAnchors));
        }
      } else {
        console.log("[BG_TASK] No new anchors in range.");
      }

    } catch (err) {
      console.error("[BG_TASK] Fatal Error =>", err);
    }
  }
});

export async function setGhostModeBackgroundState(isGhostMode: boolean) {
  await AsyncStorage.setItem(GHOST_MODE_STORAGE_KEY, String(isGhostMode));
}

export async function stopBackgroundLocationTracking() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (!hasStarted) return;

  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
}

export async function startBackgroundLocationTracking() {
  const ghostModeEnabled = (await AsyncStorage.getItem(GHOST_MODE_STORAGE_KEY)) === 'true';
  if (ghostModeEnabled) {
    await stopBackgroundLocationTracking();
    console.log("Ghost mode is enabled. Background tracking will remain off.");
    return;
  }

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (hasStarted) return;

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
