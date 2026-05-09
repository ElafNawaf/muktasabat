import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const headers = await forwardHeaders(req);
  headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}/api/v1/auth/resend-verification`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Could not resend verification" }, { status: 502 });
  }

  // Pass through debug_verify_url for local development.
  const data = (await res.json()) as {
    ok: boolean;
    message?: string;
    debug_verify_url?: string | null;
  };
  return NextResponse.json(data);
}
