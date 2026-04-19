import { apiRequest } from "./api";

export type CircleMember = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  joined_at: string;
};

export type UserCircle = {
  circle_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  created_at: string;
  member_count: number;
  is_owner: boolean;
};

export type CreateCircleBody = {
  name: string;
  description?: string | null;
  visibility: "PUBLIC" | "PRIVATE";
};

export function getCircleMembers(circleId: string, token: string) {
  return apiRequest<CircleMember[]>(`/circles/${circleId}/members`, {
    method: "GET",
    token,
  });
}

export function createCircle(body: CreateCircleBody, token: string) {
  return apiRequest<UserCircle>("/circles/", {
    method: "POST",
    token,
    body,
  });
}

export function inviteCircleMember(circleId: string, username: string, token: string) {
  return apiRequest<{ message: string }>(`/circles/${circleId}/members`, {
    method: "POST",
    token,
    body: { username },
  });
}

export function removeCircleMember(circleId: string, userId: string, token: string) {
  return apiRequest<{ message: string }>(`/circles/${circleId}/members/${userId}`, {
    method: "DELETE",
    token,
  });
}

export type CircleSearchResult = {
  circle_id: string;
  name: string;
  description: string | null;
  member_count: number;
  is_member: boolean;
};

export function searchCircles(query: string, token: string) {
  return apiRequest<CircleSearchResult[]>(`/circles/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
    token,
  });
}

export function joinCircle(circleId: string, token: string) {
  return apiRequest<{ message: string }>(`/circles/${circleId}/join`, {
    method: "POST",
    token,
  });
}
