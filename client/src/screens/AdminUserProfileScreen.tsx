import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { updateAdminUserBanStatus } from "../services/adminService";

type Props = NativeStackScreenProps<RootStackParamList, "AdminUserProfile">;

function formatDateLabel(value?: string | null, fallback = "Unavailable") {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return parsed.toLocaleString();
}

export default function AdminUserProfileScreen({
  navigation,
  route,
}: Props) {
  const { session } = useAuth();
  const [user, setUser] = useState(route.params.user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleBanToggle = () => {
    const token = session?.access_token;
    if (!token) {
      setErrorMessage("You must be logged in to manage this user.");
      return;
    }

    const nextIsBanned = !Boolean(user.is_banned);
    const actionLabel = nextIsBanned ? "Ban" : "Unban";
    const confirmationCopy = nextIsBanned
      ? "This will block the user from continuing to use the app."
      : "This will restore the user account.";

    Alert.alert(`${actionLabel} User`, confirmationCopy, [
      { text: "Cancel", style: "cancel" },
      {
        text: actionLabel,
        style: nextIsBanned ? "destructive" : "default",
        onPress: () => {
          const run = async () => {
            setIsSubmitting(true);
            setErrorMessage(null);

            try {
              const response = await updateAdminUserBanStatus(
                user.user_id,
                nextIsBanned,
                token,
              );
              setUser((previous) => ({
                ...previous,
                is_banned: response.is_banned,
              }));
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Failed to update user status.";
              setErrorMessage(message);
            } finally {
              setIsSubmitting(false);
            }
          };

          void run();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Admin User Profile</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {user.username.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.username}>{user.username}</Text>
          <Text style={styles.email}>{user.email}</Text>

          <View
            style={[
              styles.statusBanner,
              user.is_banned ? styles.statusBannerBanned : styles.statusBannerActive,
            ]}
          >
            <Text
              style={[
                styles.statusBannerText,
                user.is_banned
                  ? styles.statusBannerTextBanned
                  : styles.statusBannerTextActive,
              ]}
            >
              {user.is_banned ? "Banned account" : "Active account"}
            </Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Account Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>User ID</Text>
            <Text style={styles.detailValue}>{user.user_id}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Role</Text>
            <Text style={styles.detailValue}>{user.is_admin ? "Admin" : "Standard user"}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailValue}>
              {formatDateLabel(user.created_at, "Unavailable")}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Last login</Text>
            <Text style={styles.detailValue}>
              {formatDateLabel(user.last_login, "No login recorded")}
            </Text>
          </View>
        </View>

        <View style={styles.moderationCard}>
          <Text style={styles.sectionTitle}>Moderation</Text>
          <Text style={styles.moderationBody}>
            Toggle the account ban state for this user. The button is wired to the backend ban endpoint your sprint defines.
          </Text>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            disabled={isSubmitting}
            onPress={handleBanToggle}
            style={({ pressed }) => [
              styles.toggleButton,
              user.is_banned ? styles.unbanButton : styles.banButton,
              (pressed || isSubmitting) && styles.buttonPressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.toggleButtonText}>
                {user.is_banned ? "Unban User" : "Ban User"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  selectedCanvas: "#F5E6DA",
  text: "#1f2937",
  muted: "#6b7280",
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
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
  profileCard: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  avatarCircle: {
    alignItems: "center",
    justifyContent: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.selectedCanvas,
    marginBottom: 14,
  },
  avatarInitial: {
    color: colors.accentPink,
    fontSize: 28,
    fontWeight: "800",
  },
  username: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  email: {
    color: colors.muted,
    fontSize: 15,
    marginBottom: 16,
  },
  statusBanner: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusBannerActive: {
    backgroundColor: "#e6f6ef",
  },
  statusBannerBanned: {
    backgroundColor: "#fde8e8",
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusBannerTextActive: {
    color: colors.success,
  },
  statusBannerTextBanned: {
    color: colors.error,
  },
  detailCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 14,
  },
  moderationCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  moderationBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  toggleButton: {
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 14,
  },
  banButton: {
    backgroundColor: colors.error,
  },
  unbanButton: {
    backgroundColor: colors.success,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  toggleButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "800",
  },
});
