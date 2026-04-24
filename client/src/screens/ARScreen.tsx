import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Alert } from "react-native";
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroAmbientLight,
  ViroNode,
  ViroImage,
  ViroText,
  ViroQuad,
  ViroMaterials,
  ViroFlexView,
} from "@viro-community/react-viro";
import { API_BASE_URL } from "../services/api";
import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  getNearbyAnchors,
  NearbyAnchor,
  getAnchorAttachments,
  AnchorAttachment,
} from "../services/anchorService";
import { getDistanceFromLatLonInM } from "../utils/distance";
import { useAuth } from "../context/AuthContext";
import { getRelativeARCoords } from "../utils/arMath";

// ─── Materials ────────────────────────────────────────────────────────────────
ViroMaterials.createMaterials({
  // --- Premium card layers ---
  // Outermost ambient glow (warm)
  cardAura: {
    diffuseColor: "rgba(244, 187, 126, 0.08)",
    lightingModel: "Constant",
  },
  // Warm gold accent border
  cardBorder: {
    diffuseColor: "rgba(244, 187, 126, 0.60)",
    lightingModel: "Constant",
  },
  // Dark glass body
  cardGlass: {
    diffuseColor: "rgba(10, 8, 16, 0.93)",
    lightingModel: "Constant",
  },
  // Pink header fill
  cardHeader: {
    diffuseColor: "rgba(245, 84, 118, 0.96)",
    lightingModel: "Constant",
  },
  // Subtle sheen over header (highlights the top edge)
  cardHeaderSheen: {
    diffuseColor: "rgba(255, 230, 210, 0.14)",
    lightingModel: "Constant",
  },
  // Warm gold horizontal rule
  cardRule: {
    diffuseColor: "rgba(244, 187, 126, 0.50)",
    lightingModel: "Constant",
  },
  // Very dark frosted pane inside card (description / content zones)
  cardInset: {
    diffuseColor: "rgba(255, 255, 255, 0.04)",
    lightingModel: "Constant",
  },
  // Footer tint
  cardFooter: {
    diffuseColor: "rgba(245, 84, 118, 0.09)",
    lightingModel: "Constant",
  },
  cardFooterRule: {
    diffuseColor: "rgba(245, 84, 118, 0.35)",
    lightingModel: "Constant",
  },

  // --- Badge fills ---
  badgePink: {
    diffuseColor: "rgba(245, 84, 118, 0.92)",
    lightingModel: "Constant",
  },
  badgeWarm: {
    diffuseColor: "rgba(244, 187, 126, 0.92)",
    lightingModel: "Constant",
  },
  badgeDark: {
    diffuseColor: "rgba(18, 14, 24, 0.90)",
    lightingModel: "Constant",
  },
  badgeMuted: {
    diffuseColor: "rgba(65, 68, 82, 0.88)",
    lightingModel: "Constant",
  },
  badgeSuccess: {
    diffuseColor: "rgba(2, 122, 72, 0.88)",
    lightingModel: "Constant",
  },

  // --- Beacon rings – unlocked (pink) ---
  pinAura: {
    diffuseColor: "rgba(245, 84, 118, 0.09)",
    lightingModel: "Constant",
  },
  pinRingOuter: {
    diffuseColor: "rgba(245, 84, 118, 0.22)",
    lightingModel: "Constant",
  },
  pinRingMid: {
    diffuseColor: "rgba(245, 84, 118, 0.50)",
    lightingModel: "Constant",
  },
  pinCore: {
    diffuseColor: "rgba(245, 84, 118, 0.92)",
    lightingModel: "Constant",
  },
  pinCoreWhite: {
    diffuseColor: "rgba(255, 248, 244, 0.96)",
    lightingModel: "Constant",
  },

  // --- Beacon rings – locked (muted slate) ---
  pinLockedAura: {
    diffuseColor: "rgba(100, 104, 120, 0.09)",
    lightingModel: "Constant",
  },
  pinLockedRingOuter: {
    diffuseColor: "rgba(100, 104, 120, 0.22)",
    lightingModel: "Constant",
  },
  pinLockedRingMid: {
    diffuseColor: "rgba(100, 104, 120, 0.48)",
    lightingModel: "Constant",
  },
  pinLockedCore: {
    diffuseColor: "rgba(110, 114, 130, 0.88)",
    lightingModel: "Constant",
  },
  pinLockedCoreWhite: {
    diffuseColor: "rgba(195, 196, 205, 0.90)",
    lightingModel: "Constant",
  },
});

