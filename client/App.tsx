import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { startBackgroundLocationTracking } from "./src/services/locationTask";
import AppNavigator from "./src/navigation/AppNavigator";
import { AuthProvider } from "./src/context/AuthContext";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from "react-native";
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
export default function App() {
  useEffect(() => {
    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        return;
      }
      await startBackgroundLocationTracking();
    })();
  }, []);

  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (
      lastNotificationResponse &&
      lastNotificationResponse.notification.request.content.data.anchor_id
    ) {
      const anchorId = lastNotificationResponse.notification.request.content.data.anchor_id;

      const { navigationRef } = require("./src/navigation/AppNavigator");
      if (navigationRef.isReady()) {
        navigationRef.navigate("Discovery", { targetAnchorId: anchorId });
      } else {
        const rootNavigationUrl = setInterval(() => {
          if (navigationRef.isReady()) {
            clearInterval(rootNavigationUrl);
            navigationRef.navigate("Discovery", { targetAnchorId: anchorId });
          }
        }, 300);
      }
    }
  }, [lastNotificationResponse]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
