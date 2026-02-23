import { apiRequest } from "./api";

export type RegisterRequest = {
  email: string;
  password: string;
  username: string;
};

export type AuthResponse = {
  user_id: string;
  email: string;
  username: string;
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type OAuthRequest = {
  provider: "google";
  id_token: string;
};

export type OAuthResponse = AuthResponse & {
  is_new_user: boolean;
};

export type RefreshRequest = {
  refresh_token: string;
};

export type RefreshResponse = {
  access_token: string;
  token_type: "bearer";
};

export type LogoutRequest = {
  refresh_token: string;
};

export type LogoutResponse = {
  message: string;
};

export function register(payload: RegisterRequest) {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function login(payload: LoginRequest) {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function oauthLogin(payload: OAuthRequest) {
  return apiRequest<OAuthResponse>("/auth/oauth", {
    method: "POST",
    body: payload,
  });
}

export function refreshAccessToken(payload: RefreshRequest) {
  return apiRequest<RefreshResponse>("/auth/refresh", {
    method: "POST",
    body: payload,
  });
}

export function logout(payload: LogoutRequest) {
  return apiRequest<LogoutResponse>("/auth/logout", {
    method: "POST",
    body: payload,
  });
}