// ─── Beacon Pin  (shown when anchor is far away or locked) ───────────────────
const BeaconPin = ({
  anchor,
  distance,
}: {
  anchor: NearbyAnchor;
  distance: number;
}) => {
  const locked = !anchor.is_unlocked;

  const aura = locked ? "pinLockedAura" : "pinAura";
  const ringOuter = locked ? "pinLockedRingOuter" : "pinRingOuter";
  const ringMid = locked ? "pinLockedRingMid" : "pinRingMid";
  const core = locked ? "pinLockedCore" : "pinCore";
  const coreWhite = locked ? "pinLockedCoreWhite" : "pinCoreWhite";
  const distBadge = locked ? "badgeMuted" : "badgePink";

  const iconSource = locked
    ? require("../../assets/locked_p2.png")
    : require("../../assets/unlocked.png");

  return (
    <>
      {/* ── Title floating above ── */}
      {/* Pill background behind title */}
      <ViroQuad
        position={[0, 0.92, -0.01]}
        scale={[anchor.title.length * 0.052 + 0.18, 0.26, 1]}
        materials={["badgeDark"]}
      />
      <ViroText
        text={anchor.title}
        scale={[0.44, 0.44, 0.44]}
        position={[0, 0.92, 0.01]}
        style={styles.pinTitle}
      />

      {/* ── Diamond glow rings (stacked, rotated 45°) ── */}
      {/* Aura – largest, most transparent */}
      <ViroQuad
        position={[0, 0, -0.05]}
        scale={[0.88, 0.88, 1]}
        rotation={[0, 0, 45]}
        materials={[aura]}
      />
      {/* Outer ring */}
      <ViroQuad
        position={[0, 0, -0.03]}
        scale={[0.66, 0.66, 1]}
        rotation={[0, 0, 45]}
        materials={[ringOuter]}
      />
      {/* Mid ring */}
      <ViroQuad
        position={[0, 0, -0.02]}
        scale={[0.46, 0.46, 1]}
        rotation={[0, 0, 45]}
        materials={[ringMid]}
      />
      {/* Core diamond */}
      <ViroQuad
        position={[0, 0, -0.01]}
        scale={[0.30, 0.30, 1]}
        rotation={[0, 0, 45]}
        materials={[core]}
      />
      {/* White hot center dot */}
      <ViroQuad
        position={[0, 0, 0]}
        scale={[0.15, 0.15, 1]}
        rotation={[0, 0, 45]}
        materials={[coreWhite]}
      />

      {/* ── Icon centered on core ── */}
      <ViroImage
        height={0.20}
        width={0.20}
        source={iconSource}
        position={[0, 0, 0.02]}
      />

      {/* ── Distance badge ── */}
      <ViroQuad
        position={[0, -0.60, -0.01]}
        scale={[0.70, 0.24, 1]}
        materials={[distBadge]}
      />
      <ViroText
        text={`${distance}m away`}
        scale={[0.22, 0.22, 0.22]}
        position={[0, -0.60, 0.01]}
        style={styles.pinDistanceText}
      />

      {/* ── Lock status label ── */}
      <ViroText
        text={locked ? "LOCKED" : "UNLOCKED"}
        scale={[0.20, 0.20, 0.20]}
        position={[0, -0.85, 0]}
        style={locked ? styles.pinLabelLocked : styles.pinLabelUnlocked}
      />
    </>
  );
};

