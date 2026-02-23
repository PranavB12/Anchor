import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import Mapbox from '@rnmapbox/maps';

Mapbox.setAccessToken('sent');

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/light-v11"
      />
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.dropAnchorButton} onPress={() => Alert.alert('TODO')}>
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
    bottom: 30,
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
