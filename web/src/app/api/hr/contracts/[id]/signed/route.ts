import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_BASE, TOKEN_COOKIE } from "@/lib/api";
import { forwardHeaders } from "@/lib/forward";

/** Signed employment contracts (private personal data).
 *  GET  → stream the file or redirect to a 5-minute presigned URL.
 *  POST → upload: the employee's own copy, or `?as=hr` for HR filing it on their behalf. */
async function token() {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const t = await token();
  if (!t) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const res = await fetch(`${API_BASE}/api/v1/hr/contracts/${id}/signed`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
  if (!res.ok) return NextResponse.json({ detail: "Not available" }, { status: res.status });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const { url } = (await res.json()) as { url?: string };
    if (url && url.startsWith("https://")) return NextResponse.redirect(url);
    return NextResponse.json({ detail: "Not available" }, { status: 404 });
  }
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": ct || "application/octet-stream",
      "Content-Disposition": (res.headers.get("content-disposition") || "inline").replace(/^attachment/, "inline"),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const t = await token();
  if (!t) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const asHr = new URL(req.url).searchParams.get("as") === "hr";
  const headers = await forwardHeaders(req);
  headers.set("Authorization", `Bearer ${t}`);
  headers.set("Content-Type", req.headers.get("content-type") ?? "application/octet-stream");
  const target = asHr ? `${API_BASE}/api/v1/hr/contracts/${id}/signed` : `${API_BASE}/api/v1/hr/me/contracts/${id}/signed`;
  const upstream = await fetch(target, {
    method: "POST",
    headers,
    body: req.body,
    // @ts-expect-error — duplex is required when streaming a request body in fetch.
    duplex: "half",
    cache: "no-store",
  });
  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
