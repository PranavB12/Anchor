import { apiRequest } from "./api";
import type {
  AnchorContentType,
  AnchorStatus,
  AnchorVisibility,
} from "./anchorService";

export type SavedAnchorExpirationStatus = "LIVE" | "EXPIRED";

export type SavedAnchor = {
  anchor_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  status: AnchorStatus;
  visibility: AnchorVisibility;
  unlock_radius: number;
  max_unlock: number | null;
  current_unlock: number;
  activation_time: string | null;
  expiration_time: string | null;
  always_active: boolean;
  expiration_status: SavedAnchorExpirationStatus;
  content_type: AnchorContentType[] | null;
  tags: string[] | null;
  saved_at: string;
};

export async function saveAnchor(anchorId: string, token: string) {
  return apiRequest<SavedAnchor>("/user/library/save", {
    method: "POST",
    token,
    body: { anchor_id: anchorId },
  });
}

export async function getLibrary(
  token: string,
  expirationStatus?: SavedAnchorExpirationStatus,
) {
  const query = new URLSearchParams();
  if (expirationStatus) {
    query.set("expiration_status", expirationStatus);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<SavedAnchor[]>(`/user/library${suffix}`, {
    method: "GET",
    token,
  });
}

export async function removeFromLibrary(anchorId: string, token: string) {
  return apiRequest<{ message: string }>(`/user/library/${anchorId}`, {
    method: "DELETE",
    token,
  });
}
