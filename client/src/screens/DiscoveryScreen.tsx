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
  ScrollView,
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
import { getProfile } from "../services/authService";

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

const [isGhostMode, setIsGhostMode] = useState(false);

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
Mapbox.setAccessToken(MAPBOX_TOKEN ?? "");

const RADIUS_FACTS: [number, number, string[]][] = [
  [10, 15, ["~1 T-Rex lying down 🦕", "~5 Shaqs 🏀"]],
  [16, 25, ["a bowling lane 🎳", "~4 giraffes laid sideways 🦒", "a tennis court 🎾"]],
  [26, 40, ["one blue whale 🐋", "how far a snail can travel in a day 🐌"]],
  [41, 60, ["~10 sedans 🚗", "1 Olympic pools 🏊", "a very ambitious snowball throw ❄️"]],
  [61, 80, ["average frisbee throws 🥏"]],
  [81, 100, ["the Statue of Liberty tipped over 🗽", "one really committed javelin throw 🥇", "the best paper airplane throw ✈️"]]
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
  isSelected,
  onPress,
}: {
  anchor: AnchorWithDerivedFields;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.anchorCard, isSelected && styles.anchorCardSelected]}
      onPress={onPress}
    >
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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [draftSelectedTags, setDraftSelectedTags] = useState<string[]>([]);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const [anchorLocation, setAnchorLocation] = useState<Coordinate | null>(null);
  const [editingAnchor, setEditingAnchor] = useState<AnchorWithDerivedFields | null>(null);
  const [radius, setRadius] = useState(50);


  const collapsedHeight = 116;
  const expandedHeight = Math.min(windowHeight * 0.72, windowHeight - 128);
  const collapseOffset = Math.max(expandedHeight - collapsedHeight, 0);

  const sheetTranslateY = useRef(new Animated.Value(collapseOffset)).current;
  const currentTranslateY = useRef(collapseOffset);
  const panStartOffset = useRef(collapseOffset);
  const listScrollOffset = useRef(0);
  // NEW: ref to programmatically control the map camera
  const cameraRef = useRef<Mapbox.Camera>(null);

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
    if (isGhostMode) return;

    const center = userCoordinate ?? FALLBACK_CENTER;

    setIsLoading(true);
    setErrorMessage(null);

    try {

      const response = await getNearbyAnchors(
        {
          lat: center[1],
          lon: center[0],
          radiusKm: 1000,
          sortBy: "distance",
        },
        token,
      );
      const currentTime = Date.now();
      const mapped = response
        .filter((anchor) => {
          if (!anchor.expiration_time) return true;
          return new Date(anchor.expiration_time).getTime() > currentTime;
        })
        .map<AnchorWithDerivedFields>((anchor) => {
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
  }, [session?.access_token, userCoordinate]);

  useEffect(() => {
    void loadAnchors();
  }, [loadAnchors]);

  useEffect(() => {
    const loadGhostMode = async () => {
      if (!session?.access_token) return;
      try {
        const profile = await getProfile(session.access_token);
        setIsGhostMode(profile.is_ghost_mode ?? false);
      } catch {
      }
    };
    void loadGhostMode();
  }, [session?.access_token]);

  useEffect(() => {
    if (isGhostMode) return;

    let subscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // Permission denied — map will fall back to FALLBACK_CENTER
        return;
      }
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10, // update every 10 meters of movement
        },
        (location) => {
          setUserCoordinate([location.coords.longitude, location.coords.latitude]);
        },
      );
    };

    void startWatching();

    return () => {
      subscription?.remove();
    };
  }, [isGhostMode]);

  const topNearbyTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const anchor of anchors) {
      for (const rawTag of anchor.tags ?? []) {
        const normalized = rawTag.trim().toLowerCase();
        if (!normalized) continue;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }, [anchors]);

  const hasActiveTagFilter = selectedTags.length > 0;

  const openTagFilter = useCallback(() => {
    setDraftSelectedTags(selectedTags);
    setIsTagFilterOpen(true);
  }, [selectedTags]);

  const closeTagFilter = useCallback(() => {
    setDraftSelectedTags(selectedTags);
    setIsTagFilterOpen(false);
  }, [selectedTags]);

  const toggleDraftTag = useCallback((tag: string) => {
    setDraftSelectedTags((previous) =>
      previous.includes(tag)
        ? previous.filter((item) => item !== tag)
        : [...previous, tag],
    );
  }, []);

  const applyTagFilter = useCallback(() => {
    setSelectedTags(draftSelectedTags);
    setIsTagFilterOpen(false);
  }, [draftSelectedTags]);

  const clearTagFilter = useCallback(() => {
    setSelectedTags([]);
    setDraftSelectedTags([]);
    setIsTagFilterOpen(false);
  }, []);

  const filteredAnchors = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return anchors.filter((anchor) => {
      const anchorTags = (anchor.tags ?? []).map((tag) => tag.toLowerCase());
      const joinedTags = anchorTags.join(" ");

      const matchesSearch =
        !normalizedQuery ||
        anchor.title.toLowerCase().includes(normalizedQuery) ||
        anchor.visibilityLabel.toLowerCase().includes(normalizedQuery) ||
        joinedTags.includes(normalizedQuery);

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((selectedTag) => anchorTags.includes(selectedTag));

      return matchesSearch && matchesTags;
    });
  }, [anchors, searchQuery, selectedTags]);

  const selectedAnchor = useMemo(
    () => anchors.find((anchor) => anchor.anchor_id === selectedAnchorId) ?? null,
    [anchors, selectedAnchorId],
  );

  // NEW: pan map to anchor and highlight it when a row is tapped
  const openAnchorDetails = useCallback(
    (anchorId: string) => {
      listScrollOffset.current = 0;
      setSelectedAnchorId(anchorId);
      animateSheet(true);

      const anchor = anchors.find((a) => a.anchor_id === anchorId);
      if (anchor && cameraRef.current) {
        cameraRef.current.setCamera({
          centerCoordinate: [anchor.longitude, anchor.latitude],
          zoomLevel: 16,
          animationDuration: 500,
        });
      }
    },
    [animateSheet, anchors],
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
    setEditingAnchor(null);
    animateSheet(false);
  };

  const radiusShape = useMemo(() => {
    if (anchorLocation) {
      return circle(anchorLocation, radius, { steps: 64, units: 'meters' });
    }
    if (editingAnchor) {
      return circle([editingAnchor.longitude, editingAnchor.latitude], radius, { steps: 64, units: 'meters' });
    }
    return undefined;
  }, [anchorLocation, editingAnchor, radius]);

  const handleAnchorPress = (anchor: typeof anchors[0]) => {
    if (anchor.creator_id !== session?.user_id) return;
    Alert.alert("Your Anchor", undefined, [
      {
        text: "Edit Anchor",
        onPress: () => {
          setEditingAnchor(anchor);
          setRadius(anchor.unlock_radius);
          animateSheet(true);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };


  const profileInitial = (session?.username ?? "U").charAt(0).toUpperCase();

  return (
    <View style={styles.screen}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Light}>
        {/* NEW: ref added to allow programmatic camera control */}
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={userCoordinate ?? FALLBACK_CENTER}
          animationDuration={1000}
        />

        {!anchorLocation && filteredAnchors.map((anchor) => {
          // NEW: check if this marker is the selected one
          const isSelected = selectedAnchorId === anchor.anchor_id || editingAnchor?.anchor_id === anchor.anchor_id;
          return (
            <Mapbox.MarkerView
              key={anchor.anchor_id}
              id={`marker-${anchor.anchor_id}`}
              coordinate={[anchor.longitude, anchor.latitude]}
            >
              <TouchableOpacity
                onPress={() => handleAnchorPress(anchor)}
                style={[
                  styles.mapMarker,
                  // NEW: apply highlight style when selected
                  isSelected && styles.mapMarkerSelected,
                ]}
              >
                <View style={[
                  styles.markerWrapper,
                  // NEW: grow the wrapper when selected
                  isSelected && styles.markerWrapperSelected,
                ]}>
                  <Image
                    source={anchor.isUnlocked ? require('../../assets/unlocked.png') : require('../../assets/locked_p2.png')}
                    style={styles.markerImage}
                  />
                  {/* TODO: ONCE LOGIC FOR OWN ANCHOR IS DONE, UNCOMMENT BOTTOM THING */}
                  {/*{anchor.isOwn && <View style={styles.ownerBadge} />}*/}
                </View>
              </TouchableOpacity>
            </Mapbox.MarkerView>
          );
        })}

        {(anchorLocation || editingAnchor) && radiusShape && (
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
        )}
        {anchorLocation && (
          <Mapbox.MarkerView id="anchor-pin" coordinate={anchorLocation}>
            <View style={styles.mapMarkerDropped}>
              <Image source={require('../../assets/unlocked.png')} style={{ width: 40, height: 40 }} />
            </View>
          </Mapbox.MarkerView>
        )}
      </Mapbox.MapView>

      {
        !anchorLocation && !editingAnchor && (
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
                testID="open-profile-button"
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
            height: anchorLocation || editingAnchor ? 320 : expandedHeight,
            paddingBottom: Math.max(insets.bottom, 16),
            transform: [{ translateY: anchorLocation || editingAnchor ? 0 : sheetTranslateY }],
          },
        ]}
      >
        {!anchorLocation && !editingAnchor && (
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
        ) : editingAnchor ? (
          <View style={styles.detailContainer}>
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

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={cancelDropAnchor}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => {
                  const anchor = editingAnchor;
                  setEditingAnchor(null);
                  navigation.navigate('EditAnchor', { anchor, radius });
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

            <View style={styles.listFilterRow}>
              <View
                style={[
                  styles.filterPillWrap,
                  hasActiveTagFilter && styles.filterPillWrapActive,
                ]}
              >
                <TouchableOpacity
                  style={styles.filterPillMain}
                  onPress={() => {
                    if (isTagFilterOpen) {
                      closeTagFilter();
                      return;
                    }
                    openTagFilter();
                  }}
                  activeOpacity={0.85}
                >
                  <Feather
                    name="tag"
                    size={13}
                    color={hasActiveTagFilter ? colors.accentPink : colors.muted}
                  />
                  <Text
                    style={[
                      styles.filterPillText,
                      hasActiveTagFilter && styles.filterPillTextActive,
                    ]}
                  >
                    Tags{hasActiveTagFilter ? ` (${selectedTags.length})` : ""}
                  </Text>
                  <Feather
                    name={isTagFilterOpen ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={hasActiveTagFilter ? colors.accentPink : colors.muted}
                  />
                </TouchableOpacity>

                {hasActiveTagFilter ? (
                  <TouchableOpacity
                    style={styles.filterPillClear}
                    onPress={clearTagFilter}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={13} color={colors.accentPink} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {isTagFilterOpen ? (
              <View style={styles.tagDropdown}>
                <View style={styles.tagDropdownHeader}>
                  <Text style={styles.tagDropdownTitle}>Filter by tags</Text>
                  <Text style={styles.tagDropdownMeta}>
                    {draftSelectedTags.length} selected
                  </Text>
                </View>

                {topNearbyTags.length === 0 ? (
                  <Text style={styles.tagDropdownEmpty}>
                    No nearby tags to filter yet.
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.tagDropdownList}
                    contentContainerStyle={styles.tagDropdownListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {topNearbyTags.map(({ tag, count }) => {
                      const isChecked = draftSelectedTags.includes(tag);
                      return (
                        <Pressable
                          key={tag}
                          style={[
                            styles.tagOptionRow,
                            isChecked && styles.tagOptionRowChecked,
                          ]}
                          onPress={() => toggleDraftTag(tag)}
                        >
                          <Feather
                            name={isChecked ? "check-square" : "square"}
                            size={16}
                            color={isChecked ? colors.accentPink : colors.muted}
                          />
                          <Text
                            style={[
                              styles.tagOptionText,
                              isChecked && styles.tagOptionTextChecked,
                            ]}
                          >
                            #{tag}
                          </Text>
                          <Text style={styles.tagOptionCount}>{count}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={styles.tagDropdownActions}>
                  <TouchableOpacity
                    style={styles.tagDropdownSecondaryButton}
                    onPress={closeTagFilter}
                  >
                    <Text style={styles.tagDropdownSecondaryButtonText}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tagDropdownPrimaryButton}
                    onPress={applyTagFilter}
                  >
                    <Text style={styles.tagDropdownPrimaryButtonText}>
                      Confirm
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

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
                  // NEW: pass isSelected and updated onPress to highlight row
                  <AnchorRowCard
                    anchor={item}
                    isSelected={selectedAnchorId === item.anchor_id}
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
                  <Text style={styles.emptyStateText}>
                    {hasActiveTagFilter
                      ? "No anchors match your selected tags."
                      : "No anchors found."}
                  </Text>
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
  listFilterRow: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  filterPillWrap: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  filterPillWrapActive: {
    borderColor: "#f7a2b4",
    backgroundColor: "#FEE8ED",
  },
  filterPillMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPillText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  filterPillTextActive: {
    color: colors.accentPink,
  },
  filterPillClear: {
    borderLeftWidth: 1,
    borderLeftColor: "#f7a2b4",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FDE3EA",
  },
  tagDropdown: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 12,
    gap: 10,
  },
  tagDropdownHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagDropdownTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  tagDropdownMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  tagDropdownEmpty: {
    color: colors.muted,
    fontSize: 13,
  },
  tagDropdownList: {
    maxHeight: 220,
  },
  tagDropdownListContent: {
    gap: 8,
  },
  tagOptionRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fffdfa",
  },
  tagOptionRowChecked: {
    borderColor: "#f7a2b4",
    backgroundColor: "#fff1f4",
  },
  tagOptionText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  tagOptionTextChecked: {
    color: colors.accentPink,
  },
  tagOptionCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  tagDropdownActions: {
    flexDirection: "row",
    gap: 10,
  },
  tagDropdownSecondaryButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffdfa",
  },
  tagDropdownSecondaryButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  tagDropdownPrimaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentPink,
  },
  tagDropdownPrimaryButtonText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 13,
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
  // NEW: highlighted card style when selected
  anchorCardSelected: {
    borderColor: colors.accentPink,
    backgroundColor: colors.selectedCanvas,
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
  // NEW: larger wrapper for selected marker
  markerWrapperSelected: { width: 38, height: 38 },
  // NEW: pink ring + shadow for selected marker
  mapMarkerSelected: {
    borderColor: colors.accentPink,
    borderWidth: 3,
    borderRadius: 20,
    shadowColor: colors.accentPink,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
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
