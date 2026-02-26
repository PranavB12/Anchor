import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';


Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);

export default function MapScreen() {
  const handleDropAnchor = async () => {
    let {status} = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Allow location access to drop an anchor.');
      return;
    }
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    const { latitude, longitude } = location.coords;
    Alert.alert(
      'Anchor Dropped',
      `Current Location:\nLat: ${latitude}\nLong: ${longitude}`
    );
  }
  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Light}
      >
        <Mapbox.Camera
          zoomLevel={15}
          centerCoordinate={[-86.9081, 40.4237]}
        />
      </Mapbox.MapView>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.dropAnchorButton} onPress={handleDropAnchor}>
          <Text style={styles.dropAnchorText}>Drop Anchor</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 60,
    width: '100%',
    alignItems: 'center',
  },
  dropAnchorButton: {
    backgroundColor: '#f55476',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropAnchorText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
