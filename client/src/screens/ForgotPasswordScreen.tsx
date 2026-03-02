import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
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
import { requestPasswordReset } from "../services/authService";

type Props = NativeStackScreenProps<RootStackParamList, "ForgotPassword">;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequest = async () => {
    Keyboard.dismiss();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset({ email: trimmed });
      setSuccess(result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
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
            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you a reset link.
            </Text>

            <View style={styles.card}>
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

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {success ? <Text style={styles.successText}>{success}</Text> : null}

              <Pressable
                disabled={isSubmitting}
                onPress={handleRequest}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || isSubmitting) && styles.primaryButtonPressed,
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate("ResetPassword", { token: "" })}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>I have a reset token</Text>
              </Pressable>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Remember your password?</Text>
                <Pressable onPress={() => navigation.navigate("Login")}>
                  <Text style={styles.footerLink}>Sign in</Text>
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
  success: "#027a48",
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
  errorText: { marginTop: 10, color: colors.error, fontSize: 13 },
  successText: { marginTop: 10, color: colors.success, fontSize: 13, fontWeight: "600" },
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
  secondaryButton: { marginTop: 12, alignItems: "center", justifyContent: "center", minHeight: 44 },
  secondaryButtonText: { color: colors.accentPink, fontWeight: "600", fontSize: 14 },
  footerRow: { marginTop: 18, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  footerText: { color: colors.muted, fontSize: 14 },
  footerLink: { color: colors.accentPink, fontWeight: "700", fontSize: 14 },
});