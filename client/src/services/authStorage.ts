import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthResponse, RefreshResponse } from "./authService";

const AUTH_SESSION_STORAGE_KEY = "anchor.auth.session.v1";

export type StoredAuthSession = {
  user_id: string;
  email: string;
  username: string;
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

type PersistableAuthPayload = AuthResponse | (RefreshResponse & {
  refresh_token: string;
  user_id: string;
  email: string;
  username: string;
});

export async function saveAuthSession(session: PersistableAuthPayload) {
  await AsyncStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function loadAuthSession(): Promise<StoredAuthSession | null> {
  const raw = await AsyncStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
    if (
      typeof parsed.user_id !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.access_token !== "string" ||
      typeof parsed.refresh_token !== "string" ||
      parsed.token_type !== "bearer"
    ) {
      return null;
    }

    return parsed as StoredAuthSession;
  } catch {
    return null;
  }
}

export async function clearAuthSession() {
  await AsyncStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}
