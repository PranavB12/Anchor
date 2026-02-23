import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import MapScreen from "../screens/MapScreen";


export type RootStackParamList = {
  Login: undefined;
  Map: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: "Anchor Login" }}
        />
	<Stack.Screen
	  name="Map"
	  component={MapScreen}
	  options={{title: "Anchor Map"}}
	/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
