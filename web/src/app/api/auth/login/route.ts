import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, REFRESH_COOKIE, TOKEN_COOKIE } from "@/lib/api";

export async function POST(req: Request) {
  const body = (await req.json()) as { username?: string; password?: string };
  if (!body.username || !body.password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }

  // FastAPI's /auth/login is OAuth2-form-encoded
  const form = new URLSearchParams();
  form.set("username", body.username);
  form.set("password", body.password);

  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: res.status === 401 ? 401 : 500 },
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    user: { id: number; username: string; role: string; email: string };
  };

  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  cookieStore.set(TOKEN_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  cookieStore.set(REFRESH_COOKIE, data.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ user: data.user });
}
