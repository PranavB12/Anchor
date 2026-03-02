import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RootStackParamList } from "../navigation/AppNavigator";
import { confirmPasswordReset } from "../services/authService";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const [token, setToken] = useState(route.params?.token ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = async () => {
    Keyboard.dismiss();

    if (!token.trim()) {
      setError("Please enter your reset token.");
      return;
    }
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await confirmPasswordReset({ token: token.trim(), new_password: newPassword });
      Alert.alert("Success", "Your password has been reset. Please sign in.", [
        { text: "OK", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reset failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "right", "left", "bottom"]} style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your reset token and new password.</Text>

            <View style={styles.card}>
              <Text style={styles.label}>Reset Token</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setToken}
                placeholder="Paste your reset token"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                value={token}
              />

              <Text style={styles.label}>New Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setNewPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!showPassword}
                  style={styles.passwordInput}
                  value={newPassword}
                />
                <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.showHideButton}>
                  <Text style={styles.showHideText}>{showPassword ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                autoCapitalize="none"
                onChangeText={setConfirmPassword}
                placeholder="Re-enter new password"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                style={styles.input}
                value={confirmPassword}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                disabled={isSubmitting}
                onPress={handleReset}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || isSubmitting) && styles.primaryButtonPressed,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Reset Password</Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Pressable onPress={() => navigation.navigate("Login")}>
                  <Text style={styles.footerLink}>Back to Sign In</Text>
                </Pressable>
              </View>
            </View>
          </View>
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
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1, paddingHorizontal: 20 },
  content: { flex: 1, justifyContent: "center", maxWidth: 440, alignSelf: "center", width: "100%" },
  title: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 24 },
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
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6, marginTop: 4 },
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
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fffdfb",
  },
  passwordInput: { flex: 1, height: 48, paddingHorizontal: 12, fontSize: 16, color: colors.text },
  showHideButton: { paddingHorizontal: 12, paddingVertical: 10 },
  showHideText: { color: colors.accentPink, fontWeight: "600" },
  errorText: { marginTop: 10, color: colors.error, fontSize: 13 },
  primaryButton: {
    marginTop: 16,
    backgroundColor: colors.accentPink,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: { opacity: 0.9 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  footerRow: { marginTop: 18, flexDirection: "row", justifyContent: "center" },
  footerLink: { color: colors.accentPink, fontWeight: "700", fontSize: 14 },
});