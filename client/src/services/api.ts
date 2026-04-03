import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from "react-native";

const envBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const API_BASE_URL = envBaseUrl && envBaseUrl.length > 0 ? envBaseUrl : "http://127.0.0.1:8000";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type ApiRequestOptions = {
  method?: HttpMethod;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  useFileSystemBypass?: boolean; // The new flag
};

type FastApiErrorShape = {
  detail?: string;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, token, headers = {}, useFileSystemBypass } = options;
  const targetUrl = `${API_BASE_URL}${path}`;

  const requestHeaders = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  // Execute the bulletproof background bypass only if the flag is true and it's a GET request
  if (useFileSystemBypass && method === "GET") {
    const tempFileUri = FileSystem.cacheDirectory + `temp_${Date.now()}.json`;
    const { uri, status } = await FileSystem.downloadAsync(targetUrl, tempFileUri, {
      headers: requestHeaders
    });

    if (status >= 400) throw new Error(`Request failed (${status})`);

    const fileContent = await FileSystem.readAsStringAsync(uri);
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return JSON.parse(fileContent) as T;
  }

  // Standard fetch for everything else (foreground, POSTs, etc.)
  const response = await fetch(targetUrl, {
    method,
    headers: requestHeaders,
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