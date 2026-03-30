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

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import {
  getNearbyAnchorFilterOptions,
  getNearbyAnchors,
  reportAnchor,
  unlockAnchor,
  getAnchorAttachments,
  uploadAnchorAttachment,
  type AnchorContentType,
  type AnchorFilterOption,
  type AnchorStatus,
  type AnchorVisibility,
  type NearbyAnchorFilterOptions,
  type NearbyAnchor,
  type ReportReason,
  type AnchorAttachment,
} from "../services/anchorService";
import ReportAnchorModal from "../components/ReportAnchorModal";
import { getDistanceFromLatLonInM } from "../utils/distance";
import circle from "@turf/circle";
import Slider from "@react-native-community/slider";
import { getProfile } from "../services/authService";

type Coordinate = [number, number];

type AnchorWithDerivedFields = NearbyAnchor & {
  isUnlocked: boolean;
  lockLabel: string;
  visibilityLabel: string;
  primaryTag: string | null;
  distanceMeters: number | null;
  isWithinRadius: boolean;
};

type DiscoveryFilterMenu = "tags" | "visibility" | "status" | "contentType";

type FilterConfig = {
  menu: DiscoveryFilterMenu;
  label: string;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  selectedValues: string[];
  draftValues: string[];
  options: AnchorFilterOption[];
  renderValue: (value: string) => string;
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

function toggleSelection<T extends string>(previous: T[], value: T) {
  return previous.includes(value)
    ? previous.filter((item) => item !== value)
    : [...previous, value];
}

function formatVisibility(value: NearbyAnchor["visibility"]) {
  if (value === "CIRCLE_ONLY") return "Circle";
  if (value === "PRIVATE") return "Private";
  return "Public";
}

function formatStatus(value: AnchorStatus) {
  if (value === "ACTIVE") return "Active";
  if (value === "EXPIRED") return "Expired";
  if (value === "LOCKED") return "Locked";
  return "Flagged";
}

function formatContentType(value: AnchorContentType) {
  if (value === "TEXT") return "Text";
  if (value === "FILE") return "File";
  return "Link";
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "- km";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function getLockMeta(anchor: NearbyAnchor) {
  if (anchor.status !== "ACTIVE") {
    return {
      isUnlocked: false,
      label: anchor.status,
    };
  }

  if (!anchor.is_unlocked) {
    return {
      isUnlocked: false,
      label: "Locked",
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
      style={[
        styles.anchorCard,
        isSelected && styles.anchorCardSelected,
        !anchor.isWithinRadius && styles.anchorCardOutOfRange,
      ]}
      onPress={onPress}
    >
      <View style={styles.anchorRowTop}>
        <Text style={styles.anchorTitle} numberOfLines={1}>
          {anchor.title}
        </Text>
        {!anchor.isWithinRadius ? (
          <View style={styles.outOfRangePill}>
            <Feather name="navigation" size={10} color={colors.lightMuted} />
            <Text style={styles.outOfRangePillText}>Out of range</Text>
          </View>
        ) : anchor.primaryTag ? (
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
  const [selectedVisibility, setSelectedVisibility] = useState<AnchorVisibility[]>([]);
  const [draftSelectedVisibility, setDraftSelectedVisibility] = useState<AnchorVisibility[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<AnchorStatus[]>([]);
  const [draftSelectedStatuses, setDraftSelectedStatuses] = useState<AnchorStatus[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<AnchorContentType[]>([]);
  const [draftSelectedContentTypes, setDraftSelectedContentTypes] = useState<AnchorContentType[]>([]);
  const [openFilterMenu, setOpenFilterMenu] = useState<DiscoveryFilterMenu | null>(null);
  const [filterOptions, setFilterOptions] = useState<NearbyAnchorFilterOptions>({
    visibility: [],
    anchor_status: [],
    content_type: [],
    tags: [],
  });
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const [anchorLocation, setAnchorLocation] = useState<Coordinate | null>(null);
  const [editingAnchor, setEditingAnchor] = useState<AnchorWithDerivedFields | null>(null);
  const [radius, setRadius] = useState(50);

  const [isGhostMode, setIsGhostMode] = useState(false);



  const collapsedHeight = 116;
  const expandedHeight = Math.min(windowHeight * 0.72, windowHeight - 128);
  const collapseOffset = Math.max(expandedHeight - collapsedHeight, 0);

  const sheetTranslateY = useRef(new Animated.Value(collapseOffset)).current;
  const currentTranslateY = useRef(collapseOffset);
  const panStartOffset = useRef(collapseOffset);
  const listScrollOffset = useRef(0);
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

  // The broken useEffect was removed from here.
  const collapseSheet = useCallback(() => {
    Keyboard.dismiss();
    listScrollOffset.current = 0;
    setSelectedAnchorId(null);
    animateSheet(false);
  }, [animateSheet]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) => {
          if (Math.abs(gesture.dy) < 5) return false;
          if (!isExpanded) return true;
          if (gesture.dy > 0) return listScrollOffset.current <= 0;
          return currentTranslateY.current > 0;
        },
        onMoveShouldSetPanResponderCapture: (_event, gesture) => {
          if (Math.abs(gesture.dy) < 5) return false;
          if (!isExpanded) return true;
          if (gesture.dy > 0) return listScrollOffset.current <= 0;
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
          if (!shouldExpand && selectedAnchorId) {
            collapseSheet();
          } else {
            animateSheet(shouldExpand);
          }
        },
      }),
    [animateSheet, collapseOffset, isExpanded, sheetTranslateY, selectedAnchorId, collapseSheet],
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
          visibility: selectedVisibility.length > 0 ? selectedVisibility : undefined,
          anchorStatus: selectedStatuses.length > 0 ? selectedStatuses : undefined,
          contentType: selectedContentTypes.length > 0 ? selectedContentTypes : undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
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
          const distanceMeters = userCoordinate
            ? getDistanceFromLatLonInM(
                userCoordinate[1], userCoordinate[0],
                anchor.latitude, anchor.longitude,
              )
            : null;
          return {
            ...anchor,
            isUnlocked: lockMeta.isUnlocked,
            lockLabel: lockMeta.label,
            visibilityLabel: formatVisibility(anchor.visibility),
            primaryTag: anchor.tags?.[0] ?? null,
            distanceMeters,
            isWithinRadius: distanceMeters !== null && distanceMeters <= anchor.unlock_radius,
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
  }, [
    isGhostMode,
    selectedContentTypes,
    selectedStatuses,
    selectedTags,
    selectedVisibility,
    session?.access_token,
    userCoordinate,
  ]);

  const loadFilterOptions = useCallback(async () => {
    const token = session?.access_token;
    if (!token) return;
    if (isGhostMode) return;

    const center = userCoordinate ?? FALLBACK_CENTER;

    try {
      const response = await getNearbyAnchorFilterOptions(
        {
          lat: center[1],
          lon: center[0],
          radiusKm: 1000,
        },
        token,
      );
      setFilterOptions(response);
    } catch {
      setFilterOptions({
        visibility: [],
        anchor_status: [],
        content_type: [],
        tags: [],
      });
    }
  }, [isGhostMode, session?.access_token, userCoordinate]);

  const refreshDiscovery = useCallback(() => {
    void loadFilterOptions();
    void loadAnchors();
  }, [loadAnchors, loadFilterOptions]);

  useEffect(() => {
    void loadAnchors();
  }, [loadAnchors]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

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
        return;
      }
      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
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

  // Recompute distance/isWithinRadius instantly when location updates,
  // without waiting for a full API re-fetch.
  useEffect(() => {
    if (!userCoordinate) return;
    setAnchors((prev) =>
      prev.map((anchor) => {
        const distanceMeters = getDistanceFromLatLonInM(
          userCoordinate[1],
          userCoordinate[0],
          anchor.latitude,
          anchor.longitude,
        );
        return {
          ...anchor,
          distanceMeters,
          isWithinRadius: distanceMeters <= anchor.unlock_radius,
        };
      }),
    );
  }, [userCoordinate]);

  const topNearbyTags = filterOptions.tags;

  const hasActiveTagFilter = selectedTags.length > 0;
  const hasActiveVisibilityFilter = selectedVisibility.length > 0;
  const hasActiveStatusFilter = selectedStatuses.length > 0;
  const hasActiveContentTypeFilter = selectedContentTypes.length > 0;
  const hasAnyServerFilter =
    hasActiveTagFilter ||
    hasActiveVisibilityFilter ||
    hasActiveStatusFilter ||
    hasActiveContentTypeFilter;

  const openFilter = useCallback(
    (menu: DiscoveryFilterMenu) => {
      if (openFilterMenu === menu) {
        setOpenFilterMenu(null);
        return;
      }

      if (menu === "tags") {
        setDraftSelectedTags(selectedTags);
      } else if (menu === "visibility") {
        setDraftSelectedVisibility(selectedVisibility);
      } else if (menu === "status") {
        setDraftSelectedStatuses(selectedStatuses);
      } else {
        setDraftSelectedContentTypes(selectedContentTypes);
      }

      setOpenFilterMenu(menu);
    },
    [
      openFilterMenu,
      selectedContentTypes,
      selectedStatuses,
      selectedTags,
      selectedVisibility,
    ],
  );

  const closeFilterMenu = useCallback(() => {
    if (openFilterMenu === "tags") {
      setDraftSelectedTags(selectedTags);
    } else if (openFilterMenu === "visibility") {
      setDraftSelectedVisibility(selectedVisibility);
    } else if (openFilterMenu === "status") {
      setDraftSelectedStatuses(selectedStatuses);
    } else if (openFilterMenu === "contentType") {
      setDraftSelectedContentTypes(selectedContentTypes);
    }

    setOpenFilterMenu(null);
  }, [
    openFilterMenu,
    selectedContentTypes,
    selectedStatuses,
    selectedTags,
    selectedVisibility,
  ]);

  const toggleDraftFilterValue = useCallback(
    (menu: DiscoveryFilterMenu, value: string) => {
      if (menu === "tags") {
        setDraftSelectedTags((previous) => toggleSelection(previous, value));
      } else if (menu === "visibility") {
        setDraftSelectedVisibility((previous) =>
          toggleSelection(previous, value as AnchorVisibility),
        );
      } else if (menu === "status") {
        setDraftSelectedStatuses((previous) =>
          toggleSelection(previous, value as AnchorStatus),
        );
      } else {
        setDraftSelectedContentTypes((previous) =>
          toggleSelection(previous, value as AnchorContentType),
        );
      }
    },
    [],
  );

  const applyOpenFilterMenu = useCallback(() => {
    if (openFilterMenu === "tags") {
      setSelectedTags(draftSelectedTags);
    } else if (openFilterMenu === "visibility") {
      setSelectedVisibility(draftSelectedVisibility);
    } else if (openFilterMenu === "status") {
      setSelectedStatuses(draftSelectedStatuses);
    } else if (openFilterMenu === "contentType") {
      setSelectedContentTypes(draftSelectedContentTypes);
    }

    setOpenFilterMenu(null);
  }, [
    draftSelectedContentTypes,
    draftSelectedStatuses,
    draftSelectedTags,
    draftSelectedVisibility,
    openFilterMenu,
  ]);

  const clearFilter = useCallback(
    (menu: DiscoveryFilterMenu) => {
      if (menu === "tags") {
        setSelectedTags([]);
        setDraftSelectedTags([]);
      } else if (menu === "visibility") {
        setSelectedVisibility([]);
        setDraftSelectedVisibility([]);
      } else if (menu === "status") {
        setSelectedStatuses([]);
        setDraftSelectedStatuses([]);
      } else {
        setSelectedContentTypes([]);
        setDraftSelectedContentTypes([]);
      }

      if (openFilterMenu === menu) {
        setOpenFilterMenu(null);
      }
    },
    [openFilterMenu],
  );

  const visibleAnchors = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return anchors.filter((anchor) => {
      const anchorTags = (anchor.tags ?? []).map((tag) => tag.toLowerCase());
      const joinedTags = anchorTags.join(" ");
      const joinedContentTypes = (anchor.content_type ?? [])
        .map((item) => formatContentType(item).toLowerCase())
        .join(" ");

      const matchesSearch =
        !normalizedQuery ||
        anchor.title.toLowerCase().includes(normalizedQuery) ||
        anchor.visibilityLabel.toLowerCase().includes(normalizedQuery) ||
        anchor.lockLabel.toLowerCase().includes(normalizedQuery) ||
        joinedContentTypes.includes(normalizedQuery) ||
        joinedTags.includes(normalizedQuery);
      return matchesSearch;
    });
  }, [anchors, searchQuery]);

  useEffect(() => {
    if (!selectedAnchorId) return;
    if (anchors.some((anchor) => anchor.anchor_id === selectedAnchorId)) return;
    setSelectedAnchorId(null);
  }, [anchors, selectedAnchorId]);

  const filterConfigs: FilterConfig[] = [
    {
      menu: "tags" as const,
      label: "Tags",
      title: "Filter by tags",
      icon: "tag" as const,
      selectedValues: selectedTags,
      draftValues: draftSelectedTags,
      options: topNearbyTags,
      renderValue: (value: string) => `#${value}`,
    },
    {
      menu: "visibility" as const,
      label: "Visibility",
      title: "Filter by visibility",
      icon: "eye" as const,
      selectedValues: selectedVisibility,
      draftValues: draftSelectedVisibility,
      options: filterOptions.visibility,
      renderValue: (value: string) => formatVisibility(value as AnchorVisibility),
    },
    {
      menu: "status" as const,
      label: "Status",
      title: "Filter by status",
      icon: "sliders" as const,
      selectedValues: selectedStatuses,
      draftValues: draftSelectedStatuses,
      options: filterOptions.anchor_status,
      renderValue: (value: string) => formatStatus(value as AnchorStatus),
    },
    {
      menu: "contentType" as const,
      label: "Content",
      title: "Filter by content type",
      icon: "paperclip" as const,
      selectedValues: selectedContentTypes,
      draftValues: draftSelectedContentTypes,
      options: filterOptions.content_type,
      renderValue: (value: string) => formatContentType(value as AnchorContentType),
    },
  ];

  const activeFilterConfig =
    filterConfigs.find((config) => config.menu === openFilterMenu) ?? null;

  const selectedAnchor = useMemo(
    () => anchors.find((anchor) => anchor.anchor_id === selectedAnchorId) ?? null,
    [anchors, selectedAnchorId],
  );

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
    openAnchorDetails(anchor.anchor_id);
  };


  const profileInitial = (session?.username ?? "U").charAt(0).toUpperCase();

  return (
    <View style={styles.screen}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Light}>
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={userCoordinate ?? FALLBACK_CENTER}
          animationDuration={1000}
        />

        {!anchorLocation && visibleAnchors.map((anchor) => {
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
                  isSelected && styles.mapMarkerSelected,
                  !anchor.isWithinRadius && styles.mapMarkerOutOfRange,
                ]}
              >
                <View style={[
                  styles.markerWrapper,
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

            {isGhostMode && (
              <View style={[styles.ghostModeBanner, { top: insets.top + 72 }]}>
                <Feather name="eye-off" size={14} color={colors.white} />
                <Text style={styles.ghostModeBannerText}>Ghost Mode is on — location hidden</Text>
              </View>
            )}

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

            <ScrollView contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false}>
              
              <View style={styles.detailTopSection}>
                <View style={[styles.detailStatusRow, selectedAnchor.isUnlocked ? styles.detailStatusRowUnlocked : styles.detailStatusRowLocked]}>
                  <Feather name={selectedAnchor.isUnlocked ? "unlock" : "lock"} size={12} color={selectedAnchor.isUnlocked ? colors.success : colors.accentPink} />
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
                <Text style={styles.detailMainTitle}>{selectedAnchor.title}</Text>
                <Text style={styles.detailCreatorText}>Created by User {selectedAnchor.creator_id.substring(0, 5)}</Text>
                {selectedAnchor.description ? <Text style={styles.detailMainDesc}>{selectedAnchor.description}</Text> : null}

                <View style={styles.detailTagRow}>
                  {(selectedAnchor.tags ?? []).map((tag) => (
                    <View key={tag} style={styles.detailTagPill}>
                      <Text style={styles.detailTagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.detailInfoGrid}>
                <View style={styles.detailInfoItem}>
                   <View style={styles.detailInfoIconSection}>
                     <Feather name="eye" size={16} color={colors.accentPink} />
                   </View>
                   <View style={styles.detailInfoTextSection}>
                     <Text style={styles.detailInfoLabel}>Visibility</Text>
                     <Text style={styles.detailInfoValue}>{selectedAnchor.visibilityLabel}</Text>
                   </View>
                </View>
                <View style={styles.detailInfoItem}>
                   <View style={styles.detailInfoIconSection}>
                     <Feather name="crosshair" size={16} color={colors.accentPink} />
                   </View>
                   <View style={styles.detailInfoTextSection}>
                     <Text style={styles.detailInfoLabel}>Unlock Radius</Text>
                     <Text style={styles.detailInfoValue}>{selectedAnchor.unlock_radius}m</Text>
                   </View>
                </View>
                {selectedAnchor.creator_id === session?.user_id && (
                  <View style={styles.detailInfoItem}>
                     <View style={styles.detailInfoIconSection}>
                       <Feather name="unlock" size={16} color={colors.accentPink} />
                     </View>
                     <View style={styles.detailInfoTextSection}>
                       <Text style={styles.detailInfoLabel}>Unlocks</Text>
                       <Text style={styles.detailInfoValue}>{selectedAnchor.max_unlock === null ? `${selectedAnchor.current_unlock}` : `${selectedAnchor.current_unlock} / ${selectedAnchor.max_unlock}`}</Text>
                     </View>
                  </View>
                )}
                <View style={styles.detailInfoItem}>
                   <View style={styles.detailInfoIconSection}>
                     <Feather name="clock" size={16} color={colors.accentPink} />
                   </View>
                   <View style={styles.detailInfoTextSection}>
                     <Text style={styles.detailInfoLabel}>Activated</Text>
                     <Text style={styles.detailInfoValue}>{formatDateTime(selectedAnchor.activation_time)}</Text>
                   </View>
                </View>
                <View style={styles.detailInfoItem}>
                   <View style={styles.detailInfoIconSection}>
                     <Feather name="calendar" size={16} color={colors.accentPink} />
                   </View>
                   <View style={styles.detailInfoTextSection}>
                     <Text style={styles.detailInfoLabel}>Expires</Text>
                     <Text style={styles.detailInfoValue}>{formatDateTime(selectedAnchor.expiration_time)}</Text>
                   </View>
                </View>
              </View>

              <View style={styles.detailActionRow}>
                {selectedAnchor.creator_id === session?.user_id ? (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => {
                      setEditingAnchor(selectedAnchor);
                      setRadius(selectedAnchor.unlock_radius);
                      animateSheet(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <Feather name="edit-2" size={14} color={colors.white} />
                    <Text style={styles.editButtonText}>Edit Anchor</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.reportButton}
                    onPress={() => setIsReportModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="flag" size={14} color={colors.muted} />
                    <Text style={styles.reportButtonText}>Report Anchor</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        ) : isExpanded ? (
          <View style={styles.listContainer}>
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Nearby Anchors</Text>
              <View style={styles.listHeaderActions}>
                <TouchableOpacity onPress={refreshDiscovery}>
                  <Feather name="refresh-cw" size={16} color={colors.muted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={collapseSheet}>
                  <Feather name="chevron-down" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.listFilterRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPillRowContent}
              >
                {filterConfigs.map((config) => {
                  const isActive = config.selectedValues.length > 0;
                  const isOpen = openFilterMenu === config.menu;
                  return (
                    <View
                      key={config.menu}
                      style={[
                        styles.filterPillWrap,
                        isActive && styles.filterPillWrapActive,
                      ]}
                    >
                      <TouchableOpacity
                        style={styles.filterPillMain}
                        onPress={() => openFilter(config.menu)}
                        activeOpacity={0.85}
                      >
                        <Feather
                          name={config.icon}
                          size={13}
                          color={isActive ? colors.accentPink : colors.muted}
                        />
                        <Text
                          style={[
                            styles.filterPillText,
                            isActive && styles.filterPillTextActive,
                          ]}
                        >
                          {config.label}
                          {isActive ? ` (${config.selectedValues.length})` : ""}
                        </Text>
                        <Feather
                          name={isOpen ? "chevron-up" : "chevron-down"}
                          size={14}
                          color={isActive ? colors.accentPink : colors.muted}
                        />
                      </TouchableOpacity>

                      {isActive ? (
                        <TouchableOpacity
                          style={styles.filterPillClear}
                          onPress={() => clearFilter(config.menu)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="x" size={13} color={colors.accentPink} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {activeFilterConfig ? (
              <View style={styles.tagDropdown}>
                <View style={styles.tagDropdownHeader}>
                  <Text style={styles.tagDropdownTitle}>{activeFilterConfig.title}</Text>
                  <Text style={styles.tagDropdownMeta}>
                    {activeFilterConfig.draftValues.length} selected
                  </Text>
                </View>

                {activeFilterConfig.options.length === 0 ? (
                  <Text style={styles.tagDropdownEmpty}>
                    No nearby options available yet.
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.tagDropdownList}
                    contentContainerStyle={styles.tagDropdownListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {activeFilterConfig.options.map(({ value, count }: AnchorFilterOption) => {
                      const isChecked = activeFilterConfig.draftValues.includes(value);
                      return (
                        <Pressable
                          key={value}
                          style={[
                            styles.tagOptionRow,
                            isChecked && styles.tagOptionRowChecked,
                          ]}
                          onPress={() => toggleDraftFilterValue(activeFilterConfig.menu, value)}
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
                            {activeFilterConfig.renderValue(value)}
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
                    onPress={closeFilterMenu}
                  >
                    <Text style={styles.tagDropdownSecondaryButtonText}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tagDropdownPrimaryButton}
                    onPress={applyOpenFilterMenu}
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
                data={visibleAnchors}
                keyExtractor={(item) => item.anchor_id}
                renderItem={({ item }) => (
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
                    {hasAnyServerFilter
                      ? "No anchors match your selected filters."
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
                : `${visibleAnchors.length} anchors found`}
            </Text>
            <Feather name="chevrons-up" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}
      </Animated.View>

      {selectedAnchor && (
        <ReportAnchorModal
          visible={isReportModalVisible}
          anchorTitle={selectedAnchor.title}
          onClose={() => setIsReportModalVisible(false)}
          onSubmit={async (reason: ReportReason, description: string) => {
            if (!session?.access_token) return;
            try {
              await reportAnchor(selectedAnchor.anchor_id, { reason, description: description || undefined }, session.access_token);
              setIsReportModalVisible(false);
              Alert.alert("Report submitted", "Thanks for helping keep Anchor safe.");
            } catch (err) {
              const message = err instanceof Error ? err.message : "Failed to submit report.";
              Alert.alert("Couldn't submit report", message);
            }
          }}
        />
      )}
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
  filterPillRowContent: {
    gap: 10,
    paddingRight: 18,
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
  detailScrollContent: {
    paddingHorizontal: 0,
    paddingBottom: 40,
    paddingTop: 4,
  },
  detailTopSection: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 20,
  },
  detailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
    marginBottom: 12,
  },
  detailStatusRowUnlocked: {
    backgroundColor: "#E7F8EF",
  },
  detailStatusRowLocked: {
    backgroundColor: "#FEE8ED",
  },
  detailStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  detailStatusTextUnlocked: {
    color: colors.success,
  },
  detailStatusTextLocked: {
    color: colors.accentPink,
  },
  detailMainTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  detailCreatorText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 10,
    fontWeight: "500",
  },
  detailMainDesc: {
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 16,
  },
  detailTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailTagPill: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  detailTagText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  detailInfoGrid: {
    paddingHorizontal: 16,
    gap: 16,
    marginBottom: 32,
  },
  detailInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  detailInfoIconSection: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  detailInfoTextSection: {
    flex: 1,
  },
  detailInfoLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  detailInfoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  detailActionRow: {
    paddingHorizontal: 16,
  },
  markerWrapper: { width: 30, height: 30 },
  markerWrapperSelected: { width: 38, height: 38 },
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
  ghostModeBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ghostModeBannerText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
  anchorCardOutOfRange: {
    opacity: 0.5,
  },
  outOfRangePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  outOfRangePillText: {
    fontSize: 11,
    color: colors.lightMuted,
  },
  mapMarkerOutOfRange: {
    opacity: 0.4,
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  reportButtonText: {
    fontSize: 15,
    color: colors.muted,
    fontWeight: "600",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: colors.accentPink,
    borderRadius: 14,
    shadowColor: colors.accentPink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  editButtonText: {
    fontSize: 15,
    color: colors.white,
    fontWeight: "700",
  }
});
