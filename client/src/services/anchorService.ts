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

export type UpdateAnchorBody = {
  title?: string;
  description?: string | null;
  visibility?: AnchorVisibility;
  unlock_radius?: number;
  max_unlock?: number | null;
  activation_time?: string | null;
  expiration_time?: string | null;
  tags?: string[] | null;
};

export async function updateAnchor(anchorId: string, body: UpdateAnchorBody, token: string) {
  return apiRequest<NearbyAnchor>(`/anchors/${anchorId}`, {
    method: "PATCH",
    token,
    body,
  });
}

export async function deleteAnchor(anchorId: string, token: string) {
  return apiRequest<{ message: string }>(`/anchors/${anchorId}`, {
    method: "DELETE",
    token,
  });
}

export type ReportReason =
  | "SPAM"
  | "INAPPROPRIATE"
  | "HARASSMENT"
  | "MISINFORMATION"
  | "OTHER";

export type ReportAnchorBody = {
  reason: ReportReason;
  description?: string;
};

export type ReportResponse = {
  report_id: string;
  anchor_id: string;
  reporter_id: string;
  reason: ReportReason;
  description: string | null;
  status: string;
  created_at: string;
};

export async function reportAnchor(
  anchorId: string,
  body: ReportAnchorBody,
  token: string,
) {
  return apiRequest<ReportResponse>(`/anchors/${anchorId}/report`, {
    method: "POST",
    token,
    body,
  });
}
