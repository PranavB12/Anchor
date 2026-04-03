import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Platform,
  StatusBar,
} from "react-native";

import AdminSectionTabs from "../components/AdminSectionTabs";
import { useAuth } from "../context/AuthContext";
import { useAdminAccessGuard } from "../hooks/useAdminAccessGuard";
import type { RootStackParamList } from "../navigation/AppNavigator";
import {
  fetchAdminReports,
  resolveAdminReport,
  type AdminReport,
} from "../services/adminService";

type Props = NativeStackScreenProps<RootStackParamList, "AdminReports">;

const colors = {
  accentPink: "#F55476",
  accentWarm: "#F4BB7E",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  lightMuted: "#9FA6B5",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
  success: "#027a48",
};

function formatReportTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return parsed.toLocaleString();
}

function formatReason(reason: string) {
  return reason
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCoordinates(report: AdminReport) {
  return `${report.anchor_latitude.toFixed(5)}, ${report.anchor_longitude.toFixed(5)}`;
}

export default function AdminReportsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const { accessError, hasAccess, isCheckingAccess } = useAdminAccessGuard(
    session?.access_token,
  );

  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const loadReports = async () => {
    if (!session?.access_token || !hasAccess) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextReports = await fetchAdminReports(session.access_token, "PENDING");
      setReports(nextReports);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load pending reports.";
      setErrorMessage(message);
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) return;
    void loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, session?.access_token]);

  const submitResolution = async (
    report: AdminReport,
    mode: "delete" | "dismiss",
  ) => {
    if (!session?.access_token) return;

    setActiveReportId(report.report_id);
    setErrorMessage(null);

    try {
      await resolveAdminReport(
        report.report_id,
        mode === "delete" ? "ACTION" : "DISMISS",
        mode === "delete",
        session.access_token,
      );

      setReports((prev) =>
        prev.filter((currentReport) => currentReport.report_id !== report.report_id),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update report.";
      setErrorMessage(message);
    } finally {
      setActiveReportId(null);
    }
  };

  const confirmResolution = (report: AdminReport, mode: "delete" | "dismiss") => {
    const isDelete = mode === "delete";

    Alert.alert(
      isDelete ? "Delete anchor?" : "Dismiss report?",
      isDelete
        ? "This will permanently remove the anchor and resolve the report."
        : "This will keep the anchor active and mark the report as resolved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isDelete ? "Delete Anchor" : "Dismiss",
          style: isDelete ? "destructive" : "default",
          onPress: () => {
            void submitResolution(report, mode);
          },
        },
      ],
    );
  };

  const renderReport = ({ item }: { item: AdminReport }) => {
    const isMutating = activeReportId === item.report_id;

    return (
      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.reportTitle}>{item.anchor_title}</Text>
            <Text style={styles.reportTimestamp}>{formatReportTime(item.created_at)}</Text>
          </View>
          <View style={styles.reasonPill}>
            <Text style={styles.reasonPillText}>{formatReason(item.reason)}</Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Anchor Status</Text>
            <Text style={styles.metaValue}>{item.anchor_status}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Reported By</Text>
            <Text style={styles.metaValue}>{item.reporter_username}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Coordinates</Text>
            <Text style={styles.metaValue}>{formatCoordinates(item)}</Text>
          </View>
        </View>

        <View style={styles.commentCard}>
          <Text style={styles.commentLabel}>Reporter Comment</Text>
          <Text style={styles.commentBody}>
            {item.description?.trim() || "No comment provided with this report."}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            disabled={isMutating}
            onPress={() => confirmResolution(item, "dismiss")}
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed && !isMutating && styles.buttonPressed,
              isMutating && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryActionText}>
              {isMutating ? "Working..." : "Dismiss"}
            </Text>
          </Pressable>

          <Pressable
            disabled={isMutating}
            onPress={() => confirmResolution(item, "delete")}
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && !isMutating && styles.buttonPressed,
              isMutating && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryActionText}>
              {isMutating ? "Working..." : "Delete Anchor"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.navigate("Discovery")} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Admin Dashboard</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <AdminSectionTabs
          activeTab="Reports"
          onNavigate={(route) => navigation.navigate(route)}
        />

        {isCheckingAccess ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={colors.accentPink} />
            <Text style={styles.stateText}>Checking admin access...</Text>
          </View>
        ) : null}

        {!isCheckingAccess && accessError ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>403 Forbidden</Text>
            <Text style={styles.stateText}>
              Admin tools are restricted to approved moderators. This session cannot access admin endpoints.
            </Text>
          </View>
        ) : null}

        {!isCheckingAccess && hasAccess ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Reports Queue</Text>
              <Text style={styles.heroTitle}>Review unresolved anchor reports</Text>
              <Text style={styles.heroBody}>
                Pending reports are sorted with the most recent submissions first. Dismiss false alarms or delete anchors that violate policy.
              </Text>
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {isLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color={colors.accentPink} />
                <Text style={styles.stateText}>Loading pending reports...</Text>
              </View>
            ) : (
              <FlatList
                data={reports}
                keyExtractor={(item) => item.report_id}
                renderItem={renderReport}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onRefresh={() => {
                  void loadReports();
                }}
                refreshing={isLoading}
                ListEmptyComponent={
                  <View style={styles.centerState}>
                    <Text style={styles.stateTitle}>No pending reports</Text>
                    <Text style={styles.stateText}>
                      Everything has been reviewed. New reports will appear here automatically.
                    </Text>
                  </View>
                }
              />
            )}
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  backButton: {
    minWidth: 56,
  },
  backButtonText: {
    color: colors.accentPink,
    fontSize: 15,
    fontWeight: "700",
  },
  backButtonPlaceholder: {
    minWidth: 56,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 16,
  },
  heroEyebrow: {
    color: colors.accentPink,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 36,
    gap: 12,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  stateText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  reportCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  reportTitleBlock: {
    flex: 1,
    gap: 4,
  },
  reportTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  reportTimestamp: {
    color: colors.muted,
    fontSize: 13,
  },
  reasonPill: {
    backgroundColor: "#fff0f3",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reasonPillText: {
    color: colors.accentPink,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  metaGrid: {
    gap: 10,
  },
  metaItem: {
    backgroundColor: colors.selectedCanvas,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  commentCard: {
    backgroundColor: "#fff6ef",
    borderRadius: 18,
    padding: 14,
  },
  commentLabel: {
    color: colors.accentWarm,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  commentBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.selectedCanvas,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
