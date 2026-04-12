import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Alert, Image } from "react-native";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroAmbientLight,
  ViroNode,
  ViroImage,
  ViroText,
  ViroAnimations,
} from "@viro-community/react-viro";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { getNearbyAnchors, NearbyAnchor } from "../services/anchorService";
import { useAuth } from "../context/AuthContext";

const getRelativeARCoords = (
  userLat: number,
  userLon: number,
  userAlt: number,
  anchorLat: number,
  anchorLon: number,
  anchorAlt: number | null
) => {
  const R = 6371000;

  const dLat = (anchorLat - userLat) * (Math.PI / 180);
  const dLon = (anchorLon - userLon) * (Math.PI / 180);


  const x = R * dLon * Math.cos(userLat * (Math.PI / 180));

  const z = R * dLat;


  const y = anchorAlt !== null ? anchorAlt - userAlt : 0;

  return { x, y: y, z: -z }; // Note: In Viro, -Z is forward (North)
};

const ARAnchor = ({ anchor, userLocation }: { anchor: NearbyAnchor, userLocation: Location.LocationObject }) => {
  const { x, y, z } = getRelativeARCoords(
    userLocation.coords.latitude,
    userLocation.coords.longitude,
    userLocation.coords.altitude || 0,
    anchor.latitude,
    anchor.longitude,
    anchor.altitude
  );

  const imageSource = anchor.is_unlocked
    ? require("../../assets/unlocked.png")
    : require("../../assets/locked_p2.png");

  return (
    <ViroNode position={[x, y, z]} transformBehaviors={["billboardY"]}>
      <ViroImage
        height={1}
        width={1}
        source={imageSource}
      />
      <ViroText
        text={anchor.title}
        scale={[0.5, 0.5, 0.5]}
        position={[0, 0.6, 0]}
        style={styles.arText}
      />
    </ViroNode>
  );
};

const AnchorARScene = (props: any) => {
  const { anchors, userLocation } = props.sceneNavigator.viroAppProps;

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" />
      {anchors.map((anchor: NearbyAnchor) => (
        <ARAnchor
          key={anchor.anchor_id}
          anchor={anchor}
          userLocation={userLocation}
        />
      ))}
    </ViroARScene>
  );
};

export default function ARScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const [anchors, setAnchors] = useState<NearbyAnchor[]>([]);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== "granted") {
        setHasPermission(false);
        Alert.alert("Permission Required", "Location access is needed for AR positioning.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setUserLocation(location);
      setHasPermission(true);

      if (session?.access_token) {
        try {
          const nearby = await getNearbyAnchors({
            lat: location.coords.latitude,
            lon: location.coords.longitude,
            radiusKm: 1,
          }, session.access_token);
          setAnchors(nearby);
        } catch (err) {
          console.error("Failed to fetch nearby anchors for AR:", err);
        }
      }
    })();
  }, []);

  if (hasPermission === false) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Permissions not granted</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!userLocation) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Initializing AR...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        initialScene={{
          scene: AnchorARScene,
        }}
        viroAppProps={{ anchors, userLocation }}
        style={styles.arView}
      />

      {/* UI Overlays */}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.infoBadge}>
          <Text style={styles.infoText}>{anchors.length} Anchors nearby</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  arView: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 10,
    borderRadius: 25,
  },
  infoBadge: {
    backgroundColor: "rgba(245, 84, 118, 0.9)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  infoText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF8F2",
  },
  loadingText: {
    fontSize: 18,
    color: "#F55476",
    fontWeight: "bold",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#b42318",
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: "#F55476",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  arText: {
    fontFamily: "Arial",
    fontSize: 20,
    color: "#ffffff",
    textAlignVertical: "center",
    textAlign: "center",
  },
});
