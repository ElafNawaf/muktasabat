import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, REFRESH_COOKIE, TOKEN_COOKIE } from "@/lib/api";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    username?: string;
    email?: string;
    password?: string;
  };
  if (!body.username || !body.email || !body.password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const reg = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: body.username,
      email: body.email,
      password: body.password,
    }),
    cache: "no-store",
  });

  if (reg.status === 409) {
    const err = (await reg.json().catch(() => ({}))) as { detail?: string | string[] };
    const detail = Array.isArray(err.detail) ? err.detail.join(", ") : err.detail || "Conflict";
    return NextResponse.json({ error: detail }, { status: 409 });
  }

  if (!reg.ok) {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }

  const form = new URLSearchParams();
  form.set("username", body.username);
  form.set("password", body.password);

  const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  if (!loginRes.ok) {
    return NextResponse.json(
      {
        registered: true,
        error: "Account created but auto sign-in failed; please sign in manually.",
      },
      { status: 200 },
    );
  }

  const data = (await loginRes.json()) as {
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
    maxAge: 60 * 60 * 8,
  });
  cookieStore.set(REFRESH_COOKIE, data.refresh_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ user: data.user });
}
