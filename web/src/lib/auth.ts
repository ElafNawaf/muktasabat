import { redirect } from "next/navigation";
import { cache } from "react";

import { api, ApiError } from "./api";

export type Me = {
  id: number;
  username: string;
  email: string;
  role: string;
  full_name?: string | null;
  full_name_ar?: string | null;
  avatar_url?: string | null;
  preferred_locale?: string;
  is_super_admin?: boolean;
  /** Effective permissions: the role's matrix plus this user's own overrides. */
  permissions?: Record<string, Partial<Record<"view" | "create" | "edit" | "delete" | "approve", number | boolean>>>;
};

/**
 * Fetch the current user. Cached per-request via React `cache()` so layouts
 * and pages share the same call. On 401, redirects to the localized login page.
 */
export const requireAuth = cache(async (locale: string): Promise<Me> => {
  try {
    return await api.get<Me>("/api/v1/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/${locale}/login`);
    }
    throw err;
  }
});
