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

import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { login } from "../services/authService";
import AnchorLogo from "../../assets/anchor-logo.svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn, status, session, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    Keyboard.dismiss();
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError("Enter your email and password.");
      setSuccessMessage(null);
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const result = await login({ email: trimmedEmail, password });
      await signIn(result);
      setSuccessMessage(`Login successful. Welcome back, ${result.username}.`);
      Alert.alert("Signed in", `Welcome back, ${result.username}.`);
      // Next step: persist tokens and navigate to the authenticated app flow.
      navigation.navigate("Map");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleOAuth = () => {
    Alert.alert(
      "Google OAuth",
      "Google sign-in UI is not wired yet. Backend /auth/oauth is ready.",
    );
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.screen,
          {
            paddingTop: Math.max(insets.top, 36),
            paddingBottom: Math.max(insets.bottom, 20)
          }
        ]}
      >
        <View style={styles.hero}>
          <AnchorLogo width={200} height={200} />
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.card}>
          {status === "authenticated" && session ? (
            <View style={styles.activeSessionBanner}>
              <Text style={styles.activeSessionText}>
                Session active for {session.username}
              </Text>
              <Pressable onPress={() => void signOut()}>
                <Text style={styles.activeSessionLink}>Sign out</Text>
              </Pressable>
            </View>
          ) : null}

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

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
              placeholder="Enter your password"
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              value={password}
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.showHideButton}
            >
              <Text style={styles.showHideText}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {successMessage ? (
            <Text style={styles.successText}>{successMessage}</Text>
          ) : null}

          <Pressable
            disabled={isSubmitting}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || isSubmitting) && styles.primaryButtonPressed,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Log In</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={handleGoogleOAuth}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.googleButtonPressed,
            ]}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don&apos;t have an account?</Text>
            <Pressable onPress={() => navigation.navigate("Register")}>
              <Text style={styles.footerLink}>Create one</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const colors = {
  accentWarm: "#F4BB7E",
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
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 20,
    paddingTop: 36,
  },
  hero: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 22,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 16,
    color: colors.accentPink,
    fontWeight: "600",
    textAlign: "center",
  },
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
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 6,
    marginTop: 4,
  },
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
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
  },
  showHideButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  showHideText: {
    color: colors.accentPink,
    fontWeight: "600",
  },
  errorText: {
    marginTop: 10,
    color: colors.error,
    fontSize: 13,
  },
  successText: {
    marginTop: 10,
    color: colors.success,
    fontSize: 13,
    fontWeight: "600",
  },
  activeSessionBanner: {
    marginBottom: 10,
    backgroundColor: "#ecfdf3",
    borderWidth: 1,
    borderColor: "#abe8c9",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  activeSessionText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  activeSessionLink: {
    color: colors.accentPink,
    fontWeight: "700",
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: colors.accentPink,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  dividerRow: {
    marginVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#f3e3cf",
  },
  dividerText: {
    color: colors.muted,
    fontSize: 13,
  },
  googleButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentWarm,
    backgroundColor: "#fff8ee",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  googleButtonPressed: {
    opacity: 0.9,
  },
  googleButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  footerRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    color: colors.muted,
    fontSize: 14,
  },
  footerLink: {
    color: colors.accentPink,
    fontWeight: "700",
    fontSize: 14,
  },
  buttonContainer: {
    marginTop: 20,
  }
});
