import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { StoredAuthSession } from "./authStorage";

const BIOMETRIC_SESSION_KEY = "anchor.biometric.session.v1";
const BIOMETRIC_PREF_KEY = "anchor.biometric.enabled";

// ── Device capability ─────────────────────────────────────────────────────────

export async function checkBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

export async function getBiometricType(): Promise<"faceid" | "touchid" | "none"> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "faceid";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "touchid";
  }
  return "none";
}

// ── Prompt ────────────────────────────────────────────────────────────────────

export async function promptBiometric(reason?: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason ?? "Authenticate to sign in to Anchor",
    fallbackLabel: "Use Password",
    disableDeviceFallback: false,
  });
  return result.success;
}

// ── Secure session storage ────────────────────────────────────────────────────

export async function saveBiometricSession(session: StoredAuthSession): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_SESSION_KEY, JSON.stringify(session));
}

export async function loadBiometricSession(): Promise<StoredAuthSession | null> {
  const raw = await SecureStore.getItemAsync(BIOMETRIC_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    return null;
  }
}

export async function clearBiometricSession(): Promise<void> {
  await SecureStore.deleteItemAsync(BIOMETRIC_SESSION_KEY);
}

// ── User preference ───────────────────────────────────────────────────────────

export async function getBiometricPreference(): Promise<boolean> {
  const val = await AsyncStorage.getItem(BIOMETRIC_PREF_KEY);
  return val === "true";
}

export async function setBiometricPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, enabled ? "true" : "false");
}
