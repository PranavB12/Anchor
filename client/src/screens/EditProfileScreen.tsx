import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { getProfile, updateProfile } from "../services/authService";
import {
  setGhostModeBackgroundState,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from "../services/locationTask";
import {
  checkBiometricAvailable,
  clearBiometricSession,
  getBiometricPreference,
  getBiometricType,
  promptBiometric,
  saveBiometricSession,
  setBiometricPreference,
} from "../services/biometricService";

type Props = NativeStackScreenProps<RootStackParamList, "EditProfile">;

export default function EditProfileScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<"faceid" | "touchid" | "none">("none");
  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);

  // Load current profile on mount and pre-fill all fields
  useEffect(() => {
    const load = async () => {
      if (!session?.access_token) return;
      try {
        const profile = await getProfile(session.access_token);
        setUsername(profile.username ?? "");
        setEmail(profile.email ?? "");
        setBio(profile.bio ?? "");
        setAvatarUrl(profile.avatar_url ?? "");
        setIsGhostMode(profile.is_ghost_mode ?? false);
      } catch {
        setError("Failed to load profile.");
      } finally {
        setIsLoading(false);
      }

      const available = await checkBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        setBiometricType(await getBiometricType());
        setBiometricEnabled(await getBiometricPreference());
      }
    };
    void load();
  }, [session]);

  const biometricLabel = biometricType === "faceid" ? "Face ID" : "Touch ID";

  const handleToggleBiometric = async (value: boolean) => {
    if (isTogglingBiometric) return;
    setIsTogglingBiometric(true);
    try {
      if (value) {
        const success = await promptBiometric(`Enable ${biometricLabel} for Anchor`);
        if (!success) return;
        if (session) await saveBiometricSession(session);
        await setBiometricPreference(true);
        setBiometricEnabled(true);
        Alert.alert(`${biometricLabel} Enabled`, `You can now sign in using ${biometricLabel}.`);
      } else {
        await clearBiometricSession();
        await setBiometricPreference(false);
        setBiometricEnabled(false);
      }
    } catch {
      Alert.alert("Error", "Could not update biometric settings.");
    } finally {
      setIsTogglingBiometric(false);
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();

    if (!username.trim()) {
      setError("Username cannot be empty.");
      return;
    }

    // Basic email format check before hitting the backend
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const updatedProfile = await updateProfile(
        {
          username: username.trim(),
          email: email.trim(),
          bio: bio.trim() || undefined,
          avatar_url: avatarUrl.trim() || undefined,
          is_ghost_mode: isGhostMode,
        },
        session!.access_token,
      );
      const nextGhostMode = updatedProfile.is_ghost_mode ?? isGhostMode;
      await setGhostModeBackgroundState(nextGhostMode);
      if (nextGhostMode) {
        await stopBackgroundLocationTracking();
      } else {
        await startBackgroundLocationTracking();
      }
      Alert.alert("Success", "Profile updated successfully.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      // Backend returns 409 if email is already taken by another account
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          const run = async () => {
            setIsLoggingOut(true);
            try {
              await signOut();
            } catch (err) {
              const message = err instanceof Error ? err.message : "Logout failed";
              setError(message);
            } finally {
              setIsLoggingOut(false);
            }
          };
          void run();
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#F55476" />
      </View>
    );
  }

  return (
    <SafeAreaView edges={["top", "right", "left", "bottom"]} style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
                <Text style={styles.backButtonText}>← Back</Text>
              </Pressable>
              <Text style={styles.title}>Edit Profile</Text>
              <View style={styles.backButton} />
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setUsername}
                placeholder="Your username"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                value={username}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                value={email}
              />

              <Text style={styles.label}>Bio</Text>
              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setBio}
                placeholder="Tell people about yourself..."
                placeholderTextColor="#9ca3af"
                style={styles.textArea}
                value={bio}
              />

              <Text style={styles.label}>Avatar URL</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setAvatarUrl}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                value={avatarUrl}
              />

              <Text style={styles.label}>Ghost Mode</Text>
              <View style={styles.ghostModeRow}>
                <Text style={styles.ghostModeDescription}>
                  Hide your location and stop nearby Anchor updates
                </Text>
                <Switch
                  value={isGhostMode}
                  onValueChange={setIsGhostMode}
                  trackColor={{ false: colors.border, true: colors.accentPink }}
                  thumbColor={colors.white}
                />
              </View>

              {biometricAvailable && (
                <>
                  <Text style={styles.label}>{biometricLabel} Login</Text>
                  <View style={styles.ghostModeRow}>
                    <Text style={styles.ghostModeDescription}>
                      Sign in instantly using {biometricLabel}
                    </Text>
                    {isTogglingBiometric ? (
                      <ActivityIndicator size="small" color={colors.accentPink} />
                    ) : (
                      <Switch
                        value={biometricEnabled}
                        onValueChange={(val) => void handleToggleBiometric(val)}
                        trackColor={{ false: colors.border, true: colors.accentPink }}
                        thumbColor={colors.white}
                      />
                    )}
                  </View>
                </>
              )}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                disabled={isSubmitting || isLoggingOut}
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || isSubmitting || isLoggingOut) && styles.primaryButtonPressed,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Changes</Text>
                )}
              </Pressable>

              <Pressable
                testID="logout-button"
                disabled={isSubmitting || isLoggingOut}
                onPress={handleLogout}
                style={({ pressed }) => [
                  styles.logoutButton,
                  (pressed || isSubmitting || isLoggingOut) && styles.primaryButtonPressed,
                ]}
              >
                {isLoggingOut ? (
                  <ActivityIndicator color={colors.accentPink} />
                ) : (
                  <Text style={styles.logoutButtonText}>Log Out</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const colors = {
  accentPink: "#F55476",
  canvas: "#FFF8F2",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#f2d9bf",
  white: "#ffffff",
  error: "#b42318",
};

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF8F2" },
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  backButton: { width: 80 },
  backButtonText: { color: colors.accentPink, fontWeight: "600", fontSize: 15 },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  card: {
    backgroundColor: colors.white,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#f5e7d6",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6, marginTop: 12 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: "#fffdfb",
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: "#fffdfb",
    minHeight: 100,
    textAlignVertical: "top",
  },
  errorText: { marginTop: 10, color: colors.error, fontSize: 13 },
  primaryButton: {
    marginTop: 20,
    backgroundColor: colors.accentPink,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: { opacity: 0.9 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  logoutButton: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.accentPink,
    backgroundColor: "#fff6f8",
  },
  logoutButtonText: {
    color: colors.accentPink,
    fontSize: 16,
    fontWeight: "700",
  },
  ghostModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  ghostModeDescription: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    marginRight: 12,
  },
});
