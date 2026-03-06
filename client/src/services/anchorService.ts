import { apiRequest } from "./api";

export type AnchorVisibility = "PUBLIC" | "PRIVATE" | "CIRCLE_ONLY";

export type AnchorStatus = "ACTIVE" | "EXPIRED" | "LOCKED" | "FLAGGED";

export type NearbyAnchor = {
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
  tags: string[] | null;
};

export type CreateAnchorBody = {
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  altitude?: number | null;
  visibility: "PUBLIC" | "PRIVATE" | "CIRCLE_ONLY";
  unlock_radius: number;
  max_unlock?: number | null;
  activation_time?: string | null;
  expiration_time?: string | null;
  always_active?: boolean;
  tags?: string[] | null;
};

type GetNearbyAnchorsParams = {
  lat: number;
  lon: number;
  radiusKm?: number;
  visibility?: AnchorVisibility;
  anchorStatus?: AnchorStatus;
  sortBy?: "distance" | "created_at";
};

export async function getNearbyAnchors(
  params: GetNearbyAnchorsParams,
  token: string,
) {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    radius_km: String(params.radiusKm ?? 5),
    sort_by: params.sortBy ?? "distance",
  });

  if (params.visibility) {
    query.set("visibility", params.visibility);
  }
  if (params.anchorStatus) {
    query.set("anchor_status", params.anchorStatus);
  }

  return apiRequest<NearbyAnchor[]>(`/anchors/nearby?${query.toString()}`, {
    method: "GET",
    token,
  });
}
