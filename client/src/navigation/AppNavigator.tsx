import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import MapScreen from "../screens/MapScreen";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Map: undefined;
  AnchorCreation: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        initialRouteName="Login"
        screenOptions={{
          headerTitleAlign: "center",
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title:
              status === "authenticated" && session
                ? `Signed In (${session.username})`
                : "Anchor Login",
          }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: "Create Account" }}
        />
	<Stack.Screen
	  name="Map"
	  component={MapScreen}
	  options={{title: "Anchor Map"}}
	/>
    <Stack.Screen
      name="AnchorCreation"
      component={AnchorCreation}
      options={{title: "Anchor Details"}}
    />
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