// ─── Premium Card  (shown when anchor is near AND unlocked) ──────────────────
const PremiumCard = ({
  anchor,
  distance,
  attachments,
}: {
  anchor: NearbyAnchor;
  distance: number;
  attachments: AnchorAttachment[] | null;
}) => {
  // Card geometry constants (reduced size)
  const W = 1.60;   
  const H = 2.40;   
  const halfH = H / 2;

  // Positions relative to card center (0,0,0)
  const HEADER_Y = halfH - 0.22;   
  const RULE_Y = halfH - 0.46;   
  const BADGE_Y = halfH - 0.64;   
  const DESC_Y = halfH - 0.96;   
  const CONTENT_Y = -0.06;           
  const FOOTER_Y = -halfH + 0.12;   
  const FOOTER_RULE = -halfH + 0.25;   

  const renderAttachment = () => {
    if (!attachments || attachments.length === 0) return null;
    const first = attachments[0];
    const mime = (first.mime_type ?? first.content_type ?? "").toLowerCase();

    if (mime.includes("image") && first.file_url) {
      let url = first.file_url;
      if (url.startsWith("/")) {
        url = `${API_BASE_URL}${url}`;
      } else if (url.includes("127.0.0.1") || url.includes("localhost")) {
        try { url = `${API_BASE_URL}${new URL(url).pathname}`; } catch (_) { }
      }
      return (
        <ViroImage
          height={0.65}
          width={1.28}
          position={[0, CONTENT_Y, 0.07]}
          source={{ uri: url }}
          resizeMode="ScaleToFit"
        />
      );
    } else if (mime.includes("text") || first.text_body) {
      return (
        <ViroText
          text={first.text_body ?? ""}
          scale={[0.14, 0.14, 0.14]}
          position={[0, CONTENT_Y, 0.07]}
          style={styles.cardBodyText}
        />
      );
    }
    return null;
  };

  return (
    <>
      {/* ══ LAYER 0 – Outermost warm aura glow (soft edges) ══ */}
      <ViroFlexView
        position={[0, 0, -0.08]}
        width={W + 0.40}
        height={H + 0.40}
        style={{ backgroundColor: "rgba(244, 187, 126, 0.08)", borderRadius: 0.2 }}
      />

      {/* ══ LAYER 1 – Gold accent border (rounded corners) ══ */}
      <ViroFlexView
        position={[0, 0, -0.06]}
        width={W + 0.04}
        height={H + 0.04}
        style={{ backgroundColor: "rgba(244, 187, 126, 0.60)", borderRadius: 0.12 }}
      />

      {/* ══ LAYER 2 – Dark glass body (rounded corners) ══ */}
      <ViroFlexView
        position={[0, 0, -0.05]}
        width={W}
        height={H}
        style={{ backgroundColor: "rgba(10, 8, 16, 0.93)", borderRadius: 0.10 }}
      />

      {/* ══ HEADER BAND ══ */}
      {/* Pink fill with rounded corners */}
      <ViroFlexView
        position={[0, HEADER_Y, -0.02]}
        width={W - 0.04}
        height={0.44}
        style={{ backgroundColor: "rgba(245, 84, 118, 0.96)", borderRadius: 0.08 }}
      />
      {/* Title text */}
      <ViroText
        text={anchor.title}
        scale={[0.26, 0.26, 0.26]}
        position={[0, HEADER_Y, 0.02]}
        style={styles.cardTitle}
      />

      {/* ══ GOLD RULE ══ */}
      <ViroFlexView
        position={[0, RULE_Y, -0.01]}
        width={W - 0.12}
        height={0.012}
        style={{ backgroundColor: "rgba(244, 187, 126, 0.50)", borderRadius: 0.01 }}
      />

      {/* ══ BADGE ROW – distance + unlocked status ══ */}
      {/* Distance pill */}
      <ViroFlexView
        position={[-0.30, BADGE_Y, -0.01]}
        width={0.50}
        height={0.14}
        style={{ backgroundColor: "rgba(245, 84, 118, 0.92)", borderRadius: 0.07 }}
      />
      <ViroText
        text={`${distance}m AWAY`}
        scale={[0.15, 0.15, 0.15]}
        position={[-0.30, BADGE_Y, 0.02]}
        style={styles.cardBadgeText}
      />
      {/* Unlocked pill */}
      <ViroFlexView
        position={[0.30, BADGE_Y, -0.01]}
        width={0.48}
        height={0.14}
        style={{ backgroundColor: "rgba(2, 122, 72, 0.88)", borderRadius: 0.07 }}
      />
      <ViroText
        text={"✓ UNLOCKED"}
        scale={[0.13, 0.13, 0.13]}
        position={[0.30, BADGE_Y, 0.02]}
        style={styles.cardBadgeText}
      />

      {/* ══ DESCRIPTION ZONE ══ */}
      {anchor.description ? (
        <>
          <ViroFlexView
            position={[0, DESC_Y, -0.02]}
            width={W - 0.14}
            height={0.40}
            style={{ backgroundColor: "rgba(255, 255, 255, 0.04)", borderRadius: 0.05 }}
          />
          <ViroText
            text={anchor.description}
            scale={[0.14, 0.14, 0.14]}
            position={[0, DESC_Y, 0.02]}
            style={styles.cardDescText}
          />
        </>
      ) : null}

      {/* ══ ATTACHMENT / CONTENT ZONE ══ */}
      <ViroFlexView
        position={[0, CONTENT_Y, -0.02]}
        width={W - 0.14}
        height={0.74}
        style={{ backgroundColor: "rgba(255, 255, 255, 0.04)", borderRadius: 0.05 }}
      />
      {renderAttachment()}

      {/* ══ FOOTER ══ */}
      <ViroFlexView
        position={[0, FOOTER_Y, -0.02]}
        width={W - 0.04}
        height={0.25}
        style={{ backgroundColor: "rgba(245, 84, 118, 0.09)", borderRadius: 0.08 }}
      />
      {/* Thin rule above footer */}
      <ViroFlexView
        position={[0, FOOTER_RULE, -0.01]}
        width={W - 0.06}
        height={0.01}
        style={{ backgroundColor: "rgba(245, 84, 118, 0.35)", borderRadius: 0.01 }}
      />
    </>
  );
};

