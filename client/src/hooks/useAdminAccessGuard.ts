import { useEffect, useState } from "react";

import { verifyAdminAccess } from "../services/adminService";

function normalizeAccessError(error: unknown) {
  const fallbackMessage = "403 Forbidden: Admin access required";

  if (!(error instanceof Error)) return fallbackMessage;
  if (error.message.includes("403")) return error.message;
  if (error.message.toLowerCase().includes("admin access required")) {
    return fallbackMessage;
  }
  return error.message;
}

export function useAdminAccessGuard(token?: string) {
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setAccessError("403 Forbidden: Admin access required");
      setIsCheckingAccess(false);
      return;
    }

    let isMounted = true;

    const run = async () => {
      setIsCheckingAccess(true);
      setAccessError(null);

      try {
        await verifyAdminAccess(token);
        if (isMounted) {
          setAccessError(null);
        }
      } catch (error) {
        if (isMounted) {
          setAccessError(normalizeAccessError(error));
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false);
        }
      }
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return {
    accessError,
    hasAccess: !isCheckingAccess && !accessError,
    isCheckingAccess,
  };
}
