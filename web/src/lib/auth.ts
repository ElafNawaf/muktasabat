import { redirect } from "next/navigation";
import { cache } from "react";

import { api, ApiError } from "./api";

export type Me = { id: number; username: string; email: string; role: string };

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
