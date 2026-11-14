"use server";

/**
 * Server actions for "My account" and support tickets.
 *
 * Password change and "sign out everywhere" rotate the session generation on
 * the API, so they also rewrite (or clear) the httpOnly auth cookies here.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { api, ApiError, REFRESH_COOKIE, TOKEN_COOKIE } from "./api";
import type { EmailLogDetail } from "@/app/[locale]/(app)/email-log/EmailLogClient";

import type { ReinviteResult } from "./actions";
import type { AccountActivity, Profile, TicketDetail, TicketPriority, TicketStatus } from "./types";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof ApiError) {
    const detail = (e.body as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return { ok: false, error: detail };
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: unknown[] };
      const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
      return { ok: false, error: field ? `${field}: ${first.msg}` : first.msg ?? "Validation error" };
    }
    return { ok: false, error: e.message };
  }
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

async function run<T>(fn: () => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

async function setSessionCookies(access: string, refresh: string) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(TOKEN_COOKIE, access, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 8 });
  store.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// ---------------------------------------------------------------- profile

export type ProfileInput = {
  full_name?: string | null;
  full_name_ar?: string | null;
  phone?: string | null;
  job_title?: string | null;
  preferred_locale?: "ar" | "en";
  notify_ticket_updates?: boolean;
};

export async function updateProfile(input: ProfileInput): Promise<Result<Profile>> {
  // Layout revalidation refreshes the avatar / name in the sidebar & topbar.
  return run(() => api.put<Profile>("/api/v1/account/profile", input), ["/[locale]"]);
}

export async function removeAvatar(): Promise<Result<Profile>> {
  return run(() => api.delete<Profile>("/api/v1/account/avatar"), ["/[locale]"]);
}

export async function changeUsername(newUsername: string, currentPassword: string): Promise<Result<Profile>> {
  return run(
    () =>
      api.post<Profile>("/api/v1/account/username", {
        new_username: newUsername,
        current_password: currentPassword,
      }),
    ["/[locale]"],
  );
}

export async function requestEmailChange(
  newEmail: string,
  currentPassword: string,
): Promise<Result<{ pending_email: string; debug_confirm_url: string | null }>> {
  return run(
    () =>
      api.post<{ pending_email: string; debug_confirm_url: string | null }>("/api/v1/account/email", {
        new_email: newEmail,
        current_password: currentPassword,
      }),
    ["/[locale]/(app)/account"],
  );
}

export async function cancelEmailChange(): Promise<Result<Profile>> {
  return run(() => api.delete<Profile>("/api/v1/account/email/pending"), ["/[locale]/(app)/account"]);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<Result<null>> {
  try {
    const tokens = await api.post<{ access_token: string; refresh_token: string }>("/api/v1/account/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    // Old tokens are now revoked server-side — keep this browser signed in.
    await setSessionCookies(tokens.access_token, tokens.refresh_token);
    revalidatePath("/[locale]/(app)/account", "page");
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function logoutEverywhere(): Promise<Result<null>> {
  try {
    await api.post("/api/v1/account/logout-all");
    const store = await cookies();
    store.delete(TOKEN_COOKIE);
    store.delete(REFRESH_COOKIE);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function getActivity(): Promise<Result<AccountActivity[]>> {
  return run(() => api.get<AccountActivity[]>("/api/v1/account/activity"));
}

// ---------------------------------------------------------------- support

export type TriageInput = {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignee_id?: number | null;
  unassign?: boolean;
};

const SUPPORT_PATHS = ["/[locale]/(app)/support"];

export async function triageTicket(id: number, input: TriageInput): Promise<Result<TicketDetail>> {
  return run(() => api.put<TicketDetail>(`/api/v1/support/tickets/${id}`, input), SUPPORT_PATHS);
}

export async function closeTicket(id: number): Promise<Result<TicketDetail>> {
  return run(() => api.post<TicketDetail>(`/api/v1/support/tickets/${id}/close`), SUPPORT_PATHS);
}

export async function reopenTicket(id: number): Promise<Result<TicketDetail>> {
  return run(() => api.post<TicketDetail>(`/api/v1/support/tickets/${id}/reopen`), SUPPORT_PATHS);
}

// ------------------------------------------------------- admin helpdesk

export async function adminSendResetLink(
  userId: number,
): Promise<Result<{ debug_reset_url: string | null }>> {
  return run(() =>
    api.post<{ debug_reset_url: string | null }>(`/api/v1/auth/admin/users/${userId}/send-reset`),
  );
}

export async function adminRevokeSessions(userId: number): Promise<Result<null>> {
  return run(async () => {
    await api.post(`/api/v1/auth/admin/users/${userId}/revoke-sessions`);
    return null;
  });
}

/** Public: confirm a pending email change from the emailed link. */
export async function confirmEmailChange(token: string): Promise<Result<{ email: string }>> {
  return run(() => api.post<{ email: string }>("/api/v1/account/confirm-email", { token }));
}

// ------------------------------------------- admin: links, passwords, roles


/** E-mail chosen users a set-password link: "invite" (72 h) or "reset" (24 h). */
export async function sendUserLinks(
  userIds: number[],
  kind: "invite" | "reset",
): Promise<Result<ReinviteResult>> {
  return run(
    () => api.post<ReinviteResult>("/api/v1/auth/admin/users/reinvite", { user_ids: userIds, kind }),
    ["/[locale]/(app)/users"],
  );
}

export async function adminSetPassword(userId: number, newPassword: string, notify: boolean): Promise<Result<null>> {
  return run(async () => {
    await api.post(`/api/v1/auth/admin/users/${userId}/set-password`, { new_password: newPassword, notify });
    return null;
  });
}

export async function makeSuperAdmin(userId: number): Promise<Result<unknown>> {
  return run(() => api.post(`/api/v1/auth/admin/super-admin/${userId}`), ["/[locale]"]);
}

// ------------------------------------------------ super admin: e-mail log


export async function getEmailLog(id: number): Promise<Result<EmailLogDetail>> {
  return run(() => api.get<EmailLogDetail>(`/api/v1/admin/email-logs/${id}`));
}
