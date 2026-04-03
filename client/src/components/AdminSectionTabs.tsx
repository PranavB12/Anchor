import { Pressable, StyleSheet, Text, View } from "react-native";

type AdminTabRoute = "AdminDashboard" | "AdminAuditLogs" | "AdminReports";

type AdminTabKey = "Users" | "Logs" | "Reports";

type Props = {
  activeTab: AdminTabKey;
  onNavigate: (route: AdminTabRoute) => void;
};

const colors = {
  accentPink: "#F55476",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#f2d9bf",
  white: "#ffffff",
};

const tabRouteMap: Record<AdminTabKey, AdminTabRoute> = {
  Users: "AdminDashboard",
  Logs: "AdminAuditLogs",
  Reports: "AdminReports",
};

export default function AdminSectionTabs({ activeTab, onNavigate }: Props) {
  const tabs: AdminTabKey[] = ["Users", "Logs", "Reports"];

  return (
    <View style={styles.tabRow}>
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <Pressable
            key={tab}
            onPress={() => {
              if (isActive) return;
              onNavigate(tabRouteMap[tab]);
            }}
            style={({ pressed }) => [
              styles.tabButton,
              isActive && styles.tabButtonActive,
              pressed && !isActive && styles.tabButtonPressed,
            ]}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
  },
  tabButtonActive: {
    borderColor: "#f7a2b4",
    backgroundColor: colors.selectedCanvas,
  },
  tabButtonPressed: {
    opacity: 0.85,
  },
  tabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  tabTextActive: {
    color: colors.accentPink,
  },
});
