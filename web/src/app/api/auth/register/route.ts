import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    username?: string;
    email?: string;
    password?: string;
  };
  if (!body.username || !body.email || !body.password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const fwd = await forwardHeaders(req);
  fwd.set("Content-Type", "application/json");

  const reg = await fetch(`${API_BASE}/api/v1/auth/register`, {
    method: "POST",
    headers: fwd,
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

  // Email verification gate: do not auto-login. Frontend shows "check your email"
  // and the user activates by clicking the SES link → /verify-email?token=…
  return NextResponse.json({ registered: true, email: body.email });
}
