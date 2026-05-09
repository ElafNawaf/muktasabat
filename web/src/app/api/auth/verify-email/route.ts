import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

export async function POST(req: Request) {
  const { token } = (await req.json()) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const headers = await forwardHeaders(req);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}/api/v1/auth/verify-email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    return NextResponse.json(
      { error: err.detail || "Invalid or expired link" },
      { status: res.status === 400 ? 400 : 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
