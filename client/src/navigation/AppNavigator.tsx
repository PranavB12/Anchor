import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import DiscoveryScreen from "../screens/DiscoveryScreen";
import MapScreen from "../screens/MapScreen";
import AnchorCreation from "../screens/AnchorCreation";
import EditAnchor from "../screens/EditAnchor";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import EditProfileScreen from "../screens/EditProfileScreen";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token: string };
  Discovery: undefined;
  Map: undefined;
  AnchorCreation: { latitude: number; longitude: number; radius: number };
  EditAnchor: { anchorId: string };
  EditProfile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const colors = {
  accentWarm: "#F4BB7E",
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
  success: "#027a48",
  blue: "#4285F4",
};

export default function AppNavigator() {
  const { status, session } = useAuth();

  if (status === "loading") {
    return (
      <View style={styles.bootScreen}>
        <ActivityIndicator size="large" color="#F55476" />
        <Text style={styles.bootText}>Restoring session...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={status === "authenticated" ? "Discovery" : "Login"}
        screenOptions={{
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: colors.canvas },
          headerTintColor: colors.text,
          headerShown: false,
        }}
      >
        {status === "authenticated" && session ? (
          <>
            <Stack.Screen name="Discovery" component={DiscoveryScreen} options={{ title: "Discover" }} />
            <Stack.Screen name="Map" component={MapScreen} options={{ title: "Anchor Map" }} />
            <Stack.Screen name="AnchorCreation" component={AnchorCreation} options={{ title: "Anchor Details" }} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Edit Profile" }} />
            <Stack.Screen
              name="EditAnchor"
              component={EditAnchor}
              options={{ title: "Edit Anchor Details" }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Anchor Login" }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Create Account" }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: "Forgot Password" }} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: "Reset Password" }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8F2",
    gap: 12,
  },
  bootText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "600",
  },
});