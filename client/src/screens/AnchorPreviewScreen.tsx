import React from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Mapbox from "@rnmapbox/maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import circle from "@turf/circle";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { createAnchor } from "../services/anchorService";

type Props = NativeStackScreenProps<RootStackParamList, "AnchorPreview">;

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
};

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
Mapbox.setAccessToken(MAPBOX_TOKEN ?? "");

function formatVisibility(visibility: Props["route"]["params"]["draft"]["visibility"]) {
  if (visibility === "PUBLIC") return "Public";
  if (visibility === "CIRCLE_ONLY") return "Circle";
  return "Private";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Always active";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPreviewZoom(radius: number) {
  if (radius <= 20) return 16.5;
  if (radius <= 40) return 16;
  if (radius <= 60) return 15.5;
  if (radius <= 80) return 15;
  return 14.5;
}

export default function AnchorPreviewScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { draft } = route.params;
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const detailItems = [
    { key: "visibility", label: "Visibility", value: formatVisibility(draft.visibility) },
    { key: "radius", label: "Unlock Radius", value: `${draft.unlock_radius}m` },
    {
      key: "unlocks",
      label: "Unlock Limit",
      value: draft.max_unlock === null ? "Unlimited" : String(draft.max_unlock),
    },
    { key: "activation", label: "Starts", value: formatDateTime(draft.activation_time) },
    { key: "expiration", label: "Ends", value: formatDateTime(draft.expiration_time) },
  ];
  const coordinate: [number, number] = [draft.longitude, draft.latitude];
  const radiusShape = circle(coordinate, draft.unlock_radius, { steps: 64, units: "meters" });

  const handlePublish = async () => {
    if (!session?.access_token) {
      Alert.alert("Not Logged In", "Please log in to create an anchor.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createAnchor(draft, session.access_token);
      navigation.navigate("Discovery");
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to create anchor.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Feather name="eye" size={14} color={colors.accentPink} />
            <Text style={styles.heroBadgeText}>What others will see</Text>
          </View>
          <Text style={styles.heroTitle}>Preview your Anchor</Text>
          <Text style={styles.heroSubtitle}>
            Review the details and map placement before you publish.
          </Text>
        </View>

        <View style={styles.mapCard}>
          <View style={styles.mapCardHeader}>
            <Text style={styles.mapCardTitle}>Map Preview</Text>
            <Text style={styles.mapCardMeta}>{draft.unlock_radius}m radius</Text>
          </View>
          <View style={styles.mapFrame}>
            <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Light}>
              <Mapbox.Camera
                zoomLevel={getPreviewZoom(draft.unlock_radius)}
                centerCoordinate={coordinate}
                animationDuration={0}
              />
              <Mapbox.ShapeSource id="preview-radius-source" shape={radiusShape}>
                <Mapbox.FillLayer
                  id="preview-radius-fill"
                  style={{ fillColor: colors.accentPink, fillOpacity: 0.2 }}
                />
                <Mapbox.LineLayer
                  id="preview-radius-line"
                  style={{ lineColor: colors.accentPink, lineWidth: 1.5 }}
                />
              </Mapbox.ShapeSource>
              <Mapbox.MarkerView id="preview-anchor-pin" coordinate={coordinate}>
                <View style={styles.mapMarker}>
                  <Image
                    source={require("../../assets/unlocked.png")}
                    style={styles.mapMarkerImage}
                    resizeMode="contain"
                  />
                </View>
              </Mapbox.MarkerView>
            </Mapbox.MapView>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.iconWrap}>
              <Feather name="map-pin" size={18} color={colors.accentPink} />
            </View>
            <View style={styles.summaryHeaderText}>
              <Text style={styles.summaryTitle}>{draft.title}</Text>
              <Text style={styles.summaryMeta}>
                {formatVisibility(draft.visibility)} · Radius {draft.unlock_radius}m
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Description</Text>
          <Text style={styles.bodyText}>
            {draft.description || "No description"}
          </Text>

          <View style={styles.detailList}>
            {detailItems.map((item) => (
              <View key={item.key} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={styles.detailValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.tagsBlock}>
            <Text style={styles.sectionLabel}>Tags</Text>
            {draft.tags.length > 0 ? (
              <View style={styles.tagRow}>
                {draft.tags.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyState}>No tags</Text>
            )}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Edit Details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
          onPress={handlePublish}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? "Publishing..." : "Publish Anchor"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  heroCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FEE8ED",
  },
  heroBadgeText: {
    color: colors.accentPink,
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 20,
  },
  mapCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 14,
    gap: 12,
  },
  mapCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  mapCardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  mapCardMeta: {
    color: colors.accentPink,
    fontSize: 13,
    fontWeight: "600",
  },
  mapFrame: {
    overflow: "hidden",
    borderRadius: 20,
    height: 220,
    backgroundColor: "#f4efe7",
  },
  map: {
    flex: 1,
  },
  mapMarker: {
    width: 40,
    height: 40,
  },
  mapMarkerImage: {
    width: "100%",
    height: "100%",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE8ED",
    marginRight: 12,
  },
  summaryHeaderText: {
    flex: 1,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  summaryMeta: {
    color: colors.muted,
    fontSize: 14,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  bodyText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  detailList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f7e8da",
    gap: 12,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 14,
    flex: 1,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
  tagsBlock: {
    gap: 8,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    backgroundColor: colors.selectedCanvas,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tagText: {
    color: colors.accentPink,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyState: {
    color: colors.lightMuted,
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    backgroundColor: colors.white,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: colors.accentPink,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
    backgroundColor: "#f3a3b5",
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
