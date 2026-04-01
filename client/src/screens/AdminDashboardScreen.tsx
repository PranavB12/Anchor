import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import {
  searchAdminUsers,
  type AdminUserSummary,
} from "../services/adminService";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDashboard">;

function getAccountStatusLabel(user: AdminUserSummary) {
  return user.is_banned ? "Banned" : "Active";
}

function formatLastLogin(value?: string | null) {
  if (!value) return "No login recorded";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No login recorded";

  return `Last login ${parsed.toLocaleString()}`;
}

export default function AdminDashboardScreen({ navigation }: Props) {
  const { session } = useAuth();

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const token = session?.access_token;
    const trimmedQuery = query.trim();

    if (!token) {
      setUsers([]);
      setHasSearched(false);
      return;
    }

    if (trimmedQuery.length < 2) {
      setUsers([]);
      setHasSearched(false);
      setErrorMessage(null);
      return;
    }

    const timeoutId = setTimeout(() => {
      const run = async () => {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const results = await searchAdminUsers(trimmedQuery, token);
          setUsers(results);
          setHasSearched(true);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to search users.";
          setErrorMessage(message);
          setUsers([]);
          setHasSearched(true);
        } finally {
          setIsLoading(false);
        }
      };

      void run();
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [query, session?.access_token]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Admin Dashboard</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>User Search</Text>
          <Text style={styles.heroTitle}>Find accounts by email or username</Text>
          <Text style={styles.heroBody}>
            Search results show account status at a glance, then open a user profile to manage moderation actions.
          </Text>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.label}>Search users</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Enter email or username"
            placeholderTextColor={colors.lightMuted}
            style={styles.input}
            value={query}
          />
          <Text style={styles.helperText}>Type at least 2 characters to search.</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <ScrollView
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={colors.accentPink} />
              <Text style={styles.stateText}>Searching users...</Text>
            </View>
          ) : null}

          {!isLoading && !hasSearched ? (
            <View style={styles.centerState}>
              <Text style={styles.stateTitle}>Start a search</Text>
              <Text style={styles.stateText}>
                Look up a user by email address or username to review their current account status.
              </Text>
            </View>
          ) : null}

          {!isLoading && hasSearched && users.length === 0 ? (
            <View style={styles.centerState}>
              <Text style={styles.stateTitle}>No users found</Text>
              <Text style={styles.stateText}>
                Try a different email fragment or username.
              </Text>
            </View>
          ) : null}

          {!isLoading &&
            users.map((user) => (
              <Pressable
                key={user.user_id}
                onPress={() => navigation.navigate("AdminUserProfile", { user })}
                style={({ pressed }) => [
                  styles.userCard,
                  pressed && styles.userCardPressed,
                ]}
              >
                <View style={styles.userHeaderRow}>
                  <View style={styles.userIdentityBlock}>
                    <Text style={styles.username}>{user.username}</Text>
                    <Text style={styles.email}>{user.email}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      user.is_banned ? styles.statusPillBanned : styles.statusPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        user.is_banned
                          ? styles.statusPillTextBanned
                          : styles.statusPillTextActive,
                      ]}
                    >
                      {getAccountStatusLabel(user)}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{formatLastLogin(user.last_login)}</Text>
                  {user.is_admin ? <Text style={styles.adminBadge}>Admin</Text> : null}
                </View>
              </Pressable>
            ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
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
  searchCard: {
    backgroundColor: colors.selectedCanvas,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  helperText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  resultsContent: {
    paddingBottom: 28,
    gap: 12,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
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
  userCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  userCardPressed: {
    backgroundColor: "#fff1e7",
  },
  userHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  userIdentityBlock: {
    flex: 1,
    gap: 4,
  },
  username: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  email: {
    color: colors.muted,
    fontSize: 14,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillActive: {
    backgroundColor: "#e6f6ef",
  },
  statusPillBanned: {
    backgroundColor: "#fde8e8",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusPillTextActive: {
    color: colors.success,
  },
  statusPillTextBanned: {
    color: colors.error,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 8,
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
    flex: 1,
  },
  adminBadge: {
    color: colors.accentPink,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
