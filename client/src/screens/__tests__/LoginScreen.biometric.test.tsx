/**
 * Tests for biometric login flow in LoginScreen
 *
 * - Biometric button is shown when biometric is enabled and a session is stored
 * - Biometric button is hidden when biometric is disabled
 * - Successful biometric prompt signs the user in and navigates to Discovery
 * - Failed biometric prompt shows an error and stays on login (fallback to password)
 * - Cancelled biometric prompt shows an error and stays on login (fallback to password)
 */

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";

import LoginScreen from "../LoginScreen";
import { useAuth } from "../../context/AuthContext";
import * as biometricService from "../../services/biometricService";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../context/AuthContext", () => ({ useAuth: jest.fn() }));

jest.mock("../../services/authService", () => ({
  login: jest.fn(),
  oauthLogin: jest.fn(),
}));

jest.mock("../../services/biometricService", () => ({
  checkBiometricAvailable: jest.fn(),
  getBiometricPreference: jest.fn(),
  getBiometricType: jest.fn(),
  loadBiometricSession: jest.fn(),
  promptBiometric: jest.fn(),
}));

jest.mock("expo-auth-session/providers/google", () => ({
  useIdTokenAuthRequest: jest.fn(() => [null, null, jest.fn()]),
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => {
  const mockReact = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement(View, null, children),
  };
});

jest.mock("@expo/vector-icons", () => {
  const mockReact = require("react");
  const { Text } = require("react-native");
  return {
    Feather: ({ name }: { name: string }) => mockReact.createElement(Text, null, name),
  };
});

jest.mock("../../../assets/anchor-logo.svg", () => {
  const mockReact = require("react");
  const { View } = require("react-native");
  return () => mockReact.createElement(View, null);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedBiometric = biometricService as jest.Mocked<typeof biometricService>;

const mockSession = {
  user_id: "user-1",
  email: "test@example.com",
  username: "testuser",
  access_token: "access-token",
  refresh_token: "refresh-token",
  token_type: "bearer" as const,
};

const mockSignIn = jest.fn();
const mockNavigate = jest.fn();

type ScreenProps = React.ComponentProps<typeof LoginScreen>;

function buildProps(): ScreenProps {
  return {
    navigation: {
      navigate: mockNavigate,
      goBack: jest.fn(),
    } as unknown as ScreenProps["navigation"],
    route: {
      key: "Login-test",
      name: "Login" as const,
      params: undefined,
    } as ScreenProps["route"],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    status: "unauthenticated",
    session: null,
    signIn: mockSignIn,
    signOut: jest.fn(),
    restoreSession: jest.fn(),
  });
  // Default: biometric unavailable
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(false);
  mockedBiometric.getBiometricPreference.mockResolvedValue(false);
  mockedBiometric.loadBiometricSession.mockResolvedValue(null);
  mockedBiometric.getBiometricType.mockResolvedValue("touchid");
});

// ── Biometric button visibility ───────────────────────────────────────────────

test("biometric button is not shown when biometric is disabled", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(false);

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.queryByText(/Sign in with/i)).toBeNull();
  });
});

test("biometric button is not shown when preference is off even if hardware is available", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(false);

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.queryByText(/Sign in with/i)).toBeNull();
  });
});

test("biometric button is not shown when preference is on but no stored session", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(true);
  mockedBiometric.loadBiometricSession.mockResolvedValue(null);

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.queryByText(/Sign in with/i)).toBeNull();
  });
});

test("biometric button is shown when biometric is enabled and a session is stored", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(true);
  mockedBiometric.loadBiometricSession.mockResolvedValue(mockSession);
  mockedBiometric.getBiometricType.mockResolvedValue("touchid");

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.getByText("Sign in with Touch ID")).toBeTruthy();
  });
});

test("shows Face ID label when device uses facial recognition", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(true);
  mockedBiometric.loadBiometricSession.mockResolvedValue(mockSession);
  mockedBiometric.getBiometricType.mockResolvedValue("faceid");

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.getByText("Sign in with Face ID")).toBeTruthy();
  });
});

// ── Successful biometric login ────────────────────────────────────────────────

test("successful biometric prompt signs in and navigates to Discovery", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(true);
  mockedBiometric.loadBiometricSession.mockResolvedValue(mockSession);
  mockedBiometric.getBiometricType.mockResolvedValue("touchid");
  mockedBiometric.promptBiometric.mockResolvedValue(true);

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.getByText("Sign in with Touch ID")).toBeTruthy();
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Sign in with Touch ID"));
  });

  await waitFor(() => {
    expect(mockedBiometric.promptBiometric).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith(mockSession);
    expect(mockNavigate).toHaveBeenCalledWith("Discovery");
  });
});

// ── Failed / cancelled biometric → fallback to password ──────────────────────

test("failed biometric prompt shows error and stays on login screen", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(true);
  mockedBiometric.loadBiometricSession.mockResolvedValue(mockSession);
  mockedBiometric.getBiometricType.mockResolvedValue("touchid");
  mockedBiometric.promptBiometric.mockResolvedValue(false);

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => {
    expect(screen.getByText("Sign in with Touch ID")).toBeTruthy();
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Sign in with Touch ID"));
  });

  await waitFor(() => {
    expect(mockedBiometric.promptBiometric).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText("Biometric authentication failed or was cancelled."),
    ).toBeTruthy();
  });
});

test("password fields remain accessible after biometric failure", async () => {
  mockedBiometric.checkBiometricAvailable.mockResolvedValue(true);
  mockedBiometric.getBiometricPreference.mockResolvedValue(true);
  mockedBiometric.loadBiometricSession.mockResolvedValue(mockSession);
  mockedBiometric.getBiometricType.mockResolvedValue("faceid");
  mockedBiometric.promptBiometric.mockResolvedValue(false);

  const screen = render(<LoginScreen {...buildProps()} />);

  await waitFor(() => screen.getByText("Sign in with Face ID"));

  await act(async () => {
    fireEvent.press(screen.getByText("Sign in with Face ID"));
  });

  await waitFor(() => {
    // Email + password inputs still present — user can fall back to password login
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter your password")).toBeTruthy();
    expect(screen.getByText("Log In")).toBeTruthy();
  });
});
