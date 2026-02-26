import { Platform } from "react-native";

// Android emulators cannot reach the host machine via 127.0.0.1.
// Use "adb reverse tcp:8000 tcp:8000" to reach the host machine via 127.0.0.1:8000
const API_BASE_URL =
  "http://127.0.0.1:8000";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type ApiRequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
};

type FastApiErrorShape = {
  detail?: string;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, token, headers = {} } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = data as FastApiErrorShape | null;
    throw new Error(error?.detail ?? `Request failed (${response.status})`);
  }

  return data as T;
}

export { API_BASE_URL };
