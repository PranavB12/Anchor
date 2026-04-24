import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
  getAnchorAttachments,
  type AnchorAttachment,
} from "../services/anchorService";
import {
  getLibrary,
  removeFromLibrary,
  type SavedAnchorExpirationStatus,
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

const libraryTabs: SavedAnchorExpirationStatus[] = ["LIVE", "EXPIRED"];

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "No end time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatVisibility(value: SavedAnchor["visibility"]) {
  if (value === "CIRCLE_ONLY") return "Circle";
  if (value === "PRIVATE") return "Private";
  return "Public";
}

function formatExpirationSummary(item: SavedAnchor) {
  if (item.expiration_status === "EXPIRED") {
    return item.expiration_time
      ? `Expired ${formatSavedAt(item.expiration_time)}`
      : "Expired";
  }
  if (item.always_active) return "Never expires";
  return item.expiration_time
    ? `Expires ${formatSavedAt(item.expiration_time)}`
    : "No end time";
}

export default function LibraryScreen({ navigation }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;

  const [items, setItems] = useState<SavedAnchor[]>([]);
  const [activeTab, setActiveTab] = useState<SavedAnchorExpirationStatus>("LIVE");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedExpiredAnchor, setSelectedExpiredAnchor] = useState<SavedAnchor | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<AnchorAttachment[]>([]);
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

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
        const data = await getLibrary(token, activeTab);
        setItems(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load library.";
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeTab, token],
  );

  useEffect(() => {
    void loadLibrary("initial");
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

  const closeExpiredAnchorDetail = useCallback(() => {
    setIsDetailVisible(false);
    setSelectedExpiredAnchor(null);
    setDetailAttachments([]);
    setDetailErrorMessage(null);
    setIsDetailLoading(false);
  }, []);

  const handleOpenExpiredAnchor = useCallback(
    async (anchor: SavedAnchor) => {
      if (!token) return;
      setSelectedExpiredAnchor(anchor);
      setDetailAttachments([]);
      setDetailErrorMessage(null);
      setIsDetailVisible(true);
      setIsDetailLoading(true);
      try {
        const attachments = await getAnchorAttachments(anchor.anchor_id, token);
        setDetailAttachments(attachments);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load saved content.";
        setDetailErrorMessage(message);
      } finally {
        setIsDetailLoading(false);
      }
    },
    [token],
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

      <View style={styles.tabRow}>
        {libraryTabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {tab === "LIVE" ? "Live" : "Expired"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accentPink} />
          <Text style={styles.centerStateText}>
            Loading {activeTab === "LIVE" ? "live" : "expired"} anchors...
          </Text>
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
            const isExpired = item.expiration_status === "EXPIRED";
            return (
              <Pressable
                style={styles.card}
                onPress={() =>
                  isExpired
                    ? void handleOpenExpiredAnchor(item)
                    : handleOpenOnMap(item.anchor_id)
                }
              >
                <View style={styles.cardHeader}>
                  <View
                    style={[
                      styles.iconWrapper,
                      isExpired && styles.iconWrapperExpired,
                    ]}
                  >
                    <Feather name="bookmark" size={18} color={colors.accentPink} />
                  </View>
                  <View style={styles.cardInfo}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          isExpired ? styles.statusPillExpired : styles.statusPillLive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            isExpired
                              ? styles.statusPillTextExpired
                              : styles.statusPillTextLive,
                          ]}
                        >
                          {isExpired ? "Expired" : "Live"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardSubtitle}>
                      {formatVisibility(item.visibility)} · Saved {formatSavedAt(item.saved_at)}
                    </Text>
                    <Text style={styles.expirationText}>{formatExpirationSummary(item)}</Text>
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
                    <Feather
                      name={isExpired ? "book-open" : "navigation"}
                      size={12}
                      color={colors.accentPink}
                    />
                    <Text style={styles.footerCta}>
                      {isExpired ? "View saved content" : "Open on map"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Feather name="bookmark" size={32} color={colors.lightMuted} />
              <Text style={styles.emptyText}>
                {activeTab === "LIVE" ? "No live anchors saved" : "No expired anchors saved"}
              </Text>
              <Text style={styles.emptySubText}>
                {activeTab === "LIVE"
                  ? "Save anchors from the map to keep your active library close at hand."
                  : "Expired saves will stay here so you can still review their content."}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={isDetailVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={closeExpiredAnchorDetail}
      >
        <SafeAreaView
          edges={["top", "left", "right", "bottom"]}
          style={styles.modalSafeArea}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeExpiredAnchorDetail} style={styles.modalHeaderButton}>
              <Feather name="arrow-left" size={16} color={colors.text} />
              <Text style={styles.modalHeaderButtonText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Saved Anchor</Text>
            <View style={styles.modalHeaderButton} />
          </View>

          {selectedExpiredAnchor ? (
            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalTopCard}>
                <View style={[styles.statusPill, styles.statusPillExpired]}>
                  <Text style={[styles.statusPillText, styles.statusPillTextExpired]}>
                    Expired
                  </Text>
                </View>
                <Text style={styles.modalAnchorTitle}>{selectedExpiredAnchor.title}</Text>
                <Text style={styles.modalMetaText}>
                  {formatVisibility(selectedExpiredAnchor.visibility)} · Saved{" "}
                  {formatSavedAt(selectedExpiredAnchor.saved_at)}
                </Text>
                <Text style={styles.modalMetaText}>
                  Expiration: {formatDateTime(selectedExpiredAnchor.expiration_time)}
                </Text>
                {selectedExpiredAnchor.description ? (
                  <Text style={styles.modalDescription}>
                    {selectedExpiredAnchor.description}
                  </Text>
                ) : null}
                {selectedExpiredAnchor.tags && selectedExpiredAnchor.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {selectedExpiredAnchor.tags.map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Saved Content</Text>
                {detailErrorMessage ? (
                  <View style={styles.errorBanner}>
                    <Feather name="alert-circle" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{detailErrorMessage}</Text>
                  </View>
                ) : null}
                {isDetailLoading ? (
                  <View style={styles.detailLoadingState}>
                    <ActivityIndicator color={colors.accentPink} />
                    <Text style={styles.centerStateText}>Loading content...</Text>
                  </View>
                ) : detailAttachments.length > 0 ? (
                  detailAttachments.map((attachment) => (
                    <View key={attachment.content_id} style={styles.attachmentCard}>
                      <View style={styles.attachmentHeader}>
                        <View style={styles.attachmentTypePill}>
                          <Text style={styles.attachmentTypeText}>
                            {attachment.content_type}
                          </Text>
                        </View>
                      </View>
                      {attachment.content_type === "TEXT" && attachment.text_body ? (
                        <Text style={styles.attachmentText}>{attachment.text_body}</Text>
                      ) : null}
                      {attachment.content_type === "LINK" ? (
                        <View style={styles.attachmentBody}>
                          <Text style={styles.attachmentTitle}>
                            {attachment.page_title || "Saved link"}
                          </Text>
                          <Text style={styles.attachmentMeta}>
                            {attachment.url || "No URL available"}
                          </Text>
                        </View>
                      ) : null}
                      {attachment.content_type === "FILE" ? (
                        attachment.mime_type?.startsWith("image/") && attachment.file_url ? (
                          <Image
                            source={{ uri: attachment.file_url }}
                            style={styles.attachmentImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.attachmentFileRow}>
                            <Feather name="file" size={18} color={colors.accentPink} />
                            <Text style={styles.attachmentTitle}>
                              {attachment.file_name || "Attachment"}
                            </Text>
                          </View>
                        )
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={styles.detailLoadingState}>
                    <Feather name="book-open" size={22} color={colors.lightMuted} />
                    <Text style={styles.centerStateText}>
                      No additional attachments were saved with this anchor.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  modalSafeArea: { flex: 1, backgroundColor: colors.canvas },
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
  tabRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: colors.accentPink,
    borderColor: colors.accentPink,
  },
  tabButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: colors.white,
  },
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
  iconWrapperExpired: {
    backgroundColor: "#FEF3F2",
  },
  cardInfo: { flex: 1 },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillLive: {
    backgroundColor: "#E7F6EC",
    borderColor: "#A6E1B8",
  },
  statusPillExpired: {
    backgroundColor: "#FEF3F2",
    borderColor: "#FECACA",
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusPillTextLive: {
    color: colors.success,
  },
  statusPillTextExpired: {
    color: colors.error,
  },
  cardSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  expirationText: { fontSize: 12, color: colors.accentPink, marginTop: 4, fontWeight: "600" },
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
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalHeaderButton: {
    width: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modalHeaderButtonText: {
    color: colors.accentPink,
    fontSize: 15,
    fontWeight: "600",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  modalTopCard: {
    backgroundColor: colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  modalAnchorTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  modalMetaText: {
    fontSize: 13,
    color: colors.muted,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 21,
  },
  detailSection: {
    gap: 12,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  detailLoadingState: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  attachmentCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  attachmentHeader: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  attachmentTypePill: {
    backgroundColor: colors.canvas,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  attachmentTypeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  attachmentBody: {
    gap: 4,
  },
  attachmentTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  attachmentMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  attachmentText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  attachmentImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: colors.canvas,
  },
  attachmentFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
