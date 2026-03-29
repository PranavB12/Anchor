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
  is_unlocked: boolean;
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

// -------------------------------------------------------------
// Auto-Unlock Endpoints (US4)
// -------------------------------------------------------------

export async function unlockAnchor(anchorId: string, token: string) {
  return apiRequest<{ message: string; anchor_id: string; unlocks: number }>(
    `/anchors/${anchorId}/unlock`,
    {
      method: "POST",
      token,
    }
  );
}

// -------------------------------------------------------------
// Mock Attachment / Content Endpoints (US1)
// -------------------------------------------------------------

export type AttachmentType = 'IMAGE' | 'DOCUMENT' | 'AUDIO';

export type AnchorAttachment = {
  id: string;
  anchor_id: string;
  creator_id: string;
  type: AttachmentType;
  file_url: string;
  file_name: string;
  uploaded_at: string;
};

// In-memory mock store for attachments
const MOCK_ATTACHMENTS: Record<string, AnchorAttachment[]> = {};

export async function getAnchorAttachments(
  anchorId: string,
  token: string,
): Promise<AnchorAttachment[]> {
  // TODO: Replace with real backend API call
  // Example: return apiRequest<AnchorAttachment[]>(`/anchors/${anchorId}/content`, { ... })
  
  // Simulated network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  return MOCK_ATTACHMENTS[anchorId] || [];
}

export async function uploadAnchorAttachment(
  anchorId: string,
  userId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  token: string,
): Promise<AnchorAttachment> {
  // TODO: Replace with real backend API / S3 bucket upload logic
  // e.g. FormData upload to POST /anchors/${anchorId}/content
  
  await new Promise((resolve) => setTimeout(resolve, 800));

  const newAttachment: AnchorAttachment = {
    id: Math.random().toString(36).substring(7),
    anchor_id: anchorId,
    creator_id: userId,
    type: mimeType.startsWith("image/") ? 'IMAGE' : 'DOCUMENT',
    file_url: fileUri, // Mock local file uri
    file_name: fileName,
    uploaded_at: new Date().toISOString(),
  };

  if (!MOCK_ATTACHMENTS[anchorId]) {
    MOCK_ATTACHMENTS[anchorId] = [];
  }
  MOCK_ATTACHMENTS[anchorId].push(newAttachment);

  return newAttachment;
}
