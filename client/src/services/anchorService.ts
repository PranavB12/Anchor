import { apiRequest, API_BASE_URL } from "./api";

export type AnchorVisibility = "PUBLIC" | "PRIVATE" | "CIRCLE_ONLY";

export type AnchorStatus = "ACTIVE" | "EXPIRED" | "LOCKED" | "FLAGGED";

export type AnchorContentType = "TEXT" | "FILE" | "LINK";

export type NearbyAnchor = {
  anchor_id: string;
  creator_id: string;
  circle_id?: string | null;
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
  content_type: AnchorContentType[] | null;
  tags: string[] | null;
  net_votes: number;
  user_vote: "UPVOTE" | "DOWNVOTE" | null;
};

export type CreateAnchorBody = {
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  visibility: "PUBLIC" | "PRIVATE" | "CIRCLE_ONLY";
  circle_id?: string | null;
  unlock_radius: number;
  max_unlock?: number | null;
  activation_time?: string | null;
  expiration_time?: string | null;
  always_active?: boolean;
  tags?: string[] | null;
  is_savable?: boolean;
};

export type AnchorDraft = {
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  visibility: AnchorVisibility;
  circle_id?: string | null;
  circle_name?: string | null;
  unlock_radius: number;
  max_unlock: number | null;
  activation_time: string;
  expiration_time: string | null;
  always_active: boolean;
  tags: string[];
  is_savable: boolean;
  attachment?: {
    uri: string;
    name: string;
    type: string;
  } | null;
};

export async function createAnchor(body: CreateAnchorBody, token: string) {
  return apiRequest<NearbyAnchor>("/anchors/", {
    method: "POST",
    token,
    body,
  });
}

export type GetNearbyAnchorsParams = {
  lat: number;
  lon: number;
  radiusKm?: number;
  visibility?: AnchorVisibility[];
  anchorStatus?: AnchorStatus[];
  contentType?: AnchorContentType[];
  tags?: string[];
  sortBy?: "distance" | "created_at";
};

export type AnchorFilterOption = {
  value: string;
  count: number;
};

export type NearbyAnchorFilterOptions = {
  visibility: AnchorFilterOption[];
  anchor_status: AnchorFilterOption[];
  content_type: AnchorFilterOption[];
  tags: AnchorFilterOption[];
};

function appendRepeatedParams(
  query: URLSearchParams,
  key: string,
  values?: string[],
) {
  for (const value of values ?? []) {
    query.append(key, value);
  }
}

export async function getNearbyAnchors(
  params: GetNearbyAnchorsParams,
  token: string,
  isBackground: boolean = false // Add this parameter
) {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    radius_km: String(params.radiusKm ?? 5),
    sort_by: params.sortBy ?? "distance",
  });

  appendRepeatedParams(query, "visibility", params.visibility);
  appendRepeatedParams(query, "anchor_status", params.anchorStatus);
  appendRepeatedParams(query, "content_type", params.contentType);
  appendRepeatedParams(query, "tags", params.tags);

  return apiRequest<NearbyAnchor[]>(`/anchors/nearby?${query.toString()}`, {
    method: "GET",
    token,
    useFileSystemBypass: isBackground, // Only bypass when true
  });
}

export async function getNearbyAnchorFilterOptions(
  params: Omit<GetNearbyAnchorsParams, "sortBy">,
  token: string,
) {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    radius_km: String(params.radiusKm ?? 5),
  });

  appendRepeatedParams(query, "visibility", params.visibility);
  appendRepeatedParams(query, "anchor_status", params.anchorStatus);
  appendRepeatedParams(query, "content_type", params.contentType);
  appendRepeatedParams(query, "tags", params.tags);

  return apiRequest<NearbyAnchorFilterOptions>(
    `/anchors/nearby/filter-options?${query.toString()}`,
    {
      method: "GET",
      token,
    },
  );
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
  content_id: string;
  anchor_id: string;
  creator_id: string;
  content_type: string;
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  text_body: string | null;
  language: string | null;
  url: string | null;
  page_title: string | null;
  preview_url: string | null;
  size_bytes: number;
  uploaded_at: string;
};

export async function getAnchorAttachments(
  anchorId: string,
  token: string,
): Promise<AnchorAttachment[]> {
  return apiRequest<AnchorAttachment[]>(`/anchors/${anchorId}/content`, {
    method: "GET",
    token,
  });
}

export async function uploadAnchorAttachment(
  anchorId: string,
  userId: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  token: string,
): Promise<AnchorAttachment> {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as any);

  const response = await fetch(`${API_BASE_URL}/anchors/${anchorId}/content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `Upload failed with status ${response.status}`);
  }

  return response.json();
}

export type VoteResponse = {
  message: string;
  anchor_id: string;
  net_votes: number;
  user_vote: "UPVOTE" | "DOWNVOTE" | null;
};

export async function voteAnchor(
  anchorId: string,
  vote: "UPVOTE" | "DOWNVOTE",
  token: string,
): Promise<VoteResponse> {
  return apiRequest<VoteResponse>(`/anchors/${anchorId}/vote`, {
    method: "POST",
    token,
    body: { vote },
  });
}