// ─── ARAnchor ─────────────────────────────────────────────────────────────────
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

  const { x: realX, y: realY, z: realZ } = getRelativeARCoords(
    initialLocation.coords.latitude,
    initialLocation.coords.longitude,
    initialLocation.coords.altitude || 0,
    initialHeading,
    anchor.latitude,
    anchor.longitude,
    anchor.altitude
  );

  const realDistance = Math.sqrt(realX * realX + realZ * realZ);
  const MAX_RENDER_DISTANCE = 15;
  let renderX = realX, renderY = realY, renderZ = realZ;
  if (realDistance > MAX_RENDER_DISTANCE) {
    const f = MAX_RENDER_DISTANCE / realDistance;
    renderX = realX * f;
    renderZ = realZ * f;
  }

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
        .then((data) => { if (active) setAttachments(data); })
        .catch(console.error);
    }
    return () => { active = false; };
  }, [distance, attachments, session?.access_token, anchor.anchor_id, anchor.is_unlocked]);

  const showCard = distance <= 10 && anchor.is_unlocked;

  return (
    <ViroNode
      position={[renderX, renderY, renderZ]}
      transformBehaviors={["billboardY"]}
    >
      {showCard ? (
        <PremiumCard
          anchor={anchor}
          distance={distance}
          attachments={attachments}
        />
      ) : (
        <BeaconPin anchor={anchor} distance={distance} />
      )}
    </ViroNode>
  );
};

