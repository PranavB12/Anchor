import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import {
  getLibrary,
  removeFromLibrary,
  type SavedAnchor,
} from "../services/libraryService";

type Props = NativeStackScreenProps<RootStackParamList, "Library">;

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
  success: "#027a48",
};

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatVisibility(value: SavedAnchor["visibility"]) {
  if (value === "CIRCLE_ONLY") return "Circle";
  if (value === "PRIVATE") return "Private";
  return "Public";
}

export default function LibraryScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [items, setItems] = useState<SavedAnchor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLibrary = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const data = await getLibrary(token);
        setItems(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load library.";
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    loadLibrary("initial");
  }, [loadLibrary]);

  const handleRemove = useCallback(
    (anchorId: string, title: string) => {
      if (!token) return;
      Alert.alert(
        "Remove from Library",
        `Remove "${title}" from your library?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setRemovingId(anchorId);
              const previous = items;
              setItems((curr) => curr.filter((a) => a.anchor_id !== anchorId));
              try {
                await removeFromLibrary(anchorId, token);
              } catch (err) {
                setItems(previous);
                const message =
                  err instanceof Error ? err.message : "Failed to remove.";
                Alert.alert("Error", message);
              } finally {
                setRemovingId(null);
              }
            },
          },
        ],
      );
    },
    [items, token],
  );

  const handleOpenOnMap = useCallback(
    (anchorId: string) => {
      navigation.navigate("Discovery", { targetAnchorId: anchorId });
    },
    [navigation],
  );

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>My Library</Text>
        <View style={styles.backButton} />
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accentPink} />
          <Text style={styles.centerStateText}>Loading your library...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.anchor_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadLibrary("refresh")}
              tintColor={colors.accentPink}
            />
          }
          renderItem={({ item }) => {
            const isRemoving = removingId === item.anchor_id;
            return (
              <Pressable
                style={styles.card}
                onPress={() => handleOpenOnMap(item.anchor_id)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.iconWrapper}>
                    <Feather name="bookmark" size={18} color={colors.accentPink} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      {formatVisibility(item.visibility)} · Saved {formatSavedAt(item.saved_at)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemove(item.anchor_id, item.title)}
                    disabled={isRemoving}
                    hitSlop={8}
                  >
                    {isRemoving ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Feather name="trash-2" size={16} color={colors.error} />
                    )}
                  </TouchableOpacity>
                </View>

                {item.description ? (
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {item.tags && item.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {item.tags.slice(0, 4).map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <View style={styles.footerRow}>
                    <Feather name="map-pin" size={12} color={colors.muted} />
                    <Text style={styles.footerText}>
                      {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </Text>
                  </View>
                  <View style={styles.footerRow}>
                    <Feather name="navigation" size={12} color={colors.accentPink} />
                    <Text style={styles.footerCta}>Open on map</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Feather name="bookmark" size={32} color={colors.lightMuted} />
              <Text style={styles.emptyText}>Your library is empty</Text>
              <Text style={styles.emptySubText}>
                Save anchors from the map to access them anywhere.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: { width: 80 },
  backButtonText: { color: colors.accentPink, fontWeight: "600", fontSize: 15 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#fee4e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: 80,
  },
  centerStateText: { color: colors.muted, fontSize: 14 },
  emptyText: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 8 },
  emptySubText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, flexGrow: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEE8ED",
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
  },
  cardDescription: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { fontSize: 11, color: colors.text, fontWeight: "600" },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 12, color: colors.muted },
  footerCta: { fontSize: 12, color: colors.accentPink, fontWeight: "700" },
});
