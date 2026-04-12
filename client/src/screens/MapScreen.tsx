import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Text, Alert, Image } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import Slider from '@react-native-community/slider';
import circle from '@turf/circle';
import { Feather } from "@expo/vector-icons";

import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Coordinate = [number, number];
const FALLBACK_CENTER: Coordinate = [-86.9081, 40.4237];

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
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
Mapbox.setAccessToken(MAPBOX_TOKEN ?? "");

const DUMMY_ANCHORS = [
  {
    id: "anchor_001",
    coordinate: [-86.9120, 40.4243] as Coordinate,
    isOwn: true,
  },
  {
    id: "anchor_002",
    coordinate: [-86.9060, 40.4230] as Coordinate,
    isOwn: false,
  },
];


const RADIUS_FACTS: [number, number, string[]][] = [
  [10, 15, ["~1 T-Rex lying down 🦕", "~5 Shaqs 🏀"]],
  [16, 25, ["a bowling lane 🎳", "~4 giraffes laid sideways 🦒", "a tennis court 🎾"]],
  [26, 40, ["one blue whale 🐋", "how far a snail can travel in a day 🐌"]],
  [41, 60, ["~10 sedans 🚗", "1 Olympic pools 🏊", "a very ambitious snowball throw ❄️"]],
  [61, 80, ["average frisbee throws 🥏"]],
  [81, 100, ["the Statue of Liberty tipped over 🗽", "one really committed javelin throw 🥇", "the best paper airplane throw ✈️"]],
  [101, 130, ["a full football field 🏈", "~10 double-decker buses 🚌"]],
  [131, 160, ["~2 Doors to Hell 🚪"]],
  [161, 200, ["the world's longest hot dog"]],
];

function getRadiusFact(meters: number): string {
  for (const [min, max, labels] of RADIUS_FACTS) {
    if (meters >= min && meters <= max) {
      const idx = Math.floor(((meters - min) / (max - min + 1)) * labels.length);
      return labels[Math.min(idx, labels.length - 1)];
    }
  }
  return `${meters}m`;
}
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [anchorLocation, setAnchorLocation] = useState<number[] | null>(null);
  const [anchorAltitude, setAnchorAltitude] = useState<number | null>(null);
  const [radius, setRadius] = useState(50)

  useEffect(() => {
    console.log("MAPBOX TOKEN:", MAPBOX_TOKEN);
  }, []);

  const handleDropAnchor = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Allow location access to drop an anchor.');
      return;
    }
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    setAnchorLocation([location.coords.longitude, location.coords.latitude]);
    setAnchorAltitude(location.coords.altitude);
  };
  const radiusShape = useMemo(() => {
    if (!anchorLocation) return undefined;
    return circle(anchorLocation, radius, { steps: 64, units: 'meters' });
  }, [anchorLocation, radius]);

  const handleAnchorPress = (anchor: typeof DUMMY_ANCHORS[0]) => {
    if (!anchor.isOwn) return;
    Alert.alert("Your Anchor", undefined, [
      {
        text: "Close",
        style: "cancel",
      }
    ]);
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Light}
        onMapLoadingError={() => {
          console.log("Map fail: map style or tiles could not be loaded");
        }}
        onDidFinishLoadingStyle={() => {
          console.log("Style loaded");
        }}
      >
        <Mapbox.Camera
          zoomLevel={15}
          centerCoordinate={anchorLocation ?? FALLBACK_CENTER}
          animationDuration={1000}
        />

        {/* DUMMY ANCHOR PLACEMENT */}
        {DUMMY_ANCHORS.map((anchor) => (
          <Mapbox.MarkerView
            key={anchor.id}
            id={anchor.id}
            coordinate={anchor.coordinate}
          >
            <TouchableOpacity
              onPress={() => handleAnchorPress(anchor)}
              activeOpacity={anchor.isOwn ? 0.7 : 1}
            >
              <View style={styles.markerWrapper}>
                <Image
                  source={require('../../assets/unlocked.png')}
                  style={styles.markerImage}
                  resizeMode="contain"
                />
                {anchor.isOwn && <View style={styles.ownerBadge} />}
              </View>
            </TouchableOpacity>
          </Mapbox.MarkerView>
        ))}


        {anchorLocation && (
          <>
            <Mapbox.ShapeSource id="radius-source" shape={radiusShape}>
              <Mapbox.FillLayer
                id="radius-fill"
                style={{ fillColor: colors.accentPink, fillOpacity: 0.2 }}
              />
              <Mapbox.LineLayer
                id="radius-line"
                style={{ lineColor: colors.accentPink, lineWidth: 1 }}
              />
            </Mapbox.ShapeSource>
            <Mapbox.MarkerView id="anchor-pin" coordinate={anchorLocation}>
              <View style={{ width: 40, height: 40 }}>
                <Image
                  source={require('../../assets/unlocked.png')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              </View>
            </Mapbox.MarkerView>
          </>
        )}
      </Mapbox.MapView>

      <TouchableOpacity 
        style={[styles.arToggleButton, { top: insets.top + 20 }]} 
        onPress={() => navigation.navigate('AR')}
        activeOpacity={0.8}
      >
        <Feather name="layers" size={20} color={colors.white} />
        <Text style={styles.arToggleText}>AR Mode</Text>
      </TouchableOpacity>

      {!anchorLocation && (
        <View style={[styles.buttonContainer, { bottom: 60 + insets.bottom }]}>
          <TouchableOpacity style={styles.dropAnchorButton} onPress={handleDropAnchor}>
            <Text style={styles.dropAnchorText}>+  Drop Anchor</Text>
          </TouchableOpacity>
        </View>
      )}
      {anchorLocation && (
        <View style={[styles.bottomSheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.radiusHeader}>
            <Text style={styles.radiusTitle}>Detection Radius</Text>
            <Text style={styles.radiusValue}>{radius}m</Text>
          </View>

          <Text style={styles.radiusFact}>≈ {getRadiusFact(radius)}</Text>

          <Slider
            style={styles.slider}
            minimumValue={10}
            maximumValue={100}
            step={1}
            value={radius}
            onValueChange={setRadius}
            minimumTrackTintColor={colors.accentPink}
            maximumTrackTintColor={colors.lightMuted}
            thumbTintColor={colors.accentPink}
          />

          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabelText}>10m</Text>
            <Text style={styles.sliderLabelText}>100m</Text>
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={() => navigation.navigate('AnchorCreation', { 
            latitude: anchorLocation[1], 
            longitude: anchorLocation[0], 
            altitude: anchorAltitude,
            radius 
          })}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerWrapper: { width: 40, height: 40 },
  markerImage: { width: '100%', height: '100%' },
  ownerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.accentPink,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 60,
    width: '100%',
    alignItems: 'center',
  },
  dropAnchorButton: {
    backgroundColor: colors.accentPink,
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    elevation: 5,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropAnchorText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: colors.canvas,
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: colors.text,
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
    color: colors.text,
  },
  radiusValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  radiusFact: {
    fontSize: 12,
    color: colors.accentPink,
    fontStyle: 'italic',
    marginBottom: 8,
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
    color: colors.lightMuted,
    fontSize: 12,
  },
  nextButton: {
    backgroundColor: colors.accentPink,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  arToggleButton: {
    position: 'absolute',
    right: 20,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  arToggleText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
});
