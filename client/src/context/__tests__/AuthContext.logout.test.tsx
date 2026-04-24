import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { AuthProvider, useAuth } from "../AuthContext";
import {
  logout,
  refreshAccessToken,
  verifyAccessToken,
  type AuthResponse,
} from "../../services/authService";
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from "../../services/authStorage";

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock("../../services/authService", () => ({
  logout: jest.fn(),
  verifyAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

jest.mock("../../services/authStorage", () => ({
  clearAuthSession: jest.fn(),
  loadAuthSession: jest.fn(),
  saveAuthSession: jest.fn(),
}));

const mockedLogout = logout as jest.MockedFunction<typeof logout>;
const mockedVerifyAccessToken = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;
const mockedRefreshAccessToken = refreshAccessToken as jest.MockedFunction<typeof refreshAccessToken>;
const mockedClearAuthSession = clearAuthSession as jest.MockedFunction<typeof clearAuthSession>;
const mockedLoadAuthSession = loadAuthSession as jest.MockedFunction<typeof loadAuthSession>;
const mockedSaveAuthSession = saveAuthSession as jest.MockedFunction<typeof saveAuthSession>;

const authPayload: AuthResponse = {
  user_id: "user-1",
  email: "logout-test@example.com",
  username: "logout_test",
  access_token: "access-token",
  refresh_token: "refresh-token",
  token_type: "bearer",
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedLoadAuthSession.mockResolvedValue(null);
  mockedSaveAuthSession.mockResolvedValue(undefined);
  mockedClearAuthSession.mockResolvedValue(undefined);
  mockedLogout.mockResolvedValue({ message: "Successfully logged out" });
  mockedVerifyAccessToken.mockResolvedValue({
    valid: true,
    user_id: authPayload.user_id,
    email: authPayload.email,
    username: authPayload.username,
  });
  mockedRefreshAccessToken.mockResolvedValue({
    access_token: "refreshed-access-token",
    token_type: "bearer",
  });
});

test("signOut clears local auth state and storage when API logout succeeds", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.status).toBe("unauthenticated"));

  await act(async () => {
    await result.current.signIn(authPayload);
  });

  expect(result.current.status).toBe("authenticated");
  expect(result.current.session?.refresh_token).toBe(authPayload.refresh_token);

  await act(async () => {
    await result.current.signOut();
  });

  expect(mockedLogout).toHaveBeenCalledWith({ refresh_token: authPayload.refresh_token });
  expect(mockedClearAuthSession).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("unauthenticated");
  expect(result.current.session).toBeNull();
});

test("signOut still removes local tokens when API logout fails", async () => {
  mockedLogout.mockRejectedValueOnce(new Error("Network error"));

  const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.status).toBe("unauthenticated"));

  await act(async () => {
    await result.current.signIn(authPayload);
  });

  await act(async () => {
    await result.current.signOut();
  });

  expect(mockedLogout).toHaveBeenCalledWith({ refresh_token: authPayload.refresh_token });
  expect(mockedClearAuthSession).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("unauthenticated");
  expect(result.current.session).toBeNull();
});

test("signOut without an active session still clears local storage", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.status).toBe("unauthenticated"));

  await act(async () => {
    await result.current.signOut();
  });

  expect(mockedLogout).not.toHaveBeenCalled();
  expect(mockedClearAuthSession).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe("unauthenticated");
  expect(result.current.session).toBeNull();
});
