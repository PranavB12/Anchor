import { apiRequest } from "./api";

export type CircleMember = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  joined_at: string;
};

export function getCircleMembers(circleId: string, token: string) {
  return apiRequest<CircleMember[]>(`/circles/${circleId}/members`, {
    method: "GET",
    token,
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