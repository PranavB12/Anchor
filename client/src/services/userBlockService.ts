import { apiRequest } from "./api";

export type BlockedUser = {
  user_id: string;
  username: string;
  avatar_url?: string | null;
  blocked_at: string;
};

export async function getBlockedUsers(token: string) {
  return apiRequest<BlockedUser[]>("/users/blocked", {
    method: "GET",
    token,
  });
}

export async function blockUser(blockedUserId: string, token: string) {
  return apiRequest<BlockedUser>("/users/block", {
    method: "POST",
    token,
    body: { blocked_user_id: blockedUserId },
  });
}

export async function unblockUser(blockedUserId: string, token: string) {
  return apiRequest<{ message: string }>("/users/block", {
    method: "DELETE",
    token,
    body: { blocked_user_id: blockedUserId },
  });
}
