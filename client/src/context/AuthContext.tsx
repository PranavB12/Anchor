import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import {
  type AuthResponse,
  logout,
  refreshAccessToken,
  verifyAccessToken,
} from "../services/authService";
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
  type StoredAuthSession,
} from "../services/authStorage";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  session: StoredAuthSession | null;
  signIn: (payload: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<StoredAuthSession | null>(null);

  const restoreSession = async () => {
    setStatus("loading");

    const stored = await loadAuthSession();
    if (!stored) {
      setSession(null);
      setStatus("unauthenticated");
      return;
    }

    try {
      const verified = await verifyAccessToken(stored.access_token);
      const verifiedSession: StoredAuthSession = {
        ...stored,
        user_id: verified.user_id,
        email: verified.email,
        username: verified.username,
      };
      setSession(verifiedSession);
      setStatus("authenticated");
      await saveAuthSession(verifiedSession);
      return;
    } catch {
      // Continue to refresh attempt below.
    }

    try {
      const refreshed = await refreshAccessToken({
        refresh_token: stored.refresh_token,
      });
      const refreshedSession: StoredAuthSession = {
        ...stored,
        access_token: refreshed.access_token,
        token_type: refreshed.token_type,
      };
      const verified = await verifyAccessToken(refreshedSession.access_token);
      const verifiedSession: StoredAuthSession = {
        ...refreshedSession,
        user_id: verified.user_id,
        email: verified.email,
        username: verified.username,
      };
      setSession(verifiedSession);
      setStatus("authenticated");
      await saveAuthSession(verifiedSession);
    } catch {
      await clearAuthSession();
      setSession(null);
      setStatus("unauthenticated");
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        await restoreSession();
      } catch {
        setSession(null);
        setStatus("unauthenticated");
      }
    };

    void run();
  }, []);

  const signIn = async (payload: AuthResponse) => {
    const nextSession: StoredAuthSession = {
      user_id: payload.user_id,
      email: payload.email,
      username: payload.username,
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_type: payload.token_type,
    };
    await saveAuthSession(nextSession);
    setSession(nextSession);
    setStatus("authenticated");
  };

  const signOut = async () => {
    const refreshToken = session?.refresh_token;
    if (refreshToken) {
      try {
        await logout({ refresh_token: refreshToken });
      } catch {
        // Local sign-out should still proceed if the server is unreachable.
      }
    }
    await clearAuthSession();
    setSession(null);
    setStatus("unauthenticated");
  };

  const value: AuthContextValue = {
    status,
    session,
    signIn,
    signOut,
    restoreSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
