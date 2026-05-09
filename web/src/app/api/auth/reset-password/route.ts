import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string; new_password?: string };
  if (!body.token || !body.new_password) {
    return NextResponse.json({ error: "Missing token or password" }, { status: 400 });
  }

  const headers = await forwardHeaders(req);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
    method: "POST",
    headers,
    body: JSON.stringify({ token: body.token, new_password: body.new_password }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = typeof err?.detail === "string" ? err.detail : "Reset failed";
    return NextResponse.json({ error: detail }, { status: res.status });
  }

  return new NextResponse(null, { status: 204 });
}
