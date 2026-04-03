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

export type AuditLog = {
  log_id: string;
  user_id: string;
  username: string;
  email: string;
  action_type: string;
  target_id: string | null;
  target_type: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  timestamp: string;
};

export type AuditLogsPaginatedResponse = {
  logs: AuditLog[];
  total_count: number;
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

export async function fetchAuditLogs(
  token: string,
  filters?: {
    action_type?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }
) {
  const params = new URLSearchParams();
  if (filters?.action_type) params.append("action_type", filters.action_type);
  if (filters?.start_date) params.append("start_date", filters.start_date);
  if (filters?.end_date) params.append("end_date", filters.end_date);
  if (filters?.limit) params.append("limit", filters.limit.toString());
  if (filters?.offset) params.append("offset", filters.offset.toString());

  const queryParams = params.toString() ? `?${params.toString()}` : "";
  return await apiRequest<AuditLogsPaginatedResponse>(`/admin/audit-logs${queryParams}`, {
    method: "GET",
    token,
  });
}
