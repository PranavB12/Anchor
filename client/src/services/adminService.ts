import { apiRequest } from "./api";

export type AdminUserSummary = {
  user_id: string;
  email: string;
  username: string;
  is_admin?: boolean;
  is_banned?: boolean;
  created_at?: string | null;
  last_login?: string | null;
};

type AdminReportsProbe = {
  report_id: string;
};

type BanUserRequest = {
  is_banned: boolean;
};

type BanUserResponse = {
  user_id?: string;
  is_banned?: boolean;
  message?: string;
};

export async function canAccessAdminDashboard(token: string) {
  try {
    await apiRequest<AdminReportsProbe[]>("/admin/reports?status=PENDING", {
      method: "GET",
      token,
    });
    return true;
  } catch {
    return false;
  }
}

export async function searchAdminUsers(query: string, token: string) {
  const encodedQuery = encodeURIComponent(query.trim());

  try {
    return await apiRequest<AdminUserSummary[]>(
      `/admin/users/search?query=${encodedQuery}`,
      {
        method: "GET",
        token,
      },
    );
  } catch (searchRouteError) {
    try {
      return await apiRequest<AdminUserSummary[]>(`/admin/users?query=${encodedQuery}`, {
        method: "GET",
        token,
      });
    } catch {
      throw searchRouteError;
    }
  }
}

export async function updateAdminUserBanStatus(
  userId: string,
  isBanned: boolean,
  token: string,
) {
  const response = await apiRequest<BanUserResponse>(`/admin/users/${userId}/ban`, {
    method: "POST",
    token,
    body: { is_banned: isBanned } satisfies BanUserRequest,
  });

  return {
    user_id: response.user_id ?? userId,
    is_banned: response.is_banned ?? isBanned,
    message: response.message,
  };
}
