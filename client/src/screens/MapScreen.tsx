import React, {useState, useMemo} from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert, Image } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import Slider from '@react-native-community/slider';
import circle from '@turf/circle';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN);

export default function MapScreen() {
  const [anchorLocation, setAnchorLocation] = useState(null);
  const [radius, setRadius] = useState(50)
  
  const handleDropAnchor = async () => {
    let {status} = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Allow location access to drop an anchor.');
      return;
    }
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    setAnchorLocation([location.coords.longitude, location.coords.latitude])
  };
  const radiusShape = useMemo(() => {
    if (!anchorLocation) return null;
    return circle(anchorLocation, radius, { steps: 64, units: 'meters' });
  }, [anchorLocation, radius]);

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Light}>
        <Mapbox.Camera
          zoomLevel={15}
          centerCoordinate={anchorLocation || [-86.9081, 40.4237]}
          animationDuration={1000}
        />
        {anchorLocation && (
          <>
            <Mapbox.ShapeSource id="radius-source" shape={radiusShape}>
              <Mapbox.FillLayer
                id="radius-fill"
                style={{fillColor: '#4285F4', fillOpacity: 0.2}}
              />
              <Mapbox.LineLayer
                id="radius-line"
                style={{ lineColor: '#4285F4', lineWidth: 1 }}
              />
            </Mapbox.ShapeSource>
            <Mapbox.PointAnnotation id="anchor-pin" coordinate={anchorLocation}>
              <View style={{ width: 40, height: 40 }}>
              <Image
                source={require('../../assets/unlocked.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
            </Mapbox.PointAnnotation>
          </>
        )}
      </Mapbox.MapView>
      {!anchorLocation ? (
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.dropAnchorButton} onPress={handleDropAnchor}>
            <Text style={styles.dropAnchorText}>+  Drop Anchor</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.bottomSheet}>
          <View style={styles.radiusHeader}>
            <Text style={styles.radiusTitle}>Detection Radius</Text>
            <Text style={styles.radiusValue}>{radius}m</Text>
          </View>
          
          <Slider
            style={styles.slider}
            minimumValue={10}
            maximumValue={200}
            step={1}
            value={radius}
            onValueChange={setRadius}
            minimumTrackTintColor="#4285F4"
            maximumTrackTintColor="#E0E0E0"
            thumbTintColor="#4285F4"
          />
          
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>10m</Text>
            <Text style={styles.sliderLabelText}>200m</Text>
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={() => console.log('Pressed next')}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}
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
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: 'white',
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  radiusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  radiusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  radiusValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  sliderLabelText: {
    color: '#888',
    fontSize: 12,
  },
  nextButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});