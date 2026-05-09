/**
 * Server-side FastAPI client.
 *
 * Reads the JWT from the httpOnly cookie set by /api/auth/login and forwards
 * it to FastAPI as a Bearer token. Returns a typed JSON body or throws.
 */
import { cookies } from "next/headers";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:8000";

export const TOKEN_COOKIE = "mk_access";
export const REFRESH_COOKIE = "mk_refresh";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

type FetchOpts = Omit<RequestInit, "body"> & { body?: unknown };

async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;

  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {}
    throw new ApiError(res.status, `API ${res.status} on ${path}`, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T,>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T,>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  delete: <T,>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
