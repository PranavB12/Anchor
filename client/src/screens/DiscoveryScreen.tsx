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
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import {
  getNearbyAnchors,
  type NearbyAnchor,
} from "../services/anchorService";
import circle from "@turf/circle";
import Slider from "@react-native-community/slider";

type Coordinate = [number, number];

type AnchorWithDerivedFields = NearbyAnchor & {
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

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatVisibility(value: NearbyAnchor["visibility"]) {
  if (value === "CIRCLE_ONLY") return "Circle";
  if (value === "PRIVATE") return "Private";
  return "Public";
}

function getLockMeta(anchor: NearbyAnchor) {
  if (anchor.status !== "ACTIVE") {
    return {
      isUnlocked: false,
      label: anchor.status,
    };
  }

  return {
    isUnlocked: true,
    label: "Unlocked",
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
          <Feather
            name="map-pin"
            size={13}
            color={colors.muted}
          />
          <Text style={styles.infoChipText}>{"- km"}</Text>
        </View>
        <View
          style={[
            styles.infoChip,
            anchor.isUnlocked ? styles.infoChipSuccess : styles.infoChipLocked,
          ]}
        >
          <Feather
            name={anchor.isUnlocked ? "unlock" : "lock"}
            color={anchor.isUnlocked ? colors.success : colors.muted}
            size={13}
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

  const [anchorLocation, setAnchorLocation] = useState<Coordinate | null>(null);
  const [radius, setRadius] = useState(50);


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

  const loadAnchors = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {

      const response = await getNearbyAnchors(
        {
          lat: FALLBACK_CENTER[1],
          lon: FALLBACK_CENTER[0],
          radiusKm: 1000,
          sortBy: "distance",
        },
        token,
      );
      const mapped = response.map<AnchorWithDerivedFields>((anchor) => {
        const lockMeta = getLockMeta(anchor);
        return {
          ...anchor,
          isUnlocked: lockMeta.isUnlocked,
          lockLabel: lockMeta.label,
          visibilityLabel: formatVisibility(anchor.visibility),
          primaryTag: anchor.tags?.[0] ?? null,
        };
      });

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
    void loadAnchors();
  }, [loadAnchors]);

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
    setUserCoordinate([location.coords.longitude, location.coords.latitude]);

    animateSheet(true);
  };

  const cancelDropAnchor = () => {
    setAnchorLocation(null);
    animateSheet(false);
  };

  const radiusShape = useMemo(() => {
    if (!anchorLocation) return undefined;
    return circle(anchorLocation, radius, { steps: 64, units: 'meters' });
  }, [anchorLocation, radius]);

  const handleAnchorPress = (anchor: typeof anchors[0]) => {
    // TODO: CHECK IF THIS IS YOUR ANCHOR OR NOT.
    Alert.alert("Your Anchor", undefined, [
      {
        text: "Edit Anchor",
        onPress: () => navigation.navigate("EditAnchor", { anchorId: anchor.anchor_id }),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };


  const profileInitial = (session?.username ?? "U").charAt(0).toUpperCase();

  return (
    <View style={styles.screen}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Light}>
        <Mapbox.Camera
          zoomLevel={14}
          centerCoordinate={userCoordinate ?? FALLBACK_CENTER}
          animationDuration={1000}
        />

        {!anchorLocation && filteredAnchors.map((anchor) => (
          <Mapbox.MarkerView
            key={anchor.anchor_id}
            id={`marker-${anchor.anchor_id}`}
            coordinate={[anchor.longitude, anchor.latitude]}
          >
            <TouchableOpacity
              onPress={() => handleAnchorPress(anchor)}
              style={styles.mapMarker}
            >
              <View style={styles.markerWrapper}>
                <Image
                  source={anchor.isUnlocked ? require('../../assets/unlocked.png') : require('../../assets/locked_p2.png')}
                  style={styles.markerImage}
                />
                {/* TODO: ONCE LOGIC FOR OWN ANCHOR IS DONE, UNCOMMENT BOTTOM THING */}
                {/*{anchor.isOwn && <View style={styles.ownerBadge} />}*/}
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
              <View style={styles.mapMarkerDropped}>
                <Image source={require('../../assets/unlocked.png')} style={{ width: 40, height: 40 }} />
              </View>
            </Mapbox.MarkerView>
          </>
        )}
      </Mapbox.MapView>

      {
        !anchorLocation && (
          <>
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
                onPress={() => navigation.navigate("EditProfile")}
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
                onPress={handleDropAnchor}
              >
                <Feather name="plus" size={20} color={colors.white} />
              </TouchableOpacity>
            </Animated.View>
          </>
        )
      }

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bottomSheet,
          {
            height: anchorLocation ? 320 : expandedHeight,
            paddingBottom: Math.max(insets.bottom, 16),
            transform: [{ translateY: anchorLocation ? 0 : sheetTranslateY }],
          },
        ]}
      >
        {!anchorLocation && (
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
        )}

        {anchorLocation ? (
          <View style={styles.detailContainer}>
            <View style={styles.radiusHeader}>
              <Text style={styles.radiusTitle}>Detection Radius</Text>
              <Text style={styles.radiusValue}>{radius}m</Text>
            </View>

            <Text style={styles.radiusFact}>≈ {getRadiusFact(radius)}</Text>

            <Slider
              style={styles.slider}
              minimumValue={10}
              maximumValue={200}
              step={1}
              value={radius}
              onValueChange={setRadius}
              minimumTrackTintColor={colors.accentPink}
              maximumTrackTintColor={colors.lightMuted}
              thumbTintColor={colors.accentPink}
            />

            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>10m</Text>
              <Text style={styles.sliderLabelText}>200m</Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelDropAnchor}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => {
                  setAnchorLocation(null);
                  navigation.navigate('AnchorCreation', {
                    latitude: anchorLocation[1],
                    longitude: anchorLocation[0],
                    radius
                  });
                }}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : selectedAnchor ? (
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
                  value: "- km",
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
                    <Image
                      source={selectedAnchor.isUnlocked ? require('../../assets/unlocked.png') : require('../../assets/locked_p2.png')}
                      style={{ width: 16, height: 16 }}
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
                <TouchableOpacity onPress={() => void loadAnchors()}>
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
                <Text style={styles.centerStateText}>Loading anchors...</Text>
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
                  <Text style={styles.emptyStateText}>No anchors found.</Text>
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
            <Text style={styles.collapsedTitle}>Anchors</Text>
            <Text style={styles.collapsedSubtitle}>
              {isLoading
                ? "Loading anchors..."
                : `${filteredAnchors.length} anchors found`}
            </Text>
            <Feather name="chevrons-up" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </Animated.View>
    </View >
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
  mapMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.white,
    backgroundColor: colors.accentPink,
  },
  mapMarkerLocked: {
    backgroundColor: colors.accentPink,
  },
  mapMarkerDropped: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: colors.canvas,
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
    paddingHorizontal: 24,
    paddingTop: 24,
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  nextButton: {
    flex: 1,
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
  markerWrapper: { width: 30, height: 30 },
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
  markerImage: {
    width: '100%',
    height: '100%',
  },
});