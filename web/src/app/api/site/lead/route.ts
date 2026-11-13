import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

/** Public contact form → FastAPI. Forwards the visitor IP so the API's rate
 *  limiter and Turnstile check see the real client, not this container. */
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 20_000) return NextResponse.json({ detail: "Payload too large" }, { status: 413 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  const headers = await forwardHeaders();
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}/api/v1/cms/public/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
