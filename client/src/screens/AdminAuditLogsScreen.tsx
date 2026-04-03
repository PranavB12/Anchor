import React, { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  StatusBar,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useAuth } from "../context/AuthContext";
import AdminSectionTabs from "../components/AdminSectionTabs";
import { useAdminAccessGuard } from "../hooks/useAdminAccessGuard";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { fetchAuditLogs, type AuditLog } from "../services/adminService";

type Props = NativeStackScreenProps<RootStackParamList, "AdminAuditLogs">;

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
  blue: "#4285F4",
};

export default function AdminAuditLogsScreen({ navigation }: Props) {
  const { session } = useAuth();
  const { accessError, hasAccess, isCheckingAccess } = useAdminAccessGuard(
    session?.access_token,
  );
  
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [actionType, setActionType] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const loadLogs = async () => {
    if (!session?.access_token || !hasAccess) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetchAuditLogs(session.access_token, {
        action_type: actionType.trim() ? actionType.trim().toUpperCase() : undefined,
        start_date: startDate ? startDate.toISOString() : undefined,
        end_date: endDate ? endDate.toISOString() : undefined,
      });
      setLogs(response.logs);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAccess) return;
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, session?.access_token, startDate, endDate]);

  const renderLogItem = ({ item }: { item: AuditLog }) => {
    return (
      <View style={styles.logCard}>
        <View style={styles.cardHeader}>
          <Text style={[styles.actionType, (item.action_type === 'FAILED_LOGIN' || item.action_type === 'ANCHOR_DELETE') && styles.actionTypeCritical]}>{item.action_type}</Text>
          <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
        </View>
        <Text style={styles.userInfo}>User: {item.username} ({item.email})</Text>
        {item.target_type && item.target_id && (
          <Text style={styles.targetInfo}>
            Target: {item.target_type} ({item.target_id})
          </Text>
        )}
        {item.ip_address && (
          <Text style={styles.ipAddress}>IP: {item.ip_address}</Text>
        )}
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
          activeTab="Logs"
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
            <View style={styles.filterCard}>
              <Text style={styles.filterTitle}>Filters</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Action Type</Text>
                <View style={styles.actionTypeRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. LOGIN, ANCHOR_CREATE"
                    placeholderTextColor={colors.lightMuted}
                    autoCapitalize="characters"
                    value={actionType}
                    onChangeText={setActionType}
                    onSubmitEditing={loadLogs}
                  />
                  <Pressable style={styles.searchBtn} onPress={loadLogs}>
                    <Text style={styles.searchBtnText}>Apply</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.dateRow}>
                <View style={styles.dateControl}>
                  <Text style={styles.label}>Start Date</Text>
                  <Pressable style={styles.dateBox} onPress={() => setShowStartPicker(true)}>
                    <Text style={startDate ? styles.dateText : styles.datePlaceholder}>
                      {startDate ? startDate.toLocaleDateString() : "Select date"}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.dateControl}>
                  <Text style={styles.label}>End Date</Text>
                  <Pressable style={styles.dateBox} onPress={() => setShowEndPicker(true)}>
                    <Text style={endDate ? styles.dateText : styles.datePlaceholder}>
                      {endDate ? endDate.toLocaleDateString() : "Select date"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              
              {(startDate || endDate) && (
                <Pressable style={styles.clearDatesBtn} onPress={() => { setStartDate(undefined); setEndDate(undefined); }}>
                  <Text style={styles.clearDatesBtnText}>Clear Dates</Text>
                </Pressable>
              )}

              {showStartPicker && (
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(e, date) => {
                    setShowStartPicker(false);
                    if (date) setStartDate(date);
                  }}
                />
              )}

              {showEndPicker && (
                <DateTimePicker
                  value={endDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(e, date) => {
                    setShowEndPicker(false);
                    if (date) setEndDate(date);
                  }}
                />
              )}
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {isLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color={colors.accentPink} />
                <Text style={styles.stateText}>Loading logs...</Text>
              </View>
            ) : (
              <FlatList
                data={logs}
                keyExtractor={(item) => item.log_id}
                renderItem={renderLogItem}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.centerState}>
                    <Text style={styles.stateTitle}>No logs found</Text>
                    <Text style={styles.stateText}>Try adjusting your filters.</Text>
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
  filterCard: {
    backgroundColor: colors.selectedCanvas,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  filterTitle: {
    color: colors.accentPink,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 12,
  },
  actionTypeRow: {
    flexDirection: "row",
    gap: 12,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchBtn: {
    backgroundColor: colors.accentPink,
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  searchBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateControl: {
    flex: 1,
  },
  dateBox: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datePlaceholder: {
    color: colors.lightMuted,
    fontSize: 15,
  },
  dateText: {
    color: colors.text,
    fontSize: 15,
  },
  clearDatesBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
  },
  clearDatesBtnText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingBottom: 40,
    gap: 12,
  },
  logCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  actionType: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  actionTypeCritical: {
    color: colors.error,
  },
  timestamp: {
    color: colors.muted,
    fontSize: 13,
  },
  userInfo: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  targetInfo: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 2,
  },
  ipAddress: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  stateText: {
    color: colors.muted,
    fontSize: 15,
  },
});
