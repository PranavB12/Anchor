import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNearbyAnchors, unlockAnchor } from './anchorService';
import { getDistanceFromLatLonInM } from '../utils/distance';

export const LOCATION_TASK_NAME = 'background-location-task';

const DISCOVERED_ANCHORS_KEY = 'discovered_anchors';
const LAST_NOTIF_TIME_KEY = 'last_notif_time';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error("Background Location Error: ", error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];
    if (!location) return;

    try {
      const sessionStr = await AsyncStorage.getItem('auth_session');
      if (!sessionStr) return;
      const session = JSON.parse(sessionStr);

      if (!session?.access_token) return;

      //polling
      const nowTime = Date.now();
      const lastFetchStr = await AsyncStorage.getItem('last_fetch_time');
      const lastFetchTime = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;

      const lastLatStr = await AsyncStorage.getItem('last_fetch_lat');
      const lastLonStr = await AsyncStorage.getItem('last_fetch_lon');
      const lastLat = lastLatStr ? parseFloat(lastLatStr) : 0;
      const lastLon = lastLonStr ? parseFloat(lastLonStr) : 0;

      const distFromLastFetch = getDistanceFromLatLonInM(
        location.coords.latitude, location.coords.longitude,
        lastLat, lastLon
      );

      let anchors: any[] = [];
      const cachedAnchorsStr = await AsyncStorage.getItem('cached_anchors');

      if (!cachedAnchorsStr || (nowTime - lastFetchTime > 10 * 60 * 1000) || distFromLastFetch > 500) {
        anchors = await getNearbyAnchors({
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          radiusKm: 2,
        }, session.access_token);

        await AsyncStorage.setItem('cached_anchors', JSON.stringify(anchors));
        await AsyncStorage.setItem('last_fetch_time', nowTime.toString());
        await AsyncStorage.setItem('last_fetch_lat', location.coords.latitude.toString());
        await AsyncStorage.setItem('last_fetch_lon', location.coords.longitude.toString());
      } else {
        anchors = JSON.parse(cachedAnchorsStr);
      }

      let newlyDiscoveredCount = 0;
      let firstName = "";

      const discoveredStr = await AsyncStorage.getItem(DISCOVERED_ANCHORS_KEY);
      const discoveredMap: Record<string, boolean> = discoveredStr ? JSON.parse(discoveredStr) : {};

      let discoveredMapChanged = false;

      for (const anchor of anchors) {
        if (anchor.status !== 'ACTIVE' || session.user_id === anchor.creator_id) {
          continue;
        }

        const distanceMeters = getDistanceFromLatLonInM(
          location.coords.latitude,
          location.coords.longitude,
          anchor.latitude,
          anchor.longitude
        );

        if (distanceMeters <= anchor.unlock_radius + 5) {
          if (!discoveredMap[anchor.anchor_id]) {
            discoveredMap[anchor.anchor_id] = true;
            discoveredMapChanged = true;
            newlyDiscoveredCount++;
            if (!firstName) firstName = anchor.title;
            try {
              await unlockAnchor(anchor.anchor_id, session.access_token);
            } catch (e) {
              // ignoring error (either already unlocked or max unlocked)
            }
          }
        }
      }

      if (discoveredMapChanged) {
        await AsyncStorage.setItem(DISCOVERED_ANCHORS_KEY, JSON.stringify(discoveredMap));
      }

      const now = Date.now();
      const lastNotifStr = await AsyncStorage.getItem(LAST_NOTIF_TIME_KEY);
      const lastNotifTime = lastNotifStr ? parseInt(lastNotifStr, 10) : 0;

      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

      if (newlyDiscoveredCount > 0 && (now - lastNotifTime > TWO_HOURS_MS)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "New Anchors Nearby",
            body: `You passed by ${newlyDiscoveredCount} new anchors recently, including "${firstName}". Open the app to view them!`,
            sound: false, // silent notif
          },
          trigger: null,
        });

        await AsyncStorage.setItem(LAST_NOTIF_TIME_KEY, now.toString());
      }

    } catch (err) {
      console.error("Error in location background task", err);
    }
  }
});

export async function startBackgroundLocationTracking() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') return;

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  if (backgroundStatus !== 'granted') return;

  const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (!isRegistered) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 10, // background check once user moved more than 10m
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "Anchor is running in background",
        notificationBody: "Monitoring precise proximity to nearby anchors",
        notificationColor: "#F55476"
      }
    });
  }
}
