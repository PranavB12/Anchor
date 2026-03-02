import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Mapbox from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import {
  getNearbyAnchors,
  type NearbyAnchor,
} from "../services/anchorService";

type Coordinate = [number, number];

type AnchorWithDerivedFields = NearbyAnchor & {
  distanceMeters: number;
  isUnlocked: boolean;
  lockLabel: string;
  visibilityLabel: string;
  primaryTag: string | null;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);

  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function formatVisibility(value: NearbyAnchor["visibility"]) {
  if (value === "CIRCLE_ONLY") return "Circle";
  if (value === "PRIVATE") return "Private";
  return "Public";
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function getLockMeta(anchor: NearbyAnchor, distanceMeters: number) {
  if (anchor.status !== "ACTIVE") {
    return {
      isUnlocked: false,
      label: anchor.status,
    };
  }

  if (distanceMeters <= anchor.unlock_radius) {
    return {
      isUnlocked: true,
      label: "Unlocked",
    };
  }

  return {
    isUnlocked: false,
    label: "Locked",
  };
}

function AnchorRowCard({
  anchor,
  onPress,
}: {
  anchor: AnchorWithDerivedFields;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.anchorCard} onPress={onPress}>
      <View style={styles.anchorRowTop}>
        <Text style={styles.anchorTitle} numberOfLines={1}>
          {anchor.title}
        </Text>
        {anchor.primaryTag ? (
          <View style={styles.tagPill}>
            <Text style={styles.tagPillText}>{anchor.primaryTag}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.anchorRowMiddle}>
        <View style={styles.infoChip}>
          <Feather name="map-pin" size={13} color={colors.muted} />
          <Text style={styles.infoChipText}>{formatDistance(anchor.distanceMeters)}</Text>
        </View>
        <View
          style={[
            styles.infoChip,
            anchor.isUnlocked ? styles.infoChipSuccess : styles.infoChipLocked,
          ]}
        >
          <Feather
            name={anchor.isUnlocked ? "unlock" : "lock"}
            size={13}
            color={anchor.isUnlocked ? colors.success : colors.accentPink}
          />
          <Text
            style={[
              styles.infoChipText,
              anchor.isUnlocked
                ? styles.infoChipTextSuccess
                : styles.infoChipTextLocked,
            ]}
          >
            {anchor.lockLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.anchorMeta}>
        {anchor.visibilityLabel} · Radius {anchor.unlock_radius}m
      </Text>
    </Pressable>
  );
}

export default function DiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { session } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [userCoordinate, setUserCoordinate] = useState<Coordinate | null>(null);
  const [anchors, setAnchors] = useState<AnchorWithDerivedFields[]>([]);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const collapsedHeight = 116;
  const expandedHeight = Math.min(windowHeight * 0.72, windowHeight - 128);
  const collapseOffset = Math.max(expandedHeight - collapsedHeight, 0);

  const sheetTranslateY = useRef(new Animated.Value(collapseOffset)).current;
  const currentTranslateY = useRef(collapseOffset);
  const panStartOffset = useRef(collapseOffset);
  const listScrollOffset = useRef(0);

  useEffect(() => {
    const listenerId = sheetTranslateY.addListener(({ value }) => {
      currentTranslateY.current = value;
    });
    return () => {
      sheetTranslateY.removeListener(listenerId);
    };
  }, [sheetTranslateY]);

  const animateSheet = useCallback(
    (expand: boolean) => {
      if (expand) {
        setIsExpanded(true);
      }

      Animated.timing(sheetTranslateY, {
        toValue: expand ? 0 : collapseOffset,
        duration: 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        if (!expand) {
          setIsExpanded(false);
          listScrollOffset.current = 0;
        }
      });
    },
    [collapseOffset, sheetTranslateY],
  );

  useEffect(() => {
    sheetTranslateY.setValue(isExpanded ? 0 : collapseOffset);
    currentTranslateY.current = isExpanded ? 0 : collapseOffset;
  }, [collapseOffset, isExpanded, sheetTranslateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) => {
          if (Math.abs(gesture.dy) < 5) return false;
          if (!isExpanded) return true;
          if (gesture.dy > 0) return true;
          return currentTranslateY.current > 0;
        },
        onMoveShouldSetPanResponderCapture: (_event, gesture) => {
          if (Math.abs(gesture.dy) < 5) return false;
          if (!isExpanded) return true;
          if (gesture.dy > 0) return true;
          return currentTranslateY.current > 0;
        },
        onPanResponderGrant: () => {
          panStartOffset.current = currentTranslateY.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const next = clamp(
            panStartOffset.current + gesture.dy,
            0,
            collapseOffset,
          );
          sheetTranslateY.setValue(next);
        },
        onPanResponderRelease: (_event, gesture) => {
          let shouldExpand = currentTranslateY.current < collapseOffset / 2;
          if (gesture.vy <= -0.2) {
            shouldExpand = true;
          } else if (gesture.vy >= 0.2) {
            shouldExpand = false;
          }
          animateSheet(shouldExpand);
        },
      }),
    [animateSheet, collapseOffset, isExpanded, sheetTranslateY],
  );

  const loadNearby = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setErrorMessage("Location permission is required to discover nearby anchors.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      setUserCoordinate([userLon, userLat]);

      const response = await getNearbyAnchors(
        {
          lat: userLat,
          lon: userLon,
          radiusKm: 5,
          sortBy: "distance",
        },
        token,
      );

      const mapped = response
        .map<AnchorWithDerivedFields>((anchor) => {
          const distanceMeters = haversineDistanceMeters(
            userLat,
            userLon,
            anchor.latitude,
            anchor.longitude,
          );
          const lockMeta = getLockMeta(anchor, distanceMeters);

          return {
            ...anchor,
            distanceMeters,
            isUnlocked: lockMeta.isUnlocked,
            lockLabel: lockMeta.label,
            visibilityLabel: formatVisibility(anchor.visibility),
            primaryTag: anchor.tags?.[0] ?? null,
          };
        })
        .sort((first, second) => first.distanceMeters - second.distanceMeters);

      setAnchors(mapped);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load nearby anchors.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadNearby();
  }, [loadNearby]);

  const filteredAnchors = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return anchors;

    return anchors.filter((anchor) => {
      const tags = (anchor.tags ?? []).join(" ").toLowerCase();
      return (
        anchor.title.toLowerCase().includes(normalizedQuery) ||
        anchor.visibilityLabel.toLowerCase().includes(normalizedQuery) ||
        tags.includes(normalizedQuery)
      );
    });
  }, [anchors, searchQuery]);

  const selectedAnchor = useMemo(
    () => anchors.find((anchor) => anchor.anchor_id === selectedAnchorId) ?? null,
    [anchors, selectedAnchorId],
  );

  const openAnchorDetails = useCallback(
    (anchorId: string) => {
      listScrollOffset.current = 0;
      setSelectedAnchorId(anchorId);
      animateSheet(true);
    },
    [animateSheet],
  );

  const closeAnchorDetails = useCallback(() => {
    listScrollOffset.current = 0;
    setSelectedAnchorId(null);
  }, []);

  const collapseSheet = useCallback(() => {
    Keyboard.dismiss();
    listScrollOffset.current = 0;
    setSelectedAnchorId(null);
    animateSheet(false);
  }, [animateSheet]);

  const profileInitial = (session?.username ?? "U").charAt(0).toUpperCase();

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.screen}>
        <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Light}>
          <Mapbox.Camera
            zoomLevel={14}
            centerCoordinate={userCoordinate ?? FALLBACK_CENTER}
            animationDuration={1000}
          />

          {userCoordinate ? (
            <Mapbox.MarkerView id="user-location" coordinate={userCoordinate}>
              <View style={styles.userDot} />
            </Mapbox.MarkerView>
          ) : null}

          {filteredAnchors.map((anchor) => (
            <Mapbox.MarkerView
              key={anchor.anchor_id}
              id={`nearby-${anchor.anchor_id}`}
              coordinate={[anchor.longitude, anchor.latitude]}
            >
              <TouchableOpacity
                onPress={() => openAnchorDetails(anchor.anchor_id)}
                style={[
                  styles.mapMarker,
                  anchor.isUnlocked ? styles.mapMarkerUnlocked : styles.mapMarkerLocked,
                ]}
              >
                <Feather
                  name={anchor.isUnlocked ? "unlock" : "lock"}
                  size={14}
                  color={colors.white}
                />
              </TouchableOpacity>
            </Mapbox.MarkerView>
          ))}
        </Mapbox.MapView>

        <View style={[styles.topBar, { top: insets.top + 12 }]}>
          <View style={styles.searchBar}>
            <Feather name="search" size={17} color={colors.muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search nearby anchors"
              placeholderTextColor={colors.lightMuted}
              style={styles.searchInput}
            />
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() =>
              Alert.alert("Profile", `Signed in as ${session?.username ?? "User"}`)
            }
          >
            <Text style={styles.profileInitial}>{profileInitial}</Text>
          </TouchableOpacity>
        </View>

        <Animated.View
          style={[
            styles.addButtonWrap,
            {
              bottom: expandedHeight + insets.bottom + 14,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("Map")}
          >
            <Feather name="plus" size={20} color={colors.white} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.bottomSheet,
            {
              height: expandedHeight,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.handleTouchArea}
            onPress={() => {
              if (isExpanded) {
                collapseSheet();
              } else {
                animateSheet(true);
              }
            }}
            activeOpacity={0.85}
          >
            <View style={styles.handle} />
            {isExpanded ? (
              <Feather name="chevron-down" size={16} color={colors.muted} />
            ) : null}
          </TouchableOpacity>

        {selectedAnchor ? (
          <View style={styles.detailContainer}>
            <View style={styles.detailHeaderRow}>
              <TouchableOpacity style={styles.backButton} onPress={closeAnchorDetails}>
                <Feather name="arrow-left" size={16} color={colors.text} />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.detailHeaderTitle}>Anchor Details</Text>
              <TouchableOpacity style={styles.detailHeaderClose} onPress={collapseSheet}>
                <Feather name="chevron-down" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[
                { key: "title", label: "Title", value: selectedAnchor.title },
                {
                  key: "description",
                  label: "Description",
                  value: selectedAnchor.description || "No description",
                },
                {
                  key: "distance",
                  label: "Distance",
                  value: formatDistance(selectedAnchor.distanceMeters),
                },
                { key: "status", label: "State", value: selectedAnchor.lockLabel },
                {
                  key: "visibility",
                  label: "Visibility",
                  value: selectedAnchor.visibilityLabel,
                },
                {
                  key: "radius",
                  label: "Unlock Radius",
                  value: `${selectedAnchor.unlock_radius}m`,
                },
                {
                  key: "unlocks",
                  label: "Unlock Count",
                  value:
                    selectedAnchor.max_unlock === null
                      ? `${selectedAnchor.current_unlock}`
                      : `${selectedAnchor.current_unlock} / ${selectedAnchor.max_unlock}`,
                },
                {
                  key: "activation",
                  label: "Activation",
                  value: formatDateTime(selectedAnchor.activation_time),
                },
                {
                  key: "expiration",
                  label: "Expiration",
                  value: formatDateTime(selectedAnchor.expiration_time),
                },
              ]}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={styles.detailValue}>{item.value}</Text>
                </View>
              )}
              ListHeaderComponent={
                <View style={styles.detailTopSection}>
                  <View style={styles.detailStatusRow}>
                    <Feather
                      name={selectedAnchor.isUnlocked ? "unlock" : "lock"}
                      size={16}
                      color={
                        selectedAnchor.isUnlocked ? colors.success : colors.accentPink
                      }
                    />
                    <Text
                      style={[
                        styles.detailStatusText,
                        selectedAnchor.isUnlocked
                          ? styles.detailStatusTextUnlocked
                          : styles.detailStatusTextLocked,
                      ]}
                    >
                      {selectedAnchor.lockLabel}
                    </Text>
                  </View>
                  <View style={styles.detailTagRow}>
                    {(selectedAnchor.tags ?? []).map((tag) => (
                      <View key={tag} style={styles.detailTagPill}>
                        <Text style={styles.detailTagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              }
              contentContainerStyle={styles.detailListContent}
              showsVerticalScrollIndicator={false}
              onScroll={(event) => {
                listScrollOffset.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
            />
          </View>
        ) : isExpanded ? (
          <View style={styles.listContainer}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Nearby Anchors</Text>
              <View style={styles.listHeaderActions}>
                <TouchableOpacity onPress={() => void loadNearby()}>
                  <Feather name="refresh-cw" size={16} color={colors.muted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={collapseSheet}>
                  <Feather name="chevron-down" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>

            {isLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.accentPink} />
                <Text style={styles.centerStateText}>Finding anchors near you...</Text>
              </View>
            ) : errorMessage ? (
              <View style={styles.centerState}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : (
              <FlatList
                data={filteredAnchors}
                keyExtractor={(item) => item.anchor_id}
                renderItem={({ item }) => (
                  <AnchorRowCard
                    anchor={item}
                    onPress={() => openAnchorDetails(item.anchor_id)}
                  />
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onScroll={(event) => {
                  listScrollOffset.current = event.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                ListEmptyComponent={
                  <Text style={styles.emptyStateText}>No anchors found nearby.</Text>
                }
              />
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.collapsedPeek}
            onPress={() => animateSheet(true)}
            activeOpacity={0.9}
          >
            <Text style={styles.collapsedTitle}>Nearby Anchors</Text>
            <Text style={styles.collapsedSubtitle}>
              {isLoading
                ? "Loading nearby anchors..."
                : `${filteredAnchors.length} anchors in range`}
            </Text>
            <Feather name="chevrons-up" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  map: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBar: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  addButtonWrap: {
    position: "absolute",
    right: 18,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentPink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.blue,
    borderWidth: 2,
    borderColor: colors.white,
  },
  mapMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.white,
  },
  mapMarkerUnlocked: {
    backgroundColor: colors.success,
  },
  mapMarkerLocked: {
    backgroundColor: colors.accentPink,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handleTouchArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 10,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d5d9de",
  },
  collapsedPeek: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  collapsedTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  collapsedSubtitle: {
    fontSize: 13,
    color: colors.muted,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  listHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  anchorCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  anchorRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  anchorTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  tagPill: {
    backgroundColor: "#FEE8ED",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagPillText: {
    color: colors.accentPink,
    fontSize: 11,
    fontWeight: "700",
  },
  anchorRowMiddle: {
    flexDirection: "row",
    gap: 8,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f4f5f7",
  },
  infoChipSuccess: {
    backgroundColor: "#E7F8EF",
  },
  infoChipLocked: {
    backgroundColor: "#FEE8ED",
  },
  infoChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  infoChipTextSuccess: {
    color: colors.success,
  },
  infoChipTextLocked: {
    color: colors.accentPink,
  },
  anchorMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  centerStateText: {
    color: colors.muted,
    fontSize: 13,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  emptyStateText: {
    textAlign: "center",
    marginTop: 24,
    color: colors.muted,
    fontSize: 13,
  },
  detailContainer: {
    flex: 1,
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  detailHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  backButton: {
    width: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailHeaderClose: {
    width: 60,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  backButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  detailListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  detailTopSection: {
    gap: 10,
    paddingBottom: 4,
  },
  detailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailStatusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  detailStatusTextUnlocked: {
    color: colors.success,
  },
  detailStatusTextLocked: {
    color: colors.accentPink,
  },
  detailTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailTagPill: {
    backgroundColor: "#FEE8ED",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  detailTagText: {
    color: colors.accentPink,
    fontSize: 11,
    fontWeight: "700",
  },
  detailItem: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
  },
});
