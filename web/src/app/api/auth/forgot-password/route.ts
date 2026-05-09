import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string };
  if (!body.email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const headers = await forwardHeaders(req);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: body.email }),
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json(data);
}
