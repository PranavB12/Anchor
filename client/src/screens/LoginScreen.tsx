import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
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
import { useAuth } from "../context/AuthContext";
import { login, oauthLogin } from "../services/authService";
import AnchorLogo from "../../assets/anchor-logo.svg";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }: Props) {
  const { signIn, status, session, signOut } = useAuth();
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const activeGoogleClientId = Platform.select({
    ios: googleIosClientId,
    android: googleAndroidClientId,
    default: googleWebClientId,
  });

  const [googleRequest, , promptGoogleAuth] = Google.useIdTokenAuthRequest({
    webClientId: googleWebClientId,
    iosClientId: googleIosClientId,
    androidClientId: googleAndroidClientId,
    scopes: ["profile", "email"],
    selectAccount: true,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const isGoogleConfigured = Boolean(activeGoogleClientId);
  const isAnySubmitting = isSubmitting || isGoogleSubmitting;

  const exchangeGoogleCodeForIdToken = async (code: string) => {
    if (!activeGoogleClientId || !googleRequest?.codeVerifier || !googleRequest.redirectUri) {
      return null;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: activeGoogleClientId,
        code,
        code_verifier: googleRequest.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: googleRequest.redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      return null;
    }

    const tokenData = (await response.json()) as { id_token?: string };
    return tokenData.id_token ?? null;
  };

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
      navigation.navigate("Discovery");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleOAuth = () => {
    const run = async () => {
      Keyboard.dismiss();
      setError(null);
      setSuccessMessage(null);

      if (!isGoogleConfigured) {
        setError(
          "Google OAuth is not configured for this platform. Set EXPO_PUBLIC_GOOGLE_*_CLIENT_ID values.",
        );
        return;
      }

      if (!googleRequest) {
        setError("Google sign-in is still initializing. Try again.");
        return;
      }

      setIsGoogleSubmitting(true);

      try {
        const authResult = await promptGoogleAuth();

        if (authResult.type !== "success") {
          if (authResult.type === "error") {
            setError(authResult.error?.message ?? "Google sign-in failed.");
          }
          return;
        }

        const authParams = authResult.params as Record<string, string | undefined>;
        let idToken = authParams.id_token ?? authResult.authentication?.idToken ?? null;

        if (!idToken && authParams.code) {
          idToken = await exchangeGoogleCodeForIdToken(authParams.code);
        }

        if (!idToken) {
          setError(
            "Google sign-in succeeded but no ID token was returned. Check Google client IDs for this platform.",
          );
          return;
        }

        const resolvedIdToken = idToken;
        const result = await oauthLogin({
          provider: "google",
          id_token: resolvedIdToken,
        });
        await signIn(result);

        const message = result.is_new_user
          ? `Google account created. Welcome, ${result.username}.`
          : `Login successful. Welcome back, ${result.username}.`;

        setSuccessMessage(message);
        Alert.alert("Signed in", message);
        navigation.navigate("Discovery");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Google sign-in failed";
        setError(message);
      } finally {
        setIsGoogleSubmitting(false);
      }
    };

    void run();
  };

  return (
    <SafeAreaView edges={["top", "right", "left", "bottom"]} style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <View style={styles.content}>
            <View style={styles.topSection}>
            <View style={styles.hero}>
              <AnchorLogo width={300} height={60} />
              {/* <Text style={styles.subtitle}>Sign in to continue</Text> */}
            </View>
          </View>

          <View style={styles.cardSection}>
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
              ) : (
                null
              )}

              <Pressable
                disabled={isAnySubmitting}
                onPress={handleLogin}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (pressed || isAnySubmitting) && styles.primaryButtonPressed,
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
                disabled={isAnySubmitting}
                onPress={handleGoogleOAuth}
                style={({ pressed }) => [
                  styles.googleButton,
                  (pressed || isAnySubmitting) && styles.googleButtonPressed,
                ]}
              >
                {isGoogleSubmitting ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.googleButtonText}>
                    Continue with Google
                  </Text>
                )}
              </Pressable>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Don&apos;t have an account?</Text>
                <Pressable onPress={() => navigation.navigate("Register")}>
                  <Text style={styles.footerLink}>Create one</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.bottomSection} />
        </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
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
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: 440,
  },
  topSection: {
    flex: 1,
    justifyContent: "center",
  },
  cardSection: {
    width: "100%",
  },
  bottomSection: {
    flex: 1,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
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
    width: "100%",
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
