/**
 * Tests for biometricService.ts
 *
 * - promptBiometric returns true on success, false on failure/cancel
 * - saveBiometricSession / loadBiometricSession round-trip
 * - clearBiometricSession removes stored session
 * - getBiometricPreference / setBiometricPreference persist correctly
 * - checkBiometricAvailable returns false when hardware absent or not enrolled
 */

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  checkBiometricAvailable,
  clearBiometricSession,
  getBiometricPreference,
  loadBiometricSession,
  promptBiometric,
  saveBiometricSession,
  setBiometricPreference,
} from "../biometricService";
import type { StoredAuthSession } from "../authStorage";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const mockedLA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const mockedSS = SecureStore as jest.Mocked<typeof SecureStore>;

const mockSession: StoredAuthSession = {
  user_id: "user-123",
  email: "test@example.com",
  username: "testuser",
  access_token: "access-token",
  refresh_token: "refresh-token",
  token_type: "bearer",
};

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
});

// ── promptBiometric ───────────────────────────────────────────────────────────

describe("promptBiometric", () => {
  it("returns true when authentication succeeds", async () => {
    mockedLA.authenticateAsync.mockResolvedValueOnce({ success: true } as any);
    const result = await promptBiometric();
    expect(result).toBe(true);
    expect(mockedLA.authenticateAsync).toHaveBeenCalledTimes(1);
  });

  it("returns false when authentication fails", async () => {
    mockedLA.authenticateAsync.mockResolvedValueOnce({
      success: false,
      error: "authentication_failed",
    } as any);
    const result = await promptBiometric();
    expect(result).toBe(false);
  });

  it("returns false when user cancels", async () => {
    mockedLA.authenticateAsync.mockResolvedValueOnce({
      success: false,
      error: "user_cancel",
    } as any);
    const result = await promptBiometric();
    expect(result).toBe(false);
  });

  it("passes the custom reason to the prompt", async () => {
    mockedLA.authenticateAsync.mockResolvedValueOnce({ success: true } as any);
    await promptBiometric("Sign in to Anchor");
    expect(mockedLA.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: "Sign in to Anchor" }),
    );
  });
});

// ── checkBiometricAvailable ───────────────────────────────────────────────────

describe("checkBiometricAvailable", () => {
  it("returns false when device has no biometric hardware", async () => {
    mockedLA.hasHardwareAsync.mockResolvedValueOnce(false);
    expect(await checkBiometricAvailable()).toBe(false);
  });

  it("returns false when hardware present but no biometrics enrolled", async () => {
    mockedLA.hasHardwareAsync.mockResolvedValueOnce(true);
    mockedLA.isEnrolledAsync.mockResolvedValueOnce(false);
    expect(await checkBiometricAvailable()).toBe(false);
  });

  it("returns true when hardware present and biometrics enrolled", async () => {
    mockedLA.hasHardwareAsync.mockResolvedValueOnce(true);
    mockedLA.isEnrolledAsync.mockResolvedValueOnce(true);
    expect(await checkBiometricAvailable()).toBe(true);
  });
});

// ── Secure session storage ────────────────────────────────────────────────────

describe("saveBiometricSession / loadBiometricSession", () => {
  it("stores and retrieves a session correctly", async () => {
    mockedSS.setItemAsync.mockResolvedValueOnce(undefined);
    mockedSS.getItemAsync.mockResolvedValueOnce(JSON.stringify(mockSession));

    await saveBiometricSession(mockSession);
    const loaded = await loadBiometricSession();

    expect(mockedSS.setItemAsync).toHaveBeenCalledWith(
      "anchor.biometric.session.v1",
      JSON.stringify(mockSession),
    );
    expect(loaded).toEqual(mockSession);
  });

  it("returns null when no session is stored", async () => {
    mockedSS.getItemAsync.mockResolvedValueOnce(null);
    expect(await loadBiometricSession()).toBeNull();
  });

  it("returns null when stored value is invalid JSON", async () => {
    mockedSS.getItemAsync.mockResolvedValueOnce("not-valid-json{{{");
    expect(await loadBiometricSession()).toBeNull();
  });
});

describe("clearBiometricSession", () => {
  it("deletes the stored session from SecureStore", async () => {
    mockedSS.deleteItemAsync.mockResolvedValueOnce(undefined);
    await clearBiometricSession();
    expect(mockedSS.deleteItemAsync).toHaveBeenCalledWith(
      "anchor.biometric.session.v1",
    );
  });
});

// ── Preference ────────────────────────────────────────────────────────────────

describe("getBiometricPreference / setBiometricPreference", () => {
  it("returns false by default when nothing is stored", async () => {
    expect(await getBiometricPreference()).toBe(false);
  });

  it("returns true after enabling", async () => {
    await setBiometricPreference(true);
    expect(await getBiometricPreference()).toBe(true);
  });

  it("returns false after disabling", async () => {
    await setBiometricPreference(true);
    await setBiometricPreference(false);
    expect(await getBiometricPreference()).toBe(false);
  });
});
