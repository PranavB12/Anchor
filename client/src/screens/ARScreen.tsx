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
import { getNearbyAnchors, NearbyAnchor, getAnchorAttachments, AnchorAttachment } from "../services/anchorService";
import { getDistanceFromLatLonInM } from "../utils/distance";
import { useAuth } from "../context/AuthContext";

const getRelativeARCoords = (
  userLat: number,
  userLon: number,
  userAlt: number,
  initialHeading: number,
  anchorLat: number,
  anchorLon: number,
  anchorAlt: number | null
) => {
  const R = 6371000;
  const dLat = (anchorLat - userLat) * (Math.PI / 180);
  const dLon = (anchorLon - userLon) * (Math.PI / 180);

  const x_east = R * dLon * Math.cos(userLat * (Math.PI / 180));
  const z_north = R * dLat;
  const y_diff = anchorAlt !== null ? anchorAlt - userAlt : 0;

  const H_rad = initialHeading * (Math.PI / 180);
  const cosH = Math.cos(H_rad);
  const sinH = Math.sin(H_rad);

  const viroX = x_east * cosH - z_north * sinH;
  const viroZ = -(x_east * sinH + z_north * cosH);

  return { x: viroX, y: y_diff, z: viroZ };
};

const ARAnchor = ({
  anchor,
  initialLocation,
  initialHeading,
  currentLocation,
}: {
  anchor: NearbyAnchor;
  initialLocation: Location.LocationObject;
  initialHeading: number;
  currentLocation: Location.LocationObject;
}) => {
  const { session } = useAuth();
  const { x, y, z } = getRelativeARCoords(
    initialLocation.coords.latitude,
    initialLocation.coords.longitude,
    initialLocation.coords.altitude || 0,
    initialHeading,
    anchor.latitude,
    anchor.longitude,
    anchor.altitude
  );

  const distance = Math.round(
    getDistanceFromLatLonInM(
      currentLocation.coords.latitude,
      currentLocation.coords.longitude,
      anchor.latitude,
      anchor.longitude
    )
  );

  const [attachments, setAttachments] = useState<AnchorAttachment[] | null>(null);

  useEffect(() => {
    let active = true;
    if (distance <= 10 && !attachments && session?.access_token && anchor.is_unlocked) {
      getAnchorAttachments(anchor.anchor_id, session.access_token)
        .then((data) => {
          if (active) setAttachments(data);
        })
        .catch(console.error);
    }
    return () => {
      active = false;
    };
  }, [distance, attachments, session?.access_token, anchor.anchor_id, anchor.is_unlocked]);

  const imageSource = anchor.is_unlocked
    ? require("../../assets/unlocked.png")
    : require("../../assets/locked_p2.png");

  const renderContent = () => {
    if (!attachments || attachments.length === 0) return null;
    const first = attachments[0];
    if (first.content_type.includes("image")) {
      return (
        <ViroImage height={0.8} width={0.8} position={[0, -0.6, 0]} source={{ uri: first.file_url || "" }} />
      );
    } else if (first.content_type.includes("text") || first.text_body) {
      return (
        <ViroText
          text={first.text_body || "Text Document"}
          scale={[0.4, 0.4, 0.4]}
          position={[0, -0.6, 0]}
          style={styles.arText}
        />
      );
    } else {
      return (
        <ViroText
          text={"Document File"}
          scale={[0.4, 0.4, 0.4]}
          position={[0, -0.6, 0]}
          style={styles.arText}
        />
      );
    }
  };

  return (
    <ViroNode position={[x, y, z]} transformBehaviors={["billboardY"]}>
      <ViroImage height={1} width={1} source={imageSource} />
      <ViroText text={anchor.title} scale={[0.5, 0.5, 0.5]} position={[0, 0.6, 0]} style={styles.arText} />
      <ViroText text={`${distance}m`} scale={[0.4, 0.4, 0.4]} position={[0, -0.3, 0]} style={styles.arDistanceText} />
      {distance <= 10 && anchor.is_unlocked && renderContent()}
    </ViroNode>
  );
};

const AnchorARScene = (props: any) => {
  const { anchors, initialLocation, initialHeading, currentLocation } = props.sceneNavigator.viroAppProps;

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" />
      {anchors.map((anchor: NearbyAnchor) => (
        <ARAnchor
          key={anchor.anchor_id}
          anchor={anchor}
          initialLocation={initialLocation}
          initialHeading={initialHeading}
          currentLocation={currentLocation}
        />
      ))}
    </ViroARScene>
  );
};

export default function ARScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const [anchors, setAnchors] = useState<NearbyAnchor[]>([]);
  const [initialLocation, setInitialLocation] = useState<Location.LocationObject | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [initialHeading, setInitialHeading] = useState<number | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let locSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== "granted") {
        setHasPermission(false);
        Alert.alert("Permission Required", "Location access is needed for AR positioning.");
        return;
      }
      setHasPermission(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setInitialLocation(location);
      setCurrentLocation(location);

      const headingObj = await Location.getHeadingAsync();
      setInitialHeading(headingObj.trueHeading !== -1 ? headingObj.trueHeading : headingObj.magHeading);

      if (session?.access_token) {
        try {
          const nearby = await getNearbyAnchors(
            {
              lat: location.coords.latitude,
              lon: location.coords.longitude,
              radiusKm: 2,
            },
            session.access_token
          );
          setAnchors(nearby);
        } catch (err) {
          console.error("Failed to fetch nearby anchors for AR:", err);
        }
      }

      locSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
        (loc) => {
          setCurrentLocation(loc);
        }
      );

      headSub = await Location.watchHeadingAsync((head) => {
        // Continuous tracking loop as per tracking requirement.
      });
    })();

    return () => {
      if (locSub) locSub.remove();
      if (headSub) headSub.remove();
    };
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

  if (!initialLocation || initialHeading === null || !currentLocation) {
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
        viroAppProps={{ anchors, initialLocation, initialHeading, currentLocation }}
        style={styles.arView}
      />

      {/* UI Overlays */}
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
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
  arDistanceText: {
    fontFamily: "Arial",
    fontSize: 16,
    color: "#F55476",
    textAlignVertical: "center",
    textAlign: "center",
    fontWeight: "bold",
  },
});