// ─── AR Scene ─────────────────────────────────────────────────────────────────
const AnchorARScene = (props: any) => {
  const { anchors, initialLocation, initialHeading, currentLocation } =
    props.sceneNavigator.viroAppProps;

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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ARScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();
  const [anchors, setAnchors] = useState<NearbyAnchor[]>([]);
  const [initialLocation, setInitialLocation] =
    useState<Location.LocationObject | null>(null);
  const [currentLocation, setCurrentLocation] =
    useState<Location.LocationObject | null>(null);
  const [initialHeading, setInitialHeading] = useState<number | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    let locSub: Location.LocationSubscription | null = null;
    let headSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setHasPermission(false);
        Alert.alert(
          "Permission Required",
          "Location access is needed for AR positioning."
        );
        return;
      }
      setHasPermission(true);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setInitialLocation(location);
      setCurrentLocation(location);

      const headingObj = await Location.getHeadingAsync();
      setInitialHeading(
        headingObj.trueHeading !== -1
          ? headingObj.trueHeading
          : headingObj.magHeading
      );

      if (session?.access_token) {
        try {
          const nearby = await getNearbyAnchors(
            { lat: location.coords.latitude, lon: location.coords.longitude, radiusKm: 2 },
            session.access_token
          );
          setAnchors(nearby);
        } catch (err) {
          console.error("Failed to fetch nearby anchors for AR:", err);
        }
      }

      locSub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (loc) => setCurrentLocation(loc)
      );

      headSub = await Location.watchHeadingAsync(() => { });
    })();

    return () => {
      locSub?.remove();
      headSub?.remove();
    };
  }, []);

  if (hasPermission === false) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Permissions not granted</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!initialLocation || initialHeading === null || !currentLocation) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingDot}>◆</Text>
        <Text style={styles.loadingText}>Initializing AR</Text>
        <Text style={styles.loadingSubText}>Acquiring location & heading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        initialScene={{ scene: AnchorARScene }}
        viroAppProps={{ anchors, initialLocation, initialHeading, currentLocation }}
        style={styles.arView}
      />

      {/* ── HUD Overlay ── */}
      <View style={styles.hud}>
        {/* Close button */}
        <TouchableOpacity
          style={styles.hudClose}
          onPress={() => navigation.goBack()}
        >
          <Feather name="x" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Anchor count badge */}
        <View style={styles.hudBadge}>
          <View style={styles.hudBadgeDot} />
          <Text style={styles.hudBadgeText}>
            {anchors.length} anchor{anchors.length !== 1 ? "s" : ""} nearby
          </Text>
        </View>
      </View>

      {/* ── Bottom hint bar ── */}
      <View style={styles.hintBar}>
        <Text style={styles.hintText}>
          Move within <Text style={styles.hintAccent}>10m</Text> of a pin to unlock its contents
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Screen ──
  container: { flex: 1 },
  arView: { flex: 1 },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF8F2",
    gap: 8,
  },
  loadingDot: {
    fontSize: 28,
    color: "#F55476",
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 20,
    color: "#1f2937",
    fontWeight: "700",
    letterSpacing: 1,
  },
  loadingSubText: {
    fontSize: 13,
    color: "#9FA6B5",
    letterSpacing: 0.4,
  },

  // ── Error ──
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: "#b42318", marginBottom: 20 },
  backButton: {
    backgroundColor: "#F55476",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: { color: "#fff", fontWeight: "700" },

  // ── HUD ──
  hud: {
    position: "absolute",
    top: 52,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hudClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  hudBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(245, 84, 118, 0.92)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: "#F55476",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  hudBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  hudBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Hint bar ──
  hintBar: {
    position: "absolute",
    bottom: 36,
    left: 24,
    right: 24,
    backgroundColor: "rgba(10, 8, 16, 0.72)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(244,187,126,0.25)",
    alignItems: "center",
  },
  hintText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  hintAccent: {
    color: "#F4BB7E",
    fontWeight: "700",
  },

  // ─── ViroText styles (AR world-space) ────────────────────────────────────

  // Beacon pin
  pinTitle: {
    fontFamily: "sans-serif",
    fontSize: 38,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  pinDistanceText: {
    fontFamily: "sans-serif",
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    textAlignVertical: "center",
  },
  pinLabelUnlocked: {
    fontFamily: "sans-serif",
    fontSize: 18,
    fontWeight: "bold",
    color: "#4ade80",           // soft green – success
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pinLabelLocked: {
    fontFamily: "sans-serif",
    fontSize: 18,
    fontWeight: "bold",
    color: "#9FA6B5",
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // Premium card
  cardTitle: {
    fontFamily: "sans-serif",
    fontSize: 36,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cardBadgeText: {
    fontFamily: "sans-serif",
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    textAlignVertical: "center",
  },
  cardDescText: {
    fontFamily: "sans-serif",
    fontSize: 22,
    color: "#d1d5db",
    textAlign: "center",
    textAlignVertical: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardBodyText: {
    fontFamily: "sans-serif",
    fontSize: 20,
    color: "#e5e7eb",
    textAlign: "center",
    textAlignVertical: "center",
  },
});